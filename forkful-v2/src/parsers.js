// ── Pure parsing utilities (no React, no fetch) ───────────────────────────────
// Extracted so they can be unit-tested independently of the React app.

// ── Duration parser ───────────────────────────────────────────────────────────
export function parseDuration(dur) {
  if (!dur) return null;
  const h = dur.match(/(\d+)H/)?.[1];
  const m = dur.match(/(\d+)M/)?.[1];
  if (h && m) return `${h} t ${m} min`;
  if (h) return `${h} time${Number(h) !== 1 ? "r" : ""}`;
  if (m) return `${m} min`;
  return null;
}

// ── Ingredient parser ─────────────────────────────────────────────────────────
export function parseIngredient(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^([\d.,½¼¾⅓⅔⅛]+)\s*([a-zA-ZæøåÆØÅ]*\.?)\s+(.+)$/u);
  if (m) {
    const amount = parseFloat(m[1].replace(",", ".")) || m[1];
    const unit = m[2].trim();
    const name = m[3].trim();
    return { amount, unit, name };
  }
  return { amount: "", unit: "", name: str };
}

export function cleanStepText(str) {
  if (!str) return "";
  const text = str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.replace(/^\s*(?:step|steg)\s*\d+[.:)]\s*/i, "").replace(/^\s*\d+[.)]\s*/, "").trim();
}

export function parseSteps(instructions) {
  if (!instructions) return [];
  const raw = Array.isArray(instructions) ? instructions : [instructions];
  const steps = [];
  for (const item of raw) {
    if (typeof item === "string") {
      steps.push(cleanStepText(item));
    } else if (item["@type"] === "HowToStep") {
      steps.push(cleanStepText(item.text || item.name || ""));
    } else if (item["@type"] === "HowToSection") {
      const sub = Array.isArray(item.itemListElement) ? item.itemListElement : [];
      for (const s of sub) steps.push(cleanStepText(s.text || s.name || ""));
    } else if (item.text) {
      steps.push(cleanStepText(item.text));
    }
  }
  return steps.filter(Boolean);
}

// ── Category guesser ──────────────────────────────────────────────────────────
export function guessCategory(tags, title) {
  const s = ((title || "") + " " + tags.join(" ")).toLowerCase();
  if (s.match(/frokost|breakfast|oatmeal|havregrøt|smoothie|eggerøre|pannekake/)) return "Frokost";
  if (s.match(/lunsj|lunch|wraps?|sandwich|salat|salad/)) return "Lunsj";
  if (s.match(/dessert|kake|cake|cookies?|iskrem|pudding|muffins?|brownies?|sjokolade|chocolate/)) return "Dessert";
  if (s.match(/brød|bread|boller?|bakst|baking|croissant|pizza|focaccia/)) return "Bakst";
  if (s.match(/smoothie|juice|kaffe|coffee|cocktail|te |tea /)) return "Drikke";
  if (s.match(/snacks?|chips|dip|popcorn/)) return "Snacks";
  return "Middag";
}

// ── Schema.org JSON-LD parser ─────────────────────────────────────────────────
export function parseSchemaRecipe(r, url, doc) {
  const title = r.name || "Ukjent oppskrift";
  let image = null;
  const img = r.image;
  if (typeof img === "string") image = img;
  else if (Array.isArray(img)) image = typeof img[0] === "string" ? img[0] : img[0]?.url;
  else if (img?.url) image = img.url;
  if (!image) image = doc.querySelector('meta[property="og:image"]')?.content || null;

  const time = parseDuration(r.totalTime) || parseDuration(r.cookTime) || null;
  const servings = String(r.recipeYield || r.yield || "4").replace(/[^\d]/g, "") || "4";

  const tagSources = [
    ...(typeof r.keywords === "string" ? r.keywords.split(/[,،]/) : r.keywords || []),
    ...(Array.isArray(r.recipeCategory) ? r.recipeCategory : [r.recipeCategory || ""]),
    ...(Array.isArray(r.recipeCuisine) ? r.recipeCuisine : [r.recipeCuisine || ""]),
  ];
  const tags = tagSources.map((t) => t?.trim()).filter(Boolean).slice(0, 5);

  const rawIngs = Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [];
  const ingredients = rawIngs.map((s) => parseIngredient(String(s))).filter(Boolean);
  const steps = parseSteps(r.recipeInstructions);

  const category = guessCategory(tags, title);

  return { title, image, time, servings, tags, ingredients, steps, category };
}

// ── Microdata parser ──────────────────────────────────────────────────────────
export function parseMicrodataRecipe(doc, url) {
  const root = doc.querySelector('[itemtype*="schema.org/Recipe"]');
  if (!root) return null;

  function prop(name, multiple = false) {
    const sel = `[itemprop="${name}"]`;
    if (multiple) {
      return Array.from(root.querySelectorAll(sel))
        .map((el) => el.getAttribute("content") || el.textContent.trim())
        .filter(Boolean);
    }
    const el = root.querySelector(sel);
    if (!el) return null;
    return el.getAttribute("content") || el.getAttribute("datetime") || el.textContent.trim() || null;
  }

  const title = prop("name") || doc.querySelector('meta[property="og:title"]')?.content || "Ukjent oppskrift";
  const imgEl = root.querySelector('[itemprop="image"]');
  const image =
    imgEl?.getAttribute("src") ||
    imgEl?.getAttribute("content") ||
    doc.querySelector('meta[property="og:image"]')?.content ||
    null;
  const time = parseDuration(prop("totalTime") || prop("cookTime"));
  const servings = (prop("recipeYield") || "4").replace(/[^\d]/g, "") || "4";

  const rawIngs = prop("recipeIngredient", true);
  const ingredients = rawIngs.length ? rawIngs.map(parseIngredient).filter(Boolean) : [];

  const stepEls = root.querySelectorAll('[itemprop="recipeInstructions"]');
  let steps = [];
  if (stepEls.length > 1) {
    steps = Array.from(stepEls).map((el) => cleanStepText(el.textContent)).filter(Boolean);
  } else if (stepEls.length === 1) {
    const liItems = Array.from(stepEls[0].querySelectorAll("li"));
    if (liItems.length) {
      steps = liItems.map((li) => cleanStepText(li.textContent)).filter(Boolean);
    } else {
      steps = cleanStepText(stepEls[0].textContent).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    }
  }

  const tags = prop("recipeCategory", true)
    .concat(prop("recipeCuisine", true))
    .concat((prop("keywords") || "").split(/[,،]/).map((k) => k.trim()).filter(Boolean))
    .filter(Boolean)
    .slice(0, 5);

  if (!ingredients.length && !steps.length) return null;
  const category = guessCategory(tags, title);
  return { title, image, time, servings, tags, ingredients, steps, category };
}

// ── CSS selector fallback (WordPress plugins) ─────────────────────────────────
export function parseCssRecipe(doc, url) {
  const PATTERNS = [
    {
      container: ".wprm-recipe-container",
      title: ".wprm-recipe-name",
      image: ".wprm-recipe-image img",
      ingContainer: ".wprm-recipe-ingredient",
      ingWprm: true,
      step: ".wprm-recipe-instruction-text",
      time: ".wprm-recipe-total_time-minutes",
      servings: ".wprm-recipe-servings",
    },
    {
      container: ".tasty-recipes",
      title: ".tasty-recipes-title",
      image: ".tasty-recipes-image img",
      ing: ".tasty-recipes-ingredients ul li, .tasty-recipes-ingredients ol li",
      step: ".tasty-recipes-instructions ol li",
      servings: ".tasty-recipes-yield",
    },
    {
      container: ".easyrecipe",
      title: ".ERSName",
      image: ".ERSImage img",
      ing: ".ERSIngredients li",
      step: ".ERSInstructions li",
      servings: ".ERSServes",
    },
    {
      container: ".wpzoom-recipe-card",
      title: ".recipe-card-title",
      image: ".recipe-card-image img",
      ing: ".recipe-card-ingredients li",
      step: ".recipe-card-steps li",
      servings: ".recipe-card-servings",
    },
    {
      container: ".recipe-card",
      title: ".recipe-title, .recipe-card-title, h2.recipe-name",
      image: ".recipe-card img, .recipe-image img",
      ing: ".recipe-ingredients li, .ingredients-list li",
      step: ".recipe-instructions li, .instructions-list li",
      servings: ".recipe-servings, .recipe-yield",
    },
    // Matprat.no specific
    {
      container: ".recipe",
      title: ".recipe__title",
      image: ".recipe__media img, .article-media img",
      ing: ".ingredients__list-item, .ingredients li",
      step: ".steps__step, .steps li",
      servings: ".recipe__quantity",
    },
  ];

  for (const p of PATTERNS) {
    const root = doc.querySelector(p.container);
    if (!root) continue;

    const rawTitle =
      p.title ? (root.querySelector(p.title) || doc.querySelector(p.title))?.textContent?.trim() : null;
    const title =
      rawTitle ||
      doc.querySelector('meta[property="og:title"]')?.content ||
      doc.querySelector("h1")?.textContent?.trim() ||
      "Ukjent oppskrift";

    const imgEl = p.image ? root.querySelector(p.image) : null;
    const image =
      imgEl?.getAttribute("src") ||
      imgEl?.getAttribute("data-src") ||
      imgEl?.getAttribute("data-lazy-src") ||
      doc.querySelector('meta[property="og:image"]')?.content ||
      null;

    let ingredients = [];
    if (p.ingWprm) {
      ingredients = Array.from(root.querySelectorAll(p.ingContainer)).map((el) => {
        const amount = el.querySelector(".wprm-recipe-ingredient-amount")?.textContent?.trim() || "";
        const unit = el.querySelector(".wprm-recipe-ingredient-unit")?.textContent?.trim() || "";
        const name = el.querySelector(".wprm-recipe-ingredient-name")?.textContent?.trim() || "";
        const full = [amount, unit, name].filter(Boolean).join(" ");
        return full ? parseIngredient(full) : null;
      }).filter(Boolean);
    } else if (p.ing) {
      ingredients = Array.from(root.querySelectorAll(p.ing))
        .map((el) => el.textContent.trim())
        .filter(Boolean)
        .map(parseIngredient)
        .filter(Boolean);
    }

    const steps = p.step
      ? Array.from(root.querySelectorAll(p.step)).map((el) => cleanStepText(el.textContent)).filter(Boolean)
      : [];

    if (!ingredients.length && !steps.length) continue;

    const servingsText = p.servings ? root.querySelector(p.servings)?.textContent?.trim() : null;
    const servings = (servingsText?.replace(/[^\d]/g, "")) || "4";
    const category = guessCategory([], title);
    return { title, image, time: null, servings, tags: [], ingredients, steps, category };
  }
  return null;
}

// ── Plain blog fallback ────────────────────────────────────────────────────────
export function parseBlogRecipe(doc, url) {
  const title =
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector("h1")?.textContent?.trim() ||
    "";
  const image = doc.querySelector('meta[property="og:image"]')?.content || null;

  // Ingredients: find heading with "ingredien" / "trenger", then the next <ul>
  let ingredients = [];
  const needHeading = /trenger\s+du|du\s+trenger|ingredients?|ingredienser|you\s+will\s+need/i;
  let found = false;
  doc.querySelectorAll("p, h2, h3, h4, strong").forEach((el) => {
    if (found) return;
    if (needHeading.test(el.textContent.trim())) {
      const sibs = [];
      let sib = el.nextElementSibling;
      while (sib && sibs.length < 3) { sibs.push(sib); sib = sib.nextElementSibling; }
      const ul = sibs.find((s) => s.tagName === "UL") || el.closest("section, div, article")?.querySelector("ul");
      if (ul) {
        const items = Array.from(ul.querySelectorAll("li")).map((li) => li.textContent.trim()).filter(Boolean);
        if (items.length > 1) { ingredients = items.map(parseIngredient).filter(Boolean); found = true; }
      }
    }
  });

  // Last resort: largest <ul> in content area
  if (!found) {
    let bestUl = null, bestCount = 0;
    doc.querySelectorAll("article ul, .entry-content ul, .post-content ul, .content ul, main ul").forEach((ul) => {
      const count = ul.querySelectorAll("li").length;
      if (count > bestCount && count <= 30) { bestUl = ul; bestCount = count; }
    });
    if (bestUl) {
      ingredients = Array.from(bestUl.querySelectorAll("li"))
        .map((li) => li.textContent.trim())
        .filter(Boolean)
        .map(parseIngredient)
        .filter(Boolean);
    }
  }

  // Steps: numbered paragraphs
  const steps = [];
  doc.querySelectorAll("p").forEach((el) => {
    const text = el.textContent.trim();
    if (/^\d+[\.\)]\s+\S/.test(text) && text.length > 10) {
      steps.push(text.replace(/^\d+[\.\)]\s+/, "").trim());
    }
  });

  if (!ingredients.length && !steps.length) return null;
  if (!title) return null;
  return { title, image, time: null, servings: "4", tags: [], ingredients, steps, category: guessCategory([], title) };
}

// ── Parse raw pasted/OCR recipe text ─────────────────────────────────────────
export function parseRecipeText(text) {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const ingHeader = /^(ingredients?|ingredienser?|du trenger|what you need)\s*:?$/i;
  const stepHeader = /^(steps?|instructions?|fremgangsmåte|slik gjør du det|method|directions?)\s*:?$/i;

  let title = "";
  let mode = null;
  const ingredients = [];
  const steps = [];
  const other = [];

  for (const line of lines) {
    if (!title && !ingHeader.test(line) && !stepHeader.test(line)) {
      title = line;
      continue;
    }
    if (ingHeader.test(line)) { mode = "ing"; continue; }
    if (stepHeader.test(line)) { mode = "step"; continue; }
    if (mode === "ing") ingredients.push(line.replace(/^[-•*]\s*/, ""));
    else if (mode === "step") steps.push(line.replace(/^\d+[.)]\s*/, ""));
    else other.push(line);
  }

  // If no sections found, treat all lines after title as ingredients
  if (!ingredients.length && !steps.length && other.length) {
    return { title, ingredients: other, steps: [] };
  }
  return { title, ingredients, steps };
}

// ── Caption parser (TikTok / Instagram / Facebook) ───────────────────────────
export function parseCaptionForRecipe(caption) {
  if (!caption) return { ingredients: [], steps: [] };
  const lines = caption.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const ingredientHeader = /^(ingredients?|ingredienser?|what you'?ll need|du trenger)\s*:?$/i;
  const stepsHeader = /^(steps?|instructions?|method|how to make|fremgangsmåte|slik gjør du det|directions?)\s*:?$/i;
  let mode = null;
  const ingredients = [];
  const steps = [];
  const stripBullet = (line) => line.replace(/^[-•*✓]\s*/, "").trim();
  for (const line of lines) {
    if (ingredientHeader.test(line)) { mode = "ingredients"; continue; }
    if (stepsHeader.test(line)) { mode = "steps"; continue; }
    if (mode === "ingredients") { const c = stripBullet(line); if (c) ingredients.push(c); }
    else if (mode === "steps") { const c = stripBullet(line.replace(/^\d+[.)]\s*/, "")); if (c) steps.push(c); }
  }
  return { ingredients, steps };
}

// ── YouTube ID extractor ──────────────────────────────────────────────────────
export function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/(?:shorts|embed|v)\/([^/?]+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

// ── Source detector ───────────────────────────────────────────────────────────
export function detectSource(url) {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return { name: "TikTok", icon: "🎵" };
    if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") return { name: "YouTube", icon: "▶️" };
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return { name: "Instagram", icon: "📸" };
    if (h === "facebook.com" || h.endsWith(".facebook.com") || h === "fb.watch") return { name: "Facebook", icon: "📘" };
    return { name: h, icon: "🌐" };
  } catch { return { name: "Ukjent", icon: "🌐" }; }
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
export function timeAgo(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d === 0 ? "I dag" : d === 1 ? "I går" : `${d} dager siden`;
}

export function foodEmoji(title, tags) {
  const s = ((title || "") + " " + (tags || []).join(" ")).toLowerCase();
  if (s.match(/gulrot|carrot|kake|cake|dessert|sjokolade|chocolate/)) return "🎂";
  if (s.match(/pasta|spaghetti|carbonara|lasagne/)) return "🍝";
  if (s.match(/pizza/)) return "🍕";
  if (s.match(/salat|salad/)) return "🥗";
  if (s.match(/suppe|soup/)) return "🍲";
  if (s.match(/burger|sandwich/)) return "🍔";
  if (s.match(/kylling|chicken/)) return "🍗";
  if (s.match(/laks|salmon|fisk|fish/)) return "🐟";
  if (s.match(/taco|mex|burrito/)) return "🌮";
  if (s.match(/brød|bread|bolle/)) return "🍞";
  if (s.match(/egg/)) return "🍳";
  if (s.match(/curry/)) return "🍛";
  return "🍴";
}

export function cardTheme(title, tags) {
  const s = ((title || "") + " " + (tags || []).join(" ")).toLowerCase();
  if (s.match(/gulrot|carrot|kake|cake|dessert/)) return { a: "#c4622d", b: "#e8845a", c: "#fff3ee" };
  if (s.match(/sjokolade|chocolate/)) return { a: "#3d1f0f", b: "#7b3f1e", c: "#f5ede8" };
  if (s.match(/pasta|carbonara|lasagne/)) return { a: "#b8860b", b: "#daa520", c: "#fffbee" };
  if (s.match(/pizza/)) return { a: "#c0392b", b: "#e74c3c", c: "#fff0ef" };
  if (s.match(/salat|salad/)) return { a: "#27ae60", b: "#2ecc71", c: "#f0fff5" };
  if (s.match(/suppe|soup/)) return { a: "#d35400", b: "#e67e22", c: "#fff5ee" };
  if (s.match(/laks|salmon|fisk|fish/)) return { a: "#2980b9", b: "#3498db", c: "#eef7ff" };
  if (s.match(/kylling|chicken/)) return { a: "#8e6914", b: "#c49a22", c: "#fffbf0" };
  if (s.match(/taco|mex|burrito/)) return { a: "#6e2f0a", b: "#b5541a", c: "#fff5ee" };
  return { a: "#5c3d2e", b: "#9c7b6a", c: "#faf8f3" };
}

export function scaleAmount(amount, factor) {
  if (!amount || factor === 1) return amount;
  const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(",", "."));
  if (isNaN(n)) return amount;
  const scaled = Math.round(n * factor * 100) / 100;
  if (scaled === Math.floor(scaled)) return scaled;
  const fracMap = { 0.25: "¼", 0.5: "½", 0.75: "¾", 0.33: "⅓", 0.67: "⅔" };
  const whole = Math.floor(scaled);
  const dec = Math.round((scaled - whole) * 100) / 100;
  if (fracMap[dec]) return whole > 0 ? `${whole}${fracMap[dec]}` : fracMap[dec];
  return scaled;
}
