import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Shared formatting helpers
//
// These intentionally duplicate (in miniature) logic that also lives on the
// frontend (`formatScaledAmount` in hooks/useScaling.ts) and in the import
// parser's ingredient-ref resolution (`resolveIngredientRefsText` in
// utils/resolveIngredientRefs.tsx). Keeping a small server-side copy avoids
// pulling frontend code into the backend bundle; the JSON-LD round-trip test
// (export.roundtrip.test.ts) is the shared test vector that keeps the two
// implementations honest.
// ---------------------------------------------------------------------------

/** Formats a number the same way the frontend's formatScaledAmount does: fraction-friendly. */
function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toString();
  const fractions: [number, string][] = [
    [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'],
    [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞'],
  ];
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  for (const [val, glyph] of fractions) {
    if (Math.abs(frac - val) < 0.01) {
      return whole > 0 ? `${whole} ${glyph}` : glyph;
    }
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

interface ExportIngredient {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  isOptional: boolean;
  note: string | null;
}

/** "2 cups flour" / "flour" style line for an ingredient. */
function formatIngredientLine(ing: ExportIngredient): string {
  const amt = ing.amount !== null ? formatAmount(ing.amount) : '';
  const optional = ing.isOptional ? ' (optional)' : '';
  const note = ing.note ? ` — ${ing.note}` : '';
  return [amt, ing.unit, ing.name].filter(Boolean).join(' ') + optional + note;
}

const REF_PATTERN = /\{([^}:]+)(?::(\d+(?:\.\d+)?)%)?\}/g;

/** Build a name → ingredient map, disambiguating duplicate names with " 1", " 2", … suffixes. */
function buildIngredientMap(ingredients: ExportIngredient[]): Map<string, ExportIngredient> {
  const totals = new Map<string, number>();
  for (const ing of ingredients) totals.set(ing.name, (totals.get(ing.name) ?? 0) + 1);

  const ranks = new Map<string, number>();
  const result = new Map<string, ExportIngredient>();
  for (const ing of ingredients) {
    const rank = (ranks.get(ing.name) ?? 0) + 1;
    ranks.set(ing.name, rank);
    const key = (totals.get(ing.name) ?? 1) === 1 ? ing.name : `${ing.name} ${rank}`;
    result.set(key, ing);
  }
  return result;
}

/** Resolves {ref}/{ref:pct%} tokens in a step instruction to plain text (server-side port). */
export function resolveIngredientRefsText(instruction: string, ingredients: ExportIngredient[]): string {
  const ingByInternalId = buildIngredientMap(ingredients);
  return instruction.replace(REF_PATTERN, (full, internalId, pctStr) => {
    const ing = ingByInternalId.get(internalId);
    if (!ing) return full;
    const pct = (pctStr !== undefined ? parseFloat(pctStr) : 100) / 100;
    const scaledAmount = ing.amount !== null ? ing.amount * pct : null;
    const amountStr = scaledAmount !== null ? formatAmount(scaledAmount) : null;
    return [amountStr, ing.unit, ing.name].filter(Boolean).join(' ');
  });
}

/** Whole minutes → ISO-8601 duration (e.g. 90 → "PT1H30M"); null/0 → undefined (omit the field). */
export function minutesToIsoDuration(minutes: number | null): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  let out = 'PT';
  if (hours > 0) out += `${hours}H`;
  if (mins > 0 || hours === 0) out += `${mins}M`;
  return out;
}

const recipeInclude = {
  ingredients: { orderBy: { orderIndex: 'asc' as const } },
  steps: { orderBy: { orderIndex: 'asc' as const } },
  labels: { include: { label: true } },
  courses: true,
};

// ---------------------------------------------------------------------------
// schema.org format
// ---------------------------------------------------------------------------

export interface SchemaOrgRecipe {
  '@context': 'https://schema.org';
  '@type': 'Recipe';
  name: string;
  recipeYield: string;
  totalTime?: string;
  prepTime?: string;
  recipeIngredient: string[];
  recipeInstructions: { '@type': 'HowToStep'; text: string }[];
  recipeCategory?: string[];
  keywords?: string;
  author?: { '@type': 'Person' | 'Organization'; name: string };
  url?: string;
  description?: string;
  creativeWorkStatus: 'Active' | 'Archived';
}

function totalMinutes(steps: { timeMinutes: number | null }[]): number | null {
  const sum = steps.reduce((acc, s) => acc + (s.timeMinutes ?? 0), 0);
  return sum > 0 ? Math.ceil(sum) : null;
}

function activeMinutes(steps: { timeMinutes: number | null; isActiveTime: boolean }[]): number | null {
  const sum = steps.filter((s) => s.isActiveTime).reduce((acc, s) => acc + (s.timeMinutes ?? 0), 0);
  return sum > 0 ? Math.ceil(sum) : null;
}

export async function exportSchemaOrg(userId: string): Promise<SchemaOrgRecipe[]> {
  const recipes = await prisma.recipe.findMany({
    where: { userId, isLatest: true },
    include: recipeInclude,
    orderBy: { title: 'asc' },
  });

  return recipes.map((recipe) => {
    const ingredients = recipe.ingredients;
    return {
      '@context': 'https://schema.org' as const,
      '@type': 'Recipe' as const,
      name: recipe.title,
      recipeYield: String(recipe.servings),
      totalTime: minutesToIsoDuration(totalMinutes(recipe.steps)),
      prepTime: minutesToIsoDuration(activeMinutes(recipe.steps)),
      recipeIngredient: ingredients.map(formatIngredientLine),
      recipeInstructions: recipe.steps.map((step) => ({
        '@type': 'HowToStep' as const,
        text: resolveIngredientRefsText(step.instruction, ingredients),
      })),
      recipeCategory: recipe.courses.length ? recipe.courses.map((c) => c.courseType) : undefined,
      keywords: recipe.labels.length ? recipe.labels.map((rl) => rl.label.name).join(', ') : undefined,
      author: recipe.source ? { '@type': 'Organization' as const, name: recipe.source } : undefined,
      url: recipe.source ?? undefined,
      description: recipe.authorNotes ?? undefined,
      creativeWorkStatus: recipe.archived ? ('Archived' as const) : ('Active' as const),
    };
  });
}

// ---------------------------------------------------------------------------
// Proprietary "full" format — complete dump, versioned envelope
// ---------------------------------------------------------------------------

export interface FullExport {
  formatVersion: 1;
  exportedAt: string;
  data: {
    recipes: unknown[];
    mealPlans: unknown[];
    catalogItems: unknown[];
    aliases: unknown[];
    substitutions: unknown[];
    localizations: unknown[];
    labels: unknown[];
    media: { recipeId: string | null; stepId: string | null; type: string; path: string }[];
  };
}

export async function exportFull(userId: string): Promise<FullExport> {
  const [recipes, mealPlans, catalogItems, aliases, substitutions, localizations, labels, media] =
    await Promise.all([
      prisma.recipe.findMany({
        where: { userId },
        include: recipeInclude,
        orderBy: [{ parentId: 'asc' }, { version: 'asc' }],
      }),
      prisma.mealPlan.findMany({
        where: { userId },
        include: { recipes: true, groceryList: true },
      }),
      prisma.ingredientCatalog.findMany({ where: { userId }, include: { aliases: true } }),
      prisma.ingredientAlias.findMany({ where: { userId } }),
      prisma.ingredientSubstitution.findMany({ where: { createdBy: userId } }),
      prisma.localizationMapping.findMany({ where: { userId } }),
      prisma.label.findMany({ where: { userId } }),
      prisma.media.findMany({
        where: { OR: [{ recipe: { userId } }, { step: { recipe: { userId } } }] },
        select: { recipeId: true, stepId: true, type: true, path: true },
      }),
    ]);

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data: { recipes, mealPlans, catalogItems, aliases, substitutions, localizations, labels, media },
  };
}
