import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import useAuth from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import ErrorFallback from "./components/ui/ErrorFallback";

/**
 * 배포 후 캐시된 이전 청크 파일을 요청할 때 발생하는 로드 에러를 처리합니다.
 * 청크 로드 실패 시 한 번만 페이지를 새로고침합니다.
 */
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    importFn().catch((error: unknown) => {
      const isChunkError =
        error instanceof Error &&
        (error.message.includes("Failed to fetch dynamically imported module") ||
         error.message.includes("Loading chunk") ||
         error.message.includes("Loading CSS chunk"));

      // 무한 새로고침 방지: sessionStorage로 1회만 시도
      const reloadKey = "chunk-reload";
      if (isChunkError && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        // reload 중에는 빈 컴포넌트 반환
        return { default: () => null } as { default: React.ComponentType };
      }

      // 이미 새로고침 했거나 다른 에러면 throw
      sessionStorage.removeItem(reloadKey);
      throw error;
    }),
  );
}

// 페이지 로드 성공 시 reload 플래그 제거
if (sessionStorage.getItem("chunk-reload")) {
  sessionStorage.removeItem("chunk-reload");
}

// Lazy-loaded pages (코드 스플리팅 + 청크 에러 자동 복구)
const RegisterPage = lazyWithRetry(() => import("./pages/RegisterPage"));
const PendingPage = lazyWithRetry(() => import("./pages/PendingPage"));
const DashboardPage = lazyWithRetry(() => import("./pages/DashboardPage"));
const RecordPage = lazyWithRetry(() => import("./pages/RecordPage"));
const AgentsPage = lazyWithRetry(() => import("./pages/AgentsPage"));
const CheckpointPage = lazyWithRetry(() => import("./pages/CheckpointPage"));
const DocumentPage = lazyWithRetry(() => import("./pages/DocumentPage"));
const CasesPage = lazyWithRetry(() => import("./pages/CasesPage"));
const CaseDetailPage = lazyWithRetry(() => import("./pages/CaseDetailPage"));
const SettingsPage = lazyWithRetry(() => import("./pages/SettingsPage"));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage"));
const FinancePage = lazyWithRetry(() => import("./pages/FinancePage"));

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
  if (user.status === "pending") return <Navigate to="/pending" replace />;

  return <>{children}</>;
}

// 관리자 전용 라우트 가드
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== "approved") return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

// 승인 대기 사용자 전용 라우트 가드
function RequirePending({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const loading = useAuth((s) => s.loading);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "approved") return <Navigate to="/dashboard" replace />;

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
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, [initialize]);

  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error} resetError={resetError} />}>
    <BrowserRouter>
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          {/* 공개 라우트 */}
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/pending" element={<RequirePending><PendingPage /></RequirePending>} />

          {/* 인증 필요 라우트 */}
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/record" element={<RequireAuth><RecordPage /></RequireAuth>} />
          <Route path="/record/agents" element={<RequireAuth><AgentsPage /></RequireAuth>} />
          <Route path="/record/checkpoint" element={<RequireAuth><CheckpointPage /></RequireAuth>} />
          <Route path="/record/document" element={<RequireAuth><DocumentPage /></RequireAuth>} />
          <Route path="/cases" element={<RequireAuth><CasesPage /></RequireAuth>} />
          <Route path="/cases/:id" element={<RequireAuth><CaseDetailPage /></RequireAuth>} />
          <Route path="/finance" element={<RequireAuth><FinancePage /></RequireAuth>} />
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
