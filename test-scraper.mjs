// Quick standalone scraper test — no server needed, no SQLite.
// Run with: node test-scraper.mjs
import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Helpers (copied from scraper.js) ─────────────────────────────────────────

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

function extractRecipe($, url) {
  const recipe = { title:'', description:'', ingredients:[], steps:[], image_url:'', source_url:url, servings:4, prep_time:0, cook_time:0, tags:[] };

  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const raw = $(jsonLdScripts[i]).html();
      if (!raw) continue;
      const data = JSON.parse(raw);

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
      const s = candidates.find(d => isRecipeType(d['@type']));

      if (s) {
        recipe.title = s.name || '';
        recipe.description = s.description || '';
        const img = s.image;
        if (Array.isArray(img)) recipe.image_url = typeof img[0] === 'string' ? img[0] : (img[0]?.url || '');
        else recipe.image_url = typeof img === 'string' ? img : (img?.url || '');

        recipe.ingredients = Array.isArray(s.recipeIngredient) ? s.recipeIngredient.map(x => String(x).trim()).filter(Boolean) : [];

        const ri = s.recipeInstructions;
        if (typeof ri === 'string') {
          recipe.steps = ri.split(/\.\s+|\n+/).map(x => x.trim()).filter(x => x.length > 5);
        } else if (Array.isArray(ri)) {
          recipe.steps = ri.flatMap(inst => {
            if (typeof inst === 'string') return inst.trim() || [];
            if (inst['@type'] === 'HowToSection' && Array.isArray(inst.itemListElement))
              return inst.itemListElement.map(x => (typeof x === 'string' ? x : (x.text || x.name || ''))).filter(Boolean);
            return (inst.text || inst.name || '').trim() || [];
          }).filter(Boolean);
        }

        recipe.servings = parseServings(s.recipeYield);
        recipe.prep_time = parseDuration(s.prepTime);
        recipe.cook_time = parseDuration(s.cookTime);
        const cuisine = s.recipeCuisine, category = s.recipeCategory;
        if (cuisine) recipe.tags.push(...(Array.isArray(cuisine) ? cuisine : [cuisine]));
        if (category) recipe.tags.push(...(Array.isArray(category) ? category : [category]));
        return { recipe, method: 'JSON-LD' };
      }
    } catch { /* next script */ }
  }

  recipe.title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '';
  recipe.description = $('meta[property="og:description"]').attr('content') || '';
  recipe.image_url = $('meta[property="og:image"]').attr('content') || '';

  const ingredientSelectors = [
    { sel: '.wprm-recipe-ingredient', wprm: true },
    { sel: '.tasty-recipes-ingredients-body li' },
    { sel: '.tasty-recipe-ingredients li' },
    { sel: '.recipe-card-ingredients li' },
    { sel: '.ERSIngredients li' },
    { sel: '[itemprop="recipeIngredient"]' },
    { sel: '.recipe-ingredient' },
    { sel: '.ingredients li' },
    { sel: '.ingredient-list li' },
    { sel: '[class*="ingredient"] li' },
  ];

  for (const { sel, wprm } of ingredientSelectors) {
    let items;
    if (wprm) {
      items = $(sel).map((_, el) => {
        const a = $(el).find('.wprm-recipe-ingredient-amount').text().trim();
        const u = $(el).find('.wprm-recipe-ingredient-unit').text().trim();
        const n = $(el).find('.wprm-recipe-ingredient-name').text().trim();
        return [a, u, n].filter(Boolean).join(' ');
      }).get().filter(Boolean);
    } else {
      items = $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
    }
    if (items.length > 0) { recipe.ingredients = items; recipe._ingredientSel = sel; break; }
  }

  const stepsSelectors = [
    '.wprm-recipe-instruction-text',
    '.tasty-recipes-instructions-body li',
    '.tasty-recipe-instructions li',
    '.recipe-card-directions li',
    '.ERSInstructions li',
    '[itemprop="recipeInstructions"] li',
    '.recipe-instruction',
    '.instructions li',
    '.steps li',
    '.directions li',
    '[class*="instruction"] li',
    '[class*="step"] li',
  ];

  for (const sel of stepsSelectors) {
    const items = $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
    if (items.length > 0) { recipe.steps = items; recipe._stepsSel = sel; break; }
  }

  // ── Plain-blog-post fallback (e.g. glutenfrihet.no) ───────────────────────
  if (recipe.ingredients.length === 0) {
    const needHeading = /trenger\s+du|du\s+trenger|ingredients?|ingredienser|you\s+will\s+need/i;
    let found = false;
    $('p, h2, h3, h4, strong').each((_, el) => {
      if (found) return;
      const text = $(el).text().trim();
      if (needHeading.test(text)) {
        const nextUl = $(el).nextAll('ul').first();
        const items = nextUl.find('li').map((__, li) => $(li).text().trim()).get().filter(Boolean);
        if (items.length > 0) { recipe.ingredients = items; found = true; }
      }
    });
    if (!found) {
      let bestUl = null, bestCount = 0;
      $('article ul, .entry-content ul, .post-content ul, .content ul').each((_, ul) => {
        const count = $(ul).find('li').length;
        if (count > bestCount && count <= 30) { bestUl = ul; bestCount = count; }
      });
      if (bestUl) recipe.ingredients = $(bestUl).find('li').map((_, li) => $(li).text().trim()).get().filter(Boolean);
    }
  }

  if (recipe.steps.length === 0) {
    const numberedSteps = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (/^\d+[\.\)]\s+\S/.test(text) && text.length > 10) {
        numberedSteps.push(text.replace(/^\d+[\.\)]\s+/, '').trim());
      }
    });
    if (numberedSteps.length >= 2) recipe.steps = numberedSteps;
  }

  return { recipe, method: 'CSS fallback' };
}

// ── Test runner ───────────────────────────────────────────────────────────────

const TEST_URLS = [
  'https://glutenfrihet.no/2016/11/15/glutenfri-brownies/',
  'https://glutenfrihet.no/2017/03/04/glutenfri-gulrotkake/',
  'https://glutenfrihet.no/2016/11/06/glutenfrie-pannekaker-2/',
];

async function testUrl(url) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`URL: ${url}`);
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
      }
    });
    const $ = cheerio.load(response.data);
    const { recipe, method } = extractRecipe($, url);

    console.log(`Method:       ${method}${recipe._ingredientSel ? ` (ingredients via "${recipe._ingredientSel}")` : ''}`);
    console.log(`Title:        ${recipe.title || '(none)'}`);
    console.log(`Servings:     ${recipe.servings}`);
    console.log(`Prep time:    ${recipe.prep_time} min`);
    console.log(`Cook time:    ${recipe.cook_time} min`);
    console.log(`Tags:         ${recipe.tags.join(', ') || '(none)'}`);
    console.log(`Ingredients (${recipe.ingredients.length}):`);
    recipe.ingredients.slice(0, 8).forEach(i => console.log(`  • ${i}`));
    if (recipe.ingredients.length > 8) console.log(`  … and ${recipe.ingredients.length - 8} more`);
    console.log(`Steps (${recipe.steps.length}):`);
    recipe.steps.slice(0, 4).forEach((s, idx) => console.log(`  ${idx+1}. ${s.substring(0, 100)}${s.length > 100 ? '…' : ''}`));
    if (recipe.steps.length > 4) console.log(`  … and ${recipe.steps.length - 4} more`);
    console.log(`Image:        ${recipe.image_url ? 'YES' : 'NO'}`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

console.log('Testing food-recipes scraper against live WordPress sites...\n');
for (const url of TEST_URLS) {
  await testUrl(url);
}
console.log(`\n${'─'.repeat(70)}\nDone.`);
