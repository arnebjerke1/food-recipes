import { useState, useEffect, useRef } from "react";
import Tesseract from "tesseract.js";
import {
  parseDuration, parseIngredient, cleanStepText, parseSteps, guessCategory,
  parseSchemaRecipe, parseMicrodataRecipe, parseCssRecipe, parseBlogRecipe,
  parseRecipeText, parseCaptionForRecipe, getYoutubeId,
  detectSource, timeAgo, foodEmoji, cardTheme, scaleAmount,
} from "./parsers.js";

const STORAGE_KEY = "forkful-v2-recipes";

const CATEGORIES = ["Frokost", "Lunsj", "Middag", "Dessert", "Bakst", "Snacks", "Drikke", "Annet"];

// ── CORS proxy list (tried in order) ─────────────────────────────────────────
const PROXIES = [
  {
    url: (t) => `https://api.allorigins.win/get?url=${encodeURIComponent(t)}`,
    rawText: false,
  },
  {
    url: (t) => `https://corsproxy.io/?url=${encodeURIComponent(t)}`,
    rawText: true,
  },
  {
    url: (t) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}`,
    rawText: true,
  },
  {
    url: (t) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(t)}`,
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

// ── Fetch HTML via CORS proxies ───────────────────────────────────────────────
async function fetchHtml(url) {
  let lastError = null;
  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(proxy.url(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const html = proxy.rawText ? await res.text() : (await res.json()).contents;
      if (html && html.length > 100) return html;
      lastError = new Error("Tom respons fra siden");
    } catch (e) {
      if (e.name === "AbortError") { lastError = new Error("Tidsavbrudd"); continue; }
      lastError = e;
    }
  }
  throw lastError || new Error("Alle servere feilet");
}

async function fetchRecipeFromPage(url) {
  const html = await fetchHtml(url);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 1. JSON-LD
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of [...candidates]) {
        if (item["@graph"]) candidates.push(...item["@graph"]);
        if (
          item["@type"] === "Recipe" ||
          (Array.isArray(item["@type"]) && item["@type"].includes("Recipe"))
        ) {
          return parseSchemaRecipe(item, url, doc);
        }
      }
    } catch {}
  }

  // 2. Microdata
  const md = parseMicrodataRecipe(doc, url);
  if (md) return md;

  // 3. CSS plugin selectors
  const css = parseCssRecipe(doc, url);
  if (css) return css;

  // 4. Plain-blog fallback
  const blog = parseBlogRecipe(doc, url);
  if (blog) return blog;

  throw new RecipeNotFoundError(
    `Ingen oppskriftsdata funnet på siden.\n\nTips: Prøv matprat.no, allrecipes.com, bbcgoodfood.com eller andre store oppskriftssider.`
  );
}

// ── Duration parser ───────────────────────────────────────────────────────────


const VIDEO_FALLBACK_STEP = "Se videoen for fremgangsmåten. Legg til ingredienser og steg manuelt.";

async function fetchYoutubeRecipe(url) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error("Kunne ikke hente YouTube-info");
  const data = await res.json();
  const ytId = getYoutubeId(url);
  return {
    title: data.title || "YouTube-oppskrift",
    image: ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null,
    time: null,
    servings: "4",
    tags: ["video"],
    ingredients: [],
    steps: [VIDEO_FALLBACK_STEP],
    isVideoOnly: true,
    category: "Middag",
  };
}

async function fetchOgMeta(url, defaultTitle) {
  let title = defaultTitle, image = null, caption = "";
  try {
    const html = await fetchHtml(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    title = doc.querySelector('meta[property="og:title"]')?.content || title;
    image = doc.querySelector('meta[property="og:image"]')?.content || null;
    caption = doc.querySelector('meta[property="og:description"]')?.content || "";
  } catch {}
  return { title, image, caption };
}

async function fetchTikTokRecipe(url) {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  let data = null;
  try { const r = await fetch(oembedUrl); if (r.ok) data = await r.json(); } catch {}
  if (!data) {
    try {
      const html = await fetchHtml(oembedUrl);
      data = JSON.parse(html);
    } catch {}
  }
  if (!data) throw new Error("Kunne ikke hente TikTok-info.\nKontroller at videoen er offentlig.");
  const { ingredients, steps } = parseCaptionForRecipe(data.title || "");
  return {
    title: data.title || "TikTok-oppskrift",
    image: data.thumbnail_url || null,
    time: null, servings: "4",
    tags: ["video", "tiktok"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true, category: "Middag",
  };
}

async function fetchInstagramRecipe(url) {
  const { title, image, caption } = await fetchOgMeta(url, "Instagram-oppskrift");
  const { ingredients, steps } = parseCaptionForRecipe(caption);
  return {
    title, image, time: null, servings: "4",
    tags: ["video", "instagram"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true, category: "Middag",
  };
}

async function fetchFacebookRecipe(url) {
  const { title, image, caption } = await fetchOgMeta(url, "Facebook-oppskrift");
  const { ingredients, steps } = parseCaptionForRecipe(caption);
  return {
    title, image, time: null, servings: "4",
    tags: ["video", "facebook"],
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.length > 0 ? steps : [VIDEO_FALLBACK_STEP],
    isVideoOnly: true, category: "Middag",
  };
}

async function fetchRecipe(url, onStatus) {
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const isYt = hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  const isIg = hostname === "instagram.com" || hostname.endsWith(".instagram.com");
  const isTt = hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
  const isFb = hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch";

  if (isYt) { onStatus("▶️ Henter YouTube-info…"); return await fetchYoutubeRecipe(url); }
  if (isTt) { onStatus("🎵 Henter TikTok-info…"); return await fetchTikTokRecipe(url); }
  if (isIg) { onStatus("📸 Henter Instagram-info…"); return await fetchInstagramRecipe(url); }
  if (isFb) { onStatus("📘 Henter Facebook-info…"); return await fetchFacebookRecipe(url); }

  onStatus("🔍 Henter siden via proxy…");
  const recipe = await fetchRecipeFromPage(url);
  onStatus("✅ Ferdig!");
  return recipe;
}

// ── Translation (MyMemory free API) ──────────────────────────────────────────
async function translateOne(text, from, to) {
  if (!text || !text.trim()) return text;
  const str = String(text);
  if (str.length > 500) {
    // Split into chunks
    const words = str.split(" ");
    const chunks = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > 450 && cur) { chunks.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
    }
    if (cur) chunks.push(cur);
    const parts = await Promise.all(chunks.map((c) => translateOne(c, from, to)));
    return parts.join(" ");
  }
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(str)}&langpair=${from}|${to}`
    );
    const d = await r.json();
    return d.responseData?.translatedText || str;
  } catch {
    return str;
  }
}

async function translateRecipe(recipe, targetLang) {
  const from = targetLang === "no" ? "en" : "no";
  const [title, ...ingNames] = await Promise.all([
    translateOne(recipe.title, from, targetLang),
    ...recipe.ingredients.map((ing) => translateOne(ing.name, from, targetLang)),
  ]);
  const steps = await Promise.all(recipe.steps.map((s) => translateOne(s, from, targetLang)));
  const ingredients = recipe.ingredients.map((ing, i) => ({ ...ing, name: ingNames[i] }));
  return { ...recipe, title, ingredients, steps };
}

// ── Scaling helpers ───────────────────────────────────────────────────────────


// ── RecipePlaceholder ─────────────────────────────────────────────────────────
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

// ── URL helpers ───────────────────────────────────────────────────────────────
/** Return the URL only if it has an http or https scheme; otherwise null. */
function safeHref(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return url;
  } catch {}
  return null;
}

// ── SmartImage ────────────────────────────────────────────────────────────────
function proxyImg(url) {
  if (!url) return null;
  if (url.includes("img.youtube.com") || url.includes("ytimg.com")) return url;
  if (url.startsWith("data:image/")) return url;
  // Only proxy http/https image URLs
  if (!safeHref(url)) return null;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=800&h=500&fit=cover&output=jpg&q=85`;
}

function SmartImage({ recipe }) {
  const ytId = getYoutubeId(recipe.sourceUrl || "");
  const rawImage = safeHref(recipe.image) ? recipe.image : null;
  const sources = [
    ytId && `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
    ytId && `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
    rawImage && proxyImg(rawImage),
    rawImage, // direct fallback
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIdx(0); setFailed(false); }, [recipe.id, recipe.image]);

  if (failed || sources.length === 0) return <RecipePlaceholder recipe={recipe} />;
  return (
    <img
      key={recipe.id + "-" + idx}
      src={sources[idx]}
      alt={recipe.title}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      onError={() => { if (idx < sources.length - 1) setIdx((i) => i + 1); else setFailed(true); }}
    />
  );
}

// ── ManualForm ────────────────────────────────────────────────────────────────
function ManualForm({ onSave, onCancel, initialData }) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [time, setTime] = useState(initialData?.time || "");
  const [servings, setServings] = useState(initialData?.servings || "4");
  const [category, setCategory] = useState(initialData?.category || "Middag");
  const [tags, setTags] = useState(initialData?.tags?.join(", ") || "");
  const [image, setImage] = useState(initialData?.image || "");
  const [ings, setIngs] = useState(
    initialData?.ingredients
      ? initialData.ingredients.map((i) => [i.amount, i.unit, i.name].filter(Boolean).join(" ")).join("\n")
      : ""
  );
  const [steps, setSteps] = useState(initialData?.steps?.join("\n") || "");

  function save() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      time: time.trim() || null,
      servings: servings.trim() || "4",
      category,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      image: image.trim() || null,
      ingredients: ings.split("\n").filter(Boolean).map((l) => parseIngredient(l.trim())).filter(Boolean),
      steps: steps.split("\n").filter(Boolean).map((s) => s.trim()),
    });
  }

  const inp = { width:"100%",padding:".75rem 1rem",border:"1.5px solid #e0d5c5",borderRadius:12,fontFamily:"'DM Sans',sans-serif",fontSize:".9rem",color:"#2c1810",background:"#faf8f3",outline:"none",marginBottom:".75rem" };
  const ta = { ...inp, minHeight:100, resize:"vertical", display:"block" };
  const lbl = { fontSize:".75rem",fontWeight:600,color:"#5c3d2e",textTransform:"uppercase",letterSpacing:".05em",display:"block",marginBottom:".3rem" };
  const sel = { ...inp, appearance:"none", cursor:"pointer" };

  return (
    <div>
      <label style={lbl}>Tittel *</label>
      <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Glutenfri gulrotkake" />

      <div style={{ display:"flex", gap:".5rem" }}>
        <div style={{ flex:1 }}>
          <label style={lbl}>Tid</label>
          <input style={inp} value={time} onChange={(e) => setTime(e.target.value)} placeholder="30 min" />
        </div>
        <div style={{ flex:1 }}>
          <label style={lbl}>Porsjoner</label>
          <input style={inp} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
        </div>
      </div>

      <label style={lbl}>Kategori</label>
      <select style={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label style={lbl}>Bilde URL (valgfritt)</label>
      <input style={inp} value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." />

      <label style={lbl}>Tagger (kommaseparert)</label>
      <input style={inp} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="kake, glutenfri, norsk" />

      <label style={lbl}>Ingredienser (én per linje)</label>
      <textarea style={ta} value={ings} onChange={(e) => setIngs(e.target.value)} placeholder={"400 g mandelmel\n3 egg\n2 ts kanel"} />

      <label style={lbl}>Fremgangsmåte (ett steg per linje)</label>
      <textarea style={ta} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"Bland egg og sukker.\nSikt inn mel og kanel.\nStek på 175°C i 35 min."} />

      <div style={{ display:"flex", gap:".75rem", justifyContent:"flex-end", marginTop:".5rem" }}>
        <button className="btn btn-muted" onClick={onCancel}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>Lagre →</button>
      </div>
    </div>
  );
}

// ── PhotoTab ──────────────────────────────────────────────────────────────────
function PhotoTab({ onParsed, onCancel }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setImageUrl(dataUrl);
      setText("");
      setOcrLoading(true);
      setOcrProgress(0);
      try {
        const { data } = await Tesseract.recognize(dataUrl, "nor+eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setOcrProgress(Math.round((m.progress || 0) * 100));
            }
          },
        });
        setText(data.text || "");
      } catch {
        // OCR failed — user can still paste manually
      } finally {
        setOcrLoading(false);
        setOcrProgress(0);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleParse() {
    if (!text.trim()) return;
    const result = parseRecipeText(text);
    setParsed(result);
  }

  if (parsed) {
    return (
      <ManualForm
        initialData={{ ...parsed, ingredients: parsed.ingredients.map((s) => parseIngredient(s)).filter(Boolean) }}
        onSave={onParsed}
        onCancel={() => setParsed(null)}
      />
    );
  }

  const inp2 = { width:"100%",padding:".75rem 1rem",border:"1.5px solid #e0d5c5",borderRadius:12,fontFamily:"'DM Sans',sans-serif",fontSize:".9rem",color:"#2c1810",background:"#faf8f3",outline:"none",marginBottom:".75rem",display:"block" };
  const lbl2 = { fontSize:".75rem",fontWeight:600,color:"#5c3d2e",textTransform:"uppercase",letterSpacing:".05em",display:"block",marginBottom:".3rem" };

  return (
    <div>
      <p style={{ fontFamily:"'Lora',serif",fontSize:".9rem",color:"#9c7b6a",marginBottom:"1rem",lineHeight:1.6 }}>
        Ta bilde av kokebok eller håndskrevet oppskrift — teksten gjenkjennes automatisk.
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleFile} />
      <button className="btn btn-primary" style={{ width:"100%",marginBottom:"1rem" }} onClick={() => fileRef.current?.click()} disabled={ocrLoading}>
        📷 Ta bilde / velg bilde
      </button>

      {imageUrl && (
        <div style={{ marginBottom:"1rem",borderRadius:12,overflow:"hidden",border:"1.5px solid #e0d5c5",maxHeight:240,display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f0e8" }}>
          <img src={imageUrl} alt="Valgt bilde" style={{ maxWidth:"100%",maxHeight:240,objectFit:"contain" }} />
        </div>
      )}

      {ocrLoading && (
        <div style={{ background:"#fff8f0",border:"1px solid #f0d8b8",borderRadius:10,padding:".85rem 1rem",fontSize:".82rem",color:"#7a4f2e",marginBottom:"1rem",lineHeight:1.6,display:"flex",alignItems:"center",gap:".6rem" }}>
          <span className="spin" style={{ width:14,height:14,borderWidth:2 }} />
          Leser tekst fra bilde… {ocrProgress > 0 ? `${ocrProgress}%` : ""}
        </div>
      )}

      {!ocrLoading && (
        <>
          <label style={lbl2}>Gjenkjent tekst (rediger om nødvendig)</label>
          <textarea
            style={{ ...inp2, minHeight:120, resize:"vertical" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Tittel\nIngredienser:\n400 g mel\n3 egg\nFremgangsmåte:\nBland alt sammen..."}
          />
        </>
      )}

      <div style={{ display:"flex",gap:".75rem",justifyContent:"flex-end" }}>
        <button className="btn btn-muted" onClick={onCancel}>Avbryt</button>
        <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim() || ocrLoading}>Analyser tekst →</button>
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
    time: "20 min", servings: "4",
    category: "Middag",
    tags: ["pasta", "italiensk", "rask"],
    tried: false,
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
.header{background:var(--br);padding:0 1.25rem;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100;gap:.5rem}
.logo{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--cream);cursor:pointer;display:flex;align-items:center;gap:.35rem;flex-shrink:0}
.logo span{color:var(--tc-l)}
.header-actions{display:flex;gap:.5rem;align-items:center}
.btn{border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.875rem;font-weight:500;border-radius:100px;padding:.5rem 1.1rem;transition:all .18s;display:inline-flex;align-items:center;gap:.35rem}
.btn-primary{background:var(--tc);color:#fff}
.btn-primary:hover:not(:disabled){background:#a8511f;transform:translateY(-1px);box-shadow:0 4px 12px rgba(196,98,45,.4)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:rgba(255,255,255,.1);color:var(--cream);border:1px solid rgba(255,255,255,.2);font-size:.8rem;padding:.4rem .9rem}
.btn-ghost:hover{background:rgba(255,255,255,.2)}
.btn-muted{background:var(--sand);color:var(--brm)}
.btn-muted:hover:not(:disabled){background:var(--bd)}
.btn-sm{padding:.35rem .8rem;font-size:.78rem}
.btn-danger{background:#fff0ed;color:#c0392b;border:1px solid #ffd5cc}
.btn-danger:hover{background:#ffe0da}
.hero{text-align:center;padding:4rem 2rem 2rem}
.hero-icon{font-size:3.5rem;margin-bottom:1.25rem;display:block}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,5vw,3rem);color:var(--br);line-height:1.15;margin-bottom:.75rem}
.hero h1 em{font-style:italic;color:var(--tc)}
.hero p{font-family:'Lora',serif;font-size:1rem;color:var(--brl);max-width:440px;margin:0 auto 1.75rem;line-height:1.7}

/* ── Filter bar ── */
.filter-section{padding:.75rem 1.25rem .5rem;border-bottom:1px solid var(--bd)}
.filter-label{font-size:.7rem;color:var(--brl);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem}
.filter-row{display:flex;gap:.4rem;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px}
.filter-row::-webkit-scrollbar{display:none}
.chip{flex-shrink:0;padding:.3rem .8rem;border-radius:100px;border:1.5px solid var(--bd);background:var(--cream);color:var(--brm);font-size:.78rem;font-weight:500;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.chip.active{background:var(--tc);border-color:var(--tc);color:#fff}

/* ── Grid – single column ── */
.grid-top{padding:1rem 1.25rem .5rem;display:flex;align-items:baseline;justify-content:space-between}
.grid-top h2{font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--br)}
.count{font-size:.82rem;color:var(--brl);background:var(--sand);padding:.2rem .65rem;border-radius:100px}
.grid{display:flex;flex-direction:column;gap:1rem;padding:.5rem 1.25rem 6rem}
.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:var(--sh);cursor:pointer;transition:all .22s;border:1px solid var(--bd);display:flex;flex-direction:row;align-items:stretch;gap:0}
.card:active{transform:scale(.98);box-shadow:var(--sh)}
.card-thumb{width:110px;min-width:110px;height:110px;background:var(--sand);overflow:hidden;flex-shrink:0}
.card-body{padding:.85rem 1rem;flex:1;min-width:0}
.card-src{font-size:.68rem;color:var(--brl);display:flex;align-items:center;gap:.3rem;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.05em;font-weight:500}
.card-title{font-family:'Playfair Display',serif;font-size:1rem;color:var(--br);margin-bottom:.4rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-meta{display:flex;gap:.6rem;font-size:.75rem;color:var(--brl);margin-bottom:.4rem;flex-wrap:wrap}
.tags{display:flex;flex-wrap:wrap;gap:.3rem}
.tag{background:var(--sand);color:var(--brm);font-size:.65rem;padding:.15rem .5rem;border-radius:100px;font-weight:500}
.tried-pill{font-size:.65rem;font-weight:600;padding:.15rem .5rem;border-radius:100px}
.tried-pill.yes{background:#e8f5e9;color:#2e7d32}
.tried-pill.no{background:var(--sand);color:var(--brl)}
.card-cat{font-size:.65rem;color:var(--tc);font-weight:600;margin-bottom:.25rem}

/* ── Detail ── */
.detail{max-width:720px;margin:0 auto;padding:1.25rem 1.25rem 5rem}
.back{background:var(--sand);color:var(--brm);border:none;padding:.45rem .9rem;border-radius:100px;font-family:'DM Sans',sans-serif;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;margin-bottom:1.25rem;transition:background .15s}
.back:hover{background:var(--bd)}
.d-hero{border-radius:18px;overflow:hidden;height:240px;margin-bottom:1.25rem;background:var(--sand)}
@media(min-width:600px){.d-hero{height:320px}}
.d-src{font-size:.78rem;color:var(--tc);text-transform:uppercase;letter-spacing:.08em;font-weight:500;display:flex;align-items:center;gap:.35rem;margin-bottom:.4rem}
.d-title{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,4vw,2.4rem);color:var(--br);line-height:1.2;margin-bottom:.75rem}
.d-meta{display:flex;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap;align-items:center}
.d-chip{display:flex;align-items:center;gap:.35rem;font-size:.88rem;color:var(--brm)}
.d-chip strong{color:var(--br);font-weight:500}

/* ── Action buttons ── */
.action-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.25rem}
.act-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .9rem;border-radius:100px;border:1.5px solid var(--bd);background:#fff;color:var(--brm);font-size:.78rem;font-weight:500;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.act-btn:hover{border-color:var(--tc);color:var(--tc)}
.act-btn.active{background:var(--tc);border-color:var(--tc);color:#fff}
.act-btn.danger{border-color:#ffd5cc;color:#c0392b}
.act-btn.danger:hover{background:#fff0ed}

/* ── Scale row ── */
.scale-row{display:flex;align-items:center;gap:.75rem;background:var(--sand);padding:.6rem 1rem;border-radius:12px;margin-bottom:1rem}
.scale-btn{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--bd);background:#fff;color:var(--brm);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;font-family:'DM Sans',sans-serif}
.scale-btn:hover:not(:disabled){background:var(--tc);border-color:var(--tc);color:#fff}
.scale-btn:disabled{opacity:.4;cursor:not-allowed}
.scale-val{font-size:.85rem;font-weight:500;color:var(--br);flex:1;text-align:center}
.scale-note{font-size:.72rem;color:var(--brl);font-style:italic}

/* ── Ingredients & steps ── */
.sec{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--br);margin-bottom:.85rem;padding-bottom:.45rem;border-bottom:2px solid var(--sand);margin-top:1.75rem}
.ings{list-style:none;margin-bottom:.5rem}
.ing{display:flex;align-items:baseline;gap:.65rem;padding:.6rem 0;border-bottom:1px solid var(--bd);font-size:.92rem}
.ing:last-child{border-bottom:none}
.ing-amt{font-weight:500;color:var(--tc);min-width:72px;text-align:right;font-size:.85rem;flex-shrink:0}
.ing-name{color:var(--br)}
.steps-list{list-style:none;margin-bottom:.5rem}
.step{display:flex;gap:.85rem;margin-bottom:1.1rem;align-items:flex-start}
.step-n{width:26px;height:26px;background:var(--tc);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:600;flex-shrink:0;margin-top:2px}
.step-t{font-family:'Lora',serif;font-size:.92rem;line-height:1.75;color:var(--brm)}
.video-note{background:var(--sand);border-radius:12px;padding:1rem;font-family:'Lora',serif;font-size:.9rem;color:var(--brm);line-height:1.6;margin-top:1.5rem}

/* ── Translation box ── */
.trans-box{background:var(--sand);border-radius:12px;padding:1rem;margin-top:1rem;border:1px solid var(--bd)}
.trans-box h4{font-family:'Playfair Display',serif;font-size:1rem;color:var(--br);margin-bottom:.5rem}
.trans-ing,.trans-step{font-size:.88rem;color:var(--brm);margin-bottom:.3rem;line-height:1.5}

/* ── Modal / Overlay ── */
.overlay{position:fixed;inset:0;background:rgba(44,24,16,.55);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(4px);animation:fi .18s ease}
@media(min-width:600px){.overlay{align-items:center;padding:1rem}}
@keyframes fi{from{opacity:0}to{opacity:1}}
.modal{background:#fff;border-radius:24px 24px 0 0;padding:1.75rem 1.5rem 2.5rem;width:100%;max-width:540px;box-shadow:var(--sh-lg);animation:su .25s ease;max-height:92vh;overflow-y:auto}
@media(min-width:600px){.modal{border-radius:24px;padding:2.25rem;max-height:85vh}}
@keyframes su{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.modal-title{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--br);margin-bottom:.35rem}
.modal-sub{font-size:.88rem;color:var(--brl);margin-bottom:1.25rem;line-height:1.6;font-family:'Lora',serif}
.tab-row{display:flex;gap:.4rem;margin-bottom:1.25rem;flex-wrap:wrap}
.tab{flex:1;min-width:0;padding:.6rem .4rem;border:1.5px solid var(--bd);border-radius:10px;background:#fff;color:var(--brm);font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:500;cursor:pointer;transition:all .15s;text-align:center;white-space:nowrap}
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
.modal-foot{display:flex;justify-content:space-between;align-items:center;margin-top:.5rem;gap:.5rem}

/* ── Translation loading ── */
.trans-loading{display:flex;align-items:center;gap:.5rem;color:var(--brl);font-size:.82rem;font-style:italic;font-family:'Lora',serif}
`;

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [recipes, setRecipes] = useState([]);
  const [view, setView] = useState("grid"); // grid | detail
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("url"); // url | manual | photo
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [ready, setReady] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [triedFilter, setTriedFilter] = useState(null); // null | true | false

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Scale state (per-detail-view)
  const [curServings, setCurServings] = useState(4);

  // Translation state
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState(null); // { title, ingredients, steps }
  const [showTranslated, setShowTranslated] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);

  const inputRef = useRef(null);
  const importRef = useRef(null);

  // ── Storage ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      // Migrate old recipes to add new fields
      const migrated = (saved.length ? saved : SAMPLES).map((r) => ({
        tried: false,
        category: guessCategory(r.tags || [], r.title || ""),
        ...r,
      }));
      setRecipes(migrated);
    } catch { setRecipes(SAMPLES); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)); } catch {}
    }
  }, [recipes, ready]);

  // ── Web Share Target: handle ?url= / ?text= params ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = (params.get("url") || params.get("text") || "").trim();
    if (sharedUrl && /^https?:\/\//i.test(sharedUrl)) {
      setUrl(sharedUrl);
      setTab("url");
      setShowAdd(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (showAdd) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showAdd, tab]);

  // ── When entering detail, reset scale & translation ──
  function openDetail(r) {
    setSelected(r);
    setCurServings(parseInt(r.servings) || 4);
    setTranslated(null);
    setShowTranslated(false);
    setView("detail");
  }

  function openAdd() { setShowAdd(true); setError(""); setAdded(false); setUrl(""); setTab("url"); }
  function closeAdd() { if (!loading) setShowAdd(false); }

  function addRecipe(data, sourceUrl) {
    const src = detectSource(sourceUrl || "");
    const recipe = {
      id: "r-" + Date.now(),
      title: data.title || "Ukjent oppskrift",
      source: src.name,
      sourceUrl: sourceUrl || "",
      image: data.image || null,
      time: data.time || null,
      servings: String(data.servings || "4"),
      category: data.category || guessCategory(data.tags || [], data.title || ""),
      tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((i) => i?.name) : [],
      steps: Array.isArray(data.steps) ? data.steps.filter(Boolean) : [],
      isVideoOnly: data.isVideoOnly || false,
      tried: false,
      savedAt: new Date().toISOString(),
    };
    setRecipes((p) => [recipe, ...p]);
    setAdded(true);
    setTimeout(() => { setShowAdd(false); setAdded(false); }, 1400);
  }

  async function handleUrl() {
    const u = url.trim();
    if (!u) return;
    setLoading(true); setError(""); setAdded(false);
    try {
      let data = await fetchRecipe(u, setStatus);
      if (autoTranslate) {
        setStatus("🌐 Oversetter til norsk…");
        try { data = await translateRecipe(data, "no"); } catch {}
      }
      addRecipe(data, u);
    } catch (e) {
      setError(isNetworkError(e)
        ? "Kunne ikke koble til for å hente oppskriften. Sjekk internettforbindelsen din og prøv igjen."
        : e.message || "Ukjent feil");
    } finally { setLoading(false); setStatus(""); }
  }

  function handleManual(data) { addRecipe(data, ""); setShowAdd(false); }
  function handlePhoto(data) { addRecipe(data, ""); setShowAdd(false); }

  function doDelete(id) {
    if (!confirm("Slette denne oppskriften?")) return;
    setRecipes((p) => p.filter((r) => r.id !== id));
    setView("grid");
  }

  function toggleTried(id) {
    setRecipes((p) => p.map((r) => r.id === id ? { ...r, tried: !r.tried } : r));
    if (selected?.id === id) setSelected((s) => s ? { ...s, tried: !s.tried } : s);
  }

  // ── Edit ──
  function openEdit(r) { setEditTarget(r); setShowEdit(true); }

  function saveEdit(data) {
    const updated = {
      ...editTarget,
      title: data.title,
      time: data.time,
      servings: data.servings,
      category: data.category,
      tags: data.tags,
      image: data.image,
      ingredients: data.ingredients,
      steps: data.steps,
      source: editTarget.source,
    };
    setRecipes((p) => p.map((r) => r.id === editTarget.id ? updated : r));
    if (selected?.id === editTarget.id) {
      setSelected(updated);
      setCurServings(parseInt(updated.servings) || 4);
    }
    setShowEdit(false);
    setEditTarget(null);
  }

  // ── Translation ──
  async function handleTranslate(toLang) {
    if (!selected) return;
    setTranslating(true);
    try {
      const result = await translateRecipe(selected, toLang);
      setTranslated(result);
      setShowTranslated(true);
    } catch { setTranslated(null); }
    finally { setTranslating(false); }
  }

  // ── Backup / Restore ──
  function exportData() {
    const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `forkful-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) {
          setRecipes((prev) => {
            const ids = new Set(prev.map((r) => r.id));
            const newOnes = data.filter((r) => !ids.has(r.id));
            const merged = [...newOnes, ...prev];
            return merged;
          });
          alert(`Importerte ${data.length} oppskrifter (duplikater ble hoppet over).`);
        } else { alert("Ugyldig sikkerhetskopifil."); }
      } catch { alert("Kunne ikke lese filen. Kontroller at det er en gyldig JSON-fil."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Filtered recipes ──
  const filtered = recipes.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (triedFilter === true && !r.tried) return false;
    if (triedFilter === false && r.tried) return false;
    return true;
  });

  // ── Scaling ──
  const origServings = selected ? (parseInt(selected.servings) || 4) : 4;
  const scaleFactor = origServings > 0 ? curServings / origServings : 1;

  function scaledIngredients(ings) {
    if (scaleFactor === 1) return ings;
    return ings.map((ing) => ({ ...ing, amount: scaleAmount(ing.amount, scaleFactor) }));
  }

  // Decide which content to display (translated or original)
  const displayRecipe = showTranslated && translated ? translated : selected;

  return (
    <>
      <style>{FONTS + CSS}</style>
      <div className="app">

        {/* ── Header ── */}
        <header className="header">
          <div className="logo" onClick={() => setView("grid")}>🍴 Fork<span>ful</span></div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={exportData} title="Eksporter oppskrifter">💾</button>
            <label className="btn btn-ghost btn-sm" title="Importer oppskrifter" style={{ cursor:"pointer" }}>
              📂
              <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport} />
            </label>
            <button className="btn btn-primary" onClick={openAdd}>+ Legg til</button>
          </div>
        </header>

        {/* ── Grid view ── */}
        {view === "grid" && (
          recipes.length === 0
            ? <div className="hero">
                <span className="hero-icon">🍽️</span>
                <h1>Din personlige<br /><em>oppskriftsbok</em></h1>
                <p>Lim inn en lenke fra matprat.no, allrecipes.com og de fleste andre oppskriftssider — vi henter og lagrer alt automatisk.</p>
                <button className="btn btn-primary" style={{ margin:"0 auto",fontSize:"1rem",padding:".75rem 2rem" }} onClick={openAdd}>
                  + Legg til din første oppskrift
                </button>
              </div>
            : <>
                {/* Filters */}
                <div className="filter-section">
                  <div className="filter-label">Kategori</div>
                  <div className="filter-row">
                    <button className={"chip" + (!categoryFilter ? " active" : "")} onClick={() => setCategoryFilter(null)}>Alle</button>
                    {CATEGORIES.map((c) => (
                      <button key={c} className={"chip" + (categoryFilter === c ? " active" : "")} onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}>{c}</button>
                    ))}
                  </div>
                  <div className="filter-row" style={{ marginTop:".4rem" }}>
                    <button className={"chip" + (triedFilter === null ? " active" : "")} onClick={() => setTriedFilter(null)}>Alle</button>
                    <button className={"chip" + (triedFilter === false ? " active" : "")} onClick={() => setTriedFilter(triedFilter === false ? null : false)}>Ikke prøvd</button>
                    <button className={"chip" + (triedFilter === true ? " active" : "")} onClick={() => setTriedFilter(triedFilter === true ? null : true)}>✅ Prøvd</button>
                  </div>
                </div>

                <div className="grid-top">
                  <h2>Mine oppskrifter</h2>
                  <span className="count">{filtered.length} / {recipes.length}</span>
                </div>

                {filtered.length === 0
                  ? <div style={{ textAlign:"center",padding:"2rem",color:"var(--brl)",fontFamily:"'Lora',serif",fontSize:".95rem" }}>
                      Ingen oppskrifter matcher filteret. <button className="btn btn-muted btn-sm" style={{ marginTop:".5rem" }} onClick={() => { setCategoryFilter(null); setTriedFilter(null); }}>Nullstill filter</button>
                    </div>
                  : <div className="grid">
                      {filtered.map((r) => (
                        <div key={r.id} className="card" onClick={() => openDetail(r)}>
                          <div className="card-thumb"><SmartImage recipe={r} /></div>
                          <div className="card-body">
                            <div className="card-cat">{r.category || "Middag"}</div>
                            <div className="card-src">{detectSource(r.sourceUrl || "").icon} {r.source}</div>
                            <div className="card-title">{r.title}</div>
                            <div className="card-meta">
                              {r.time && <span>⏱ {r.time}</span>}
                              <span>👤 {r.servings} porsjoner</span>
                            </div>
                            <div style={{ display:"flex",gap:".3rem",alignItems:"center",flexWrap:"wrap" }}>
                              <span className={"tried-pill " + (r.tried ? "yes" : "no")}>{r.tried ? "✅ Prøvd" : "Ikke prøvd"}</span>
                              {r.tags?.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </>
        )}

        {/* ── Detail view ── */}
        {view === "detail" && selected && displayRecipe && (
          <div className="detail">
            <button className="back" onClick={() => setView("grid")}>← Tilbake</button>
            <div className="d-hero"><SmartImage recipe={selected} /></div>

            <div className="d-src">
              {detectSource(selected.sourceUrl || "").icon} {selected.source}
              {safeHref(selected.sourceUrl) && (
                <button
                  onClick={() => window.open(safeHref(selected.sourceUrl), "_blank", "noopener,noreferrer")}
                  style={{ background:"none",border:"none",cursor:"pointer",color:"inherit",marginLeft:".3rem",fontSize:"inherit",padding:0 }}
                >↗</button>
              )}
            </div>

            <h1 className="d-title">{displayRecipe.title}</h1>

            <div className="d-meta">
              {selected.time && <div className="d-chip">⏱ <strong>{selected.time}</strong></div>}
              <div className="d-chip">🍽️ <strong>{selected.category || "Middag"}</strong></div>
              {displayRecipe.ingredients?.length > 0 && (
                <div className="d-chip">🧂 <strong>{displayRecipe.ingredients.length} ingredienser</strong></div>
              )}
            </div>

            {selected.tags?.length > 0 && (
              <div className="tags" style={{ marginBottom:"1rem" }}>
                {selected.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}

            {/* ── Action buttons ── */}
            <div className="action-row">
              <button
                className={"act-btn" + (selected.tried ? " active" : "")}
                onClick={() => toggleTried(selected.id)}
              >
                {selected.tried ? "✅ Prøvd" : "☐ Merk som prøvd"}
              </button>
              <button className="act-btn" onClick={() => openEdit(selected)}>✏️ Rediger</button>
              {!showTranslated && (
                <button className="act-btn" onClick={() => handleTranslate("no")} disabled={translating}>
                  {translating ? <><span className="spin" style={{ width:12,height:12,borderWidth:2 }} /> Oversetter…</> : "🇳🇴 Oversett til norsk"}
                </button>
              )}
              {!showTranslated && (
                <button className="act-btn" onClick={() => handleTranslate("en")} disabled={translating}>
                  {translating ? "" : "🇬🇧 Translate to English"}
                </button>
              )}
              {showTranslated && (
                <button className="act-btn" onClick={() => setShowTranslated(false)}>↩ Vis original</button>
              )}
              <button className="act-btn danger" onClick={() => doDelete(selected.id)}>🗑 Slett</button>
            </div>

            {selected.isVideoOnly && (
              <div className="video-note">
                📹 Denne oppskriften er fra en video.{" "}
                {safeHref(selected.sourceUrl) && (
                  <button
                    onClick={() => window.open(safeHref(selected.sourceUrl), "_blank", "noopener,noreferrer")}
                    style={{ background:"none",border:"none",cursor:"pointer",color:"#c4622d",fontSize:"inherit",padding:0,textDecoration:"underline" }}
                  >Se videoen her ↗</button>
                )}
              </div>
            )}

            {/* ── Scale control ── */}
            {displayRecipe.ingredients?.length > 0 && (
              <>
                <h3 className="sec">Ingredienser</h3>
                <div className="scale-row">
                  <button
                    className="scale-btn"
                    onClick={() => setCurServings((v) => Math.max(1, v - 1))}
                    disabled={curServings <= 1}
                  >−</button>
                  <span className="scale-val">
                    {curServings} porsjon{curServings !== 1 ? "er" : ""}
                    {scaleFactor !== 1 && (
                      <span className="scale-note"> (×{Math.round(scaleFactor * 100) / 100})</span>
                    )}
                  </span>
                  <button
                    className="scale-btn"
                    onClick={() => setCurServings((v) => v + 1)}
                  >+</button>
                  <button
                    className="btn btn-muted btn-sm"
                    onClick={() => setCurServings(parseInt(selected.servings) || 4)}
                    style={{ display: scaleFactor !== 1 ? "inline-flex" : "none" }}
                  >Nullstill</button>
                </div>
                <ul className="ings">
                  {scaledIngredients(displayRecipe.ingredients).map((ing, i) => (
                    <li key={i} className="ing">
                      <span className="ing-amt">{ing.amount}{ing.unit ? " " + ing.unit : ""}</span>
                      <span className="ing-name">{ing.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {displayRecipe.steps?.length > 0 && (
              <>
                <h3 className="sec">Fremgangsmåte</h3>
                <ol className="steps-list">
                  {displayRecipe.steps.map((s, i) => (
                    <li key={i} className="step">
                      <span className="step-n">{i + 1}</span>
                      <span className="step-t">{s}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}

        {/* ── Add Modal ── */}
        {showAdd && (
          <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAdd(); }}>
            <div className="modal">
              <h2 className="modal-title">Legg til oppskrift</h2>
              <div className="tab-row">
                <button className={"tab" + (tab === "url" ? " active" : "")} onClick={() => setTab("url")}>�� Fra lenke</button>
                <button className={"tab" + (tab === "manual" ? " active" : "")} onClick={() => setTab("manual")}>✏️ Manuelt</button>
                <button className={"tab" + (tab === "photo" ? " active" : "")} onClick={() => setTab("photo")}>📷 Fra bilde</button>
              </div>

              {tab === "url" && (
                <>
                  <p className="modal-sub">Lim inn lenke fra en oppskriftsside — vi leser strukturdata direkte fra siden.</p>
                  <div className="info-box">
                    ✅ <strong>Fungerer med:</strong> matprat.no, allrecipes.com, bbcgoodfood.com og de fleste andre<br />
                    🎵 TikTok · 📸 Instagram · 📘 Facebook: Henter tittel og bilde (kun åpne profiler)<br />
                    ▶️ YouTube: Henter tittel og miniatyrbilde automatisk
                  </div>
                  <div className="input-row">
                    <input
                      ref={inputRef}
                      className="url-in"
                      type="url"
                      placeholder="https://www.matprat.no/oppskrifter/..."
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && !loading && url.trim() && handleUrl()}
                      disabled={loading}
                    />
                    <button className="btn btn-primary" onClick={handleUrl} disabled={loading || !url.trim()}>
                      {loading ? <span className="spin" /> : "Hent →"}
                    </button>
                  </div>
                  <label style={{ display:"flex",alignItems:"center",gap:".5rem",fontSize:".82rem",color:"#5c3d2e",marginBottom:".5rem",cursor:"pointer",userSelect:"none" }}>
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(e) => setAutoTranslate(e.target.checked)}
                      style={{ accentColor:"#c4622d",width:15,height:15,cursor:"pointer" }}
                    />
                    🇳🇴 Oversett til norsk automatisk ved innlegging
                  </label>
                  {loading && <div className="status-row"><span className="spin" />{status}</div>}
                  {added && <div className="ok-box">✅ Lagret! Åpner samlingen…</div>}
                  {error && <div className="err-box">❌ {error}</div>}
                  <div className="modal-foot">
                    <button className="btn btn-muted" onClick={closeAdd} disabled={loading}>Avbryt</button>
                  </div>
                </>
              )}

              {tab === "manual" && (
                <ManualForm onSave={handleManual} onCancel={closeAdd} />
              )}

              {tab === "photo" && (
                <PhotoTab onParsed={handlePhoto} onCancel={closeAdd} />
              )}
            </div>
          </div>
        )}

        {/* ── Edit Modal ── */}
        {showEdit && editTarget && (
          <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowEdit(false); setEditTarget(null); } }}>
            <div className="modal">
              <h2 className="modal-title">Rediger oppskrift</h2>
              <ManualForm
                initialData={{
                  title: editTarget.title,
                  time: editTarget.time,
                  servings: editTarget.servings,
                  category: editTarget.category,
                  tags: editTarget.tags,
                  image: editTarget.image,
                  ingredients: editTarget.ingredients,
                  steps: editTarget.steps,
                }}
                onSave={saveEdit}
                onCancel={() => { setShowEdit(false); setEditTarget(null); }}
              />
            </div>
          </div>
        )}

      </div>
    </>
  );
}
