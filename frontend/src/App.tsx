import { Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { RecipeListPage } from './pages/RecipeListPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { RecipeFormPage } from './pages/RecipeFormPage';
import { MealHistoryPage } from './pages/MealHistoryPage';
import { MealPlanDetailPage } from './pages/MealPlanDetailPage';
import { MealPlanFormPage } from './pages/MealPlanFormPage';
import { CookModePage } from './pages/CookModePage';
import { ImportPage } from './pages/ImportPage';
import { RecipeVersionHistoryPage } from './pages/RecipeVersionHistoryPage';
import { SubstitutionsPage } from './pages/SubstitutionsPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { SharedRecipePage } from './pages/SharedRecipePage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Public token-gated shared recipe view (no session required) */}
          <Route path="/shared/:token" element={<SharedRecipePage />} />

          {/* Everything else requires a session */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<RecipeListPage />} />
              <Route path="/recipes/new" element={<RecipeFormPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
              <Route path="/recipes/:id/cook" element={<CookModePage />} />
              <Route path="/recipes/:id/versions" element={<RecipeVersionHistoryPage />} />
              <Route path="/meal-plans" element={<MealHistoryPage />} />
              <Route path="/meal-plans/new" element={<MealPlanFormPage />} />
              <Route path="/meal-plans/:id/edit" element={<MealPlanFormPage />} />
              <Route path="/meal-plans/:id" element={<MealPlanDetailPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/substitutions" element={<SubstitutionsPage />} />
              <Route path="/ingredients" element={<IngredientsPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  );
}
