const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { requireAuth } = require('./auth');

const router = express.Router();

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

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FoodRecipesBot/1.0)'
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
      const data = JSON.parse(raw);

      let schemaData;
      if (Array.isArray(data)) {
        schemaData = data.find(d => d['@type'] === 'Recipe');
      } else if (data['@graph'] && Array.isArray(data['@graph'])) {
        schemaData = data['@graph'].find(d => d['@type'] === 'Recipe');
      } else {
        schemaData = data;
      }

      if (schemaData && schemaData['@type'] === 'Recipe') {
        recipe.title = schemaData.name || '';
        recipe.description = schemaData.description || '';
        recipe.image_url = Array.isArray(schemaData.image)
          ? schemaData.image[0]
          : (schemaData.image?.url || schemaData.image || '');

        recipe.ingredients = Array.isArray(schemaData.recipeIngredient)
          ? schemaData.recipeIngredient
          : [];

        const instructions = schemaData.recipeInstructions || [];
        recipe.steps = instructions.map(inst => {
          if (typeof inst === 'string') return inst;
          return inst.text || inst.name || '';
        }).filter(Boolean);

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

  // Try common ingredient selectors
  const ingredientSelectors = [
    '[itemprop="recipeIngredient"]',
    '.recipe-ingredient',
    '.ingredients li',
    '.ingredient',
    '[class*="ingredient"] li'
  ];

  for (const sel of ingredientSelectors) {
    const items = $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
    if (items.length > 0) {
      recipe.ingredients = items;
      break;
    }
  }

  // Try common steps selectors
  const stepsSelectors = [
    '[itemprop="recipeInstructions"] li',
    '.recipe-instruction',
    '.instructions li',
    '.steps li',
    '[class*="instruction"] li',
    '[class*="step"] li'
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
