import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importFromFile, importFromUrl, type ParsedRecipe } from '../api/import';
import { useCreateRecipe } from '../hooks/useRecipes';
import { formatDuration } from '../utils/formatDuration';

type ImportMode = 'url' | 'file';
type ImportStatus = 'idle' | 'loading' | 'preview' | 'error';

// The parser always fills these fields with a default rather than leaving them empty (servings
// defaults to 4, for instance), so a successful-looking import can still be silently wrong.
// Flag the defaults/gaps the parser is known to fall back on so the user reviews before saving.
function missingFieldWarnings(preview: ParsedRecipe): string[] {
  const warnings: string[] = [];
  if (preview.servings === 4) {
    warnings.push('No servings detected — defaulting to 4. Double-check before saving.');
  }
  if (preview.totalTime === null) {
    warnings.push('No total time detected.');
  }
  if (preview.ingredients.length === 0) {
    warnings.push('No ingredients detected.');
  }
  if (preview.steps.length === 0) {
    warnings.push('No steps detected.');
  }
  return warnings;
}

export function ImportPage() {
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>('url');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<ParsedRecipe | null>(null);

  async function handleImport() {
    setStatus('loading');
    setErrorMsg('');
    try {
      let parsed: ParsedRecipe;
      if (mode === 'url') {
        if (!url.trim()) throw new Error('Please enter a URL');
        parsed = await importFromUrl(url.trim());
        // URL import: show preview so user can review before saving
        setPreview(parsed);
        setStatus('preview');
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error('Please select a file');
        parsed = await importFromFile(file);
        // File import: go straight to the recipe form pre-populated
        navigate('/recipes/new', { state: { importData: parsed } });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStatus('error');
    }
  }

  async function handleSave() {
    if (!preview) return;
    try {
      const recipe = await createRecipe.mutateAsync({
        title: preview.title,
        servings: preview.servings,
        source: preview.source ?? undefined,
        authorNotes: preview.authorNotes ?? undefined,
        ingredients: preview.ingredients.map(({ amount, unit, ...rest }) => ({
          ...rest,
          amount: amount ?? undefined,
          unit: unit ?? undefined,
        })),
        steps: preview.steps.map(({ timeMinutes, ...rest }) => ({
          ...rest,
          timeMinutes: timeMinutes ?? undefined,
        })),
      });
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save recipe');
      setStatus('error');
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Import Recipe</h1>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['url', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setStatus('idle'); setPreview(null); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m === 'url' ? 'From URL' : 'From File'}
          </button>
        ))}
      </div>

      {/* Input */}
      {mode === 'url' ? (
        <div className="mb-4">
          <label htmlFor="import-url" className="block text-sm font-medium text-gray-700 mb-1">
            Recipe URL
          </label>
          <input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com/recipe/pasta"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Works best with sites that use recipe schema markup (AllRecipes, Serious Eats, NYT Cooking, etc.)
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label htmlFor="import-file" className="block text-sm font-medium text-gray-700 mb-1">
            Recipe file
          </label>
          <input
            id="import-file"
            type="file"
            ref={fileRef}
            accept=".pdf,.docx,.txt"
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
          />
          <p className="text-xs text-gray-400 mt-1">Supported: .pdf, .docx, .txt — opens in editor for review</p>
        </div>
      )}

      {status !== 'preview' && (
        <button
          onClick={handleImport}
          disabled={status === 'loading'}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {status === 'loading' ? 'Importing...' : 'Import'}
        </button>
      )}

      {status === 'error' && (
        <div className="mt-3">
          <p className="text-sm text-red-600">{errorMsg}</p>
          {mode === 'url' && (
            <button
              onClick={() => { setMode('file'); setStatus('idle'); setErrorMsg(''); }}
              className="mt-2 text-sm font-medium text-orange-600 hover:text-orange-700 underline"
            >
              Switch to file import
            </button>
          )}
        </div>
      )}

      {/* Preview (URL import only) */}
      {status === 'preview' && preview && (
        <div className="mt-6 border border-gray-200 rounded-xl p-5 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setStatus('idle'); setPreview(null); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Start over
              </button>
              <button
                onClick={() => navigate('/recipes/new', { state: { importData: preview } })}
                className="border border-orange-500 text-orange-600 hover:bg-orange-50 font-medium px-4 py-1.5 rounded-lg text-sm transition-colors"
              >
                Edit before saving
              </button>
              <button
                onClick={handleSave}
                disabled={createRecipe.isPending}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg text-sm transition-colors"
              >
                {createRecipe.isPending ? 'Saving...' : 'Save Recipe'}
              </button>
            </div>
          </div>

          <h3 className="text-xl font-bold text-gray-800 mb-1">{preview.title}</h3>
          <div className="flex gap-3 text-sm text-gray-500 mb-4">
            <span>{preview.servings} servings</span>
            {preview.totalTime && <span>{formatDuration(preview.totalTime)} total</span>}
            {preview.source && <span className="truncate">Source: {preview.source}</span>}
          </div>

          {missingFieldWarnings(preview).length > 0 && (
            <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 space-y-0.5">
              {missingFieldWarnings(preview).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          )}

          {preview.authorNotes && (
            <p className="text-sm text-gray-600 mb-4 italic">{preview.authorNotes.slice(0, 300)}{preview.authorNotes.length > 300 ? '…' : ''}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Ingredients ({preview.ingredients.length})
              </h4>
              <ul className="space-y-0.5 text-sm text-gray-600">
                {preview.ingredients.slice(0, 10).map((ing, i) => (
                  <li key={i} className="truncate">
                    {ing.amount !== null && <span className="font-medium">{ing.amount}{ing.unit ? ` ${ing.unit}` : ''} </span>}
                    {ing.name}
                  </li>
                ))}
                {preview.ingredients.length > 10 && (
                  <li className="text-gray-400">…and {preview.ingredients.length - 10} more</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Steps ({preview.steps.length})
              </h4>
              <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                {preview.steps.slice(0, 5).map((step, i) => (
                  <li key={i} className="line-clamp-2">{step.instruction}</li>
                ))}
                {preview.steps.length > 5 && (
                  <li className="text-gray-400 list-none">…and {preview.steps.length - 5} more</li>
                )}
              </ol>
            </div>
          </div>

          {createRecipe.isError && (
            <p className="mt-3 text-sm text-red-600">Failed to save recipe. Please try again.</p>
          )}
        </div>
      )}
    </div>
  );
}
