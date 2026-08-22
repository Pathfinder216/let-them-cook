import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createAuthedApi, cleanupUsers, type AuthedApi } from './helpers/auth.js';

const app = createApp();
let api: AuthedApi;

const sampleRecipe = {
  title: 'Scrambled Eggs',
  servings: 2,
  source: 'https://example.com/scrambled-eggs',
  authorNotes: 'Use low heat for creamier eggs',
  personalNotes: 'My private tweak',
  ingredients: [
    { name: 'eggs', amount: 4, unit: 'large', isOptional: false, orderIndex: 0, note: 'free-range' },
    { name: 'butter', amount: 1, unit: 'tbsp', isOptional: false, orderIndex: 1 },
    { name: 'salt', amount: 0.25, unit: 'tsp', isOptional: true, orderIndex: 2 },
  ],
  steps: [
    { orderIndex: 0, instruction: 'Crack {eggs:100%} into a bowl and whisk.', timeMinutes: 2, isActiveTime: true },
    { orderIndex: 1, instruction: 'Melt {butter:100%} in a pan.', timeMinutes: 3, isActiveTime: false },
    { orderIndex: 2, instruction: 'Cook and season with {salt:100%}.', timeMinutes: 5, isActiveTime: true },
  ],
};

beforeEach(async () => {
  await cleanupUsers();
  api = await createAuthedApi(app);
});

describe('GET /api/export', () => {
  it('rejects an unknown format', async () => {
    const res = await api.get('/api/export?format=bogus');
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/export?format=schema-org');
    expect(res.status).toBe(401);
  });

  describe('format=schema-org', () => {
    it('returns an array of schema.org Recipe objects with resolved ingredient refs', async () => {
      await api.post('/api/recipes').send(sampleRecipe);
      const res = await api.get('/api/export?format=schema-org');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="kitchen-canon-export-\d{4}-\d{2}-\d{2}\.json"/);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);

      const recipe = res.body[0];
      expect(recipe['@context']).toBe('https://schema.org');
      expect(recipe['@type']).toBe('Recipe');
      expect(recipe.name).toBe('Scrambled Eggs');
      expect(recipe.recipeYield).toBe('2');
      expect(recipe.creativeWorkStatus).toBe('Active');
      expect(recipe.recipeIngredient).toEqual([
        '4 large eggs — free-range',
        '1 tbsp butter',
        '¼ tsp salt (optional)',
      ]);
      expect(recipe.recipeInstructions).toEqual([
        { '@type': 'HowToStep', text: 'Crack 4 large eggs into a bowl and whisk.' },
        { '@type': 'HowToStep', text: 'Melt 1 tbsp butter in a pan.' },
        { '@type': 'HowToStep', text: 'Cook and season with ¼ tsp salt.' },
      ]);
      // totalTime sums all step minutes; prepTime (mapped from active-time minutes here) only active ones
      expect(recipe.totalTime).toBe('PT10M');
      expect(recipe.prepTime).toBe('PT7M');
      expect(recipe.author).toEqual({ '@type': 'Organization', name: 'https://example.com/scrambled-eggs' });
      expect(recipe.url).toBe('https://example.com/scrambled-eggs');
    });

    it('flags archived recipes via creativeWorkStatus and includes only latest versions', async () => {
      const created = await api.post('/api/recipes').send({ title: 'To Archive' });
      await api.delete(`/api/recipes/${created.body.id}`); // toggles archived
      await api.patch(`/api/recipes/${created.body.id}`).send({ title: 'To Archive v2' });

      const res = await api.get('/api/export?format=schema-org');
      expect(res.status).toBe(200);
      const titles = res.body.map((r: { name: string }) => r.name);
      expect(titles).toEqual(['To Archive v2']);
      expect(res.body[0].creativeWorkStatus).toBe('Archived');
    });

    it('produces valid ISO-8601 durations and omits zero durations', async () => {
      await api.post('/api/recipes').send({ title: 'No Times' });
      const res = await api.get('/api/export?format=schema-org');
      const recipe = res.body.find((r: { name: string }) => r.name === 'No Times');
      expect(recipe.totalTime).toBeUndefined();
      expect(recipe.prepTime).toBeUndefined();
    });

    it('only exports the authenticated user\'s own recipes', async () => {
      await api.post('/api/recipes').send({ title: 'Mine' });
      const other = await createAuthedApi(app);
      await other.post('/api/recipes').send({ title: 'Theirs' });

      const res = await api.get('/api/export?format=schema-org');
      const titles = res.body.map((r: { name: string }) => r.name);
      expect(titles).toEqual(['Mine']);
    });
  });

  describe('format=full', () => {
    it('includes all versions, private notes, and catalog/substitution data', async () => {
      const created = await api.post('/api/recipes').send(sampleRecipe);
      await api.patch(`/api/recipes/${created.body.id}`).send({ title: 'Scrambled Eggs v2' });

      await api.post('/api/ingredients').send({ name: 'truffle salt', allergens: [], diets: [] });
      await api.post('/api/substitutions').send({
        fromIngredient: 'butter',
        toIngredient: 'margarine',
        ratio: 1,
      });

      const res = await api.get('/api/export?format=full');
      expect(res.status).toBe(200);
      expect(res.body.formatVersion).toBe(1);
      expect(typeof res.body.exportedAt).toBe('string');

      const recipes = res.body.data.recipes;
      const titles = recipes.map((r: { title: string }) => r.title).sort();
      expect(titles).toEqual(['Scrambled Eggs', 'Scrambled Eggs v2']);

      const original = recipes.find((r: { title: string }) => r.title === 'Scrambled Eggs');
      expect(original.personalNotes).toBe('My private tweak');
      expect(original.ingredients[0].note).toBe('free-range');
      expect(original.steps[0].instruction).toBe('Crack {eggs:100%} into a bowl and whisk.');

      expect(res.body.data.catalogItems.some((c: { displayAlias: string }) => c.displayAlias === 'truffle salt')).toBe(true);
      expect(res.body.data.substitutions.some((s: { fromIngredient: string }) => s.fromIngredient === 'butter')).toBe(true);
    });

    it('includes a media manifest without file bytes', async () => {
      await api.post('/api/recipes').send({ title: 'No Media' });
      const res = await api.get('/api/export?format=full');
      expect(Array.isArray(res.body.data.media)).toBe(true);
    });

    it('only exports the authenticated user\'s own data', async () => {
      await api.post('/api/recipes').send({ title: 'Mine' });
      const other = await createAuthedApi(app);
      await other.post('/api/recipes').send({ title: 'Theirs' });

      const res = await api.get('/api/export?format=full');
      const titles = res.body.data.recipes.map((r: { title: string }) => r.title);
      expect(titles).toEqual(['Mine']);
    });
  });
});
