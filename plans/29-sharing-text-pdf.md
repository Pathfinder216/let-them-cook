# 29 — Share recipes: native share, email, PDF

**Size:** S-M | **Depends on:** nothing (30 covers shareable links)

## Goal
Spec §6: share a recipe as raw text via email and as PDF. Today there's `.txt`/`.json` download
(`frontend/src/utils/exportRecipe.ts`) and a print stylesheet (`RecipeDetailPage.tsx:517`).

## Design decisions (made)
- **PDF = the browser's print-to-PDF** via a polished print stylesheet — no jsPDF/server
  rendering. Self-hosted Pi + modern mobile/desktop browsers all offer "Save as PDF" in the
  print dialog; a dedicated PDF pipeline is maintenance for no gain.
- **Email = `mailto:`** with subject + plain-text body (the existing text-export content),
  plus **Web Share API** where available (mobile) sharing the same text.

## Implementation

1. Refactor `exportRecipe.ts`: extract `recipeToText(recipe, …)` (it exists inside the .txt
   path at :19-74) so share and download use one formatter. Include title, servings, times,
   ingredients (amount + unit + name + note), steps (with `resolveIngredientRefsText` so
   `{ref}` tokens read naturally), author notes, source attribution.
2. Share menu on RecipeDetailPage's action bar (use plan 05 `Menu` if landed; plain buttons
   otherwise):
   - **Share…** — `navigator.share({ title, text })` when `'share' in navigator`; hide
     otherwise. Wrap in try/catch (user-cancel rejects — swallow `AbortError`).
   - **Email** — `mailto:?subject=Recipe: <title>&body=<encodeURIComponent(text)>`. ⚠️ mailto
     bodies have practical length limits (~2000 chars in some clients); if the text exceeds
     that, truncate the body with "… full recipe attached below was truncated — use Share or
     Download instead" and keep the action available anyway.
   - **Save as PDF** — `window.print()` plus a short tooltip "choose 'Save as PDF'".
   - Keep existing **Download .txt / .json** entries.
3. Print stylesheet polish: verify `@media print` / `print:hidden` classes produce a clean
   single-recipe page (hide nav/actions/substitution UI; show full ingredient + step list;
   black-on-white). Fix as needed — this IS the PDF output.
4. Tests: `recipeToText` unit tests (full recipe, notes, refs resolved, optional markers).
   Share/mailto wiring: RTL with `navigator.share` mocked (called with expected payload;
   absent → button hidden).

## Acceptance
From a recipe: native share sheet on mobile, prefilled email on desktop, print dialog produces
a clean PDF; spec §8 sharing row updated (links remain plan 30).

## Follow-up — issue #34 (recipe notes missing from print / Save as PDF)
`PrintLayout` always emitted the Author/Personal Notes blocks, but `html, body { overflow-x:
hidden; max-width: 100vw }` (added for the mobile screen layout) carries into paged media and
makes browsers clip everything past the first printed page — the notes sit last, so they were
the first thing to vanish. Fixed in `frontend/src/index.css` by resetting `overflow`,
`max-width` and `height` on `html, body` inside `@media print`, and notes blocks now carry
`break-inside-avoid` so a note is not split across pages. The same pass picked up the
per-ingredient `note` (plan 23's deferred "export/print pickup") in the printed ingredient
list. Headings still render only when the note exists — no empty sections.
Covered by `frontend/src/components/recipe-detail/PrintLayout.test.tsx`.
