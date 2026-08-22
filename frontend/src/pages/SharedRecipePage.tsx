import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSharedRecipe, sharedMediaUrl, type SharedRecipe } from '../api/shares';
import { COURSE_DISPLAY_NAMES } from '../api/courses';
import { resolveIngredientRefs } from '../utils/resolveIngredientRefs';
import { formatDuration } from '../utils/formatDuration';
import { RecipeIngredientList } from '../components/recipe-detail/RecipeIngredientList';
import { RecipeNotes } from '../components/recipe-detail/RecipeNotes';
import type { Ingredient } from '../types/recipe';

/** Adapt the trimmed public ingredient shape to the shared display component's `Ingredient`. */
function toDisplayIngredient(ing: SharedRecipe['ingredients'][number]): Ingredient {
  return { ...ing, recipeId: '', originalName: null };
}

function SharedRecipeView({ token, recipe }: { token: string; recipe: SharedRecipe }) {
  const ingredients = recipe.ingredients.map(toDisplayIngredient);
  const coverImage = recipe.media.find((m) => m.type === 'image') ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{recipe.title}</h1>
        <div className="flex gap-3 text-sm text-gray-500 mt-1">
          {recipe.totalTime && <span>Total: {formatDuration(recipe.totalTime)}</span>}
          {recipe.activeTime && <span>Active: {formatDuration(recipe.activeTime)}</span>}
        </div>
      </div>

      {/* Cover photo */}
      {coverImage && (
        <div className="w-full aspect-video rounded-xl overflow-hidden border border-gray-200 mb-6">
          <img src={sharedMediaUrl(token, coverImage.id)} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Source */}
      {recipe.source && (
        <p className="text-sm text-gray-500 mb-4">
          Source:{' '}
          {recipe.source.startsWith('http') ? (
            <a href={recipe.source} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 underline">
              {recipe.source}
            </a>
          ) : (
            recipe.source
          )}
        </p>
      )}

      {/* Courses & manual labels */}
      {(recipe.courses.length > 0 || recipe.labels.some((rl) => rl.label.type === 'manual')) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {recipe.courses.map((rc) => (
            <span key={rc.courseType} className="px-2.5 py-0.5 text-xs rounded-full bg-blue-50 border border-blue-200 text-blue-700">
              {COURSE_DISPLAY_NAMES[rc.courseType] ?? rc.courseType}
            </span>
          ))}
          {recipe.labels.filter((rl) => rl.label.type === 'manual').map((rl) => (
            <span key={rl.labelId} className="px-2.5 py-0.5 text-xs rounded-full bg-gray-100 border border-gray-200 text-gray-600">
              {rl.label.name}
            </span>
          ))}
        </div>
      )}

      {/* Ingredients (read-only; no scaling / substitutions on the public view) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Ingredients</h2>
          <span className="text-sm text-gray-500">Serves {recipe.servings}</span>
        </div>
        <RecipeIngredientList
          ingredients={ingredients}
          scaledIngredients={ingredients}
          activeSwaps={{}}
          subsByIngredientId={{}}
          onApplySwap={() => {}}
          onRemoveSwap={() => {}}
          onClearSwaps={() => {}}
        />
      </div>

      {/* Steps */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Steps</h2>
        {recipe.steps.length === 0 ? (
          <p className="text-gray-500 text-sm">No steps listed.</p>
        ) : (
          <ol className="space-y-4">
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </span>
                <div className="flex-1 pt-0.5">
                  <p className="text-gray-900 text-sm">
                    {resolveIngredientRefs(step.instruction, ingredients)}
                  </p>
                  {!!step.timeMinutes && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDuration(step.timeMinutes)} ({step.isActiveTime ? 'active' : 'inactive'})
                    </p>
                  )}
                  {step.media && (
                    step.media.type === 'video' ? (
                      <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 aspect-video">
                        <video src={sharedMediaUrl(token, step.media.id)} controls playsInline className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
                        <img src={sharedMediaUrl(token, step.media.id)} alt="" className="w-full object-cover max-h-64" />
                      </div>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Author notes only — personal notes are never shared */}
      <RecipeNotes authorNotes={recipe.authorNotes} personalNotes={null} />
    </div>
  );
}

export function SharedRecipePage() {
  const { token } = useParams<{ token: string }>();
  const { data: recipe, isLoading, error } = useQuery({
    queryKey: ['shared-recipe', token],
    queryFn: () => fetchSharedRecipe(token!),
    enabled: !!token,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <span className="font-semibold text-gray-900">Kitchen Canon</span>
          <span className="text-sm text-gray-400 ml-2">shared recipe</span>
        </div>
      </header>

      {isLoading && <p className="max-w-2xl mx-auto px-4 py-8 text-gray-500">Loading recipe…</p>}
      {(error || (!isLoading && !recipe)) && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-gray-700 font-medium">This link is no longer available.</p>
          <p className="text-sm text-gray-500 mt-1">
            The recipe may have been unshared, or the link is incorrect.
          </p>
        </div>
      )}
      {recipe && <SharedRecipeView token={token!} recipe={recipe} />}
    </div>
  );
}
