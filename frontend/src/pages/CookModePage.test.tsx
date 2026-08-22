import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookModePage } from './CookModePage';

vi.mock('../api/recipes', () => ({
  fetchRecipe: vi.fn(),
}));

import { fetchRecipe } from '../api/recipes';
const mockFetchRecipe = fetchRecipe as ReturnType<typeof vi.fn>;

const mockRecipe = {
  id: 'r1',
  title: 'Test Recipe',
  servings: 4,
  totalTime: 30,
  activeTime: 15,
  archived: false,
  version: 1,
  parentId: null,
  isLatest: true,
  source: null,
  authorNotes: null,
  personalNotes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ingredients: [
    { id: 'i1', recipeId: 'r1', name: 'Flour', amount: 2, unit: 'cups', isOptional: false, orderIndex: 0, originalName: null },
  ],
  steps: [
    { id: 's1', recipeId: 'r1', orderIndex: 0, instruction: 'Mix the flour', timeMinutes: 5, isActiveTime: true },
    { id: 's2', recipeId: 'r1', orderIndex: 1, instruction: 'Let it rest', timeMinutes: 10, isActiveTime: false },
    { id: 's3', recipeId: 'r1', orderIndex: 2, instruction: 'Bake it', timeMinutes: null, isActiveTime: false },
  ],
};

function renderPage(id = 'r1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/recipes/${id}/cook`]}>
        <Routes>
          <Route path="/recipes/:id/cook" element={<CookModePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CookModePage', () => {
  beforeEach(() => {
    mockFetchRecipe.mockResolvedValue(mockRecipe);
  });

  it('shows loading state', () => {
    mockFetchRecipe.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders recipe title and step 1', async () => {
    renderPage();
    expect(await screen.findByText('Test Recipe')).toBeInTheDocument();
    expect(screen.getByText('Mix the flour')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('does not show timer for active time steps', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    // Step 1 is active time — no timer should be shown
    expect(screen.queryByRole('button', { name: /start timer/i })).not.toBeInTheDocument();
  });

  it('shows timer for passive time steps', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    // Navigate to step 2 (passive time with 10 minutes)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Let it rest')).toBeInTheDocument();
    expect(screen.getByText(/10 min \(passive\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start timer/i })).toBeInTheDocument();
  });

  it('navigates to next step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Let it rest')).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('shows Finish link on last step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('link', { name: /finish/i })).toBeInTheDocument();
  });

  it('previous button is disabled on first step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('shows ingredients checklist', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    const summary = screen.getByText(/ingredients \(1\)/i);
    fireEvent.click(summary);
    expect(screen.getByText('Flour')).toBeInTheDocument();
  });

  it('timer persists in panel when navigating away from step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');

    // Navigate to step 2 (passive)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Let it rest')).toBeInTheDocument();

    // Start the timer
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));

    // Navigate away to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Bake it')).toBeInTheDocument();

    // Timer from step 2 should be visible in the running timers panel
    expect(screen.getByText(/Step 2: Let it rest/)).toBeInTheDocument();
  });

  it('can dismiss a timer from the running panel', async () => {
    renderPage();
    await screen.findByText('Mix the flour');

    // Navigate to step 2, start timer, go to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Timer panel visible
    expect(screen.getByText(/Step 2: Let it rest/)).toBeInTheDocument();

    // Dismiss it
    fireEvent.click(screen.getByRole('button', { name: /dismiss timer/i }));
    expect(screen.queryByText(/Step 2: Let it rest/)).not.toBeInTheDocument();
  });

  it('shows the wake lock notice when the API is unavailable', async () => {
    // jsdom has no navigator.wakeLock, so the hook reports unsupported.
    renderPage();
    await screen.findByText('Mix the flour');
    expect(
      screen.getByText(/screen may sleep — wake lock unavailable/i),
    ).toBeInTheDocument();
  });

  it('hides the wake lock notice when the lock is acquired', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }) },
      configurable: true,
    });
    try {
      renderPage();
      await screen.findByText('Mix the flour');
      await waitFor(() =>
        expect(screen.queryByText(/screen may sleep/i)).not.toBeInTheDocument(),
      );
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }
  });

  function swipe(el: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
    fireEvent.touchStart(el, { touches: [{ clientX: from.x, clientY: from.y }] });
    fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: to.x, clientY: to.y }] });
  }

  it('swiping left advances to the next step', async () => {
    renderPage();
    const stepText = await screen.findByText('Mix the flour');
    swipe(stepText, { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText('Let it rest')).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('swiping right goes back to the previous step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const stepText = screen.getByText('Let it rest');
    swipe(stepText, { x: 100, y: 100 }, { x: 300, y: 110 });
    expect(screen.getByText('Mix the flour')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('swiping right on the first step stays on step 1', async () => {
    renderPage();
    const stepText = await screen.findByText('Mix the flour');
    swipe(stepText, { x: 100, y: 100 }, { x: 300, y: 110 });
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('swiping left on the last step stays on the last step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const stepText = screen.getByText('Bake it');
    swipe(stepText, { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
  });

  it('a vertical-dominant gesture does not change the step', async () => {
    renderPage();
    const stepText = await screen.findByText('Mix the flour');
    // Large vertical drift alongside the horizontal movement → treated as scroll.
    swipe(stepText, { x: 300, y: 100 }, { x: 200, y: 250 });
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('a short horizontal movement does not change the step', async () => {
    renderPage();
    const stepText = await screen.findByText('Mix the flour');
    swipe(stepText, { x: 300, y: 100 }, { x: 260, y: 105 });
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('multi-touch gestures are ignored', async () => {
    renderPage();
    const stepText = await screen.findByText('Mix the flour');
    fireEvent.touchStart(stepText, {
      touches: [
        { clientX: 300, clientY: 100 },
        { clientX: 320, clientY: 120 },
      ],
    });
    fireEvent.touchEnd(stepText, { touches: [], changedTouches: [{ clientX: 100, clientY: 110 }] });
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('swiping outside the step card (ingredient checklist) also changes the step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    swipe(screen.getByText(/ingredients \(1\)/i), { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('swiping on empty space outside the page content changes the step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    // The listeners live on document, so the gap between the content and the
    // fixed bottom nav (layout background, outside any page element) works too.
    swipe(document.body, { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('swiping on the bottom navigation bar changes the step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    swipe(screen.getByRole('button', { name: /previous/i }), { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it('swiping on the header does not change the step', async () => {
    renderPage();
    await screen.findByText('Mix the flour');
    swipe(screen.getByText('Test Recipe'), { x: 300, y: 100 }, { x: 100, y: 110 });
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  it('can pause and resume a timer from the running panel', async () => {
    renderPage();
    await screen.findByText('Mix the flour');

    // Navigate to step 2, start timer, go to step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /start timer/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Pause from panel
    fireEvent.click(screen.getByRole('button', { name: /pause timer/i }));
    // Now resume button should appear
    expect(screen.getByRole('button', { name: /resume timer/i })).toBeInTheDocument();

    // Resume it
    fireEvent.click(screen.getByRole('button', { name: /resume timer/i }));
    expect(screen.getByRole('button', { name: /pause timer/i })).toBeInTheDocument();
  });
});

describe('CookModePage media visibility', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    mockFetchRecipe.mockResolvedValue(mockRecipe);
    // StepMedia loads step media via raw fetch — return an image for every step.
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/media')) {
        return new Response(JSON.stringify({ id: 'm1', type: 'image', path: '/media/step.jpg' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('null', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders step media in the step card by default', async () => {
    const { container } = renderPage();
    await screen.findByText('Mix the flour');
    // <img alt=""> is presentational, so query the DOM directly
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  });

  it('with showMedia=false renders no img or video in the step card', async () => {
    localStorage.setItem('ltc:showMedia', 'false');
    const { container } = renderPage();
    await screen.findByText('Mix the flour');

    // Wait until the step-media query has fired so the assertion isn't vacuous
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/steps/s1/media'),
        expect.anything(),
      ),
    );
    expect(container.querySelector('img, video')).toBeNull();
    // Header shows the "show media" affordance while hidden
    expect(screen.getByRole('button', { name: /show media/i })).toBeInTheDocument();
  });

  it('toggling from the header hides step media immediately and persists', async () => {
    const { container } = renderPage();
    await screen.findByText('Mix the flour');
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /hide media/i }));

    expect(container.querySelector('img, video')).toBeNull();
    expect(localStorage.getItem('ltc:showMedia')).toBe('false');
  });
});
