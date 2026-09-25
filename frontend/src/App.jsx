/**
 * Route tree.
 *
 * Three role-scoped areas behind a shared login. Screens are lazy-loaded so a
 * collector on a slow connection downloads only the collector bundle.
 */
import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { CollectorLayout, RecyclerLayout, AdminLayout } from './components/Layout';
import { LoadingBlock, EmptyState } from './components/ui';
import Icon from './components/Icon';

// ---------- Public ----------
const Login = lazy(() => import('./pages/Login'));
const VerifyHandover = lazy(() => import('./pages/VerifyHandover'));

// ---------- Collector ----------
const CollectorHome = lazy(() => import('./pages/collector/Home'));
const PriceBoard = lazy(() => import('./pages/collector/PriceBoard'));
const AddLot = lazy(() => import('./pages/collector/AddLot'));
const MyLots = lazy(() => import('./pages/collector/MyLots'));
const LotDetail = lazy(() => import('./pages/collector/LotDetail'));
const Matches = lazy(() => import('./pages/collector/Matches'));
const Earnings = lazy(() => import('./pages/collector/Earnings'));
const Safety = lazy(() => import('./pages/collector/Safety'));
const TransactionDetail = lazy(() => import('./pages/collector/TransactionDetail'));

// ---------- Recycler ----------
const RecyclerHome = lazy(() => import('./pages/recycler/Home'));
const Incoming = lazy(() => import('./pages/recycler/Incoming'));
const RecyclerRates = lazy(() => import('./pages/recycler/Rates'));
const RecyclerProfile = lazy(() => import('./pages/recycler/Profile'));
const RecyclerTransaction = lazy(() => import('./pages/recycler/TransactionDetail'));

// ---------- Admin ----------
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const AdminRecyclers = lazy(() => import('./pages/admin/Recyclers'));
const AdminCollectors = lazy(() => import('./pages/admin/Collectors'));
const AdminLots = lazy(() => import('./pages/admin/Lots'));
const AdminPrices = lazy(() => import('./pages/admin/Prices'));
const AdminDatasets = lazy(() => import('./pages/admin/Datasets'));

/** Landing path per role. */
function homeFor(role) {
  if (role === 'collector') return '/app';
  if (role === 'recycler') return '/recycler';
  if (role === 'admin') return '/admin';
  return '/login';
}

/**
 * Gate a subtree on an authenticated session with one of `allow`ed roles.
 * Signed-in users hitting the wrong area are redirected to their own home
 * rather than shown a dead end.
 */
function Protected({ allow, children }) {
  const { isAuthenticated, role, booting } = useApp();
  const location = useLocation();

  if (booting) return <LoadingBlock label="Loading your account…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (allow && !allow.includes(role)) {
    return <Navigate to={homeFor(role)} replace />;
  }

  return children;
}

function NotFound() {
  const { role, isAuthenticated } = useApp();

  return (
    <div className="page">
      <EmptyState
        icon="search"
        title="Page not found"
        description="That link does not exist or has moved."
        action={
          <a href={isAuthenticated ? homeFor(role) : '/login'} className="btn-primary btn-sm">
            <Icon name="home" size={16} />
            Go home
          </a>
        }
      />
    </div>
  );
}

export default function App() {
  const { isAuthenticated, role, booting } = useApp();

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingBlock label="Loading…" />}>
      <Routes>
        {/* ---------- Public ---------- */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to={homeFor(role)} replace /> : <Login />}
        />
        {/* Anyone holding a paper reference slip can verify it, signed in or not. */}
        <Route path="/verify" element={<VerifyHandover />} />
        <Route path="/verify/:reference" element={<VerifyHandover />} />

        {/* ---------- Collector ---------- */}
        <Route
          path="/app/*"
          element={
            <Protected allow={['collector']}>
              <CollectorLayout>
                <Routes>
                  <Route index element={<CollectorHome />} />
                  <Route path="prices" element={<PriceBoard />} />
                  <Route path="lots" element={<MyLots />} />
                  <Route path="lots/new" element={<AddLot />} />
                  <Route path="lots/:id" element={<LotDetail />} />
                  <Route path="lots/:id/matches" element={<Matches />} />
                  <Route path="transactions/:id" element={<TransactionDetail />} />
                  <Route path="earnings" element={<Earnings />} />
                  <Route path="safety" element={<Safety />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </CollectorLayout>
            </Protected>
          }
        />

        {/* ---------- Recycler ---------- */}
        <Route
          path="/recycler/*"
          element={
            <Protected allow={['recycler']}>
              <RecyclerLayout>
                <Routes>
                  <Route index element={<RecyclerHome />} />
                  <Route path="incoming" element={<Incoming />} />
                  <Route path="transactions/:id" element={<RecyclerTransaction />} />
                  <Route path="rates" element={<RecyclerRates />} />
                  <Route path="profile" element={<RecyclerProfile />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RecyclerLayout>
            </Protected>
          }
        />

        {/* ---------- Admin ---------- */}
        <Route
          path="/admin/*"
          element={
            <Protected allow={['admin']}>
              <AdminLayout>
                <Routes>
                  <Route index element={<AdminOverview />} />
                  <Route path="recyclers" element={<AdminRecyclers />} />
                  <Route path="collectors" element={<AdminCollectors />} />
                  <Route path="lots" element={<AdminLots />} />
                  <Route path="prices" element={<AdminPrices />} />
                  <Route path="datasets" element={<AdminDatasets />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AdminLayout>
            </Protected>
          }
        />

        {/* ---------- Root ---------- */}
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? homeFor(role) : '/login'} replace />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
