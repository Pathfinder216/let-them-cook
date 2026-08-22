import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecipes } from '../hooks/useRecipes';
import { RecipeCard } from '../components/RecipeCard';
import { FilterPanel } from '../components/FilterPanel';
import { Menu, MenuItemButton } from '../components/ui/Menu';
import { downloadExport } from '../api/export';

export function RecipeListPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState<{
    includeIngredients?: string;
    excludeIngredients?: string;
    labels?: string;
    diets?: string;
    freeFrom?: string;
    courses?: string;
  }>({});

  const { data, isLoading, error } = useRecipes({
    page,
    search: search || undefined,
    archived: showArchived || undefined,
    ...filters,
  });

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(format: 'schema-org' | 'full') {
    setExportError(null);
    try {
      await downloadExport(format);
    } catch {
      setExportError('Export failed. Please try again.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold text-gray-900">My Recipes</h1>
        <div className="flex items-center gap-2">
          <Menu
            label="Export"
            buttonAriaLabel="Export all recipes"
            buttonClassName="border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <MenuItemButton onClick={() => handleExport('schema-org')}>
              Export as schema.org (standard)
            </MenuItemButton>
            <MenuItemButton onClick={() => handleExport('full')}>
              Export everything (full backup)
            </MenuItemButton>
          </Menu>
          <Link
            to="/recipes/new"
            className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 transition-colors"
          >
            + New Recipe
          </Link>
        </div>
      </div>

      {exportError && <p className="text-red-600 text-sm mb-2">{exportError}</p>}

      {/* Search */}
      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search recipes..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
      </div>

      {/* Archived toggle */}
      <div className="mb-2">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          Show archived recipes
        </label>
      </div>

      {/* Filters */}
      <FilterPanel
        onFilterChange={(newFilters) => {
          setFilters(newFilters);
          setPage(1);
        }}
      />

      {/* Content */}
      {isLoading && <p className="text-gray-500">Loading recipes...</p>}

      {error && <p className="text-red-600">Failed to load recipes.</p>}

      {data && data.recipes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {search || hasActiveFilters
              ? 'No recipes match your search or filters.'
              : showArchived
                ? 'No archived recipes.'
                : 'No recipes yet. Add your first recipe to get started!'}
          </p>
          {!search && !hasActiveFilters && !showArchived && (
            <Link to="/recipes/new" className="text-orange-600 hover:text-orange-700 font-medium text-sm">
              Create your first recipe
            </Link>
          )}
        </div>
      )}

      {data && data.recipes.length > 0 && (
        <>
          <div className="grid gap-3">
            {data.recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
