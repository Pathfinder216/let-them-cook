// Canonical ingredient-unit vocabulary.
//
// Units are free text at the UI, but we normalize them to a single canonical abbreviation at
// write time (recipe create/update + import) so stored data is consistent app-wide. Consistent
// units also let grocery consolidation key on the unit string without double-counting spelling
// variants (`2 tbsp` + `1 tablespoon` → one line).
//
// `system` / `kind` are groundwork for plan 27 (imperial↔metric conversion) — populated now so
// the conversion work has a typed table to lean on.
//
// ⚠️ Case-sensitivity trap: `T` means tablespoon and `t` means teaspoon (classic recipe
// shorthand). Everything else is matched case-insensitively, so those two exact-case tokens are
// resolved BEFORE the general lowercase pass — see normalizeUnit().

export type UnitSystem = 'imperial' | 'metric';
export type UnitKind = 'volume' | 'weight' | 'count';

export interface CanonicalUnit {
  canonical: string;
  synonyms: string[];
  system?: UnitSystem;
  kind?: UnitKind;
}

export const CANONICAL_UNITS: CanonicalUnit[] = [
  // ── Volume ──────────────────────────────────────────────────────────────────
  {
    canonical: 'tsp',
    system: 'imperial',
    kind: 'volume',
    // NOTE: bare `t` is resolved case-sensitively in normalizeUnit(), not here.
    synonyms: ['teaspoon', 'teaspoons', 'tsp', 'tsps', 'tsp.', 'teaspoonful', 'teaspoonfuls'],
  },
  {
    canonical: 'tbsp',
    system: 'imperial',
    kind: 'volume',
    // NOTE: bare `T` is resolved case-sensitively in normalizeUnit(), not here.
    synonyms: [
      'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbsp.', 'tbs', 'tbl', 'tbls',
      'tablespoonful', 'tablespoonfuls',
    ],
  },
  {
    canonical: 'cup',
    system: 'imperial',
    kind: 'volume',
    synonyms: ['cup', 'cups', 'c'],
  },
  {
    canonical: 'fl oz',
    system: 'imperial',
    kind: 'volume',
    synonyms: ['fl oz', 'fl. oz.', 'fl oz.', 'floz', 'fluid ounce', 'fluid ounces'],
  },
  {
    canonical: 'pt',
    system: 'imperial',
    kind: 'volume',
    synonyms: ['pt', 'pt.', 'pint', 'pints'],
  },
  {
    canonical: 'qt',
    system: 'imperial',
    kind: 'volume',
    synonyms: ['qt', 'qt.', 'quart', 'quarts'],
  },
  {
    canonical: 'gal',
    system: 'imperial',
    kind: 'volume',
    synonyms: ['gal', 'gal.', 'gallon', 'gallons'],
  },
  {
    canonical: 'ml',
    system: 'metric',
    kind: 'volume',
    synonyms: ['ml', 'ml.', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  },
  {
    canonical: 'l',
    system: 'metric',
    kind: 'volume',
    synonyms: ['l', 'l.', 'liter', 'liters', 'litre', 'litres'],
  },
  // ── Weight ──────────────────────────────────────────────────────────────────
  {
    canonical: 'oz',
    system: 'imperial',
    kind: 'weight',
    synonyms: ['oz', 'oz.', 'ounce', 'ounces'],
  },
  {
    canonical: 'lb',
    system: 'imperial',
    kind: 'weight',
    synonyms: ['lb', 'lb.', 'lbs', 'lbs.', 'pound', 'pounds'],
  },
  {
    canonical: 'g',
    system: 'metric',
    kind: 'weight',
    synonyms: ['g', 'g.', 'gr', 'gm', 'gram', 'grams', 'gramme', 'grammes'],
  },
  {
    canonical: 'kg',
    system: 'metric',
    kind: 'weight',
    synonyms: ['kg', 'kg.', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'],
  },
  // ── Count / descriptive ───────────────────────────────────────────────────────
  { canonical: 'pinch', kind: 'count', synonyms: ['pinch', 'pinches'] },
  { canonical: 'dash', kind: 'count', synonyms: ['dash', 'dashes'] },
  { canonical: 'clove', kind: 'count', synonyms: ['clove', 'cloves'] },
  { canonical: 'can', kind: 'count', synonyms: ['can', 'cans'] },
  { canonical: 'slice', kind: 'count', synonyms: ['slice', 'slices'] },
  { canonical: 'stick', kind: 'count', synonyms: ['stick', 'sticks'] },
  { canonical: 'bunch', kind: 'count', synonyms: ['bunch', 'bunches'] },
  { canonical: 'sprig', kind: 'count', synonyms: ['sprig', 'sprigs'] },
  { canonical: 'head', kind: 'count', synonyms: ['head', 'heads'] },
  { canonical: 'piece', kind: 'count', synonyms: ['piece', 'pieces'] },
];

/** Ordered list of canonical abbreviations (for UI suggestions / conversion tables). */
export const CANONICAL_UNIT_NAMES: string[] = CANONICAL_UNITS.map((u) => u.canonical);

// Lowercased synonym → canonical lookup. Built once at module load.
const SYNONYM_MAP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const unit of CANONICAL_UNITS) {
    map.set(unit.canonical.toLowerCase(), unit.canonical);
    for (const syn of unit.synonyms) {
      map.set(syn.toLowerCase(), unit.canonical);
    }
  }
  return map;
})();

/** Canonical → metadata lookup (for plan 27). */
export const UNIT_BY_CANONICAL: Map<string, CanonicalUnit> = new Map(
  CANONICAL_UNITS.map((u) => [u.canonical, u]),
);

/**
 * Normalize a raw unit string to its canonical abbreviation.
 *
 * - `null`, `undefined`, or blank → `null`.
 * - Known synonyms (case-insensitive) → the canonical form.
 * - The bare tokens `T` and `t` are resolved case-sensitively first (`T`→tbsp, `t`→tsp).
 * - Unrecognized units are never destroyed: returned trimmed + lowercased as-is (pass-through).
 */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // Case-sensitive shorthand — must run before the lowercase pass.
  if (trimmed === 'T') return 'tbsp';
  if (trimmed === 't') return 'tsp';

  const lower = trimmed.toLowerCase();
  return SYNONYM_MAP.get(lower) ?? lower;
}
