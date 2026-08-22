import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { SharedRecipePage } from './SharedRecipePage';
import type { SharedRecipe } from '../api/shares';

vi.mock('../api/shares', async () => {
  const actual = await vi.importActual<typeof import('../api/shares')>('../api/shares');
  return { ...actual, fetchSharedRecipe: vi.fn() };
});

import { fetchSharedRecipe } from '../api/shares';
const mockFetch = fetchSharedRecipe as ReturnType<typeof vi.fn>;

const shared: SharedRecipe = {
  id: 'r-latest',
  title: 'Shared Pancakes',
  servings: 4,
  source: null,
  authorNotes: 'Rest the batter',
  totalTime: 30,
  activeTime: 15,
  updatedAt: '2026-01-01T00:00:00.000Z',
  courses: [{ courseType: 'BREAKFAST' }],
  labels: [],
  ingredients: [
    { id: 'i1', name: 'flour', amount: 2, unit: 'cups', isOptional: false, note: 'sifted', orderIndex: 0 },
  ],
  steps: [
    { id: 's1', orderIndex: 0, instruction: 'Mix {flour:100%} and whisk.', timeMinutes: 5, isActiveTime: true, media: null },
  ],
  media: [{ id: 'm1', type: 'image', orderIndex: 0 }],
};

function renderPage(token = 'tok') {
  return renderWithProviders(
    <Routes>
      <Route path="/shared/:token" element={<SharedRecipePage />} />
    </Routes>,
    { route: `/shared/${token}` },
  );
}

describe('SharedRecipePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the shared recipe read-only with ingredients, steps, notes, and cover image', async () => {
    mockFetch.mockResolvedValue(shared);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Shared Pancakes', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('flour')).toBeInTheDocument();
    expect(screen.getByText(/sifted/)).toBeInTheDocument();
    expect(screen.getByText(/whisk/)).toBeInTheDocument();
    expect(screen.getByText('Rest the batter')).toBeInTheDocument();

    // Cover image points at the token-scoped media endpoint.
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/shared/tok/media/m1');
  });

  it('shows an unavailable message when the token resolves to an error (revoked/unknown)', async () => {
    mockFetch.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByText('This link is no longer available.')).toBeInTheDocument();
  });
});
