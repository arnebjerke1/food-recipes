package no.forkful.app;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RecipeFetcher {

    public static class Result {
        public String title;
        public String image;
        public String time;
        public String servings;
        public List<String> tags = new ArrayList<>();
        public List<Ingredient> ingredients = new ArrayList<>();
        public List<String> steps = new ArrayList<>();
        public boolean isVideoOnly;
        public String source;
        public String sourceUrl;
    }

    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();

    public static Result fetch(String url) throws IOException {
        String lower = url.toLowerCase();

        if (lower.contains("youtube.com") || lower.contains("youtu.be")) {
            return fetchYouTube(url);
        }
        if (lower.contains("tiktok.com") || lower.contains("instagram.com") || lower.contains("facebook.com")) {
            return fetchVideoOnly(url);
        }
        return fetchRecipeSite(url);
    }

    private static Result fetchYouTube(String url) throws IOException {
        String oEmbedUrl = "https://www.youtube.com/oembed?url=" + url + "&format=json";
        Request request = new Request.Builder().url(oEmbedUrl).build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) throw new IOException("Kunne ikke hente YouTube-info (HTTP " + response.code() + ")");
            String body = response.body().string();
            JsonObject json = JsonParser.parseString(body).getAsJsonObject();
            Result result = new Result();
            result.title = getStr(json, "title");
            result.image = getStr(json, "thumbnail_url");
            result.isVideoOnly = true;
            result.source = "YouTube";
            result.sourceUrl = url;
            // Try high-res thumbnail
            String videoId = extractYouTubeId(url);
            if (videoId != null) {
                result.image = "https://img.youtube.com/vi/" + videoId + "/maxresdefault.jpg";
            }
            result.steps.add("Se videoen for fremgangsmåte.");
            return result;
        }
    }

    private static Result fetchVideoOnly(String url) throws IOException {
        Result result = new Result();
        result.title = "Video-oppskrift";
        result.isVideoOnly = true;
        result.sourceUrl = url;
        if (url.contains("tiktok.com")) result.source = "TikTok";
        else if (url.contains("instagram.com")) result.source = "Instagram";
        else result.source = "Facebook";
        result.steps.add("Kun tittel og bilde er tilgjengelig. Legg til trinn manuelt.");
        throw new IOException("Kun tittel/bilde er tilgjengelig fra " + result.source + ". Bruk manuell innlegging for å legge til ingredienser og trinn.");
    }

    private static Result fetchRecipeSite(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (compatible; Forkful/1.0)")
                .build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) throw new IOException("Kunne ikke laste siden (HTTP " + response.code() + ")");
            String html = response.body().string();
            Document doc = Jsoup.parse(html, url);
            Elements scripts = doc.select("script[type=application/ld+json]");
            for (Element script : scripts) {
                String text = script.html();
                try {
                    JsonElement el = JsonParser.parseString(text);
                    Result result = extractFromJsonLd(el, url);
                    if (result != null) return result;
                } catch (Exception ignored) {}
            }
            throw new IOException("Fant ingen oppskrift på denne siden. Prøv manuell innlegging.");
        }
    }

    private static Result extractFromJsonLd(JsonElement el, String url) {
        if (el.isJsonObject()) {
            JsonObject obj = el.getAsJsonObject();
            String type = getStr(obj, "@type");
            if ("Recipe".equalsIgnoreCase(type)) {
                return parseRecipe(obj, url);
            }
            if (obj.has("@graph") && obj.get("@graph").isJsonArray()) {
                for (JsonElement item : obj.getAsJsonArray("@graph")) {
                    if (item.isJsonObject()) {
                        String t = getStr(item.getAsJsonObject(), "@type");
                        if ("Recipe".equalsIgnoreCase(t)) {
                            return parseRecipe(item.getAsJsonObject(), url);
                        }
                    }
                }
            }
        } else if (el.isJsonArray()) {
            for (JsonElement item : el.getAsJsonArray()) {
                Result r = extractFromJsonLd(item, url);
                if (r != null) return r;
            }
        }
        return null;
    }

    private static Result parseRecipe(JsonObject obj, String url) {
        Result result = new Result();
        result.sourceUrl = url;

        result.title = getStr(obj, "name");
        if (result.title == null || result.title.isEmpty()) return null;

        // Image
        if (obj.has("image")) {
            JsonElement imgEl = obj.get("image");
            if (imgEl.isJsonPrimitive()) {
                result.image = imgEl.getAsString();
            } else if (imgEl.isJsonArray()) {
                JsonArray arr = imgEl.getAsJsonArray();
                if (arr.size() > 0) {
                    JsonElement first = arr.get(0);
                    if (first.isJsonPrimitive()) result.image = first.getAsString();
                    else if (first.isJsonObject()) result.image = getStr(first.getAsJsonObject(), "url");
                }
            } else if (imgEl.isJsonObject()) {
                result.image = getStr(imgEl.getAsJsonObject(), "url");
            }
        }

        // Time
        String time = getStr(obj, "totalTime");
        if (time == null || time.isEmpty()) time = getStr(obj, "cookTime");
        if (time != null && !time.isEmpty()) result.time = parseIsoDuration(time);

        // Servings
        if (obj.has("recipeYield")) {
            JsonElement yieldEl = obj.get("recipeYield");
            String yieldStr = yieldEl.isJsonArray() && yieldEl.getAsJsonArray().size() > 0
                    ? yieldEl.getAsJsonArray().get(0).getAsString()
                    : yieldEl.getAsString();
            result.servings = yieldStr.replaceAll("[^0-9]", "");
        }

        // Tags
        addTagsFromField(result.tags, obj, "keywords");
        addTagsFromField(result.tags, obj, "recipeCategory");
        addTagsFromField(result.tags, obj, "recipeCuisine");

        // Ingredients
        if (obj.has("recipeIngredient") && obj.get("recipeIngredient").isJsonArray()) {
            for (JsonElement ing : obj.getAsJsonArray("recipeIngredient")) {
                result.ingredients.add(parseIngredient(ing.getAsString()));
            }
        }

        // Steps
        if (obj.has("recipeInstructions")) {
            JsonElement instrEl = obj.get("recipeInstructions");
            extractSteps(result.steps, instrEl);
        }

        // Source (hostname)
        try {
            java.net.URL u = new java.net.URL(url);
            result.source = u.getHost().replaceFirst("^www\\.", "");
        } catch (Exception e) {
            result.source = url;
        }

        return result;
    }

    private static void extractSteps(List<String> steps, JsonElement instrEl) {
        if (instrEl.isJsonPrimitive()) {
            String text = instrEl.getAsString().trim();
            if (!text.isEmpty()) steps.add(text);
        } else if (instrEl.isJsonArray()) {
            for (JsonElement item : instrEl.getAsJsonArray()) {
                if (item.isJsonPrimitive()) {
                    steps.add(item.getAsString().trim());
                } else if (item.isJsonObject()) {
                    JsonObject stepObj = item.getAsJsonObject();
                    String type = getStr(stepObj, "@type");
                    if ("HowToSection".equals(type) && stepObj.has("itemListElement")) {
                        extractSteps(steps, stepObj.get("itemListElement"));
                    } else {
                        String text = getStr(stepObj, "text");
                        if (text == null) text = getStr(stepObj, "name");
                        if (text != null && !text.isEmpty()) steps.add(text.trim());
                    }
                }
            }
        }
    }

    private static void addTagsFromField(List<String> tags, JsonObject obj, String field) {
        if (!obj.has(field)) return;
        JsonElement el = obj.get(field);
        String raw;
        if (el.isJsonPrimitive()) {
            raw = el.getAsString();
        } else if (el.isJsonArray() && el.getAsJsonArray().size() > 0) {
            raw = el.getAsJsonArray().get(0).getAsString();
        } else return;
        for (String t : raw.split("[,;]")) {
            String trimmed = t.trim().toLowerCase();
            if (!trimmed.isEmpty() && !tags.contains(trimmed)) tags.add(trimmed);
        }
    }

    private static Ingredient parseIngredient(String line) {
        line = line.trim();
        // Try to match amount + unit + name: "400g mel" or "2 ss smør" or "2 eggs"
        Pattern p = Pattern.compile("^([\\d½¼¾⅓⅔.,/]+)\\s*([a-zA-ZæøåÆØÅ]*)\\s+(.+)$");
        Matcher m = p.matcher(line);
        if (m.matches()) {
            return new Ingredient(m.group(1), m.group(2), m.group(3).trim());
        }
        return new Ingredient("", "", line);
    }

    private static String parseIsoDuration(String iso) {
        if (iso == null || !iso.startsWith("PT")) return iso;
        int hours = 0, mins = 0;
        Pattern ph = Pattern.compile("(\\d+)H");
        Pattern pm = Pattern.compile("(\\d+)M");
        Matcher mh = ph.matcher(iso);
        Matcher mm = pm.matcher(iso);
        if (mh.find()) hours = Integer.parseInt(mh.group(1));
        if (mm.find()) mins = Integer.parseInt(mm.group(1));
        if (hours > 0 && mins > 0) return hours + " t " + mins + " min";
        if (hours > 0) return hours + " t";
        if (mins > 0) return mins + " min";
        return iso;
    }

    private static String extractYouTubeId(String url) {
        Pattern[] patterns = {
            Pattern.compile("[?&]v=([^&]+)"),
            Pattern.compile("youtu\\.be/([^?]+)"),
            Pattern.compile("/shorts/([^?]+)")
        };
        for (Pattern p : patterns) {
            Matcher m = p.matcher(url);
            if (m.find()) return m.group(1);
        }
        return null;
    }

    private static String getStr(JsonObject obj, String key) {
        if (!obj.has(key) || obj.get(key).isJsonNull()) return null;
        try { return obj.get(key).getAsString(); } catch (Exception e) { return null; }
    }
}
