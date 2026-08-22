import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeFormPage } from './RecipeFormPage';

const createdRecipe = {
  id: 'r1',
  title: 'Test Recipe',
  servings: 1,
  archived: false,
  version: 1,
  isLatest: true,
  ingredients: [],
  steps: [{ id: 's1', orderIndex: 0, instruction: 'Do the thing', timeMinutes: 0, isActiveTime: true }],
  courses: [],
  labels: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes>
          <Route path="/recipes/new" element={<RecipeFormPage />} />
          <Route path="/recipes/:id" element={<p>Recipe detail</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RecipeFormPage create flow', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    document.cookie = 'kc_csrf=tok123';
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    }));
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === 'POST' && href.endsWith('/api/recipes')) return json(createdRecipe, 201);
      if (href.includes('/media')) return json({ id: 'm1', type: 'image', path: '/media/x.jpg' }, 201);
      if (init?.method === 'POST') return json({});
      return json([]);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function attach(input: HTMLElement, name: string) {
    const file = new File(['x'], name, { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    return file;
  }

  it('uploads the pending cover photo and step media after creating the recipe', async () => {
    const { container } = renderPage();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Recipe' } });

    // Cover photo (create mode keeps the file pending until the recipe exists)
    attach(container.querySelector('input[accept="image/*"]')!, 'cover.jpg');

    // One step, with a photo of its own
    fireEvent.click(screen.getByRole('button', { name: /add step/i }));
    fireEvent.change(screen.getByPlaceholderText(/step instruction/i), {
      target: { value: 'Do the thing' },
    });
    attach(container.querySelector('input[accept="image/*,video/*"]')!, 'step.jpg');

    fireEvent.click(screen.getByRole('button', { name: /save|create/i }));

    // Regression: these uploads used to be rejected (no CSRF token) or never fire at all,
    // leaving a saved recipe with no cover photo and no step pictures.
    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts.map(([url]) => String(url))).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/api/recipes/r1/media'),
          expect.stringContaining('/api/steps/s1/media'),
        ]),
      );
    });

    const mediaPosts = fetchMock.mock.calls.filter(([url]) => String(url).includes('/media'));
    for (const [, init] of mediaPosts) {
      expect((init as RequestInit & { headers: Record<string, string> }).headers['x-csrf-token']).toBe('tok123');
    }

    await screen.findByText('Recipe detail');
  });

  it('shows an error banner and stays on the form when an upload fails', async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === 'POST' && href.endsWith('/api/recipes')) return json(createdRecipe, 201);
      if (href.includes('/media')) return json({ error: 'invalid csrf token' }, 403);
      if (init?.method === 'POST') return json({});
      return json([]);
    });

    const { container } = renderPage();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Recipe' } });
    attach(container.querySelector('input[accept="image/*"]')!, 'cover.jpg');
    fireEvent.click(screen.getByRole('button', { name: /save|create/i }));

    expect(await screen.findByText(/something went wrong finishing up/i)).toBeInTheDocument();
    expect(screen.queryByText('Recipe detail')).not.toBeInTheDocument();
  });
});
