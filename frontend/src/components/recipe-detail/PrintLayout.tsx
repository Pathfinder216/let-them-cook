import type { Recipe, Ingredient } from '../../types/recipe';
import { formatScaledAmount } from '../../hooks/useScaling';
import { COURSE_DISPLAY_NAMES } from '../../api/courses';
import { resolveIngredientRefsText } from '../../utils/resolveIngredientRefs';
import { formatDuration } from '../../utils/formatDuration';

interface PrintLayoutProps {
  recipe: Recipe;
  /** Scaled + swap-adjusted ingredients (names kept original for {ref} lookup). */
  finalIngredients: Ingredient[];
  /** Ingredient ID → substituted display name. */
  swapDisplayNames: Map<string, string>;
  targetServings: number;
}

/** Print-only layout (hidden on screen, shown via `print:block`). */
export function PrintLayout({ recipe, finalIngredients, swapDisplayNames, targetServings }: PrintLayoutProps) {
  return (
    <div className="hidden print:block text-black">
      <h1 className="text-2xl font-bold mb-1">{recipe.title}</h1>
      <div className="flex gap-4 text-sm text-gray-600 mb-1">
        {recipe.totalTime && <span>Total: {formatDuration(recipe.totalTime)}</span>}
        {recipe.activeTime && <span>Active: {formatDuration(recipe.activeTime)}</span>}
        <span>{targetServings} serving{targetServings !== 1 ? 's' : ''}</span>
      </div>
      {recipe.source && (
        <p className="text-sm text-gray-500 mb-1">Source: {recipe.source}</p>
      )}
      {recipe.courses.length > 0 && (
        <p className="text-sm text-gray-500 mb-3">
          {recipe.courses.map((rc) => COURSE_DISPLAY_NAMES[rc.courseType] ?? rc.courseType).join(', ')}
        </p>
      )}

      <h2 className="text-base font-semibold mt-4 mb-1">Ingredients</h2>
      <ul className="text-sm space-y-0.5 mb-4 columns-2">
        {finalIngredients.map((ing) => (
          <li key={ing.id}>
            {ing.amount !== null && (
              <span className="font-medium">
                {formatScaledAmount(ing.amount)}{' '}
                {ing.unit}{' '}
              </span>
            )}
            {swapDisplayNames.get(ing.id) ?? ing.name}
            {ing.isOptional && <span className="text-gray-400"> (optional)</span>}
            {ing.note && <span className="text-gray-500 italic"> — {ing.note}</span>}
          </li>
        ))}
      </ul>

      <h2 className="text-base font-semibold mb-1">Steps</h2>
      <ol className="text-sm space-y-2 mb-4">
        {recipe.steps.map((step, index) => (
          <li key={step.id} className="flex gap-2">
            <span className="font-semibold shrink-0">{index + 1}.</span>
            <span>
              {resolveIngredientRefsText(step.instruction, finalIngredients, 1, swapDisplayNames)}
              {!!step.timeMinutes && (
                <span className="text-gray-500"> ({formatDuration(step.timeMinutes)}{step.isActiveTime ? ', active' : ''})</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {recipe.authorNotes && (
        <div className="mb-3 break-inside-avoid">
          <h3 className="text-sm font-semibold mb-0.5">Author Notes</h3>
          <p className="text-sm whitespace-pre-line">{recipe.authorNotes}</p>
        </div>
      )}
      {recipe.personalNotes && (
        <div className="mb-3 break-inside-avoid">
          <h3 className="text-sm font-semibold mb-0.5">Personal Notes</h3>
          <p className="text-sm whitespace-pre-line">{recipe.personalNotes}</p>
        </div>
      )}
    </div>
  );
}
