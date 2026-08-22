/** Filename Content-Disposition would suggest, parsed out of the header if present. */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/);
  return match ? match[1] : fallback;
}

/**
 * Downloads a bulk export from the backend as a file. Uses fetch + blob (not a plain
 * `<a href download>`) so the request reliably carries the session cookie through any
 * service-worker edge cases — same pattern as exportRecipe.ts's per-recipe downloads.
 */
export async function downloadExport(format: 'schema-org' | 'full'): Promise<void> {
  const response = await fetch(`/api/export?format=${format}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Export failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get('content-disposition'),
    `kitchen-canon-export-${format}.json`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
