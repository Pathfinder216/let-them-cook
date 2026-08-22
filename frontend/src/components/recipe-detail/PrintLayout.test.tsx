import { render, screen } from '@testing-library/react';
import { PrintLayout } from './PrintLayout';
import type { Recipe, Ingredient } from '../../types/recipe';

const ingredients: Ingredient[] = [
  {
    id: 'i1',
    recipeId: 'r1',
    name: 'Flour',
    originalName: null,
    amount: 2,
    unit: 'cups',
    isOptional: false,
    note: 'sifted',
    orderIndex: 0,
  },
];

const recipe: Recipe = {
  id: 'r1',
  title: 'Test Recipe',
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
  steps: [
    { id: 's1', recipeId: 'r1', orderIndex: 0, instruction: 'Mix everything', timeMinutes: 5, isActiveTime: true },
  ],
  courses: [],
  labels: [],
};

function renderPrint(overrides: Partial<Recipe> = {}) {
  const r = { ...recipe, ...overrides };
  return render(
    <PrintLayout
      recipe={r}
      finalIngredients={r.ingredients}
      swapDisplayNames={new Map()}
      targetServings={r.servings}
    />,
  );
}

describe('PrintLayout', () => {
  it('renders author and personal notes after the steps', () => {
    renderPrint({ authorNotes: 'Rest the dough overnight.', personalNotes: 'Halve the sugar next time.' });

    expect(screen.getByRole('heading', { name: 'Author Notes' })).toBeInTheDocument();
    expect(screen.getByText('Rest the dough overnight.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personal Notes' })).toBeInTheDocument();
    expect(screen.getByText('Halve the sugar next time.')).toBeInTheDocument();

    // Notes come after the Steps heading in document order.
    const steps = screen.getByRole('heading', { name: 'Steps' });
    const notes = screen.getByRole('heading', { name: 'Author Notes' });
    expect(steps.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits note headings entirely when the recipe has no notes', () => {
    renderPrint();

    expect(screen.queryByRole('heading', { name: 'Author Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Personal Notes' })).not.toBeInTheDocument();
  });

  it('renders one note when only the other is set', () => {
    renderPrint({ personalNotes: 'Freezes well.' });

    expect(screen.queryByRole('heading', { name: 'Author Notes' })).not.toBeInTheDocument();
    expect(screen.getByText('Freezes well.')).toBeInTheDocument();
  });

  it('includes per-ingredient notes', () => {
    renderPrint();

    expect(screen.getByText(/sifted/)).toBeInTheDocument();
  });
});
