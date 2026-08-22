import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRecipeVersions } from './recipe.service.js';

// Public read include — mirrors the detail view's needs but adds media (recipe- and step-level)
// so the token-scoped page can render images/videos. personalNotes and userId are stripped in
// the sanitizer below; they are intentionally never sent to an unauthenticated viewer.
const sharedInclude = {
  ingredients: { orderBy: { orderIndex: 'asc' as const } },
  steps: {
    orderBy: { orderIndex: 'asc' as const },
    // A step holds at most one media item (POST /steps/:id/media replaces any existing row, and
    // version copies preserve that), but order + take explicitly so `step.media[0]` below is
    // deterministic even if a stray second row ever appears.
    include: { media: { orderBy: { orderIndex: 'asc' as const }, take: 1 } },
  },
  labels: { include: { label: true } },
  courses: true,
  media: { orderBy: { orderIndex: 'asc' as const } },
};

/**
 * Collect every recipe id in the version chain that `recipeId` belongs to, without a userId
 * scope (the share itself is the authorization). Walks to the root, then BFS over descendants —
 * the same traversal `getRecipeVersions` performs, but usable from the public read path.
 */
async function getChainRecipeIds(recipeId: string): Promise<string[]> {
  const start = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!start) return [];

  // Walk up to the root (oldest version).
  let rootId = start.id;
  let current = start;
  while (current.parentId) {
    const parent = await prisma.recipe.findUnique({ where: { id: current.parentId } });
    if (!parent) break;
    rootId = parent.id;
    current = parent;
  }

  // BFS down from the root collecting every version id.
  const ids: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    const children = await prisma.recipe.findMany({ where: { parentId: id }, select: { id: true } });
    for (const child of children) queue.push(child.id);
  }
  return ids;
}

function computeTimes(steps: { timeMinutes: number | null; isActiveTime: boolean }[]) {
  const totalTime = Math.ceil(steps.reduce((sum, s) => sum + (s.timeMinutes ?? 0), 0)) || null;
  const activeTime =
    Math.ceil(steps.filter((s) => s.isActiveTime).reduce((sum, s) => sum + (s.timeMinutes ?? 0), 0)) || null;
  return { totalTime, activeTime };
}

// ── Owner endpoints (authenticated; userId is the first argument) ────────────────

/** Look up the current unrevoked share for any version in a recipe's chain, if one exists. */
async function findActiveShare(userId: string, chainIds: string[]) {
  return prisma.recipeShare.findFirst({
    where: { userId, recipeId: { in: chainIds }, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/** Create a share for the recipe (or return the existing unrevoked one). 404 if not owned. */
export async function createShare(userId: string, recipeId: string) {
  // getRecipeVersions enforces ownership (throws 404 on a miss) and returns the whole chain.
  const versions = await getRecipeVersions(userId, recipeId);
  const chainIds = versions.map((v) => v.id);

  const existing = await findActiveShare(userId, chainIds);
  if (existing) return existing;

  return prisma.recipeShare.create({ data: { recipeId, userId } });
}

/** Current share state for a recipe, or null when there is no active share. 404 if not owned. */
export async function getShare(userId: string, recipeId: string) {
  const versions = await getRecipeVersions(userId, recipeId);
  const chainIds = versions.map((v) => v.id);
  return findActiveShare(userId, chainIds);
}

/** Revoke any active share on the recipe's chain. 404 if not owned. Idempotent. */
export async function revokeShare(userId: string, recipeId: string) {
  const versions = await getRecipeVersions(userId, recipeId);
  const chainIds = versions.map((v) => v.id);
  await prisma.recipeShare.updateMany({
    where: { userId, recipeId: { in: chainIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ── Public endpoints (token is the authorization; no session) ────────────────────

/** Resolve a token to an active share, or throw 404 for unknown/revoked tokens. */
async function resolveActiveShare(token: string) {
  const share = await prisma.recipeShare.findUnique({ where: { id: token } });
  if (!share || share.revokedAt) {
    throw new AppError(404, 'Share not found');
  }
  return share;
}

/**
 * Public read-only view of a shared recipe (latest version in the chain). Excludes personalNotes
 * and any user identifiers. Media items are returned as `{ id, type }` — the caller builds the
 * token-scoped media URL (`/api/shared/:token/media/:id`).
 */
export async function getSharedRecipe(token: string) {
  const share = await resolveActiveShare(token);
  const chainIds = await getChainRecipeIds(share.recipeId);

  const recipe = await prisma.recipe.findFirst({
    where: { id: { in: chainIds }, isLatest: true },
    include: sharedInclude,
  });
  if (!recipe) {
    throw new AppError(404, 'Share not found');
  }

  const { totalTime, activeTime } = computeTimes(recipe.steps);

  return {
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    source: recipe.source,
    authorNotes: recipe.authorNotes,
    totalTime,
    activeTime,
    updatedAt: recipe.updatedAt,
    courses: recipe.courses.map((c) => ({ courseType: c.courseType })),
    labels: recipe.labels.map((rl) => ({
      labelId: rl.labelId,
      label: { id: rl.label.id, type: rl.label.type, name: rl.label.name },
    })),
    ingredients: recipe.ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      isOptional: ing.isOptional,
      note: ing.note,
      orderIndex: ing.orderIndex,
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      orderIndex: step.orderIndex,
      instruction: step.instruction,
      timeMinutes: step.timeMinutes,
      isActiveTime: step.isActiveTime,
      media: step.media[0] ? { id: step.media[0].id, type: step.media[0].type } : null,
    })),
    media: recipe.media.map((m) => ({ id: m.id, type: m.type, orderIndex: m.orderIndex })),
  };
}

/**
 * Resolve a token + mediaId to the media row's on-disk path, but only if that media belongs to
 * the shared recipe's version chain (ownership via the share, not the session). 404 otherwise.
 */
export async function getSharedMediaPath(token: string, mediaId: string): Promise<string> {
  const share = await resolveActiveShare(token);
  const chainIds = await getChainRecipeIds(share.recipeId);

  const media = await prisma.media.findFirst({
    where: {
      id: mediaId,
      OR: [{ recipeId: { in: chainIds } }, { step: { recipeId: { in: chainIds } } }],
    },
  });
  if (!media) {
    throw new AppError(404, 'Media not found');
  }
  return media.path;
}
