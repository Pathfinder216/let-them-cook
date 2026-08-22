import { apiPost, apiUpload } from './client';
import type { CreateRecipeInput } from '../types/recipe';

export type ParsedRecipe = Omit<CreateRecipeInput, 'ingredients' | 'steps'> & {
  title: string;
  servings: number;
  totalTime: number | null;
  activeTime: number | null;
  source: string | null;
  authorNotes: string | null;
  ingredients: {
    name: string;
    originalName: string;
    amount: number | null;
    unit: string | null;
    isOptional: boolean;
    orderIndex: number;
  }[];
  steps: {
    orderIndex: number;
    instruction: string;
    timeMinutes: number | null;
    isActiveTime: boolean;
  }[];
  // Populated by the backend parser only — it's the only place that knows whether e.g.
  // `servings: 4` was actually parsed or is the no-match fallback default.
  warnings: string[];
};

export async function importFromUrl(url: string): Promise<ParsedRecipe> {
  return apiPost<ParsedRecipe>('/import/url', { url });
}

export async function importFromFile(file: File): Promise<ParsedRecipe> {
  return apiUpload<ParsedRecipe>('/import/file', file);
}
