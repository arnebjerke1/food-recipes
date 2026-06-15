import { describe, it, expect } from "vitest";
import {
  parseDuration,
  parseIngredient,
  cleanStepText,
  parseSteps,
  guessCategory,
  parseSchemaRecipe,
  parseMicrodataRecipe,
  parseCssRecipe,
  parseBlogRecipe,
  parseRecipeText,
  parseCaptionForRecipe,
  getYoutubeId,
  detectSource,
  scaleAmount,
} from "./parsers.js";

// Helper: build a minimal DOM Document from an HTML string
function makeDoc(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// ── parseDuration ─────────────────────────────────────────────────────────────
describe("parseDuration", () => {
  it("parses hours + minutes", () => {
    expect(parseDuration("PT1H30M")).toBe("1 t 30 min");
  });
  it("parses minutes only", () => {
    expect(parseDuration("PT45M")).toBe("45 min");
  });
  it("parses single hour", () => {
    expect(parseDuration("PT1H")).toBe("1 time");
  });
  it("parses plural hours", () => {
    expect(parseDuration("PT2H")).toBe("2 timer");
  });
  it("returns null for empty input", () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

// ── parseIngredient ───────────────────────────────────────────────────────────
describe("parseIngredient", () => {
  it("parses amount + unit + name", () => {
    expect(parseIngredient("400 g spaghetti")).toEqual({ amount: 400, unit: "g", name: "spaghetti" });
  });
  it("parses fraction amounts", () => {
    expect(parseIngredient("½ ts salt")).toEqual({ amount: "½", unit: "ts", name: "salt" });
  });
  it("falls back to full string as name when no pattern matches", () => {
    expect(parseIngredient("hvitløk")).toEqual({ amount: "", unit: "", name: "hvitløk" });
  });
  it("returns null for falsy input", () => {
    expect(parseIngredient("")).toBeNull();
    expect(parseIngredient(null)).toBeNull();
  });
  it("handles Norwegian decimal comma", () => {
    const r = parseIngredient("1,5 dl vann");
    expect(r.amount).toBe(1.5);
    expect(r.unit).toBe("dl");
    expect(r.name).toBe("vann");
  });
});

// ── cleanStepText ─────────────────────────────────────────────────────────────
describe("cleanStepText", () => {
  it("strips leading step numbers", () => {
    expect(cleanStepText("1. Kok pasta")).toBe("Kok pasta");
    expect(cleanStepText("2) Stek bacon")).toBe("Stek bacon");
  });
  it("strips HTML tags", () => {
    expect(cleanStepText("<strong>Bland</strong> alt")).toBe("Bland alt");
  });
  it("strips 'Step N:' prefix", () => {
    expect(cleanStepText("Step 3: Add eggs")).toBe("Add eggs");
  });
  it("returns empty string for falsy input", () => {
    expect(cleanStepText("")).toBe("");
    expect(cleanStepText(null)).toBe("");
  });
});

// ── parseSteps ────────────────────────────────────────────────────────────────
describe("parseSteps", () => {
  it("handles array of HowToStep objects", () => {
    const instructions = [
      { "@type": "HowToStep", text: "1. Kok pasta" },
      { "@type": "HowToStep", text: "2. Stek bacon" },
    ];
    const steps = parseSteps(instructions);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe("Kok pasta");
    expect(steps[1]).toBe("Stek bacon");
  });
  it("handles plain string instructions", () => {
    expect(parseSteps("Bland alt og stek.")).toEqual(["Bland alt og stek."]);
  });
  it("handles HowToSection with nested steps", () => {
    const instructions = [
      {
        "@type": "HowToSection",
        itemListElement: [
          { "@type": "HowToStep", text: "Steg A" },
          { "@type": "HowToStep", text: "Steg B" },
        ],
      },
    ];
    const steps = parseSteps(instructions);
    expect(steps).toEqual(["Steg A", "Steg B"]);
  });
  it("returns empty array for null input", () => {
    expect(parseSteps(null)).toEqual([]);
  });
});

// ── guessCategory ─────────────────────────────────────────────────────────────
describe("guessCategory", () => {
  it("identifies Dessert", () => {
    expect(guessCategory([], "Sjokoladekake")).toBe("Dessert");
  });
  it("identifies Bakst", () => {
    expect(guessCategory([], "Hjemmebakt brød")).toBe("Bakst");
  });
  it("identifies Frokost", () => {
    expect(guessCategory([], "Havregrøt med bær")).toBe("Frokost");
  });
  it("defaults to Middag", () => {
    expect(guessCategory([], "Biff og potet")).toBe("Middag");
  });
  it("checks tags as well as title", () => {
    expect(guessCategory(["salad"], "Chicken Bowl")).toBe("Lunsj");
  });
});

// ── parseSchemaRecipe ─────────────────────────────────────────────────────────
describe("parseSchemaRecipe", () => {
  it("parses a minimal JSON-LD Recipe object", () => {
    const schemaObj = {
      "@type": "Recipe",
      name: "Klassisk Carbonara",
      totalTime: "PT20M",
      recipeYield: "4",
      recipeIngredient: ["400 g spaghetti", "4 stk egg", "100 g parmesan"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "1. Kok pasta." },
        { "@type": "HowToStep", text: "2. Bland egg og ost." },
      ],
      image: "https://example.com/carbonara.jpg",
      keywords: "pasta, italiensk",
    };
    const doc = makeDoc("<html></html>");
    const result = parseSchemaRecipe(schemaObj, "https://example.com", doc);
    expect(result.title).toBe("Klassisk Carbonara");
    expect(result.time).toBe("20 min");
    expect(result.servings).toBe("4");
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(2);
    expect(result.image).toBe("https://example.com/carbonara.jpg");
    expect(result.tags).toContain("pasta");
  });

  it("falls back to og:image when schema has no image", () => {
    const schemaObj = { "@type": "Recipe", name: "Test", recipeIngredient: ["1 egg"], recipeInstructions: ["Cook it."] };
    const doc = makeDoc('<html><head><meta property="og:image" content="https://example.com/og.jpg"></head></html>');
    const result = parseSchemaRecipe(schemaObj, "", doc);
    expect(result.image).toBe("https://example.com/og.jpg");
  });

  it("handles array image field", () => {
    const schemaObj = {
      name: "Test",
      image: [{ url: "https://example.com/img.jpg" }],
      recipeIngredient: ["1 egg"],
      recipeInstructions: [],
    };
    const doc = makeDoc("<html></html>");
    const result = parseSchemaRecipe(schemaObj, "", doc);
    expect(result.image).toBe("https://example.com/img.jpg");
  });
});

// ── parseMicrodataRecipe ──────────────────────────────────────────────────────
describe("parseMicrodataRecipe", () => {
  it("parses a Microdata recipe block", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Gulrotkake</h1>
        <span itemprop="totalTime" content="PT40M">40 min</span>
        <span itemprop="recipeYield">12</span>
        <ul>
          <li itemprop="recipeIngredient">300 g mel</li>
          <li itemprop="recipeIngredient">2 ts bakepulver</li>
        </ul>
        <div itemprop="recipeInstructions">
          <li>Forvarm ovnen til 175°C.</li>
          <li>Bland alle ingrediensene.</li>
        </div>
      </div>`;
    const doc = makeDoc(html);
    const result = parseMicrodataRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.title).toBe("Gulrotkake");
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.category).toBe("Dessert");
  });

  it("returns null when no schema.org/Recipe itemtype found", () => {
    const doc = makeDoc("<html><body><p>Ingen oppskrift her</p></body></html>");
    expect(parseMicrodataRecipe(doc, "")).toBeNull();
  });
});

// ── parseCssRecipe (WordPress plugins) ───────────────────────────────────────
describe("parseCssRecipe", () => {
  it("parses WPRM (WP Recipe Maker) markup", () => {
    const html = `
      <div class="wprm-recipe-container">
        <h2 class="wprm-recipe-name">Havregrøt</h2>
        <ul>
          <li class="wprm-recipe-ingredient">
            <span class="wprm-recipe-ingredient-amount">100</span>
            <span class="wprm-recipe-ingredient-unit">g</span>
            <span class="wprm-recipe-ingredient-name">havre</span>
          </li>
          <li class="wprm-recipe-ingredient">
            <span class="wprm-recipe-ingredient-amount">300</span>
            <span class="wprm-recipe-ingredient-unit">ml</span>
            <span class="wprm-recipe-ingredient-name">melk</span>
          </li>
        </ul>
        <ul>
          <li class="wprm-recipe-instruction-text">Kok opp melk.</li>
          <li class="wprm-recipe-instruction-text">Rør inn havre og kok i 5 min.</li>
        </ul>
        <span class="wprm-recipe-servings">2</span>
      </div>`;
    const doc = makeDoc(html);
    const result = parseCssRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.title).toBe("Havregrøt");
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0].name).toBe("havre");
    expect(result.steps).toHaveLength(2);
    expect(result.servings).toBe("2");
    expect(result.category).toBe("Frokost");
  });

  it("parses Tasty Recipes markup", () => {
    const html = `
      <div class="tasty-recipes">
        <h2 class="tasty-recipes-title">Sjokoladekake</h2>
        <div class="tasty-recipes-ingredients">
          <ul>
            <li>200 g mel</li>
            <li>3 egg</li>
            <li>150 g sukker</li>
          </ul>
        </div>
        <div class="tasty-recipes-instructions">
          <ol>
            <li>Bland mel og sukker.</li>
            <li>Tilsett egg og rør.</li>
          </ol>
        </div>
        <span class="tasty-recipes-yield">8</span>
      </div>`;
    const doc = makeDoc(html);
    const result = parseCssRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.title).toBe("Sjokoladekake");
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(2);
    expect(result.category).toBe("Dessert");
  });

  it("parses EasyRecipe (ERS) markup", () => {
    const html = `
      <div class="easyrecipe">
        <span class="ERSName">Pizza Margherita</span>
        <ul class="ERSIngredients">
          <li>400 g pizzamel</li>
          <li>200 ml vann</li>
          <li>7 g tørrgjær</li>
        </ul>
        <ul class="ERSInstructions">
          <li>Bland mel, vann og gjær.</li>
          <li>Elt og hev i 1 time.</li>
        </ul>
        <span class="ERSServes">4</span>
      </div>`;
    const doc = makeDoc(html);
    const result = parseCssRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.title).toBe("Pizza Margherita");
    expect(result.ingredients).toHaveLength(3);
    expect(result.category).toBe("Bakst");
  });

  it("uses og:image as image fallback when recipe card has no img", () => {
    const html = `
      <head><meta property="og:image" content="https://example.com/cake.jpg"></head>
      <div class="tasty-recipes">
        <h2 class="tasty-recipes-title">Kake</h2>
        <div class="tasty-recipes-ingredients"><ul><li>2 egg</li><li>100 g mel</li></ul></div>
        <div class="tasty-recipes-instructions"><ol><li>Bland.</li></ol></div>
      </div>`;
    const doc = makeDoc(html);
    const result = parseCssRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.image).toBe("https://example.com/cake.jpg");
  });

  it("returns null when no known container found", () => {
    const doc = makeDoc("<html><body><p>Ingen plugin</p></body></html>");
    expect(parseCssRecipe(doc, "")).toBeNull();
  });
});

// ── parseBlogRecipe ───────────────────────────────────────────────────────────
describe("parseBlogRecipe", () => {
  it("extracts ingredients after a heading and numbered steps", () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Enkel suppe"></head>
        <body>
          <article>
            <h2>Ingredienser</h2>
            <ul>
              <li>2 gulrøtter</li>
              <li>1 løk</li>
              <li>500 ml kraft</li>
            </ul>
            <p>1. Skrell og hakk grønnsaker.</p>
            <p>2. Kok i kraft i 20 min.</p>
          </article>
        </body>
      </html>`;
    const doc = makeDoc(html);
    const result = parseBlogRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.title).toBe("Enkel suppe");
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(2);
    expect(result.category).toBe("Middag");
  });

  it("falls back to largest <ul> in content area", () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Pasta"></head>
        <body>
          <article>
            <ul>
              <li>400 g pasta</li>
              <li>2 egg</li>
              <li>100 g parmesan</li>
            </ul>
          </article>
        </body>
      </html>`;
    const doc = makeDoc(html);
    const result = parseBlogRecipe(doc, "https://example.com");
    expect(result).not.toBeNull();
    expect(result.ingredients.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null when no title and no content found", () => {
    const doc = makeDoc("<html><body></body></html>");
    expect(parseBlogRecipe(doc, "")).toBeNull();
  });

  it("uses og:image for the image", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Test">
          <meta property="og:image" content="https://example.com/img.jpg">
        </head>
        <body>
          <article>
            <h3>Du trenger</h3>
            <ul><li>Egg</li><li>Mel</li></ul>
          </article>
        </body>
      </html>`;
    const doc = makeDoc(html);
    const result = parseBlogRecipe(doc, "https://example.com");
    expect(result?.image).toBe("https://example.com/img.jpg");
  });
});

// ── parseRecipeText (OCR / paste flow) ───────────────────────────────────────
describe("parseRecipeText", () => {
  it("parses well-structured pasted text", () => {
    const text = [
      "Gulrotkake",
      "Ingredienser:",
      "300 g gulrot",
      "200 g mel",
      "Fremgangsmåte:",
      "1. Riv gulrøttene.",
      "2. Bland inn mel.",
    ].join("\n");
    const result = parseRecipeText(text);
    expect(result.title).toBe("Gulrotkake");
    expect(result.ingredients).toEqual(["300 g gulrot", "200 g mel"]);
    expect(result.steps).toEqual(["Riv gulrøttene.", "Bland inn mel."]);
  });

  it("treats lines after title as ingredients when no sections found", () => {
    const text = "Grøt\n100 g havre\n300 ml melk";
    const result = parseRecipeText(text);
    expect(result.title).toBe("Grøt");
    expect(result.ingredients).toEqual(["100 g havre", "300 ml melk"]);
    expect(result.steps).toEqual([]);
  });

  it("returns null for empty input", () => {
    expect(parseRecipeText("")).toBeNull();
    expect(parseRecipeText("   \n  ")).toBeNull();
  });
});

// ── parseCaptionForRecipe (social video captions) ─────────────────────────────
describe("parseCaptionForRecipe", () => {
  it("extracts ingredients and steps from a TikTok-style caption", () => {
    const caption = [
      "Ingredients:",
      "- 400g pasta",
      "- 4 eggs",
      "Steps:",
      "1. Cook pasta",
      "2. Mix eggs",
    ].join("\n");
    const { ingredients, steps } = parseCaptionForRecipe(caption);
    expect(ingredients).toEqual(["400g pasta", "4 eggs"]);
    expect(steps).toEqual(["Cook pasta", "Mix eggs"]);
  });

  it("returns empty arrays for empty caption", () => {
    expect(parseCaptionForRecipe("")).toEqual({ ingredients: [], steps: [] });
    expect(parseCaptionForRecipe(null)).toEqual({ ingredients: [], steps: [] });
  });
});

// ── getYoutubeId ──────────────────────────────────────────────────────────────
describe("getYoutubeId", () => {
  it("extracts ID from standard youtube.com URL", () => {
    expect(getYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts ID from youtu.be short URL", () => {
    expect(getYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts ID from YouTube Shorts URL", () => {
    expect(getYoutubeId("https://www.youtube.com/shorts/abc123")).toBe("abc123");
  });
  it("returns null for non-YouTube URL", () => {
    expect(getYoutubeId("https://vimeo.com/12345")).toBeNull();
  });
});

// ── detectSource ──────────────────────────────────────────────────────────────
describe("detectSource", () => {
  it("detects YouTube", () => {
    expect(detectSource("https://www.youtube.com/watch?v=abc")).toEqual({ name: "YouTube", icon: "▶️" });
  });
  it("detects TikTok", () => {
    expect(detectSource("https://www.tiktok.com/@user/video/123")).toEqual({ name: "TikTok", icon: "🎵" });
  });
  it("returns hostname for generic site", () => {
    expect(detectSource("https://www.matprat.no/oppskrifter/pasta/")).toEqual({ name: "matprat.no", icon: "🌐" });
  });
  it("returns Ukjent for invalid URL", () => {
    expect(detectSource("not-a-url")).toEqual({ name: "Ukjent", icon: "🌐" });
  });
});

// ── scaleAmount ───────────────────────────────────────────────────────────────
describe("scaleAmount", () => {
  it("scales a numeric amount", () => {
    expect(scaleAmount(100, 2)).toBe(200);
  });
  it("returns original when factor is 1", () => {
    expect(scaleAmount(100, 1)).toBe(100);
  });
  it("converts nice fractions", () => {
    expect(scaleAmount(100, 0.5)).toBe(50);
  });
  it("returns original for non-numeric string amounts", () => {
    expect(scaleAmount("noen", 2)).toBe("noen");
  });
});
