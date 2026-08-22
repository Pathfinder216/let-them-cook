import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchRecipeCover,
  uploadRecipeCover,
  deleteRecipeMedia,
} from '../api/media';
import { useMediaVisibility } from '../hooks/useMediaVisibility';

interface RecipeMediaProps {
  recipeId: string;
  /** Read-only display mode (no upload/delete controls) */
  readOnly?: boolean;
}

export function RecipeMedia({ recipeId, readOnly = false }: RecipeMediaProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const { showMedia } = useMediaVisibility();

  const { data: cover = null } = useQuery({
    queryKey: ['cover-photo', recipeId],
    queryFn: () => fetchRecipeCover(recipeId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (cover) await deleteRecipeMedia(recipeId, cover.id);
      return uploadRecipeCover(recipeId, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-photo', recipeId] });
      setUploadError('');
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => deleteRecipeMedia(recipeId, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-photo', recipeId] }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }

  // ── Read-only (detail page) — respects the media visibility toggle ──────
  if (readOnly) {
    if (!showMedia || !cover) return null;
    return (
      <div className="w-full aspect-video rounded-xl overflow-hidden border border-gray-200 mb-6">
        <img src={cover.path} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  // ── Edit mode — compact horizontal row ───────────────────────────────────
  return (
    <div className="flex items-center gap-3">
      {cover ? (
        <>
          <div className="relative group w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-gray-200">
            <img src={cover.path} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer text-xs text-gray-600 hover:text-gray-900 border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors">
              {uploadMutation.isPending ? 'Uploading…' : 'Change'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
              />
            </label>
            <button
              onClick={() => deleteMutation.mutate(cover.id)}
              disabled={deleteMutation.isPending}
              className="text-xs text-red-500 hover:text-red-700 border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg px-3 py-2 transition-colors">
          <span className="text-lg leading-none">🖼</span>
          <span>{uploadMutation.isPending ? 'Uploading…' : '+ Add cover photo'}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploadMutation.isPending}
          />
        </label>
      )}
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
    </div>
  );
}
