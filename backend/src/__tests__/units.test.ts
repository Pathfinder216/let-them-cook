import { describe, it, expect } from 'vitest';
import { normalizeUnit, CANONICAL_UNITS } from '../constants/units.js';

describe('normalizeUnit', () => {
  it('normalizes long forms to canonical abbreviations', () => {
    expect(normalizeUnit('tablespoons')).toBe('tbsp');
    expect(normalizeUnit('tablespoon')).toBe('tbsp');
    expect(normalizeUnit('teaspoons')).toBe('tsp');
    expect(normalizeUnit('ounce')).toBe('oz');
    expect(normalizeUnit('pounds')).toBe('lb');
    expect(normalizeUnit('grams')).toBe('g');
    expect(normalizeUnit('milliliters')).toBe('ml');
    expect(normalizeUnit('litre')).toBe('l');
  });

  it('handles the case-sensitive T (tbsp) vs t (tsp) shorthand', () => {
    expect(normalizeUnit('T')).toBe('tbsp');
    expect(normalizeUnit('t')).toBe('tsp');
  });

  it('is case-insensitive for everything else', () => {
    expect(normalizeUnit('Grams')).toBe('g');
    expect(normalizeUnit('TBSP')).toBe('tbsp');
    expect(normalizeUnit('Cup')).toBe('cup');
    expect(normalizeUnit('LB')).toBe('lb');
  });

  it('collapses periods and plurals', () => {
    expect(normalizeUnit('lb.')).toBe('lb');
    expect(normalizeUnit('oz.')).toBe('oz');
    expect(normalizeUnit('cloves')).toBe('clove');
    expect(normalizeUnit('slices')).toBe('slice');
  });

  it('passes through unrecognized units (trimmed + lowercased)', () => {
    expect(normalizeUnit('handful')).toBe('handful');
    expect(normalizeUnit('  Handful  ')).toBe('handful');
    expect(normalizeUnit('splash')).toBe('splash');
  });

  it('returns null for empty / null / undefined', () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit('   ')).toBeNull();
  });

  it('is idempotent — canonical forms map to themselves', () => {
    for (const unit of CANONICAL_UNITS) {
      expect(normalizeUnit(unit.canonical)).toBe(unit.canonical);
    }
  });
});
