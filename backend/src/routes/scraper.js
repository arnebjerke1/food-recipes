const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { requireAuth } = require('./auth');

const router = express.Router();

// ── Social-platform helpers ───────────────────────────────────────────────────

/**
 * Returns 'tiktok' | 'instagram' | 'facebook' | null
 * Uses exact hostname matching to prevent substring spoofing (e.g. evil-tiktok.com).
 */
function detectSocialPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok';
    if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return 'instagram';
    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') return 'facebook';
  } catch {}
  return null;
}

/**
 * Very lightweight caption parser.
 * Looks for "Ingredients:" / "Steps:" headings and collects lines underneath.
 * Returns { ingredients: string[], steps: string[] }
 */
function parseSocialCaption(caption) {
  if (!caption) return { ingredients: [], steps: [] };
  const lines = caption.split(/\n/).map(l => l.trim()).filter(Boolean);

  const ingredientHeader = /^(ingredients?|ingredienser?|what you'?ll need|du trenger)\s*:?$/i;
  const stepsHeader      = /^(steps?|instructions?|method|how to make|fremgangsmåte|slik gjør du det|directions?)\s*:?$/i;

  let mode = null;
  const ingredients = [];
  const steps = [];

  const stripBullet = (line) => line.replace(/^[-•*✓]\s*/, '').trim();

  for (const line of lines) {
    if (ingredientHeader.test(line)) { mode = 'ingredients'; continue; }
    if (stepsHeader.test(line))      { mode = 'steps';       continue; }

    if (mode === 'ingredients') {
      const clean = stripBullet(line);
      if (clean) ingredients.push(clean);
    } else if (mode === 'steps') {
      const clean = stripBullet(line.replace(/^\d+[.)]\s*/, ''));
      if (clean) steps.push(clean);
    }
  }

  return { ingredients, steps };
}

/**
 * Fetch recipe data from a social-video URL.
 * Returns a partial recipe object; the user fills in the rest manually.
 * NOTE: the caller (route handler) has already validated the URL with isPrivateUrl()
 * and protocol checks. This function adds a second guard for the Instagram/Facebook
 * branches that issue a request to the user-supplied URL.
 */
async function extractSocialRecipe(url, platform) {
  const recipe = {
    title: '',
    description: '',
    ingredients: [],
    steps: [],
    image_url: '',
    source_url: url,
    servings: 4,
    prep_time: 0,
    cook_time: 0,
    tags: [platform, 'video'],
    isVideoOnly: true,
  };

  if (platform === 'tiktok') {
    // TikTok oEmbed is a fixed, well-known endpoint — not affected by the user URL.
    // Errors (private video, network failure, etc.) propagate to the route handler's try-catch.
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(oembedUrl, { timeout: 10000 });
    recipe.title       = data.title || 'TikTok-oppskrift';
    recipe.description = data.title || '';
    recipe.image_url   = data.thumbnail_url || '';
    const parsed = parseSocialCaption(data.title || '');
    recipe.ingredients = parsed.ingredients;
    recipe.steps       = parsed.steps;

  } else if (platform === 'instagram' || platform === 'facebook') {
    // Defensive SSRF guard: URL must already have passed isPrivateUrl() in the route
    // handler, but we re-check here so extractSocialRecipe is safe to call stand-alone.
    if (isPrivateUrl(url)) throw new Error('URL points to a private or restricted address');

    const defaultTitle = platform === 'instagram' ? 'Instagram-oppskrift' : 'Facebook-oppskrift';
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoodRecipesBot/1.0)' },
    });
    const $ = cheerio.load(response.data);
    const caption = $('meta[property="og:description"]').attr('content') || '';
    recipe.title       = $('meta[property="og:title"]').attr('content') || defaultTitle;
    recipe.description = caption;
    recipe.image_url   = $('meta[property="og:image"]').attr('content') || '';
    const parsed = parseSocialCaption(caption);
    recipe.ingredients = parsed.ingredients;
    recipe.steps       = parsed.steps;
  }

  return recipe;
}

// Block requests to private / loopback IP ranges to prevent SSRF
function isPrivateUrl(urlStr) {
  let hostname;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    return true;
  }
  // Block localhost and common private ranges
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^169\.254\./,   // link-local
  ];
  return privatePatterns.some((re) => re.test(hostname));
}

// Parse recipe from a URL
router.post('/parse-url', requireAuth, async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are supported' });
  }

  if (isPrivateUrl(url)) {
    return res.status(400).json({ error: 'URL points to a private or restricted address' });
  }

  // ── Social-video platforms (TikTok, Instagram, Facebook) ──────────────────
  const platform = detectSocialPlatform(url);
  if (platform) {
    try {
      const recipe = await extractSocialRecipe(url, platform);
      return res.json(recipe);
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        return res.status(408).json({ error: 'Request timed out. The site may be unavailable.' });
      }
      const msg =
        platform === 'tiktok'
          ? 'Kunne ikke hente TikTok-info. Kontroller at videoen er offentlig.'
          : platform === 'instagram'
          ? 'Kunne ikke hente Instagram-info. Kontroller at profilen er offentlig.'
          : 'Kunne ikke hente Facebook-info. Kontroller at innholdet er offentlig.';
      return res.status(502).json({ error: msg });
    }
  }

  // ── Regular website ────────────────────────────────────────────────────────
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      }
    });

    const $ = cheerio.load(response.data);
    const recipe = extractRecipe($, url);
    res.json(recipe);
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timed out. The site may be unavailable.' });
    }
    res.status(502).json({ error: 'Could not fetch the URL. Please add the recipe manually.' });
  }
});

function extractRecipe($, url) {
  const recipe = {
    title: '',
    description: '',
    ingredients: [],
    steps: [],
    image_url: '',
    source_url: url,
    servings: 4,
    prep_time: 0,
    cook_time: 0,
    tags: []
  };

  // Try JSON-LD structured data first (most reliable)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const raw = $(jsonLdScripts[i]).html();
      if (!raw) continue;
      const data = JSON.parse(raw);

      // Collect all schema objects from this block (handles @graph, arrays, and nesting)
      const candidates = [];
      const collect = (node) => {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(collect); return; }
        if (typeof node !== 'object') return;
        if (node['@graph']) collect(node['@graph']);
        candidates.push(node);
      };
      collect(data);

      const isRecipeType = (t) => t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
      const schemaData = candidates.find(d => isRecipeType(d['@type']));

      if (schemaData) {
        recipe.title = schemaData.name || '';
        recipe.description = schemaData.description || '';

        // image can be string, array of strings, or ImageObject
        const img = schemaData.image;
        if (Array.isArray(img)) {
          recipe.image_url = typeof img[0] === 'string' ? img[0] : (img[0]?.url || '');
        } else {
          recipe.image_url = typeof img === 'string' ? img : (img?.url || '');
        }

        recipe.ingredients = Array.isArray(schemaData.recipeIngredient)
          ? schemaData.recipeIngredient.map(s => String(s).trim()).filter(Boolean)
          : [];

        // recipeInstructions can be: string, HowToStep[], HowToSection[], or mixed
        const raw_inst = schemaData.recipeInstructions;
        if (typeof raw_inst === 'string') {
          recipe.steps = raw_inst.split(/\.\s+|\n+/).map(s => s.trim()).filter(s => s.length > 5);
        } else if (Array.isArray(raw_inst)) {
          recipe.steps = raw_inst.flatMap(inst => {
            if (typeof inst === 'string') return inst.trim() || [];
            // HowToSection has itemListElement with nested HowToStep objects
            if (inst['@type'] === 'HowToSection' && Array.isArray(inst.itemListElement)) {
              return inst.itemListElement.map(s => (typeof s === 'string' ? s : (s.text || s.name || ''))).filter(Boolean);
            }
            return (inst.text || inst.name || '').trim() || [];
          }).filter(Boolean);
        }

        recipe.servings = parseServings(schemaData.recipeYield);
        recipe.prep_time = parseDuration(schemaData.prepTime);
        recipe.cook_time = parseDuration(schemaData.cookTime);

        const cuisine = schemaData.recipeCuisine;
        const category = schemaData.recipeCategory;
        if (cuisine) recipe.tags.push(...(Array.isArray(cuisine) ? cuisine : [cuisine]));
        if (category) recipe.tags.push(...(Array.isArray(category) ? category : [category]));

        return recipe;
      }
    } catch {
      // continue to next script tag
    }
  }

  // Fallback: extract from HTML meta tags and common patterns
  recipe.title = $('meta[property="og:title"]').attr('content')
    || $('h1').first().text().trim()
    || $('title').text().replace(/\s*[\|–-].*$/, '').trim();

  recipe.description = $('meta[property="og:description"]').attr('content')
    || $('meta[name="description"]').attr('content')
    || '';

  recipe.image_url = $('meta[property="og:image"]').attr('content') || '';

  // Try ingredient selectors — ordered from most specific (WP plugins) to generic
  const ingredientSelectors = [
    // WP Recipe Maker (WPRM) — most popular WP recipe plugin
    '.wprm-recipe-ingredient',
    // Tasty Recipes
    '.tasty-recipes-ingredients-body li',
    '.tasty-recipe-ingredients li',
    // Recipe Card Blocks by WPZOOM
    '.recipe-card-ingredients li',
    // Easy Recipe Plus
    '.ERSIngredients li',
    // Cookbook by Yummly
    '.recipe-ingred_txt',
    // Microdata / schema.org
    '[itemprop="recipeIngredient"]',
    // Generic WP patterns
    '.recipe-ingredient',
    '.ingredients li',
    '.ingredient-list li',
    '.ingredient',
    '[class*="ingredient"] li',
  ];

  for (const sel of ingredientSelectors) {
    let items;
    if (sel === '.wprm-recipe-ingredient') {
      // WPRM stores amount, unit, and name in separate child spans — join them
      items = $(sel).map((_, el) => {
        const amount = $(el).find('.wprm-recipe-ingredient-amount').text().trim();
        const unit   = $(el).find('.wprm-recipe-ingredient-unit').text().trim();
        const name   = $(el).find('.wprm-recipe-ingredient-name').text().trim();
        return [amount, unit, name].filter(Boolean).join(' ');
      }).get().filter(Boolean);
    } else {
      items = $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
    }
    if (items.length > 0) {
      recipe.ingredients = items;
      break;
    }
  }

  // Try steps selectors — ordered from most specific to generic
  const stepsSelectors = [
    // WP Recipe Maker (WPRM)
    '.wprm-recipe-instruction-text',
    // Tasty Recipes
    '.tasty-recipes-instructions-body li',
    '.tasty-recipe-instructions li',
    // Recipe Card Blocks by WPZOOM
    '.recipe-card-directions li',
    // Easy Recipe Plus
    '.ERSInstructions li',
    // Microdata / schema.org
    '[itemprop="recipeInstructions"] li',
    // Generic WP patterns
    '.recipe-instruction',
    '.instructions li',
    '.instruction-list li',
    '.steps li',
    '.directions li',
    '[class*="instruction"] li',
    '[class*="step"] li',
    '[class*="direction"] li',
  ];

  for (const sel of stepsSelectors) {
    const items = $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
    if (items.length > 0) {
      recipe.steps = items;
      break;
    }
  }

  return recipe;
}

function parseDuration(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
}

function parseServings(val) {
  if (!val) return 4;
  if (typeof val === 'number') return val;
  const match = String(val).match(/\d+/);
  return match ? parseInt(match[0]) : 4;
}

module.exports = router;
module.exports.detectSocialPlatform = detectSocialPlatform;
module.exports.parseSocialCaption = parseSocialCaption;
