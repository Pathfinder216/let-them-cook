import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { ComboInput } from '../ComboInput';
import { NumberField } from '../ui/NumberField';
import { UNIT_SUGGESTIONS } from '../../constants/suggestions';
import { InlineClassifyPanel } from './InlineClassifyPanel';
import { GripIcon, TrashIcon, UnclassifiedIcon } from './icons';
import { base, gripClass, FLIP_TRANSITION } from './styles';
import type { IngredientFormItem } from './useRecipeFormState';

interface IngredientsEditorProps {
  ingredients: IngredientFormItem[];
  setIngredients: React.Dispatch<React.SetStateAction<IngredientFormItem[]>>;
  addIngredient: () => void;
  removeIngredient: (index: number) => void;
  updateIngredient: (index: number, field: keyof IngredientFormItem, value: unknown) => void;
  ingredientNames: string[];
  catalogNameSet: Set<string>;
  /** Set when editing an existing recipe — threaded to InlineClassifyPanel for dietary refresh. */
  recipeId?: string;
}

export function IngredientsEditor({
  ingredients,
  setIngredients,
  addIngredient,
  removeIngredient,
  updateIngredient,
  ingredientNames,
  catalogNameSet,
  recipeId,
}: IngredientsEditorProps) {
  const [classifyingIngredientId, setClassifyingIngredientId] = useState<string | null>(null);

  // ── Ingredient drag state ────────────────────────────────────────────────────
  // ingDragId: ref for sync access in document listeners; ingDraggingId: state for rendering
  const ingDragId = useRef<string | null>(null);
  const [ingDraggingId, setIngDraggingId] = useState<string | null>(null);
  // ingEls: outer wrapper divs — hit-testing only, never transformed (layout position is always accurate)
  // ingContentEls: inner row divs — FLIP animation only
  const ingEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const ingContentEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const ingBeforePositions = useRef<Map<string, number>>(new Map());
  const ingPendingFlip = useRef(false);

  // ── Focus the new row's amount field after "+ Add Ingredient" ────────────────
  // amountEls holds each row's amount <input>; focusAmountPending is set when the
  // button is clicked and consumed in a layout effect once React has rendered the
  // new row, so the user can type the amount straight away.
  const amountEls = useRef<Map<string, HTMLInputElement>>(new Map());
  const focusAmountPending = useRef(false);

  useLayoutEffect(() => {
    if (!focusAmountPending.current) return;
    focusAmountPending.current = false;
    const last = ingredients[ingredients.length - 1];
    if (!last) return;
    const input = amountEls.current.get(last.internalId);
    if (!input) return;
    input.focus();
    input.select();
  }, [ingredients]);

  function handleAddIngredient() {
    focusAmountPending.current = true;
    addIngredient();
  }

  // ── Ingredient drag: document-level pointer listeners ────────────────────────
  // Using document listeners (not setPointerCapture) because pointer capture is lost
  // when React moves the captured DOM node during a live reorder.
  useEffect(() => {
    if (!ingDraggingId) return;

    function handleMove(e: PointerEvent) {
      const draggedId = ingDragId.current;
      if (!draggedId) return;
      for (const [id, el] of ingEls.current) {
        if (id === draggedId) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          if (e.clientY < rect.top + rect.height / 2) {
            const bef = new Map<string, number>();
            ingContentEls.current.forEach((ingEl, ingId) => { bef.set(ingId, ingEl.getBoundingClientRect().top); });
            ingBeforePositions.current = bef;
            ingPendingFlip.current = true;
            setIngredients(prev => {
              const fromIdx = prev.findIndex(s => s.internalId === draggedId);
              const toIdx = prev.findIndex(s => s.internalId === id);
              if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
              const arr = [...prev];
              const [item] = arr.splice(fromIdx, 1);
              arr.splice(toIdx, 0, item);
              return arr.map((ing, i) => ({ ...ing, orderIndex: i }));
            });
          }
          break;
        }
      }
    }

    function handleUp() {
      ingDragId.current = null;
      setIngDraggingId(null);
      document.documentElement.classList.remove('dragging-step');
      ingContentEls.current.forEach(el => { el.style.transition = ''; el.style.transform = ''; });
    }

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, [ingDraggingId, setIngredients]);

  // FLIP animation for ingredients — only inner content divs, outer wrappers are never transformed
  useLayoutEffect(() => {
    if (!ingPendingFlip.current) return;
    ingPendingFlip.current = false;
    const dragging = ingDragId.current;
    ingContentEls.current.forEach((el, id) => {
      if (id === dragging) return;
      const prev = ingBeforePositions.current.get(id);
      if (prev === undefined) return;
      const after = el.getBoundingClientRect().top;
      const delta = prev - after;
      if (Math.abs(delta) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      el.getBoundingClientRect(); // force reflow
      el.style.transition = FLIP_TRANSITION;
      el.style.transform = '';
    });
  }, [ingredients]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Ingredients</h3>
      <div className="space-y-0.5">
        {ingredients.map((ing, index) => (
          // Outer div: hit-testing only, never transformed — ensures layout position is always accurate
          <div
            key={ing.internalId}
            id={ing.name.trim() ? `ing-${ing.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined}
            ref={(el) => { if (el) ingEls.current.set(ing.internalId, el); else ingEls.current.delete(ing.internalId); }}
          >
            {/* Inner div: FLIP-animated + highlight */}
            <div
              ref={(el) => { if (el) ingContentEls.current.set(ing.internalId, el); else ingContentEls.current.delete(ing.internalId); }}
              className={`flex gap-1.5 items-center py-1 rounded-lg ${ingDraggingId === ing.internalId ? 'ring-2 ring-orange-400 bg-orange-50 shadow-md px-1' : ''}`}
            >
              <div
                className={gripClass}
                aria-label="Drag to reorder"
                onPointerDown={(e) => {
                  e.preventDefault();
                  ingDragId.current = ing.internalId;
                  setIngDraggingId(ing.internalId);
                  document.documentElement.classList.add('dragging-step');
                }}
              >
                <GripIcon />
              </div>

              <NumberField
                mode="fraction"
                ref={(el) => { if (el) amountEls.current.set(ing.internalId, el); else amountEls.current.delete(ing.internalId); }}
                value={ing.amountText}
                onChange={(v) => updateIngredient(index, 'amountText', v)}
                placeholder="Amt"
                className={`${base} w-18 shrink-0`}
              />
              <ComboInput
                value={ing.unit ?? ''}
                onChange={(v) => updateIngredient(index, 'unit', v || undefined)}
                suggestions={UNIT_SUGGESTIONS}
                placeholder="Unit"
                wrapperClassName="w-20 shrink-0"
                className={base}
              />
              <ComboInput
                value={ing.name}
                onChange={(v) => updateIngredient(index, 'name', v)}
                suggestions={ingredientNames}
                placeholder="Ingredient name"
                wrapperClassName="flex-1 min-w-0"
                className={base}
                required
              />
              {ing.name.trim() && !catalogNameSet.has(ing.name.toLowerCase().trim()) && (
                <button
                  type="button"
                  title="Not in ingredient catalog — click to classify"
                  onClick={() => setClassifyingIngredientId(
                    classifyingIngredientId === ing.internalId ? null : ing.internalId
                  )}
                  className="text-amber-400 hover:text-amber-600 shrink-0"
                >
                  <UnclassifiedIcon />
                </button>
              )}
              <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap shrink-0">
                <input type="checkbox" checked={ing.isOptional} onChange={(e) => updateIngredient(index, 'isOptional', e.target.checked)} />
                Opt.
              </label>
              <button type="button" onClick={() => removeIngredient(index)} className="text-red-400 hover:text-red-600 shrink-0" aria-label="Remove ingredient">
                <TrashIcon />
              </button>
            </div>
            <div className="flex items-center gap-1.5 pl-6 pb-1">
              <input
                type="text"
                value={ing.note ?? ''}
                onChange={(e) => updateIngredient(index, 'note', e.target.value || undefined)}
                maxLength={200}
                placeholder="note — brand, prep, etc."
                aria-label={`Note for ${ing.name.trim() || 'ingredient'}`}
                className={`${base} flex-1 min-w-0 text-gray-500`}
              />
            </div>
            {classifyingIngredientId === ing.internalId && (
              <InlineClassifyPanel
                ingredientName={ing.name}
                recipeId={recipeId}
                onSaved={() => setClassifyingIngredientId(null)}
                onClose={() => setClassifyingIngredientId(null)}
              />
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={handleAddIngredient} className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-medium">
        + Add Ingredient
      </button>
    </div>
  );
}
