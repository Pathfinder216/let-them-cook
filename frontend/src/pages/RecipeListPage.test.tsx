import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import { RecipeListPage } from './RecipeListPage';

vi.mock('../api/recipes', async () => {
  const actual = await vi.importActual<typeof import('../api/recipes')>('../api/recipes');
  return { ...actual, fetchRecipes: vi.fn() };
});

vi.mock('../api/export', () => ({
  downloadExport: vi.fn(),
}));

import { fetchRecipes } from '../api/recipes';
import { downloadExport } from '../api/export';

const mockFetchRecipes = fetchRecipes as ReturnType<typeof vi.fn>;
const mockDownloadExport = downloadExport as ReturnType<typeof vi.fn>;

const emptyList = { recipes: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchRecipes.mockResolvedValue(emptyList);
});

describe('RecipeListPage export menu', () => {
  it('offers schema.org and full export options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeListPage />);

    await user.click(screen.getByRole('button', { name: /export all recipes/i }));

    expect(screen.getByText(/export as schema\.org/i)).toBeInTheDocument();
    expect(screen.getByText(/export everything/i)).toBeInTheDocument();
  });

  it('downloads the schema-org format when chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeListPage />);

    await user.click(screen.getByRole('button', { name: /export all recipes/i }));
    await user.click(screen.getByText(/export as schema\.org/i));

    expect(mockDownloadExport).toHaveBeenCalledWith('schema-org');
  });

  it('downloads the full format when chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeListPage />);

    await user.click(screen.getByRole('button', { name: /export all recipes/i }));
    await user.click(screen.getByText(/export everything/i));

    expect(mockDownloadExport).toHaveBeenCalledWith('full');
  });

  it('shows an error message if the export download fails', async () => {
    mockDownloadExport.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    renderWithProviders(<RecipeListPage />);

    await user.click(screen.getByRole('button', { name: /export all recipes/i }));
    await user.click(screen.getByText(/export as schema\.org/i));

    expect(await screen.findByText(/export failed/i)).toBeInTheDocument();
  });
});
