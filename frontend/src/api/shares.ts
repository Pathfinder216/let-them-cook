import { apiGet, apiPost, apiDelete } from './client';

/** A share record returned by the owner endpoints (`id` doubles as the URL token). */
export interface Share {
  id: string;
  recipeId: string;
  userId: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface SharedIngredient {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  isOptional: boolean;
  note: string | null;
  orderIndex: number;
}

export interface SharedStep {
  id: string;
  orderIndex: number;
  instruction: string;
  timeMinutes: number | null;
  isActiveTime: boolean;
  media: { id: string; type: string } | null;
}

/** The public, read-only recipe payload behind a share token (no personalNotes, no user ids). */
export interface SharedRecipe {
  id: string;
  title: string;
  servings: number;
  source: string | null;
  authorNotes: string | null;
  totalTime: number | null;
  activeTime: number | null;
  updatedAt: string;
  courses: { courseType: string }[];
  labels: { labelId: string; label: { id: string; type: string; name: string } }[];
  ingredients: SharedIngredient[];
  steps: SharedStep[];
  media: { id: string; type: string; orderIndex: number | null }[];
}

// ── Owner endpoints (authenticated) ──────────────────────────────────────────

export function fetchShare(recipeId: string): Promise<Share | null> {
  return apiGet<Share | null>(`/recipes/${recipeId}/share`);
}

export function createShare(recipeId: string): Promise<Share> {
  return apiPost<Share>(`/recipes/${recipeId}/share`);
}

export function revokeShare(recipeId: string): Promise<void> {
  return apiDelete<void>(`/recipes/${recipeId}/share`);
}

// ── Public endpoint (token is the only credential) ───────────────────────────

export function fetchSharedRecipe(token: string): Promise<SharedRecipe> {
  return apiGet<SharedRecipe>(`/shared/${token}`);
}

/** Absolute path for a token-scoped media file (used directly as an <img>/<video> src). */
export function sharedMediaUrl(token: string, mediaId: string): string {
  return `/api/shared/${token}/media/${mediaId}`;
}
