import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "forkful-v2-recipes";

// ── Schema.org recipe extractor ───────────────────────────────────────────────
// Fetches a page via CORS proxy, finds JSON-LD Recipe data, returns structured recipe.
// No API keys needed — this is free, public, standards-based data.

const PROXIES = [
  {
    url: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    rawText: false,
  },
  {
    url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    rawText: true,
  },
];

class RecipeNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "RecipeNotFoundError";
  }
}

function isNetworkError(err) {
  const msg = (err.message || "").toLowerCase();
  return (
    msg === "failed to fetch" ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  );
}

async function fetchRecipeFromPage(url) {
  let lastError = null;

  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(url));
      if (!res.ok) {
        lastError = new Error(`Kunne ikke hente siden (${res.status})`);
        continue;
      }
      const html = proxy.rawText ? await res.text() : (await res.json()).contents;
      if (!html) {
        lastError = new Error("Tom respons fra siden");
        continue;
      }

      // Parse HTML string
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Find all JSON-LD scripts
      const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
      let recipe = null;

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Can be single object or array
          const candidates = Array.isArray(data) ? data : [data];
          // Also check @graph
          for (const item of candidates) {
            if (item["@graph"]) candidates.push(...item["@graph"]);
            if (item["@type"] === "Recipe" ||
                (Array.isArray(item["@type"]) && item["@type"].includes("Recipe"))) {
              recipe = item;
              break;
            }
          }
          if (recipe) break;
        } catch {}
      }

      if (recipe) return parseSchemaRecipe(recipe, url, doc);

      // Fallback: try schema.org microdata (itemscope/itemprop) — used by older WordPress recipe plugins
      const microdataRecipe = parseMicrodataRecipe(doc, url);
      if (microdataRecipe) return microdataRecipe;

      throw new RecipeNotFoundError(`Ingen oppskriftsdata funnet på siden.\n\nTips: Prøv matprat.no, allrecipes.com, eller andre store oppskriftssider.`);
    } catch (err) {
      // RecipeNotFoundError means the page was fetched OK but no recipe data found — no point retrying
      if (err instanceof RecipeNotFoundError) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error("Kunne ikke hente oppskriften. Sjekk internettforbindelsen din og prøv igjen.");
}

// Parse ISO 8601 duration like PT1H30M → "1 t 30 min"
function parseDuration(dur) {
  if (!dur) return null;
  const h = dur.match(/(\d+)H/)?.[1];
  const m = dur.match(/(\d+)M/)?.[1];
  if (h && m) return `${h} t ${m} min`;
  if (h)      return `${h} time${h > 1 ? "r" : ""}`;
  if (m)      return `${m} min`;
  return null;
}

// Parse ingredient string "400g mel" → {amount, unit, name}
function parseIngredient(str) {
  if (!str) return null;
  str = str.trim();
  // Match leading number + optional fraction + unit
  const m = str.match(/^([\d.,½¼¾⅓⅔⅛]+)\s*([a-zA-ZæøåÆØÅ]*\.?)\s+(.+)$/u);
  if (m) {
    const amount = parseFloat(m[1].replace(",", ".")) || m[1];
    const unit = m[2].trim();
    const name = m[3].trim();
    return { amount, unit, name };
  }
  return { amount: "", unit: "", name: str };
}

// Strip HTML tags from a string and trim leading list numbering (e.g. "3. ", "Step 2:")
function cleanStepText(str) {
  if (!str) return "";
  // Use a temporary element to strip HTML tags safely
  const tmp = document.createElement("div");
  tmp.innerHTML = str;
  const text = (tmp.textContent || tmp.innerText || "").trim();
  // Remove leading ordinal prefixes like "1.", "2)", "Step 3:", "Steg 4."
  return text.replace(/^\s*(?:step|steg)\s*\d+[.:)]\s*/i, "").replace(/^\s*\d+[.)]\s*/, "").trim();
}

// Parse instruction — can be string, HowToStep, or array
function parseSteps(instructions) {
  if (!instructions) return [];
  const raw = Array.isArray(instructions) ? instructions : [instructions];
  const steps = [];
  for (const item of raw) {
    if (typeof item === "string") {
      steps.push(cleanStepText(item));
    } else if (item["@type"] === "HowToStep") {
      steps.push(cleanStepText(item.text || item.name || ""));
    } else if (item["@type"] === "HowToSection") {
      // Section contains steps
      const sub = Array.isArray(item.itemListElement) ? item.itemListElement : [];
      for (const s of sub) {
        steps.push(cleanStepText(s.text || s.name || ""));
      }
    } else if (item.text) {
      steps.push(cleanStepText(item.text));
    }
  }
  return steps.filter(Boolean);
}

// ── Schema.org microdata extractor ────────────────────────────────────────────
// Handles pages that use itemscope/itemprop instead of JSON-LD (e.g. EasyRecipe, old WP plugins).
function parseMicrodataRecipe(doc, url) {
  // Look for an element with itemtype containing "schema.org/Recipe"
  const root = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (!root) return null;

  function prop(name, multiple = false) {
    const sel = `[itemprop="${name}"]`;
    if (multiple) {
      return Array.from(root.querySelectorAll(sel)).map(el =>
        el.getAttribute("content") || el.textContent.trim()
      ).filter(Boolean);
    }
    const el = root.querySelector(sel);
    if (!el) return null;
    return el.getAttribute("content") || el.getAttribute("datetime") || el.textContent.trim() || null;
  }

  const title = prop("name") || doc.querySelector('meta[property="og:title"]')?.content || "Ukjent oppskrift";

  // Image — prefer content/src attr, then og:image
  const imgEl = root.querySelector('[itemprop="image"]');
  const image = imgEl?.getAttribute("src") || imgEl?.getAttribute("content")
    || doc.querySelector('meta[property="og:image"]')?.content || null;

  const time = parseDuration(prop("totalTime") || prop("cookTime")) || "?";
  const servings = (prop("recipeYield") || "4").replace(/[^\d]/g, "") || "4";

  const rawIngs = prop("recipeIngredient", true);
  const ingredients = rawIngs.length
    ? rawIngs.map(parseIngredient).filter(Boolean)
    : [];

  // Instructions — can be one big block or multiple HowToStep items
  const stepEls = root.querySelectorAll('[itemprop="recipeInstructions"]');
  let steps = [];
  if (stepEls.length > 1) {
    steps = Array.from(stepEls).map(el => cleanStepText(el.textContent)).filter(Boolean);
  } else if (stepEls.length === 1) {
    // Single block — try splitting on <li> or numbered lines
    const liItems = Array.from(stepEls[0].querySelectorAll("li"));
    if (liItems.length) {
      steps = liItems.map(li => cleanStepText(li.textContent)).filter(Boolean);
    } else {
      steps = cleanStepText(stepEls[0].textContent).split(/\n+/).map(s => s.trim()).filter(Boolean);
    }
  }

  const tags = prop("recipeCategory", true)
    .concat(prop("recipeCuisine", true))
    .concat((prop("keywords") || "").split(/[,،]/).map(k => k.trim()).filter(Boolean))
    .filter(Boolean).slice(0, 5);

  if (!ingredients.length && !steps.length) return null;

  return { title, image, time, servings, tags, ingredients, steps };
}

function parseSchemaRecipe(r, url, doc) {
  // Title
  const title = r.name || "Ukjent oppskrift";

  // Image — can be string, array, or ImageObject
  let image = null;
  const img = r.image;
  if (typeof img === "string") image = img;
  else if (Array.isArray(img)) image = typeof img[0] === "string" ? img[0] : img[0]?.url;
  else if (img?.url) image = img.url;
  // Also try og:image
  if (!image) image = doc.querySelector('meta[property="og:image"]')?.content || null;

  // Time
  const time = parseDuration(r.totalTime) || parseDuration(r.cookTime) || "?";

  // Servings
  const servings = String(r.recipeYield || r.yield || "4").replace(/[^\d]/g, "") || "4";

  // Tags from keywords + recipeCategory + recipeCuisine
  const tagSources = [
    ...(typeof r.keywords === "string" ? r.keywords.split(/[,،]/) : r.keywords || []),
    ...(Array.isArray(r.recipeCategory) ? r.recipeCategory : [r.recipeCategory || ""]),
    ...(Array.isArray(r.recipeCuisine)  ? r.recipeCuisine  : [r.recipeCuisine  || ""]),
  ];
  const tags = tagSources.map(t => t?.trim()).filter(Boolean).slice(0, 5);

  // Ingredients
  const rawIngs = Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [];
  const ingredients = rawIngs.map(parseIngredient).filter(Boolean);

  // Steps
  const steps = parseSteps(r.recipeInstructions);

  return { title, image, time, servings, tags, ingredients, steps };
}

const VIDEO_FALLBACK_STEP = "Se videoen for fremgangsmåten. Legg til ingredienser og steg manuelt.";

// ── YouTube: extract title + thumbnail from oEmbed (free, no auth) ───────────
async function fetchYoutubeRecipe(url) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error("Kunne ikke hente YouTube-info");
  const data = await res.json();

  const ytId = getYoutubeId(url);
  return {
    title: data.title || "YouTube-oppskrift",
    image: ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null,
    time: "?",
    servings: "4",
    tags: ["video"],
    ingredients: [],
    steps: [VIDEO_FALLBACK_STEP],
    isVideoOnly: true,
  };
}

// ── Caption parser: find Ingredients / Steps sections in video captions ───────

function stripBullet(line) {
  return line.replace(/^[-•*✓]\s*/, "").trim();
}

function parseCaptionForRecipe(caption) {
  if (!caption) return { ingredients: [], steps: [] };
  const lines = caption.split(/\n/).map(l => l.trim()).filter(Boolean);

  const ingredientHeader = /^(ingredients?|ingredienser?|what you'?ll need|du trenger)\s*:?$/i;
  const stepsHeader      = /^(steps?|instructions?|method|how to make|fremgangsmåte|slik gjør du det|directions?)\s*:?$/i;

  let mode = null;
  const ingredients = [];
  const steps = [];

  for (const line of lines) {
    if (ingredientHeader.test(line)) { mode = "ingredients"; continue; }
    if (stepsHeader.test(line))      { mode = "steps";       continue; }

    if (mode === "ingredients") {
      const clean = stripBullet(line);
      if (clean) ingredients.push(clean);
    } else if (mode === "steps") {
      const clean = stripBullet(line.replace(/^\d+[.)]\s*/, ""));
      if (clean) steps.push(clean);
    }
  }

  return { ingredients, steps };
}

// ── Shared helper: extract og: meta tags from a URL via CORS proxies ──────────
async function fetchOgMetaFromUrl(url, defaultTitle) {
  let title   = defaultTitle;
  let image   = null;
  let caption = "";

  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(url));
      if (!res.ok) continue;
      const html = proxy.rawText ? await res.text() : (await res.json()).contents;
      if (!html) continue;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.content;
      const ogImage = doc.querySelector('meta[property="og:image"]')?.content;
      const ogDesc  = doc.querySelector('meta[property="og:description"]')?.content;
      if (ogTitle) title   = ogTitle;
      if (ogImage) image   = ogImage;
      if (ogDesc)  caption = ogDesc;
      break;
    } catch {}
  }

  return { title, image, caption };
}

// ── TikTok: title + thumbnail via oEmbed (public, no auth needed) ─────────────
async function fetchTikTokRecipe(url) {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  let data = null;

  // Try direct fetch first (TikTok oEmbed supports CORS)
  try {
    const res = await fetch(oembedUrl);
    if (res.ok) data = await res.json();
  } catch {}

  // Fallback: iterate all CORS proxies until one succeeds
  if (!data) {
    for (const proxy of PROXIES) {
      try {
        const res = await fetch(proxy.url(oembedUrl));
        if (!res.ok) continue;
        const raw = proxy.rawText ? await res.text() : (await res.json()).contents;
        if (raw) { data = JSON.parse(raw); break; }
      } catch {}
    }
  }

  if (!data) {
    throw new Error(
      "Kunne ikke hente TikTok-info.\n\nKontroller at videoen er offentlig, eller legg til oppskriften manuelt."
    );
  }

  const caption = data.title || "";
  const { ingredients, steps } = parseCaptionForRecipe(caption);

  return {
    title: caption || "TikTok-oppskrift",
    image: data.thumbnail_url || null,
    time: "?",
    servings: "4",
    tags: ["video", "tiktok"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true,
  };
}

// ── Instagram: og: meta tags via CORS proxy (open profiles only) ──────────────
async function fetchInstagramRecipe(url) {
  const { title, image, caption } = await fetchOgMetaFromUrl(url, "Instagram-oppskrift");
  const { ingredients, steps } = parseCaptionForRecipe(caption);

  return {
    title,
    image,
    time: "?",
    servings: "4",
    tags: ["video", "instagram"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true,
  };
}

// ── Facebook: og: meta tags via CORS proxy (open profiles only) ───────────────
async function fetchFacebookRecipe(url) {
  const { title, image, caption } = await fetchOgMetaFromUrl(url, "Facebook-oppskrift");
  const { ingredients, steps } = parseCaptionForRecipe(caption);

  return {
    title,
    image,
    time: "?",
    servings: "4",
    tags: ["video", "facebook"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true,
  };
}

async function fetchRecipe(url, onStatus) {
  // Use exact hostname matching to avoid substring spoofing (e.g. evil-youtube.com)
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const isYt = hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  const isIg = hostname === "instagram.com" || hostname.endsWith(".instagram.com");
  const isTt = hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
  const isFb = hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch";

  if (isYt) {
    onStatus("▶️ Henter YouTube-info…");
    return await fetchYoutubeRecipe(url);
  }

  if (isTt) {
    onStatus("🎵 Henter TikTok-info…");
    return await fetchTikTokRecipe(url);
  }

  if (isIg) {
    onStatus("📸 Henter Instagram-info…");
    return await fetchInstagramRecipe(url);
  }

  if (isFb) {
    onStatus("📘 Henter Facebook-info…");
    return await fetchFacebookRecipe(url);
  }

  onStatus("🔍 Henter siden…");
  const recipe = await fetchRecipeFromPage(url);
  onStatus("✅ Ferdig!");
  return recipe;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSource(url) {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return { name: "TikTok", icon: "🎵" };
    if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") return { name: "YouTube", icon: "▶️" };
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return { name: "Instagram", icon: "📸" };
    if (h === "facebook.com" || h.endsWith(".facebook.com") || h === "fb.watch") return { name: "Facebook", icon: "📘" };
    return { name: h, icon: "🌐" };
  } catch { return { name: "Ukjent", icon: "🌐" }; }
}

function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube")) {
      const v = u.searchParams.get("v"); if (v) return v;
      const m = u.pathname.match(/(?:shorts|embed|v)\/([^/?]+)/); if (m) return m[1];
    }
  } catch {}
  return null;
}

function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d === 0 ? "I dag" : d === 1 ? "I går" : `${d} dager siden`;
}

function foodEmoji(title, tags) {
  const s = ((title || "") + " " + (tags || []).join(" ")).toLowerCase();
  if (s.match(/gulrot|carrot|kake|cake|dessert/)) return "🎂";
  if (s.match(/pasta|spaghetti|carbonara|lasagne/)) return "🍝";
  if (s.match(/pizza/)) return "🍕";
  if (s.match(/salat|salad/)) return "🥗";
  if (s.match(/suppe|soup/)) return "🍲";
  if (s.match(/burger|sandwich/)) return "🍔";
  if (s.match(/kylling|chicken/)) return "🍗";
  if (s.match(/laks|salmon|fisk|fish/)) return "🐟";
  if (s.match(/taco|mex|burrito/)) return "🌮";
  if (s.match(/brød|bread/)) return "🍞";
  if (s.match(/egg/)) return "🍳";
  if (s.match(/curry/)) return "🍛";
  if (s.match(/sjokolade|chocolate/)) return "🍫";
  return "🍴";
}

function cardTheme(title, tags) {
  const s = ((title || "") + " " + (tags || []).join(" ")).toLowerCase();
  if (s.match(/gulrot|carrot|kake|cake|dessert/)) return { a: "#c4622d", b: "#e8845a", c: "#fff3ee" };
  if (s.match(/sjokolade|chocolate/))             return { a: "#3d1f0f", b: "#7b3f1e", c: "#f5ede8" };
  if (s.match(/pasta|carbonara|lasagne/))         return { a: "#b8860b", b: "#daa520", c: "#fffbee" };
  if (s.match(/pizza/))                           return { a: "#c0392b", b: "#e74c3c", c: "#fff0ef" };
  if (s.match(/salat|salad/))                     return { a: "#27ae60", b: "#2ecc71", c: "#f0fff5" };
  if (s.match(/suppe|soup/))                      return { a: "#d35400", b: "#e67e22", c: "#fff5ee" };
  if (s.match(/laks|salmon|fisk|fish/))           return { a: "#2980b9", b: "#3498db", c: "#eef7ff" };
  if (s.match(/kylling|chicken/))                 return { a: "#8e6914", b: "#c49a22", c: "#fffbf0" };
  if (s.match(/taco|mex|burrito/))                return { a: "#6e2f0a", b: "#b5541a", c: "#fff5ee" };
  return { a: "#5c3d2e", b: "#9c7b6a", c: "#faf8f3" };
}

// ── RecipePlaceholder (SVG, always works) ─────────────────────────────────────

function RecipePlaceholder({ recipe }) {
  const emoji = foodEmoji(recipe.title, recipe.tags);
  const theme = cardTheme(recipe.title, recipe.tags);
  const title = (recipe.title || "").toUpperCase();
  const gId = "g" + recipe.id;
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 22 && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  const lineH = 18;
  const textY = 175 - ((lines.length - 1) * lineH) / 2;

  return (
    <svg width="100%" height="100%" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={theme.c} />
          <stop offset="100%" stopColor="#f0ebe0" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${gId})`} />
      <rect width="400" height="4" fill={theme.a} opacity="0.6" />
      <circle cx="200" cy="108" r="52" fill={theme.a} opacity="0.08" />
      <text x="200" y="125" textAnchor="middle" fontSize="56" dominantBaseline="middle">{emoji}</text>
      <line x1="160" y1={textY - 12} x2="240" y2={textY - 12} stroke={theme.a} strokeWidth="1" opacity="0.4" />
      {lines.map((l, i) => (
        <text key={i} x="200" y={textY + i * lineH} textAnchor="middle" fontSize="11"
          fill={theme.a} fontFamily="Georgia,serif" letterSpacing="2.5" opacity="0.85">{l}</text>
      ))}
      <rect y="236" width="400" height="4" fill={theme.a} opacity="0.6" />
    </svg>
  );
}

// ── SmartImage ────────────────────────────────────────────────────────────────

function proxyImg(url) {
  if (!url) return null;
  if (url.includes("img.youtube.com") || url.includes("ytimg.com")) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=800&h=500&fit=cover&output=jpg&q=85`;
}

function SmartImage({ recipe }) {
  const ytId = getYoutubeId(recipe.sourceUrl || "");
  const sources = [
    ytId && `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
    ytId && `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
    recipe.image && proxyImg(recipe.image),
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIdx(0); setFailed(false); }, [recipe.id]);

  if (failed || sources.length === 0) return <RecipePlaceholder recipe={recipe} />;
  return (
    <img
      key={recipe.id + idx}
      src={sources[idx]}
      alt={recipe.title}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      onError={() => { if (idx < sources.length - 1) setIdx(i => i + 1); else setFailed(true); }}
    />
  );
}

// ── Manual add form ───────────────────────────────────────────────────────────

function ManualForm({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [servings, setServings] = useState("4");
  const [tags, setTags] = useState("");
  const [ings, setIngs] = useState("");
  const [steps, setSteps] = useState("");

  function save() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      time: time.trim() || "?",
      servings: servings.trim() || "4",
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      ingredients: ings.split("\n").filter(Boolean).map(l => parseIngredient(l.trim())).filter(Boolean),
      steps: steps.split("\n").filter(Boolean).map(s => s.trim()),
      image: null,
    });
  }

  const inputStyle = {
    width: "100%", padding: ".75rem 1rem", border: "1.5px solid #e0d5c5",
    borderRadius: 12, fontFamily: "'DM Sans',sans-serif", fontSize: ".9rem",
    color: "#2c1810", background: "#faf8f3", outline: "none", marginBottom: ".75rem",
  };
  const taStyle = { ...inputStyle, minHeight: 100, resize: "vertical", display: "block" };
  const label = { fontSize: ".75rem", fontWeight: 600, color: "#5c3d2e", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: ".3rem" };

  return (
    <div>
      <p style={{ fontFamily: "'Lora',serif", fontSize: ".9rem", color: "#9c7b6a", marginBottom: "1.25rem", lineHeight: 1.6 }}>
        Skriv inn oppskriften manuelt.
      </p>
      <label style={label}>Tittel *</label>
      <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="F.eks. Glutenfri gulrotkake" />
      <div style={{ display: "flex", gap: ".5rem" }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Tid</label>
          <input style={inputStyle} value={time} onChange={e => setTime(e.target.value)} placeholder="60 min" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Porsjoner</label>
          <input style={inputStyle} value={servings} onChange={e => setServings(e.target.value)} placeholder="4" />
        </div>
      </div>
      <label style={label}>Tagger (kommaseparert)</label>
      <input style={inputStyle} value={tags} onChange={e => setTags(e.target.value)} placeholder="kake, glutenfri, dessert" />
      <label style={label}>Ingredienser (én per linje)</label>
      <textarea style={taStyle} value={ings} onChange={e => setIngs(e.target.value)} placeholder={"400 g mandelmel\n3 egg\n2 ts kanel"} />
      <label style={label}>Fremgangsmåte (ett steg per linje)</label>
      <textarea style={taStyle} value={steps} onChange={e => setSteps(e.target.value)} placeholder={"Bland egg og sukker.\nSikt inn mel og kanel.\nStek på 175°C i 35 min."} />
      <div style={{ display: "flex", gap: ".75rem", justifyContent: "flex-end", marginTop: ".5rem" }}>
        <button className="btn btn-muted" onClick={onCancel}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>Lagre →</button>
      </div>
    </div>
  );
}

// ── Samples ───────────────────────────────────────────────────────────────────

const SAMPLES = [
  {
    id: "s1", title: "Klassisk Carbonara", source: "matprat.no",
    sourceUrl: "https://www.matprat.no/oppskrifter/pasta/spaghetti-carbonara/",
    image: "https://images.matprat.no/i1v8c2qhkf-t1200/",
    time: "20 min", servings: "4", tags: ["pasta", "italiensk", "rask"],
    ingredients: [
      { amount: 400, unit: "g", name: "spaghetti" },
      { amount: 200, unit: "g", name: "pancetta eller bacon" },
      { amount: 4, unit: "", name: "eggeplommer" },
      { amount: 100, unit: "g", name: "pecorino romano, revet" },
      { amount: 1, unit: "ts", name: "sort pepper" },
    ],
    steps: [
      "Kok spaghetti i rikelig saltet vann til al dente.",
      "Stek pancetta på middels varme til sprø.",
      "Visp eggeplommer med revet pecorino og pepper.",
      "Ta pannen av varmen, tilsett spaghetti og litt pastavann.",
      "Hell eggeblandingen over og rør raskt til kremet saus.",
    ],
    savedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&display=swap');`;

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--cream:#faf8f3;--sand:#f0ebe0;--tc:#c4622d;--tc-l:#e8845a;--br:#2c1810;--brm:#5c3d2e;--brl:#9c7b6a;--bd:#e0d5c5;--sh:0 4px 24px rgba(44,24,16,.10);--sh-lg:0 12px 48px rgba(44,24,16,.18)}
body{background:var(--cream)}
.app{min-height:100vh;font-family:'DM Sans',sans-serif;background:var(--cream)}
.header{background:var(--br);padding:0 1.25rem;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100}
.logo{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--cream);cursor:pointer;display:flex;align-items:center;gap:.35rem}
.logo span{color:var(--tc-l)}
.header-actions{display:flex;gap:.5rem}
.btn{border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.875rem;font-weight:500;border-radius:100px;padding:.5rem 1.1rem;transition:all .18s;display:inline-flex;align-items:center;gap:.35rem}
.btn-primary{background:var(--tc);color:#fff}
.btn-primary:hover:not(:disabled){background:#a8511f;transform:translateY(-1px);box-shadow:0 4px 12px rgba(196,98,45,.4)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:rgba(255,255,255,.1);color:var(--cream);border:1px solid rgba(255,255,255,.2);font-size:.8rem;padding:.4rem .9rem}
.btn-ghost:hover{background:rgba(255,255,255,.2)}
.btn-muted{background:var(--sand);color:var(--brm)}
.btn-muted:hover:not(:disabled){background:var(--bd)}
.hero{text-align:center;padding:4rem 2rem 2rem}
.hero-icon{font-size:3.5rem;margin-bottom:1.25rem;display:block}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,5vw,3rem);color:var(--br);line-height:1.15;margin-bottom:.75rem}
.hero h1 em{font-style:italic;color:var(--tc)}
.hero p{font-family:'Lora',serif;font-size:1rem;color:var(--brl);max-width:440px;margin:0 auto 1.75rem;line-height:1.7}
.grid-top{padding:2rem 1.25rem .75rem;display:flex;align-items:baseline;justify-content:space-between}
.grid-top h2{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--br)}
.count{font-size:.82rem;color:var(--brl);background:var(--sand);padding:.2rem .65rem;border-radius:100px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;padding:0 1.25rem 4rem}
.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:var(--sh);cursor:pointer;transition:all .22s;border:1px solid var(--bd)}
.card:hover{transform:translateY(-3px);box-shadow:var(--sh-lg)}
.card-img{width:100%;height:190px;background:var(--sand);overflow:hidden}
.card-body{padding:1.1rem}
.card-src{font-size:.72rem;color:var(--brl);display:flex;align-items:center;gap:.3rem;margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em;font-weight:500}
.card-title{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--br);margin-bottom:.6rem;line-height:1.3}
.card-meta{display:flex;gap:.85rem;font-size:.78rem;color:var(--brl);margin-bottom:.6rem}
.tags{display:flex;flex-wrap:wrap;gap:.35rem}
.tag{background:var(--sand);color:var(--brm);font-size:.7rem;padding:.18rem .55rem;border-radius:100px;font-weight:500}
.card-date{margin-top:.85rem;font-size:.7rem;color:var(--brl);border-top:1px solid var(--bd);padding-top:.65rem}
.overlay{position:fixed;inset:0;background:rgba(44,24,16,.55);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(4px);animation:fi .18s ease}
@media(min-width:600px){.overlay{align-items:center;padding:1rem}}
@keyframes fi{from{opacity:0}to{opacity:1}}
.modal{background:#fff;border-radius:24px 24px 0 0;padding:1.75rem 1.5rem 2.5rem;width:100%;max-width:540px;box-shadow:var(--sh-lg);animation:su .25s ease;max-height:90vh;overflow-y:auto}
@media(min-width:600px){.modal{border-radius:24px;padding:2.25rem}}
@keyframes su{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.modal-title{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--br);margin-bottom:.35rem}
.modal-sub{font-size:.88rem;color:var(--brl);margin-bottom:1.25rem;line-height:1.6;font-family:'Lora',serif}
.tab-row{display:flex;gap:.5rem;margin-bottom:1.25rem}
.tab{flex:1;padding:.6rem;border:1.5px solid var(--bd);border-radius:10px;background:#fff;color:var(--brm);font-family:'DM Sans',sans-serif;font-size:.85rem;font-weight:500;cursor:pointer;transition:all .15s;text-align:center}
.tab.active{background:var(--tc);color:#fff;border-color:var(--tc)}
.input-row{display:flex;gap:.5rem;margin-bottom:.75rem}
.url-in{flex:1;padding:.8rem 1rem;border:1.5px solid var(--bd);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:.95rem;color:var(--br);background:var(--cream);outline:none;transition:border-color .15s}
.url-in:focus{border-color:var(--tc)}
.url-in::placeholder{color:var(--brl)}
.url-in:disabled{opacity:.6}
.status-row{padding:.8rem 1rem;font-size:.875rem;color:var(--brm);font-family:'Lora',serif;font-style:italic;display:flex;align-items:center;gap:.6rem;background:var(--sand);border-radius:10px;margin-bottom:.75rem}
.spin{width:16px;height:16px;border:2px solid var(--bd);border-top-color:var(--tc);border-radius:50%;animation:sp .7s linear infinite;flex-shrink:0}
@keyframes sp{to{transform:rotate(360deg)}}
.err-box{background:#fff3f0;border:1px solid #ffd0c2;color:#8b2020;border-radius:10px;padding:.85rem 1rem;font-size:.82rem;margin-bottom:.75rem;line-height:1.6;white-space:pre-wrap;max-height:160px;overflow-y:auto}
.ok-box{background:#f0faf4;border:1px solid #b2e0c2;color:#1a6b3a;border-radius:10px;padding:.75rem 1rem;font-size:.875rem;display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem}
.info-box{background:var(--sand);border-radius:10px;padding:.8rem 1rem;font-size:.82rem;color:var(--brm);margin-bottom:.75rem;line-height:1.5}
.modal-foot{display:flex;justify-content:flex-end;margin-top:.5rem}
.detail{max-width:720px;margin:0 auto;padding:1.25rem 1.25rem 4rem}
.back{background:var(--sand);color:var(--brm);border:none;padding:.45rem .9rem;border-radius:100px;font-family:'DM Sans',sans-serif;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;margin-bottom:1.5rem;transition:background .15s}
.back:hover{background:var(--bd)}
.d-hero{border-radius:18px;overflow:hidden;height:280px;margin-bottom:1.5rem;background:var(--sand)}
@media(min-width:600px){.d-hero{height:360px}}
.d-src{font-size:.78rem;color:var(--tc);text-transform:uppercase;letter-spacing:.08em;font-weight:500;display:flex;align-items:center;gap:.35rem;margin-bottom:.5rem}
.d-title{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,4vw,2.4rem);color:var(--br);line-height:1.2;margin-bottom:.85rem}
.d-meta{display:flex;gap:1.25rem;margin-bottom:1rem;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:.35rem;font-size:.88rem;color:var(--brm)}
.chip strong{color:var(--br);font-weight:500}
.sec{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--br);margin-bottom:.85rem;padding-bottom:.45rem;border-bottom:2px solid var(--sand);margin-top:1.75rem}
.ings{list-style:none;margin-bottom:.5rem}
.ing{display:flex;align-items:baseline;gap:.65rem;padding:.6rem 0;border-bottom:1px solid var(--bd);font-size:.92rem}
.ing:last-child{border-bottom:none}
.ing-amt{font-weight:500;color:var(--tc);min-width:68px;text-align:right;font-size:.85rem;flex-shrink:0}
.ing-name{color:var(--br)}
.steps-list{list-style:none;margin-bottom:.5rem}
.step{display:flex;gap:.85rem;margin-bottom:1.1rem;align-items:flex-start}
.step-n{width:26px;height:26px;background:var(--tc);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:600;flex-shrink:0;margin-top:2px}
.step-t{font-family:'Lora',serif;font-size:.92rem;line-height:1.75;color:var(--brm)}
.video-note{background:var(--sand);border-radius:12px;padding:1rem;font-family:'Lora',serif;font-size:.9rem;color:var(--brm);line-height:1.6;margin-top:1.5rem}
.del-btn{background:#fff0ed;color:#c0392b;border:1px solid #ffd5cc;border-radius:100px;padding:.45rem 1.1rem;font-family:'DM Sans',sans-serif;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;transition:all .15s;margin-top:1.75rem}
.del-btn:hover{background:#ffe0da}
`;

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [recipes, setRecipes]   = useState([]);
  const [view, setView]         = useState("grid");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [tab, setTab]           = useState("url");   // url | manual
  const [url, setUrl]           = useState("");
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState("");
  const [error, setError]       = useState("");
  const [added, setAdded]       = useState(false);
  const [ready, setReady]       = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      setRecipes(saved.length ? saved : SAMPLES);
    } catch { setRecipes(SAMPLES); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)); } catch {}
    }
  }, [recipes, ready]);

  useEffect(() => {
    if (showAdd) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showAdd, tab]);

  function openAdd() { setShowAdd(true); setError(""); setAdded(false); setUrl(""); setTab("url"); }
  function closeAdd() { if (!loading) setShowAdd(false); }

  function addRecipe(data, sourceUrl) {
    const src = detectSource(sourceUrl || "");
    const recipe = {
      id:          "r-" + Date.now(),
      title:       data.title || "Ukjent oppskrift",
      source:      src.name,
      sourceUrl:   sourceUrl || "",
      image:       data.image || null,
      time:        data.time  || "?",
      servings:    String(data.servings || "4"),
      tags:        Array.isArray(data.tags)        ? data.tags.filter(Boolean)           : [],
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter(i => i?.name) : [],
      steps:       Array.isArray(data.steps)       ? data.steps.filter(Boolean)          : [],
      isVideoOnly: data.isVideoOnly || false,
      savedAt:     new Date().toISOString(),
    };
    setRecipes(p => [recipe, ...p]);
    setAdded(true);
    setTimeout(() => { setShowAdd(false); setAdded(false); }, 1400);
  }

  async function handleUrl() {
    const u = url.trim();
    if (!u) return;
    setLoading(true); setError(""); setAdded(false);
    try {
      const data = await fetchRecipe(u, setStatus);
      addRecipe(data, u);
    } catch (e) {
      setError(isNetworkError(e)
        ? "Kunne ikke koble til for å hente oppskriften. Sjekk internettforbindelsen din og prøv igjen."
        : e.message || "Ukjent feil");
    } finally { setLoading(false); setStatus(""); }
  }

  function handleManual(data) {
    addRecipe(data, "");
    setShowAdd(false);
  }

  function doDelete(id) {
    if (!confirm("Slette denne oppskriften?")) return;
    setRecipes(p => p.filter(r => r.id !== id));
    setView("grid");
  }

  return (
    <>
      <style>{FONTS + CSS}</style>
      <div className="app">

        {/* Header */}
        <header className="header">
          <div className="logo" onClick={() => setView("grid")}>🍴 Fork<span>ful</span></div>
          <div className="header-actions">
            <button className="btn btn-ghost" onClick={() => setView("grid")}>Mine</button>
            <button className="btn btn-primary" onClick={openAdd}>+ Legg til</button>
          </div>
        </header>

        {/* Grid */}
        {view === "grid" && (
          recipes.length === 0
            ? <div className="hero">
                <span className="hero-icon">🍽️</span>
                <h1>Din personlige<br /><em>oppskriftsbok</em></h1>
                <p>Lim inn en lenke fra matprat.no, allrecipes.com og de fleste andre oppskriftssider — vi henter og lagrer alt automatisk og gratis.</p>
                <button className="btn btn-primary" style={{ margin: "0 auto", fontSize: "1rem", padding: ".75rem 2rem" }} onClick={openAdd}>
                  + Legg til din første oppskrift
                </button>
              </div>
            : <>
                <div className="grid-top">
                  <h2>Mine oppskrifter</h2>
                  <span className="count">{recipes.length} lagret</span>
                </div>
                <div className="grid">
                  {recipes.map(r => (
                    <div key={r.id} className="card" onClick={() => { setSelected(r); setView("detail"); }}>
                      <div className="card-img"><SmartImage recipe={r} /></div>
                      <div className="card-body">
                        <div className="card-src">{detectSource(r.sourceUrl || "").icon} {r.source}</div>
                        <div className="card-title">{r.title}</div>
                        <div className="card-meta">
                          <span>⏱ {r.time}</span>
                          <span>👤 {r.servings} porsjoner</span>
                        </div>
                        {r.tags?.length > 0 && <div className="tags">{r.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>}
                        <div className="card-date">{timeAgo(r.savedAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
        )}

        {/* Detail */}
        {view === "detail" && selected && (
          <div className="detail">
            <button className="back" onClick={() => setView("grid")}>← Tilbake</button>
            <div className="d-hero"><SmartImage recipe={selected} /></div>
            <div className="d-src">
              {detectSource(selected.sourceUrl || "").icon} {selected.source}
              {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", marginLeft: ".3rem" }}>↗</a>}
            </div>
            <h1 className="d-title">{selected.title}</h1>
            <div className="d-meta">
              <div className="chip">⏱ <strong>{selected.time}</strong></div>
              <div className="chip">👤 <strong>{selected.servings} porsjoner</strong></div>
              {selected.ingredients?.length > 0 && <div className="chip">🧂 <strong>{selected.ingredients.length} ingredienser</strong></div>}
            </div>
            {selected.tags?.length > 0 && <div className="tags" style={{ marginBottom: "1rem" }}>{selected.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}

            {selected.isVideoOnly && (
              <div className="video-note">
                📹 Denne oppskriften er fra en video. <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#c4622d" }}>Se videoen her ↗</a>
              </div>
            )}

            {selected.ingredients?.length > 0 && <>
              <h3 className="sec">Ingredienser</h3>
              <ul className="ings">
                {selected.ingredients.map((ing, i) => (
                  <li key={i} className="ing">
                    <span className="ing-amt">{ing.amount}{ing.unit ? " " + ing.unit : ""}</span>
                    <span className="ing-name">{ing.name}</span>
                  </li>
                ))}
              </ul>
            </>}

            {selected.steps?.length > 0 && <>
              <h3 className="sec">Fremgangsmåte</h3>
              <ol className="steps-list">
                {selected.steps.map((s, i) => (
                  <li key={i} className="step">
                    <span className="step-n">{i + 1}</span>
                    <span className="step-t">{s}</span>
                  </li>
                ))}
              </ol>
            </>}

            <button className="del-btn" onClick={() => doDelete(selected.id)}>🗑 Slett oppskrift</button>
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="overlay" onClick={e => { if (e.target === e.currentTarget) closeAdd(); }}>
            <div className="modal">
              <h2 className="modal-title">Legg til oppskrift</h2>

              <div className="tab-row">
                <button className={"tab" + (tab === "url" ? " active" : "")} onClick={() => setTab("url")}>🔗 Fra lenke</button>
                <button className={"tab" + (tab === "manual" ? " active" : "")} onClick={() => setTab("manual")}>✏️ Manuelt</button>
              </div>

              {tab === "url" && <>
                <p className="modal-sub">Lim inn lenke fra en oppskriftsside — vi leser strukturdata direkte fra siden. Ingen AI, ingen konto.</p>
                <div className="info-box">
                  ✅ Fungerer med: matprat.no, allrecipes.com, bbcgoodfood.com, og de fleste andre store oppskriftssider<br />
                  🎵 TikTok · 📸 Instagram · 📘 Facebook: Henter tittel og bilde (kun åpne profiler). Legg til ingredienser og steg manuelt.<br />
                  ▶️ YouTube: Henter tittel og bilde automatisk.
                </div>
                <div className="input-row">
                  <input
                    ref={inputRef}
                    className="url-in"
                    type="url"
                    placeholder="https://www.matprat.no/oppskrifter/..."
                    value={url}
                    onChange={e => { setUrl(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && !loading && url.trim() && handleUrl()}
                    disabled={loading}
                  />
                  <button className="btn btn-primary" onClick={handleUrl} disabled={loading || !url.trim()}>
                    {loading ? "…" : "Hent →"}
                  </button>
                </div>
                {loading && <div className="status-row"><span className="spin" />{status}</div>}
                {added   && <div className="ok-box">✅ Lagret! Åpner samlingen…</div>}
                {error   && <div className="err-box">❌ {error}</div>}
                <div className="modal-foot">
                  <button className="btn btn-muted" onClick={closeAdd} disabled={loading}>Avbryt</button>
                </div>
              </>}

              {tab === "manual" && (
                <ManualForm onSave={handleManual} onCancel={closeAdd} />
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
