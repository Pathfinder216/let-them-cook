import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { createAuthedApi, cleanupUsers, type AuthedApi } from './helpers/auth.js';

const app = createApp();
let api: AuthedApi;

// Mirrors STANDARD_LABELS in prisma/seed.ts (plan 25: equipment + make-ahead vocabulary,
// implemented as `manual` labels — no dedicated label types). Kept in sync with the seed so
// this suite exercises exactly the rows a fresh DB seed produces.
const STANDARD_LABELS: { type: string; name: string }[] = [
  { type: 'manual', name: 'Make-ahead' },
  { type: 'manual', name: 'Freezable' },
  { type: 'manual', name: 'Quick' },
  { type: 'manual', name: 'Budget-friendly' },
  { type: 'manual', name: 'Refrigerate up to 3 days' },
  { type: 'manual', name: 'Night-before prep' },
  { type: 'manual', name: 'Slow cooker' },
  { type: 'manual', name: 'Instant Pot / pressure cooker' },
  { type: 'manual', name: 'Air fryer' },
  { type: 'manual', name: 'Oven' },
  { type: 'manual', name: 'Stovetop only' },
  { type: 'manual', name: 'No-cook' },
  { type: 'manual', name: 'Grill' },
  { type: 'manual', name: 'Blender / food processor' },
  { type: 'manual', name: 'Stand mixer' },
];

async function seedStandardLabels(): Promise<number> {
  let created = 0;
  for (const { type, name } of STANDARD_LABELS) {
    const existing = await prisma.label.findFirst({ where: { type, name, userId: null } });
    if (!existing) {
      await prisma.label.create({ data: { type, name } });
      created++;
    }
  }
  return created;
}

beforeEach(async () => {
  await cleanupUsers();
  await prisma.label.deleteMany();
  api = await createAuthedApi(app);
});

describe('Standard label seed (plan 25)', () => {
  it('seeds the full equipment/make-ahead vocabulary as global manual labels', async () => {
    const created = await seedStandardLabels();
    expect(created).toBe(STANDARD_LABELS.length);

    const globalCount = await prisma.label.count({ where: { userId: null } });
    expect(globalCount).toBe(STANDARD_LABELS.length);

    const names = (await prisma.label.findMany({ where: { userId: null } })).map((l) => l.name);
    for (const { name } of STANDARD_LABELS) {
      expect(names).toContain(name);
    }

    const types = new Set((await prisma.label.findMany({ where: { userId: null } })).map((l) => l.type));
    expect(types).toEqual(new Set(['manual']));
  });

  it('is idempotent on reseed and leaves user labels untouched', async () => {
    await seedStandardLabels();
    const countAfterFirst = await prisma.label.count({ where: { userId: null } });

    const userLabel = await api.post('/api/labels').send({ type: 'manual', name: 'My custom label' });
    expect(userLabel.status).toBe(201);

    const createdOnReseed = await seedStandardLabels();
    expect(createdOnReseed).toBe(0);

    const countAfterReseed = await prisma.label.count({ where: { userId: null } });
    expect(countAfterReseed).toBe(countAfterFirst);

    const survived = await prisma.label.findUnique({ where: { id: userLabel.body.id } });
    expect(survived).not.toBeNull();
    expect(survived?.userId).toBe(api.userId);
  });

  it('exposes the new labels through the labels endpoint', async () => {
    await seedStandardLabels();
    const res = await api.get('/api/labels');
    expect(res.status).toBe(200);
    const names = res.body.map((l: { name: string }) => l.name);
    expect(names).toContain('Slow cooker');
    expect(names).toContain('Refrigerate up to 3 days');
    expect(names).toContain('Night-before prep');
    expect(names).toContain('Instant Pot / pressure cooker');
  });
});
