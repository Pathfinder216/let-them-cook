import { screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { ExportActions } from './RecipeActionsBar';
import type { Recipe, Ingredient } from '../../types/recipe';

// Share-link buttons hit the shares API — keep them off the network. Default: no active share.
vi.mock('../../api/shares', () => ({
  fetchShare: vi.fn().mockResolvedValue(null),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
}));

const ingredients: Ingredient[] = [
  { id: 'i1', recipeId: 'r1', name: 'flour', originalName: null, amount: 2, unit: 'cups', isOptional: false, note: null, orderIndex: 0 },
];

const recipe: Recipe = {
  id: 'r1',
  title: 'Pancakes',
  servings: 4,
  totalTime: 30,
  activeTime: 15,
  source: null,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  parentId: null,
  isLatest: true,
  authorNotes: null,
  personalNotes: null,
  ingredients,
  steps: [],
  courses: [],
  labels: [],
};

function renderBar() {
  return renderWithProviders(
    <ExportActions
      recipe={recipe}
      finalIngredients={ingredients}
      swapDisplayNames={new Map()}
      targetServings={4}
    />,
  );
}

afterEach(() => {
  // Remove any share stub we installed.
  delete (navigator as unknown as { share?: unknown }).share;
  vi.restoreAllMocks();
});

describe('ExportActions share wiring', () => {
  it('hides the Share button when the Web Share API is unavailable', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
    // Email + Save as PDF are always available.
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as PDF' })).toBeInTheDocument();
  });

  it('opens the mailto link in a new tab so webmail handlers keep the recipe page', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));

    expect(open).toHaveBeenCalledTimes(1);
    const [href, target] = open.mock.calls[0];
    expect(String(href).startsWith('mailto:?subject=')).toBe(true);
    expect(target).toBe('_blank');
  });

  it('shows Share and calls navigator.share with the recipe title + text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });

    renderBar();
    const btn = screen.getByRole('button', { name: 'Share…' });
    fireEvent.click(btn);

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0];
    expect(payload.title).toBe('Pancakes');
    expect(payload.text).toContain('Pancakes');
    expect(payload.text).toContain('- 2 cups flour');
  });

  it('swallows an AbortError when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abort);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);

    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    // Give the rejected promise a tick to (not) surface.
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('creates a share on demand and copies the public URL to the clipboard', async () => {
    const { createShare } = await import('../../api/shares');
    (createShare as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tok-123',
      recipeId: 'r1',
      userId: 'u1',
      createdAt: '',
      revokedAt: null,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(createShare).toHaveBeenCalledWith('r1'));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/tok-123`),
    );
    expect(await screen.findByRole('button', { name: 'Link copied!' })).toBeInTheDocument();
  });

  it('shows a Revoke link button and calls revokeShare when a share is already active', async () => {
    const { fetchShare, revokeShare } = await import('../../api/shares');
    (fetchShare as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tok-abc',
      recipeId: 'r1',
      userId: 'u1',
      createdAt: '',
      revokedAt: null,
    });
    (revokeShare as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderBar();
    const revokeBtn = await screen.findByRole('button', { name: 'Revoke link' });
    fireEvent.click(revokeBtn);
    await waitFor(() => expect(revokeShare).toHaveBeenCalledWith('r1'));
  });

  it('logs instead of rejecting when the share itself fails', async () => {
    const failure = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const share = vi.fn().mockRejectedValue(failure);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);

    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));

    await waitFor(() => expect(warn).toHaveBeenCalledWith('Sharing failed', failure));
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
