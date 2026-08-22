import { useMediaVisibility } from '../hooks/useMediaVisibility';

/**
 * Button toggling the device-local media visibility preference.
 *
 * While media is visible it is a quiet grey icon button (click to hide). While
 * media is hidden it turns into an amber "Photos hidden" chip: the preference is
 * sticky per device and only affects the recipe page and cook mode, so an
 * unlabelled slashed icon read as "the recipe has no photos" rather than "you
 * turned photos off" — the state has to announce itself.
 */
export function MediaVisibilityToggle() {
  const { showMedia, toggle } = useMediaVisibility();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={showMedia}
      aria-label={showMedia ? 'Hide media' : 'Show media'}
      title={showMedia ? 'Hide photos & videos' : 'Photos & videos are hidden — click to show them'}
      className={
        showMedia
          ? 'border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2 rounded-md transition-colors shrink-0'
          : 'flex items-center gap-1.5 border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 p-2 rounded-md transition-colors shrink-0'
      }
    >
      {showMedia ? (
        // Image icon (media currently visible)
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      ) : (
        <>
          {/* Slashed image icon (media currently hidden) */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
            <line x1="13.5" y1="13.5" x2="6" y2="21" />
            <line x1="18" y1="12" x2="21" y2="15" />
            <path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
            <path d="M21 15V5a2 2 0 0 0-2-2H9" />
          </svg>
          <span className="text-xs font-medium whitespace-nowrap" aria-hidden="true">
            Photos hidden
          </span>
        </>
      )}
    </button>
  );
}
