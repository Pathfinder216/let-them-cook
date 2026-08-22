import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import { ImportPage } from './ImportPage';
import { ApiError } from '../api/client';
import * as importApi from '../api/import';
import type { ParsedRecipe } from '../api/import';

vi.mock('../api/import');

const mockedImportFromUrl = vi.mocked(importApi.importFromUrl);

function baseParsedRecipe(overrides: Partial<ParsedRecipe> = {}): ParsedRecipe {
  return {
    title: 'Imported Chili',
    servings: 4,
    totalTime: 45,
    activeTime: null,
    source: 'https://example.com/chili',
    authorNotes: null,
    ingredients: [
      { name: 'beef', originalName: '2 lbs beef', amount: 2, unit: 'lb', isOptional: false, orderIndex: 0 },
    ],
    steps: [
      { orderIndex: 0, instruction: 'Brown the beef.', timeMinutes: null, isActiveTime: true },
    ],
    warnings: [],
    ...overrides,
  };
}

describe('ImportPage', () => {
  beforeEach(() => {
    mockedImportFromUrl.mockReset();
  });

  it('surfaces the backend error message on a failed URL import instead of a generic message', async () => {
    mockedImportFromUrl.mockRejectedValueOnce(
      new ApiError(400, 'The site blocked this request (HTTP 403) — many recipe sites reject automated imports.'),
    );
    renderWithProviders(<ImportPage />);

    await userEvent.type(screen.getByLabelText(/recipe url/i), 'https://example.com/recipe');
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/the site blocked this request \(http 403\)/i)).toBeInTheDocument();
    });
  });

  it('renders the backend-supplied warnings for fields the parser did not find', async () => {
    mockedImportFromUrl.mockResolvedValueOnce(
      baseParsedRecipe({
        totalTime: null,
        steps: [],
        warnings: [
          'No servings detected — defaulting to 4.',
          'No total time detected.',
          'No steps detected.',
        ],
      }),
    );
    renderWithProviders(<ImportPage />);

    await userEvent.type(screen.getByLabelText(/recipe url/i), 'https://example.com/recipe');
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/no servings detected/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/no total time detected/i)).toBeInTheDocument();
    expect(screen.getByText(/no steps detected/i)).toBeInTheDocument();
  });

  it('does not show a servings warning for a genuinely-parsed 4-serving recipe', async () => {
    // Regression guard: 4 is a common real-world yield. The banner must come from the
    // backend's `warnings` field (which knows whether 4 was parsed or defaulted), never from
    // the frontend re-deriving "servings === 4 means fallback".
    mockedImportFromUrl.mockResolvedValueOnce(baseParsedRecipe({ servings: 4, warnings: [] }));
    renderWithProviders(<ImportPage />);

    await userEvent.type(screen.getByLabelText(/recipe url/i), 'https://example.com/recipe');
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText('Imported Chili')).toBeInTheDocument();
    });
    expect(screen.queryByText(/no servings detected/i)).not.toBeInTheDocument();
  });

  it('does not show warnings when the parser found everything', async () => {
    mockedImportFromUrl.mockResolvedValueOnce(baseParsedRecipe({ servings: 6, warnings: [] }));
    renderWithProviders(<ImportPage />);

    await userEvent.type(screen.getByLabelText(/recipe url/i), 'https://example.com/recipe');
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText('Imported Chili')).toBeInTheDocument();
    });
    expect(screen.queryByText(/no servings detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no steps detected/i)).not.toBeInTheDocument();
  });
});
