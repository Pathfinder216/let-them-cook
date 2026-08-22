import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createAuthedApi, cleanupUsers, type AuthedApi } from './helpers/auth.js';

// The import service already parses schema.org JSON-LD off of fetched HTML. To exercise its
// JSON-LD path against our own export.service output without a real network call, mock its one
// external dependency (safeFetch) to hand back a minimal HTML page embedding the exported
// schema.org JSON as a <script type="application/ld+json"> tag — exactly what a real recipe site
// would serve. This keeps export.service and import.service honest against each other without
// modifying import.service.ts or its existing test file (plan 19 owns those, concurrently).
vi.mock('../utils/safeFetch.js', () => ({
  safeFetch: vi.fn(),
}));

const { safeFetch } = await import('../utils/safeFetch.js');
const { importFromUrl } = await import('../services/import.service.js');

const app = createApp();
let api: AuthedApi;

const sourceRecipe = {
  title: 'Round Trip Pancakes',
  servings: 4,
  source: 'https://example.com/pancakes',
  ingredients: [
    { name: 'flour', amount: 2, unit: 'cup', isOptional: false, orderIndex: 0 },
    { name: 'milk', amount: 1.5, unit: 'cup', isOptional: false, orderIndex: 1 },
    { name: 'egg', amount: 1, isOptional: false, orderIndex: 2 },
  ],
  steps: [
    { orderIndex: 0, instruction: 'Whisk {flour:100%} and {milk:100%} together.', timeMinutes: 3, isActiveTime: true },
    { orderIndex: 1, instruction: 'Beat in the {egg:100%}.', timeMinutes: 2, isActiveTime: true },
    { orderIndex: 2, instruction: 'Cook on a griddle until golden.', timeMinutes: 10, isActiveTime: false },
  ],
};

beforeEach(async () => {
  await cleanupUsers();
  api = await createAuthedApi(app);
  vi.mocked(safeFetch).mockReset();
});

describe('schema-org export -> JSON-LD import round-trip', () => {
  it('re-imports an exported recipe with title/servings/ingredients/steps intact', async () => {
    await api.post('/api/recipes').send(sourceRecipe);

    const exportRes = await api.get('/api/export?format=schema-org');
    expect(exportRes.status).toBe(200);
    const [exported] = exportRes.body;
    expect(exported.name).toBe('Round Trip Pancakes');

    // Wrap the exported JSON-LD object as a script tag, the shape import.service expects.
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(exported)}</script></head><body></body></html>`;
    vi.mocked(safeFetch).mockResolvedValue({ body: html, finalUrl: 'https://example.com/pancakes' });

    const reimported = await importFromUrl('https://example.com/pancakes');

    expect(reimported.title).toBe('Round Trip Pancakes');
    expect(reimported.servings).toBe(4);

    expect(reimported.ingredients.map((i) => i.name)).toEqual(['flour', 'milk', 'egg']);
    expect(reimported.ingredients.map((i) => i.amount)).toEqual([2, 1.5, 1]);
    expect(reimported.ingredients[0].unit).toBe('cup');

    // Instructions come back as plain text with {ref} tokens already resolved by the exporter,
    // so the re-imported steps carry the resolved wording rather than the original tokens.
    expect(reimported.steps).toHaveLength(3);
    expect(reimported.steps[0].instruction).toBe('Whisk 2 cup flour and 1 ½ cup milk together.');
    expect(reimported.steps[1].instruction).toBe('Beat in the 1 egg.');
    expect(reimported.steps[2].instruction).toBe('Cook on a griddle until golden.');
  });
});
