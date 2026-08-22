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
  ingredients: [
    { name: 'eggs', amount: 4, unit: 'large', isOptional: false, orderIndex: 0 },
    { name: 'butter', amount: 1, unit: 'tbsp', isOptional: false, orderIndex: 1 },
    { name: 'salt', amount: 0.25, unit: 'tsp', isOptional: false, orderIndex: 2 },
    { name: 'chives', amount: 1, unit: 'tbsp', isOptional: true, orderIndex: 3 },
  ],
  steps: [
    { orderIndex: 0, instruction: 'Crack {eggs:100%} into a bowl and whisk.', timeMinutes: 2, isActiveTime: true },
    { orderIndex: 1, instruction: 'Melt {butter:100%} in a non-stick pan over low heat.', timeMinutes: 1, isActiveTime: true },
    { orderIndex: 2, instruction: 'Pour in eggs and stir gently until just set.', timeMinutes: 5, isActiveTime: true },
    { orderIndex: 3, instruction: 'Season with {salt:100%} and top with {chives:100%}.', timeMinutes: 1, isActiveTime: true },
  ],
};

beforeEach(async () => {
  // Clean database before each test (cascades recipes/steps/ingredients), then start a session
  await cleanupUsers();
  api = await createAuthedApi(app);
});

describe('POST /api/recipes', () => {
  it('creates a recipe with ingredients and steps', async () => {
    const res = await api.post('/api/recipes').send(sampleRecipe);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Scrambled Eggs');
    expect(res.body.servings).toBe(2);
    expect(res.body.version).toBe(1);
    expect(res.body.isLatest).toBe(true);
    expect(res.body.archived).toBe(false);
    expect(res.body.ingredients).toHaveLength(4);
    expect(res.body.steps).toHaveLength(4);
    expect(res.body.authorNotes).toBe('Use low heat for creamier eggs');
  });

  it('creates a minimal recipe with just a title', async () => {
    const res = await api.post('/api/recipes').send({ title: 'Quick Salad' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Quick Salad');
    expect(res.body.servings).toBe(1);
    expect(res.body.ingredients).toHaveLength(0);
    expect(res.body.steps).toHaveLength(0);
  });

  it('rejects a recipe without a title', async () => {
    const res = await api.post('/api/recipes').send({ servings: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects a recipe with invalid servings', async () => {
    const res = await api.post('/api/recipes').send({ title: 'Test', servings: -1 });

    expect(res.status).toBe(400);
  });

  it('normalizes ingredient units to canonical forms at write time', async () => {
    const res = await api.post('/api/recipes').send({
      title: 'Unit Test',
      ingredients: [
        { name: 'flour', amount: 2, unit: 'Cups', orderIndex: 0 },
        { name: 'butter', amount: 3, unit: 'Tablespoons', orderIndex: 1 },
        { name: 'salt', amount: 1, unit: 'T', orderIndex: 2 },
        { name: 'pepper', amount: 1, unit: 't', orderIndex: 3 },
        { name: 'sugar', amount: 200, unit: 'grams', orderIndex: 4 },
        { name: 'garnish', amount: 1, unit: 'handful', orderIndex: 5 },
      ],
    });

    expect(res.status).toBe(201);
    const units = Object.fromEntries(
      res.body.ingredients.map((i: { name: string; unit: string | null }) => [i.name, i.unit]),
    );
    expect(units).toEqual({
      flour: 'cup',
      butter: 'tbsp',
      salt: 'tbsp', // case-sensitive T
      pepper: 'tsp', // case-sensitive t
      sugar: 'g',
      garnish: 'handful', // pass-through
    });
  });
});

describe('GET /api/recipes', () => {
  it('returns an empty list initially', async () => {
    const res = await api.get('/api/recipes');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('returns created recipes', async () => {
    await api.post('/api/recipes').send(sampleRecipe);
    await api.post('/api/recipes').send({ title: 'Toast' });

    const res = await api.get('/api/recipes');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('supports pagination', async () => {
    // Create 3 recipes
    await api.post('/api/recipes').send({ title: 'Recipe 1' });
    await api.post('/api/recipes').send({ title: 'Recipe 2' });
    await api.post('/api/recipes').send({ title: 'Recipe 3' });

    const res = await api.get('/api/recipes?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);

    const res2 = await api.get('/api/recipes?page=2&limit=2');
    expect(res2.body.recipes).toHaveLength(1);
  });

  it('supports search by title', async () => {
    await api.post('/api/recipes').send({ title: 'Chicken Soup' });
    await api.post('/api/recipes').send({ title: 'Tomato Soup' });
    await api.post('/api/recipes').send({ title: 'Grilled Chicken' });

    const res = await api.get('/api/recipes?search=Chicken');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
  });

  it('excludes archived recipes by default', async () => {
    const createRes = await api.post('/api/recipes').send({ title: 'To Archive' });
    await api.delete(`/api/recipes/${createRes.body.id}`);

    const res = await api.get('/api/recipes');
    expect(res.body.recipes).toHaveLength(0);

    const resArchived = await api.get('/api/recipes?archived=true');
    expect(resArchived.body.recipes).toHaveLength(1);
  });

  it('only returns latest versions', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    await api.patch(`/api/recipes/${createRes.body.id}`).send({ title: 'Updated Eggs' });

    const res = await api.get('/api/recipes');
    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.recipes[0].title).toBe('Updated Eggs');
  });
});

describe('GET /api/recipes/:id', () => {
  it('returns a recipe by ID', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const res = await api.get(`/api/recipes/${createRes.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Scrambled Eggs');
    expect(res.body.ingredients).toHaveLength(4);
    expect(res.body.steps).toHaveLength(4);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await api.get('/api/recipes/non-existent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });
});

describe('PATCH /api/recipes/:id', () => {
  it('updates a recipe and creates a new version', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const originalId = createRes.body.id;

    const updateRes = await api
      .patch(`/api/recipes/${originalId}`)
      .send({ title: 'Creamy Scrambled Eggs', personalNotes: 'Even better with cream cheese' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Creamy Scrambled Eggs');
    expect(updateRes.body.version).toBe(2);
    expect(updateRes.body.isLatest).toBe(true);
    expect(updateRes.body.parentId).toBe(originalId);
    expect(updateRes.body.personalNotes).toBe('Even better with cream cheese');
    // Original ingredients should be preserved
    expect(updateRes.body.ingredients).toHaveLength(4);
  });

  it('updates ingredients when provided', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);

    const newIngredients = [
      { name: 'eggs', amount: 6, unit: 'large', isOptional: false, orderIndex: 0 },
      { name: 'cream', amount: 2, unit: 'tbsp', isOptional: false, orderIndex: 1 },
    ];

    const updateRes = await api
      .patch(`/api/recipes/${createRes.body.id}`)
      .send({ ingredients: newIngredients });

    expect(updateRes.body.ingredients).toHaveLength(2);
    expect(updateRes.body.ingredients[0].amount).toBe(6);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await api.patch('/api/recipes/non-existent').send({ title: 'Test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/recipes/:id (archive toggle)', () => {
  it('archives a recipe', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const res = await api.delete(`/api/recipes/${createRes.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
  });

  it('unarchives an archived recipe', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    await api.delete(`/api/recipes/${createRes.body.id}`);
    const res = await api.delete(`/api/recipes/${createRes.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(false);
  });

  it('returns 404 for non-existent recipe', async () => {
    const res = await api.delete('/api/recipes/non-existent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/recipes/:id/versions', () => {
  it('returns version history for a recipe', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const v1Id = createRes.body.id;

    const updateRes = await api
      .patch(`/api/recipes/${v1Id}`)
      .send({ title: 'Updated Eggs' });
    const v2Id = updateRes.body.id;

    await api.patch(`/api/recipes/${v2Id}`).send({ title: 'Final Eggs' });

    // Can get versions from any version ID in the chain
    const res = await api.get(`/api/recipes/${v1Id}/versions`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].version).toBe(3);
    expect(res.body[0].title).toBe('Final Eggs');
    expect(res.body[1].version).toBe(2);
    expect(res.body[1].title).toBe('Updated Eggs');
    expect(res.body[2].version).toBe(1);
    expect(res.body[2].title).toBe('Scrambled Eggs');
  });
});

describe('per-ingredient notes', () => {
  const notedRecipe = {
    title: 'Grilled Cheese',
    servings: 1,
    ingredients: [
      { name: 'bread', amount: 2, unit: 'slice', isOptional: false, orderIndex: 0, note: 'use sourdough' },
      { name: 'cheese', amount: 2, unit: 'slice', isOptional: false, orderIndex: 1, note: 'use Cooper brand' },
      { name: 'butter', amount: 1, unit: 'tbsp', isOptional: false, orderIndex: 2 },
    ],
  };

  it('stores and returns ingredient notes on create', async () => {
    const res = await api.post('/api/recipes').send(notedRecipe);

    expect(res.status).toBe(201);
    const byName = Object.fromEntries(res.body.ingredients.map((i: { name: string; note: string | null }) => [i.name, i.note]));
    expect(byName.bread).toBe('use sourdough');
    expect(byName.cheese).toBe('use Cooper brand');
    expect(byName.butter).toBeNull();
  });

  it('preserves notes when the recipe is edited (version copy-path)', async () => {
    const createRes = await api.post('/api/recipes').send(notedRecipe);

    // Edit only the title — ingredients are NOT resent, so the copy-path must carry notes forward.
    const updateRes = await api
      .patch(`/api/recipes/${createRes.body.id}`)
      .send({ title: 'Deluxe Grilled Cheese' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.version).toBe(2);
    const byName = Object.fromEntries(updateRes.body.ingredients.map((i: { name: string; note: string | null }) => [i.name, i.note]));
    expect(byName.bread).toBe('use sourdough');
    expect(byName.cheese).toBe('use Cooper brand');
    expect(byName.butter).toBeNull();
  });

  it('preserves notes when an old version is restored', async () => {
    const createRes = await api.post('/api/recipes').send(notedRecipe);
    const v1Id = createRes.body.id;

    // v2 drops the notes entirely
    await api.patch(`/api/recipes/${v1Id}`).send({
      title: 'Plain Grilled Cheese',
      ingredients: [
        { name: 'bread', amount: 2, unit: 'slice', isOptional: false, orderIndex: 0 },
        { name: 'cheese', amount: 2, unit: 'slice', isOptional: false, orderIndex: 1 },
      ],
    });

    // Restore v1 (creates v3 from v1's data) — notes must come back.
    const restoreRes = await api.post(`/api/recipes/${v1Id}/restore/1`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.version).toBe(3);
    const byName = Object.fromEntries(restoreRes.body.ingredients.map((i: { name: string; note: string | null }) => [i.name, i.note]));
    expect(byName.bread).toBe('use sourdough');
    expect(byName.cheese).toBe('use Cooper brand');
    expect(byName.butter).toBeNull();
  });

  it('rejects a note longer than 200 characters', async () => {
    const res = await api.post('/api/recipes').send({
      title: 'Bad Note',
      ingredients: [
        { name: 'bread', isOptional: false, orderIndex: 0, note: 'x'.repeat(201) },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('accepts a note of exactly 200 characters', async () => {
    const res = await api.post('/api/recipes').send({
      title: 'Long Note',
      ingredients: [
        { name: 'bread', isOptional: false, orderIndex: 0, note: 'x'.repeat(200) },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].note).toHaveLength(200);
  });
});

describe('POST /api/recipes/:id/restore/:version', () => {
  it('restores an old version as a new version', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const v1Id = createRes.body.id;

    const updateRes = await api
      .patch(`/api/recipes/${v1Id}`)
      .send({
        title: 'Changed Eggs',
        ingredients: [
          { name: 'eggs', amount: 2, unit: 'large', isOptional: false, orderIndex: 0 },
        ],
      });

    // Restore v1 (should create v3 with v1's data)
    const restoreRes = await api.post(`/api/recipes/${v1Id}/restore/1`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.version).toBe(3);
    expect(restoreRes.body.title).toBe('Scrambled Eggs');
    expect(restoreRes.body.isLatest).toBe(true);
    expect(restoreRes.body.ingredients).toHaveLength(4);

    // Verify old v2 is no longer latest
    const v2 = await api.get(`/api/recipes/${updateRes.body.id}`);
    expect(v2.body.isLatest).toBe(false);
  });

  it('returns 404 for non-existent version', async () => {
    const createRes = await api.post('/api/recipes').send(sampleRecipe);
    const res = await api.post(`/api/recipes/${createRes.body.id}/restore/99`);

    expect(res.status).toBe(404);
  });
});
