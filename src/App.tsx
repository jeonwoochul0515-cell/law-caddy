import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import useAuth from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import ErrorFallback from "./components/ui/ErrorFallback";

// Lazy-loaded pages (코드 스플리팅)
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const PendingPage = lazy(() => import("./pages/PendingPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const RecordPage = lazy(() => import("./pages/RecordPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const CheckpointPage = lazy(() => import("./pages/CheckpointPage"));
const DocumentPage = lazy(() => import("./pages/DocumentPage"));
const CasesPage = lazy(() => import("./pages/CasesPage"));
const CaseDetailPage = lazy(() => import("./pages/CaseDetailPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function LazyFallback() {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-dim text-sm">페이지 로딩 중...</p>
      </div>
    </div>
  );
}

// 인증 필요 라우트 가드
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-dim text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "rejected") return <Navigate to="/login" replace />;

  return <>{children}</>;
}

// 관리자 전용 라우트 가드
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

// 미인증 전용 라우트 (이미 로그인된 경우 대시보드로)
function PublicOnly({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.status === "approved") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

export default function App() {
  const initialize = useAuth((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error} resetError={resetError} />}>
    <BrowserRouter>
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          {/* 공개 라우트 */}
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/pending" element={<PendingPage />} />

          {/* 인증 필요 라우트 */}
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/record" element={<RequireAuth><RecordPage /></RequireAuth>} />
          <Route path="/record/agents" element={<RequireAuth><AgentsPage /></RequireAuth>} />
          <Route path="/record/checkpoint" element={<RequireAuth><CheckpointPage /></RequireAuth>} />
          <Route path="/record/document" element={<RequireAuth><DocumentPage /></RequireAuth>} />
          <Route path="/cases" element={<RequireAuth><CasesPage /></RequireAuth>} />
          <Route path="/cases/:id" element={<RequireAuth><CaseDetailPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

          {/* 랜딩 + 기본 라우트 */}
          <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
