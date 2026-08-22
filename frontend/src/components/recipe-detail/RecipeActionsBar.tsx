import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useArchiveRecipe, useDeleteRecipePermanently } from '../../hooks/useRecipes';
import {
  exportRecipeAsText,
  exportRecipeAsJson,
  canShareRecipe,
  shareRecipe,
  emailRecipe,
} from '../../utils/exportRecipe';
import { fetchShare, createShare, revokeShare } from '../../api/shares';
import { Modal } from '../ui/Modal';
import { MediaVisibilityToggle } from '../MediaVisibilityToggle';
import type { Recipe, Ingredient } from '../../types/recipe';
import type { Substitution } from '../../api/substitutions';

interface RecipeActionsBarProps {
  recipe: Recipe;
  /** Target servings + active swaps are passed to Cook mode via router state. */
  targetServings: number;
  activeSwaps: Record<string, Substitution>;
}

/** Header action buttons (Cook/Edit/Archive/Delete) plus the delete-confirm modal. */
export function RecipeActionsBar({ recipe, targetServings, activeSwaps }: RecipeActionsBarProps) {
  const id = recipe.id;
  const archiveMutation = useArchiveRecipe();
  const deleteMutation = useDeleteRecipePermanently();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleArchive() {
    if (!id) return;
    archiveMutation.mutate(id);
  }

  function handleDelete() {
    if (!id) return;
    deleteMutation.mutate(id);
  }

  return (
    <>
      <div className="flex gap-2">
        <MediaVisibilityToggle />
        {recipe.steps.length > 0 && (
          <Link
            to={`/recipes/${id}/cook`}
            state={{ targetServings, activeSwaps, from: { label: recipe.title, href: `/recipes/${id}` } }}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Cook
          </Link>
        )}
        <Link
          to={`/recipes/${id}/edit`}
          className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 transition-colors"
        >
          Edit
        </Link>
        <button
          onClick={handleArchive}
          disabled={archiveMutation.isPending}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {recipe.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="border border-red-200 text-red-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete recipe?"
        footer={
          <>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete permanently'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 mb-6">
          <span className="font-medium">"{recipe.title}"</span> and all its versions will be permanently deleted. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}

interface ExportActionsProps {
  recipe: Recipe;
  finalIngredients: Ingredient[];
  swapDisplayNames: Map<string, string>;
  targetServings: number;
}

const EXPORT_BTN =
  'text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 px-2.5 py-1 rounded-md transition-colors';

/** Copy public link / Revoke link — creates a token-gated share on demand and copies its URL. */
function ShareLinkActions({ recipeId }: { recipeId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const { data: share } = useQuery({
    queryKey: ['recipe-share', recipeId],
    queryFn: () => fetchShare(recipeId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['recipe-share', recipeId] });
  }

  const copyMutation = useMutation({
    // Reuse the existing token when there is one, otherwise mint a new share.
    mutationFn: async () => share ?? (await createShare(recipeId)),
    onSuccess: async (s) => {
      const url = `${window.location.origin}/shared/${s.id}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setError('');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard blocked (insecure context / permissions) — surface the URL to copy by hand.
        setError(url);
      }
      invalidate();
    },
    onError: () => setError('Could not create share link'),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeShare(recipeId),
    onSuccess: () => {
      setCopied(false);
      setError('');
      invalidate();
    },
  });

  return (
    <>
      <button
        onClick={() => copyMutation.mutate()}
        disabled={copyMutation.isPending}
        className={EXPORT_BTN}
      >
        {copied ? 'Link copied!' : copyMutation.isPending ? 'Creating…' : 'Copy link'}
      </button>
      {share && (
        <button
          onClick={() => revokeMutation.mutate()}
          disabled={revokeMutation.isPending}
          className={EXPORT_BTN}
        >
          {revokeMutation.isPending ? 'Revoking…' : 'Revoke link'}
        </button>
      )}
      {error && <span className="text-xs text-gray-500 break-all">{error}</span>}
    </>
  );
}

/** Share, email, PDF and export (.txt / JSON) buttons shown in the footer. */
export function ExportActions({ recipe, finalIngredients, swapDisplayNames, targetServings }: ExportActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 shrink-0 justify-end">
      <ShareLinkActions recipeId={recipe.id} />
      {canShareRecipe() && (
        <button
          onClick={() => shareRecipe(recipe, finalIngredients, swapDisplayNames, targetServings)}
          className={EXPORT_BTN}
        >
          Share…
        </button>
      )}
      <button
        onClick={() => emailRecipe(recipe, finalIngredients, swapDisplayNames, targetServings)}
        className={EXPORT_BTN}
      >
        Email
      </button>
      <button
        onClick={() => window.print()}
        title="Choose “Save as PDF” in the print dialog"
        className={EXPORT_BTN}
      >
        Save as PDF
      </button>
      <button
        onClick={() => exportRecipeAsText(recipe, finalIngredients, swapDisplayNames, targetServings)}
        className={EXPORT_BTN}
      >
        Export .txt
      </button>
      <button
        onClick={() => exportRecipeAsJson(recipe, finalIngredients, swapDisplayNames, targetServings)}
        className={EXPORT_BTN}
      >
        Export JSON
      </button>
    </div>
  );
}
