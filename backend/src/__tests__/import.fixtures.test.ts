import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/safeFetch.js', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../utils/safeFetch.js';
import { importFromUrl, parseTextRecipe } from '../services/import.service.js';

const mockedSafeFetch = vi.mocked(safeFetch);

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url), 'utf-8');
}

async function importFixture(name: string, url = 'https://example.com/recipe') {
  mockedSafeFetch.mockResolvedValueOnce({ body: loadFixture(name), finalUrl: url });
  return importFromUrl(url);
}

describe('importFromUrl fixture corpus', () => {
  beforeEach(() => {
    mockedSafeFetch.mockReset();
  });

  it('imports a plain JSON-LD Recipe object', async () => {
    const result = await importFixture('plain-recipe.html');
    expect(result.title).toBe('Plain Skillet Chicken');
    expect(result.servings).toBe(4);
    expect(result.totalTime).toBe(90);
    expect(result.activeTime).toBe(15);
    expect(result.authorNotes).toBe('A quick weeknight skillet chicken & rice dinner.');
    expect(result.ingredients).toHaveLength(3);
    expect(result.ingredients[0].amount).toBeCloseTo(1.5);
    expect(result.ingredients[0].unit).toBe('lb');
    expect(result.ingredients[0].name).toBe('chicken thighs');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].instruction).toBe('Season the chicken with salt.');
    // Regression guard: this recipe's yield is a genuinely-parsed "4", not the no-match
    // fallback — 4 is an extremely common real-world serving count, so the parser must not
    // warn about it just because the number happens to equal the fallback default.
    expect(result.warnings).toEqual([]);
  });

  it('imports a Recipe nested inside an @graph array', async () => {
    const result = await importFixture('graph-recipe.html');
    expect(result.title).toBe('Graph Banana Bread');
    expect(result.servings).toBe(8);
    expect(result.totalTime).toBe(60);
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[1].instruction).toBe('Mix in the flour and sugar.');
  });

  it('imports a Recipe from a top-level array of objects', async () => {
    const result = await importFixture('array-recipe.html');
    expect(result.title).toBe('Array Lentil Soup');
    // recipeYield: ["6", "6 servings"] -> first element, digits extracted
    expect(result.servings).toBe(6);
    expect(result.totalTime).toBe(55); // cookTime 45 + prepTime 10
    expect(result.activeTime).toBe(10);
    expect(result.ingredients).toHaveLength(2);
    // recipeInstructions as a plain newline-delimited string
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].instruction).toBe('Saute the onion.');
    expect(result.steps[1].instruction).toBe('Add lentils and water, simmer 40 minutes.');
  });

  it('flattens HowToSection-grouped instructions in order, prefixed with section name', async () => {
    const result = await importFixture('sections-recipe.html');
    expect(result.title).toBe('Layered Trifle');
    expect(result.servings).toBe(10);
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].instruction).toBe('Custard: Whisk the custard until smooth.');
    expect(result.steps[1].instruction).toBe('Custard: Chill the custard for 1 hour.');
    expect(result.steps[2].instruction).toBe('Assembly: Layer cake, custard, and cream in a bowl.');
    expect(result.steps[3].instruction).toBe('Assembly: Repeat the layers and chill before serving.');
  });

  it('takes the first valid Recipe script, skipping malformed/unrelated scripts', async () => {
    const result = await importFixture('multi-script.html');
    expect(result.title).toBe('Multi Script Waffle');
    expect(result.servings).toBe(4);
    expect(result.totalTime).toBe(20);
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps).toHaveLength(2);
  });

  it('parses unicode fraction ingredient strings from JSON-LD', async () => {
    const result = await importFixture('unicode-fractions.html');
    expect(result.title).toBe('Unicode Fraction Cookies');
    expect(result.servings).toBe(24);
    expect(result.ingredients).toHaveLength(4);
    expect(result.ingredients[0].amount).toBeCloseTo(1.5);
    expect(result.ingredients[0].unit).toBe('cup');
    expect(result.ingredients[0].name).toBe('flour');
    expect(result.ingredients[1].amount).toBeCloseTo(0.75);
    expect(result.ingredients[2].amount).toBeCloseTo(1 / 3);
    expect(result.ingredients[3].amount).toBeCloseTo(0.25);
  });

  it('falls back to heuristic text parsing for a no-JSON-LD blog page', async () => {
    const result = await importFixture('no-jsonld-blog.html');
    expect(result.title).toBe("Grandma's Chili");
    expect(result.servings).toBe(6);
    expect(result.ingredients).toHaveLength(3);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].instruction).toBe('Brown the ground beef in a large pot.');
  });

  it('sets source to the fetched URL', async () => {
    const result = await importFixture('plain-recipe.html', 'https://example.com/chicken');
    expect(result.source).toBe('https://example.com/chicken');
  });

  it('decodes &amp; last so already-escaped entities are not double-decoded', async () => {
    const result = await importFixture('entity-recipe.html');
    expect(result.title).toBe('AT&T Park Nachos');
    // "&amp;#39;" must decode to the literal text "&#39;", NOT to an apostrophe — decoding
    // &amp; before the numeric-entity pass would wrongly turn it into "'".
    expect(result.authorNotes).toBe(
      'Serve with a literal &#39; apostrophe glyph name and salt & pepper.',
    );
  });

  it('reports missing-field warnings for a recipe the parser could not fully read', async () => {
    const result = await importFixture('no-jsonld-blog.html');
    // Everything was found in this fixture (title, servings, ingredients, steps) — no time
    // field exists in the source, so only that one warning should fire.
    expect(result.warnings).toEqual(['No total time detected.']);
  });
});

describe('.txt file import', () => {
  // Exercises the same parseTextRecipe path routes/import.ts calls directly for text/* uploads.
  it('parses a plain-text recipe export', () => {
    const text = readFileSync(new URL('./fixtures/import/plain.txt', import.meta.url), 'utf-8');
    const result = parseTextRecipe(text);
    expect(result.title).toBe('Simple Garden Salad');
    expect(result.servings).toBe(2);
    expect(result.ingredients).toHaveLength(3);
    expect(result.ingredients[2].amount).toBe(1);
    expect(result.ingredients[2].unit).toBe('tbsp');
    expect(result.steps).toHaveLength(2);
    // No time field in this fixture — everything else was found.
    expect(result.warnings).toEqual(['No total time detected.']);
  });

  it('reports every fallback warning for empty input', () => {
    const result = parseTextRecipe('');
    expect(result.warnings).toEqual([
      'No servings detected — defaulting to 4.',
      'No total time detected.',
      'No ingredients detected.',
      'No steps detected.',
    ]);
  });
});
