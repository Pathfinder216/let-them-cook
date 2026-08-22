import { apiDelete, apiGet, apiUpload } from './client';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  path: string;
  orderIndex?: number | null;
}

/** The recipe's cover photo (the first image attached at recipe level), or null. */
export async function fetchRecipeCover(recipeId: string): Promise<MediaItem | null> {
  const items = await apiGet<MediaItem[]>(`/recipes/${recipeId}/media`);
  return items.find((m) => m.type === 'image') ?? null;
}

export function uploadRecipeCover(recipeId: string, file: File): Promise<MediaItem> {
  return apiUpload<MediaItem>(`/recipes/${recipeId}/media`, file);
}

export function deleteRecipeMedia(recipeId: string, mediaId: string): Promise<void> {
  return apiDelete(`/recipes/${recipeId}/media/${mediaId}`);
}

/** The single media item attached to a step, or null. */
export function fetchStepMedia(stepId: string): Promise<MediaItem | null> {
  return apiGet<MediaItem | null>(`/steps/${stepId}/media`);
}

export function uploadStepMedia(stepId: string, file: File): Promise<MediaItem> {
  return apiUpload<MediaItem>(`/steps/${stepId}/media`, file);
}

export function deleteStepMedia(stepId: string, mediaId: string): Promise<void> {
  return apiDelete(`/steps/${stepId}/media/${mediaId}`);
}
