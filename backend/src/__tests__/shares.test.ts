import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createAuthedApi, cleanupUsers, type AuthedApi } from './helpers/auth.js';

const app = createApp();
let api: AuthedApi;

const sampleRecipe = {
  title: 'Scrambled Eggs',
  servings: 2,
  source: 'https://example.com/scrambled-eggs',
  authorNotes: 'Use low heat for creamier eggs',
  personalNotes: 'Kids only eat this with ketchup',
  ingredients: [
    { name: 'eggs', amount: 4, unit: 'large', isOptional: false, note: 'room temperature', orderIndex: 0 },
    { name: 'butter', amount: 1, unit: 'tbsp', isOptional: false, orderIndex: 1 },
  ],
  steps: [
    { orderIndex: 0, instruction: 'Crack {eggs:100%} into a bowl and whisk.', timeMinutes: 2, isActiveTime: true },
    { orderIndex: 1, instruction: 'Melt {butter:100%} in a pan.', timeMinutes: 1, isActiveTime: true },
  ],
};

/** Create a media row + a real file on disk so sendFile has something to stream. */
async function createMedia(data: { recipeId?: string; stepId?: string }): Promise<string> {
  const filename = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(config.MEDIA_STORAGE_PATH, filename), 'fake-image-bytes');
  const media = await prisma.media.create({
    data: { type: 'image', path: `/media/${filename}`, orderIndex: 0, ...data },
  });
  return media.id;
}

beforeEach(async () => {
  await cleanupUsers();
  fs.mkdirSync(config.MEDIA_STORAGE_PATH, { recursive: true });
  api = await createAuthedApi(app);
});

describe('Owner share endpoints', () => {
  it('creates a share and returns the same token on repeat (idempotent)', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;

    const first = await api.post(`/api/recipes/${recipe.id}/share`);
    expect(first.status).toBe(201);
    expect(first.body.id).toBeTruthy();
    expect(first.body.revokedAt).toBeNull();

    const second = await api.post(`/api/recipes/${recipe.id}/share`);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('GET reports the active share, then null after revoke', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    const current = await api.get(`/api/recipes/${recipe.id}/share`);
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(share.id);

    const revoke = await api.delete(`/api/recipes/${recipe.id}/share`);
    expect(revoke.status).toBe(204);

    const afterRevoke = await api.get(`/api/recipes/${recipe.id}/share`);
    expect(afterRevoke.status).toBe(200);
    expect(afterRevoke.body).toBeNull();
  });

  it('creates a fresh token after a revoke', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const first = (await api.post(`/api/recipes/${recipe.id}/share`)).body;
    await api.delete(`/api/recipes/${recipe.id}/share`);
    const second = (await api.post(`/api/recipes/${recipe.id}/share`)).body;
    expect(second.id).not.toBe(first.id);
  });
});

describe('Public shared recipe endpoint', () => {
  it('round-trips: an anonymous request can read a shared recipe', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    // No session, no CSRF header — a plain unauthenticated client.
    const res = await request(app).get(`/api/shared/${share.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Scrambled Eggs');
    expect(res.body.ingredients).toHaveLength(2);
    expect(res.body.ingredients[0].note).toBe('room temperature');
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.totalTime).toBe(3);
    expect(res.body.authorNotes).toBe('Use low heat for creamier eggs');
  });

  it('excludes personalNotes and user identifiers from the payload', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    const res = await request(app).get(`/api/shared/${share.id}`);
    expect(res.status).toBe(200);
    expect(res.body.personalNotes).toBeUndefined();
    expect(res.body.userId).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('ketchup');
    expect(JSON.stringify(res.body)).not.toContain(api.userId);
  });

  it('tracks the latest version after an edit', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    await api.patch(`/api/recipes/${recipe.id}`).send({ title: 'Fluffy Scrambled Eggs' });

    const res = await request(app).get(`/api/shared/${share.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Fluffy Scrambled Eggs');
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).get('/api/shared/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 404 once the share is revoked', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;
    await api.delete(`/api/recipes/${recipe.id}/share`);

    const res = await request(app).get(`/api/shared/${share.id}`);
    expect(res.status).toBe(404);
  });
});

describe('Public shared media endpoint', () => {
  it('streams recipe- and step-level media that belongs to the share', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const recipeMediaId = await createMedia({ recipeId: recipe.id });
    const stepMediaId = await createMedia({ stepId: recipe.steps[0].id });
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    const cover = await request(app).get(`/api/shared/${share.id}/media/${recipeMediaId}`);
    expect(cover.status).toBe(200);

    const stepImg = await request(app).get(`/api/shared/${share.id}/media/${stepMediaId}`);
    expect(stepImg.status).toBe(200);
  });

  it('returns 404 for a media id from a different recipe (token scoping)', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const other = (await api.post('/api/recipes').send({ title: 'Other Recipe' })).body;
    const foreignMediaId = await createMedia({ recipeId: other.id });
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;

    const res = await request(app).get(`/api/shared/${share.id}/media/${foreignMediaId}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for shared media once the share is revoked', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const mediaId = await createMedia({ recipeId: recipe.id });
    const share = (await api.post(`/api/recipes/${recipe.id}/share`)).body;
    await api.delete(`/api/recipes/${recipe.id}/share`);

    const res = await request(app).get(`/api/shared/${share.id}/media/${mediaId}`);
    expect(res.status).toBe(404);
  });
});

describe('Cross-user isolation', () => {
  it('user B cannot create, read, or revoke a share on user A\'s recipe', async () => {
    const recipe = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const userB = await createAuthedApi(app);

    const create = await userB.post(`/api/recipes/${recipe.id}/share`);
    expect(create.status).toBe(404);

    const get = await userB.get(`/api/recipes/${recipe.id}/share`);
    expect(get.status).toBe(404);

    const revoke = await userB.delete(`/api/recipes/${recipe.id}/share`);
    expect(revoke.status).toBe(404);
  });

  it('user B revoking their own recipe does not touch user A\'s active share', async () => {
    const recipeA = (await api.post('/api/recipes').send(sampleRecipe)).body;
    const shareA = (await api.post(`/api/recipes/${recipeA.id}/share`)).body;

    const userB = await createAuthedApi(app);
    const recipeB = (await userB.post('/api/recipes').send({ title: 'B Recipe' })).body;
    await userB.post(`/api/recipes/${recipeB.id}/share`);
    await userB.delete(`/api/recipes/${recipeB.id}/share`);

    // A's share is still live.
    const res = await request(app).get(`/api/shared/${shareA.id}`);
    expect(res.status).toBe(200);
  });
});
