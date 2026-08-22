import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { importFromPdf, parseIngredientLine, parseTextRecipe } from '../services/import.service.js';

describe('parseIngredientLine', () => {
  it('parses integer amount and unit', () => {
    const result = parseIngredientLine('2 cups flour', 0);
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('cup'); // normalized to singular
    expect(result.name).toBe('flour');
  });

  it('parses decimal amount', () => {
    const result = parseIngredientLine('1.5 tsp salt', 0);
    expect(result.amount).toBeCloseTo(1.5);
    expect(result.unit).toBe('tsp');
    expect(result.name).toBe('salt');
  });

  it('parses fraction glyph', () => {
    const result = parseIngredientLine('½ cup sugar', 0);
    expect(result.amount).toBeCloseTo(0.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('sugar');
  });

  it('parses slash fraction', () => {
    const result = parseIngredientLine('1/4 tsp baking soda', 0);
    expect(result.amount).toBeCloseTo(0.25);
    expect(result.unit).toBe('tsp');
  });

  it('parses whole number followed by fraction glyph', () => {
    const result = parseIngredientLine('1 ½ cups milk', 0);
    expect(result.amount).toBeCloseTo(1.5);
    expect(result.unit).toBe('cup'); // normalized to singular
    expect(result.name).toBe('milk');
  });

  it('detects optional ingredients', () => {
    const result = parseIngredientLine('1 pinch cayenne (optional)', 0);
    expect(result.isOptional).toBe(true);
  });

  it('handles ingredient with no amount', () => {
    const result = parseIngredientLine('salt to taste', 0);
    expect(result.amount).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBe('salt to taste');
  });

  it('strips leading bullet', () => {
    const result = parseIngredientLine('- 2 oz butter', 0);
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('oz');
    expect(result.name).toBe('butter');
  });

  it('assigns orderIndex', () => {
    const result = parseIngredientLine('1 cup flour', 5);
    expect(result.orderIndex).toBe(5);
  });

  it('normalizes the parsed unit to canonical form', () => {
    // Long, capitalized, plural form should be stored as the canonical abbreviation.
    const result = parseIngredientLine('2 Tablespoons olive oil', 0);
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('olive oil');
  });

});

describe('parseTextRecipe', () => {
  it('uses first line as title', () => {
    const result = parseTextRecipe('My Pancakes\n2 cups flour\nMix and cook.');
    expect(result.title).toBe('My Pancakes');
  });

  it('parses explicit ingredients section', () => {
    const text = [
      'Banana Bread',
      'Ingredients:',
      '3 bananas',
      '2 cups flour',
      'Instructions:',
      'Mash bananas.',
      'Mix in flour.',
    ].join('\n');
    const result = parseTextRecipe(text);
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].instruction).toBe('Mash bananas.');
  });

  it('extracts servings from text', () => {
    const text = 'Soup\nServes 6\n1 cup broth';
    const result = parseTextRecipe(text);
    expect(result.servings).toBe(6);
  });

  it('returns default when text is empty', () => {
    const result = parseTextRecipe('');
    expect(result.title).toBe('Imported Recipe');
    expect(result.ingredients).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
  });
});

describe('importFromPdf', () => {
  // Guards against a pdf-parse major-version bump silently breaking the call
  // site (v2 dropped the v1 default-function export for a PDFParse class — that
  // mismatch surfaced as a 500 on every PDF import). The fixture is a tiny
  // hand-built PDF; see fixtures/recipe.pdf.
  const fixture = readFileSync(new URL('./fixtures/recipe.pdf', import.meta.url));

  it('extracts text from a PDF buffer and parses it into a recipe', async () => {
    const result = await importFromPdf(fixture);
    expect(result.title).toBe('Test Snickerdoodles');
    expect(result.servings).toBe(24);
    expect(result.ingredients.map((i) => i.name)).toContain('flour');
    expect(result.steps.some((s) => s.instruction.startsWith('Mix the dry'))).toBe(true);
  });
});
