import { describe, it, expect } from 'vitest';
import { consolidateIngredients } from '../services/grocery.service.js';

describe('consolidateIngredients', () => {
  it('consolidates duplicate ingredients with same unit', () => {
    const result = consolidateIngredients([
      {
        ingredients: [
          { name: 'oil', amount: 2, unit: 'tbsp' },
          { name: 'salt', amount: 1, unit: 'tsp' },
        ],
        servingsMultiplier: 1,
      },
      {
        ingredients: [
          { name: 'oil', amount: 1, unit: 'tbsp' },
          { name: 'pepper', amount: 0.5, unit: 'tsp' },
        ],
        servingsMultiplier: 1,
      },
    ]);

    const oil = result.find((r) => r.ingredient === 'oil');
    expect(oil).toBeDefined();
    expect(oil!.amount).toBe(3);
    expect(oil!.unit).toBe('tbsp');
    expect(result).toHaveLength(3);
  });

  it('scales amounts by servings multiplier', () => {
    const result = consolidateIngredients([
      {
        ingredients: [{ name: 'flour', amount: 2, unit: 'cups' }],
        servingsMultiplier: 2,
      },
    ]);

    expect(result[0].amount).toBe(4);
  });

  it('handles null amounts', () => {
    const result = consolidateIngredients([
      {
        ingredients: [{ name: 'salt', amount: null, unit: null }],
        servingsMultiplier: 1,
      },
    ]);

    expect(result[0].amount).toBeNull();
  });

  it('treats different units as separate items', () => {
    const result = consolidateIngredients([
      {
        ingredients: [
          { name: 'butter', amount: 2, unit: 'tbsp' },
        ],
        servingsMultiplier: 1,
      },
      {
        ingredients: [
          { name: 'butter', amount: 1, unit: 'cup' },
        ],
        servingsMultiplier: 1,
      },
    ]);

    expect(result).toHaveLength(2);
  });

  it('consolidates unit spelling variants onto one line', () => {
    const result = consolidateIngredients([
      {
        ingredients: [{ name: 'butter', amount: 2, unit: 'tbsp' }],
        servingsMultiplier: 1,
      },
      {
        ingredients: [{ name: 'butter', amount: 1, unit: 'tablespoon' }],
        servingsMultiplier: 1,
      },
      {
        ingredients: [{ name: 'butter', amount: 1, unit: 'T' }],
        servingsMultiplier: 1,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].ingredient).toBe('butter');
    expect(result[0].amount).toBe(4);
    expect(result[0].unit).toBe('tbsp');
  });

  it('handles case-insensitive ingredient names', () => {
    const result = consolidateIngredients([
      {
        ingredients: [{ name: 'Salt', amount: 1, unit: 'tsp' }],
        servingsMultiplier: 1,
      },
      {
        ingredients: [{ name: 'salt', amount: 0.5, unit: 'tsp' }],
        servingsMultiplier: 1,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1.5);
  });
});
