import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// Eagerly loaded pages (always needed)
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import EmailVerification from '@/pages/EmailVerification';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import BuildingDetail from '@/pages/BuildingDetail';
import Results from '@/pages/Results';
import AdminPanel from '@/pages/AdminPanel';
import NotFound from '@/pages/NotFound';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { UserRole } from '@shared/types/user.types';

// Lazy-loaded — campus pages (new structure)
const CampusList = lazy(() => import('@/pages/CampusList'));
const CampusHub = lazy(() => import('@/pages/CampusHub'));
const CampusOverviewEntry = lazy(() => import('@/pages/CampusOverviewEntry'));
const CampusInfrastructureEntry = lazy(() => import('@/pages/CampusEntry'));
const CampusBuildings = lazy(() => import('@/pages/CampusBuildings'));

// Lazy-loaded — building entry pages
const CivilEntry = lazy(() => import('@/pages/CivilEntry'));
const ElectricalEntry = lazy(() => import('@/pages/ElectricalEntry'));
const WasteEntry = lazy(() => import('@/pages/WasteEntry'));
const OverviewEntry = lazy(() => import('@/pages/OverviewEntry'));

// Backward-compat buildings list (old /buildings route)
const Buildings = lazy(() => import('@/pages/Buildings'));

// Building carbon summary page
const BuildingCarbonPage = lazy(() => import('@/pages/BuildingCarbonPage'));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-8 h-8 border-4 border-iitbhu border-t-transparent rounded-full animate-spin" />
  </div>
);

const SW = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
);

export const router = createBrowserRouter([
  // ── Public routes ────────────────────────────────────────────────────────
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/verify-email/:token', element: <EmailVerification /> },
  { path: '/reset-password/:token', element: <ResetPassword /> },
  { path: '/dashboard', element: <Dashboard /> },

  // ── CAMPUS ROUTES (new multi-campus structure) ───────────────────────────

  // Campus list — public
  {
    path: '/campus',
    element: (
      <SW>
        <CampusList />
      </SW>
    ),
  },

  // Campus hub — public (overview + infrastructure + buildings)
  {
    path: '/campus/:campusSlug',
    element: (
      <SW>
        <CampusHub />
      </SW>
    ),
  },

  // Campus overview entry — admin/reviewer only
  {
    path: '/campus/:campusSlug/overview/entry',
    element: (
      <ProtectedRoute requireRoles={[UserRole.ADMIN, UserRole.REVIEWER]}>
        <SW>
          <CampusOverviewEntry />
        </SW>
      </ProtectedRoute>
    ),
  },

  // Campus infrastructure entry — admin/reviewer/assigned-member
  {
    path: '/campus/:campusSlug/infrastructure/entry',
    element: (
      <ProtectedRoute>
        <SW>
          <CampusInfrastructureEntry />
        </SW>
      </ProtectedRoute>
    ),
  },

  // Buildings list scoped to campus — public
  {
    path: '/campus/:campusSlug/buildings',
    element: (
      <SW>
        <CampusBuildings />
      </SW>
    ),
  },

  // ── BUILDING ROUTES ──────────────────────────────────────────────────────

  // Old /buildings list (backward compat)
  {
    path: '/buildings',
    element: (
      <ProtectedRoute>
        <SW>
          <Buildings />
        </SW>
      </ProtectedRoute>
    ),
  },

  // Building detail
  {
    path: '/buildings/:id',
    element: (
      <ProtectedRoute>
        <BuildingDetail />
      </ProtectedRoute>
    ),
  },

  // Building entry pages
  {
    path: '/buildings/:id/entry/overview',
    element: (
      <ProtectedRoute>
        <SW>
          <OverviewEntry />
        </SW>
      </ProtectedRoute>
    ),
  },
  {
    path: '/buildings/:id/entry/civil',
    element: (
      <ProtectedRoute>
        <SW>
          <CivilEntry />
        </SW>
      </ProtectedRoute>
    ),
  },
  {
    path: '/buildings/:id/entry/electrical',
    element: (
      <ProtectedRoute>
        <SW>
          <ElectricalEntry />
        </SW>
      </ProtectedRoute>
    ),
  },
  {
    path: '/buildings/:id/entry/waste',
    element: (
      <ProtectedRoute>
        <SW>
          <WasteEntry />
        </SW>
      </ProtectedRoute>
    ),
  },
  {
    path: '/buildings/:id/results',
    element: (
      <ProtectedRoute>
        <Results />
      </ProtectedRoute>
    ),
  },
  {
    path: '/buildings/:id/carbon',
    element: (
      <ProtectedRoute>
        <SW>
          <BuildingCarbonPage />
        </SW>
      </ProtectedRoute>
    ),
  },

  // ── ADMIN ────────────────────────────────────────────────────────────────
  {
    path: '/admin',
    element: (
      <ProtectedRoute requireAdmin>
        <AdminPanel />
      </ProtectedRoute>
    ),
  },

  { path: '*', element: <NotFound /> },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
