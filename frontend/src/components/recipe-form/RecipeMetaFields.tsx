import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCourses } from '../../api/courses';
import { fetchLabels, createLabel } from '../../api/labels';
import { inputClass, labelClass } from './styles';
import { NumberField } from '../ui/NumberField';
import { formatDuration } from '../../utils/formatDuration';
import type { StepFormItem } from './useRecipeFormState';

interface BasicInfoFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  servings: string;
  setServings: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  steps: StepFormItem[];
}

/** Title, servings (+ time summary), and source — the top "Basic Info" block. */
export function BasicInfoFields({ title, setTitle, servings, setServings, source, setSource, steps }: BasicInfoFieldsProps) {
  return (
    <>
      <div>
        <label htmlFor="recipe-title" className={labelClass}>Title *</label>
        <input id="recipe-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
      </div>

      <div className="flex items-end gap-6 flex-wrap">
        <div className="w-32">
          <label htmlFor="recipe-servings" className={labelClass}>Servings</label>
          <NumberField id="recipe-servings" value={servings} onChange={setServings} min={1} className={inputClass} />
        </div>
        {steps.length > 0 && (() => {
          const total = Math.ceil(steps.reduce((sum, s) => sum + (parseFloat(s.timeMinutesText) || 0), 0));
          const active = Math.ceil(steps.filter(s => s.isActiveTime).reduce((sum, s) => sum + (parseFloat(s.timeMinutesText) || 0), 0));
          return (
            <div className="pb-2 text-sm text-gray-500 space-y-0.5">
              <p>Total time: <span className="font-medium text-gray-700">{formatDuration(total)}</span></p>
              <p>Active time: <span className="font-medium text-gray-700">{formatDuration(active)}</span></p>
            </div>
          );
        })()}
      </div>

      <div>
        <label htmlFor="recipe-source" className={labelClass}>Source</label>
        <input id="recipe-source" type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="URL or description" className={inputClass} />
      </div>
    </>
  );
}

interface NotesAndTaxonomyFieldsProps {
  authorNotes: string;
  setAuthorNotes: (v: string) => void;
  personalNotes: string;
  setPersonalNotes: (v: string) => void;
  selectedCourseTypes: string[];
  setSelectedCourseTypes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedLabelIds: string[];
  setSelectedLabelIds: React.Dispatch<React.SetStateAction<string[]>>;
}

/** Author/personal notes, course picker, and label picker (with inline create). */
export function NotesAndTaxonomyFields({
  authorNotes,
  setAuthorNotes,
  personalNotes,
  setPersonalNotes,
  selectedCourseTypes,
  setSelectedCourseTypes,
  selectedLabelIds,
  setSelectedLabelIds,
}: NotesAndTaxonomyFieldsProps) {
  const queryClient = useQueryClient();
  const [newLabelName, setNewLabelName] = useState('');
  const [isAddingLabel, setIsAddingLabel] = useState(false);

  const { data: allCourses = [] } = useQuery({ queryKey: ['courses'], queryFn: fetchCourses });
  const { data: allLabels = [] } = useQuery({ queryKey: ['labels'], queryFn: () => fetchLabels() });
  // Alphabetize — the standard label set has grown large enough (equipment + make-ahead
  // vocabulary, plan 25) that insertion order no longer reads as manageable.
  const manualLabels = allLabels
    .filter((l) => l.type !== 'dietary' && l.type !== 'allergen')
    .sort((a, b) => a.name.localeCompare(b.name));

  async function handleCreateLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      const created = await createLabel({ type: 'manual', name });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setSelectedLabelIds((prev) => [...prev, created.id]);
      setNewLabelName('');
      setIsAddingLabel(false);
    } catch {
      // duplicate or error — keep input open
    }
  }

  return (
    <>
      {/* Notes */}
      <div>
        <label htmlFor="recipe-author-notes" className={labelClass}>Author Notes</label>
        <textarea id="recipe-author-notes" value={authorNotes} onChange={(e) => setAuthorNotes(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="Notes about the recipe (e.g., pan size when doubling)" />
      </div>

      <div>
        <label htmlFor="recipe-personal-notes" className={labelClass}>Personal Notes</label>
        <textarea id="recipe-personal-notes" value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="Your personal notes and variations to try" />
      </div>

      {/* Course */}
      <div>
        <h3 className={labelClass}>Course</h3>
        <div className="flex flex-wrap gap-1.5">
          {allCourses.map((course) => (
            <button
              key={course.type}
              type="button"
              onClick={() =>
                setSelectedCourseTypes((prev) =>
                  prev.includes(course.type) ? prev.filter((t) => t !== course.type) : [...prev, course.type],
                )
              }
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedCourseTypes.includes(course.type)
                ? 'bg-orange-100 border-orange-300 text-orange-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
            >
              {course.name}
            </button>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div>
        <h3 className={labelClass}>Labels</h3>
        <div className="flex flex-wrap gap-1.5">
          {manualLabels.map((label) => (
            <button
              key={label.id}
              type="button"
              onClick={() =>
                setSelectedLabelIds((prev) =>
                  prev.includes(label.id) ? prev.filter((id) => id !== label.id) : [...prev, label.id],
                )
              }
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedLabelIds.includes(label.id)
                ? 'bg-orange-100 border-orange-300 text-orange-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
            >
              {label.name}
            </button>
          ))}
          {isAddingLabel ? (
            <div className="flex gap-1 items-center flex-wrap">
              <input
                autoFocus
                type="text"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateLabel(); }
                  if (e.key === 'Escape') { setIsAddingLabel(false); setNewLabelName(''); }
                }}
                placeholder="Custom label"
                className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <button type="button" onClick={handleCreateLabel} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Add</button>
              <button type="button" onClick={() => { setIsAddingLabel(false); setNewLabelName(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingLabel(true)}
              className="px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
            >
              + Custom
            </button>
          )}
        </div>
      </div>
    </>
  );
}
