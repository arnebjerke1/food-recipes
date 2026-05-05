package no.forkful.app;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public class AddRecipeActivity extends AppCompatActivity {

    private Button tabUrl, tabManual;
    private View urlContent, manualContent;
    private boolean isUrlTab = true;

    // URL tab
    private EditText urlInput;
    private TextView statusText;

    // Manual tab
    private EditText manualTitle, manualTime, manualServings, manualTags, manualIngredients, manualSteps;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private RecipeFetcher.Result fetchedResult;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_add_recipe);

        Toolbar toolbar = findViewById(R.id.add_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setTitle("Legg til oppskrift");
        }

        tabUrl = findViewById(R.id.tab_url);
        tabManual = findViewById(R.id.tab_manual);
        urlContent = findViewById(R.id.url_content);
        manualContent = findViewById(R.id.manual_content);

        urlInput = findViewById(R.id.url_input);
        statusText = findViewById(R.id.status_text);

        manualTitle = findViewById(R.id.manual_title);
        manualTime = findViewById(R.id.manual_time);
        manualServings = findViewById(R.id.manual_servings);
        manualTags = findViewById(R.id.manual_tags);
        manualIngredients = findViewById(R.id.manual_ingredients);
        manualSteps = findViewById(R.id.manual_steps);

        tabUrl.setOnClickListener(v -> switchTab(true));
        tabManual.setOnClickListener(v -> switchTab(false));

        Button fetchBtn = findViewById(R.id.btn_fetch);
        fetchBtn.setOnClickListener(v -> fetchUrl());

        Button saveBtn = findViewById(R.id.btn_save);
        saveBtn.setOnClickListener(v -> saveRecipe());

        switchTab(true);
    }

    private void switchTab(boolean url) {
        isUrlTab = url;
        urlContent.setVisibility(url ? View.VISIBLE : View.GONE);
        manualContent.setVisibility(url ? View.GONE : View.VISIBLE);
        tabUrl.setBackgroundColor(url ? Color.parseColor("#c4622d") : Color.parseColor("#e0d5c5"));
        tabUrl.setTextColor(url ? Color.WHITE : Color.parseColor("#2c1810"));
        tabManual.setBackgroundColor(url ? Color.parseColor("#e0d5c5") : Color.parseColor("#c4622d"));
        tabManual.setTextColor(url ? Color.parseColor("#2c1810") : Color.WHITE);
    }

    private void fetchUrl() {
        String url = urlInput.getText().toString().trim();
        if (url.isEmpty()) {
            Toast.makeText(this, "Lim inn en URL", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!url.startsWith("http")) url = "https://" + url;

        statusText.setText("Henter oppskrift...");
        statusText.setTextColor(Color.parseColor("#9c7b6a"));
        statusText.setVisibility(View.VISIBLE);

        final String finalUrl = url;
        new Thread(() -> {
            try {
                RecipeFetcher.Result result = RecipeFetcher.fetch(finalUrl);
                fetchedResult = result;
                mainHandler.post(() -> {
                    statusText.setText("✓ Fant: " + result.title);
                    statusText.setTextColor(Color.parseColor("#2e7d32"));
                    populateManualFromResult(result);
                    switchTab(false);
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    statusText.setText("Feil: " + e.getMessage());
                    statusText.setTextColor(Color.parseColor("#c62828"));
                });
            }
        }).start();
    }

    private void populateManualFromResult(RecipeFetcher.Result result) {
        if (result.title != null) manualTitle.setText(result.title);
        if (result.time != null) manualTime.setText(result.time);
        if (result.servings != null) manualServings.setText(result.servings);
        if (result.tags != null && !result.tags.isEmpty())
            manualTags.setText(TextUtils.join(", ", result.tags));
        if (result.ingredients != null && !result.ingredients.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (Ingredient ing : result.ingredients) {
                String amt = ing.formatAmount();
                if (!amt.isEmpty()) sb.append(amt).append(" ");
                sb.append(ing.name).append("\n");
            }
            manualIngredients.setText(sb.toString().trim());
        }
        if (result.steps != null && !result.steps.isEmpty())
            manualSteps.setText(TextUtils.join("\n", result.steps));
    }

    private void saveRecipe() {
        String title = manualTitle.getText().toString().trim();
        if (title.isEmpty()) {
            manualTitle.setError("Tittel er påkrevd");
            return;
        }

        Recipe recipe = new Recipe();
        recipe.id = UUID.randomUUID().toString();
        recipe.title = title;
        recipe.time = manualTime.getText().toString().trim();
        recipe.servings = manualServings.getText().toString().trim();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault());
        sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        recipe.savedAt = sdf.format(new Date());

        // Tags
        String tagsRaw = manualTags.getText().toString().trim();
        recipe.tags = new ArrayList<>();
        if (!tagsRaw.isEmpty()) {
            for (String t : tagsRaw.split(",")) {
                String trimmed = t.trim();
                if (!trimmed.isEmpty()) recipe.tags.add(trimmed);
            }
        }

        // Ingredients
        String ingRaw = manualIngredients.getText().toString().trim();
        recipe.ingredients = new ArrayList<>();
        if (!ingRaw.isEmpty()) {
            for (String line : ingRaw.split("\n")) {
                String l = line.trim();
                if (!l.isEmpty()) recipe.ingredients.add(new Ingredient("", "", l));
            }
        }

        // Steps
        String stepsRaw = manualSteps.getText().toString().trim();
        recipe.steps = new ArrayList<>();
        if (!stepsRaw.isEmpty()) {
            for (String line : stepsRaw.split("\n")) {
                String l = line.trim();
                if (!l.isEmpty()) recipe.steps.add(l);
            }
        }

        // Source/image from fetched result
        if (fetchedResult != null) {
            recipe.source = fetchedResult.source;
            recipe.sourceUrl = fetchedResult.sourceUrl;
            recipe.image = fetchedResult.image;
            recipe.isVideoOnly = fetchedResult.isVideoOnly;
        } else {
            recipe.source = "Manuelt";
            recipe.sourceUrl = "";
            recipe.image = null;
        }

        List<Recipe> all = RecipeStorage.load(this);
        all.add(0, recipe);
        RecipeStorage.save(this, all);

        setResult(RESULT_OK);
        finish();
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
