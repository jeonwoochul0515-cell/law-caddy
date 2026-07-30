import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import * as Sentry from "@sentry/react";
import useAuth from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import ErrorFallback from "./components/ui/ErrorFallback";
import seoRoutes from "./data/seoRoutes.json";

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
const ProfileSetupPage = lazyWithRetry(() => import("./pages/ProfileSetupPage"));
const PendingPage = lazyWithRetry(() => import("./pages/PendingPage"));
const DashboardPage = lazyWithRetry(() => import("./pages/DashboardPage"));
const RecordPage = lazyWithRetry(() => import("./pages/RecordPage"));
const FreeformPage = lazyWithRetry(() => import("./pages/FreeformPage"));
const AgentsPage = lazyWithRetry(() => import("./pages/AgentsPage"));
const CheckpointPage = lazyWithRetry(() => import("./pages/CheckpointPage"));
const DocumentPage = lazyWithRetry(() => import("./pages/DocumentPage"));
const CasesPage = lazyWithRetry(() => import("./pages/CasesPage"));
const CaseDetailPage = lazyWithRetry(() => import("./pages/CaseDetailPage"));
const CalendarPage = lazyWithRetry(() => import("./pages/CalendarPage"));
const DocumentsPage = lazyWithRetry(() => import("./pages/DocumentsPage"));
const ClientsPage = lazyWithRetry(() => import("./pages/ClientsPage"));
const SettingsPage = lazyWithRetry(() => import("./pages/SettingsPage"));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage"));
const PaymentSuccessPage = lazyWithRetry(() => import("./pages/PaymentSuccessPage"));
const PaymentFailPage = lazyWithRetry(() => import("./pages/PaymentFailPage"));
const FinancePage = lazyWithRetry(() => import("./pages/FinancePage"));
const SigningPage = lazyWithRetry(() => import("./pages/SigningPage"));

// 검색 유입용 SEO 서브페이지
const WorkflowPage = lazyWithRetry(() => import("./pages/seo/WorkflowPage"));
const AiAgentsPage = lazyWithRetry(() => import("./pages/seo/AiAgentsPage"));
const AutomationPage = lazyWithRetry(() => import("./pages/seo/AutomationPage"));
const PricingPage = lazyWithRetry(() => import("./pages/seo/PricingPage"));
const FaqPage = lazyWithRetry(() => import("./pages/seo/FaqPage"));

function LazyFallback() {
  return (
    <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin mx-auto mb-4" />
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
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-dim text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // 프로필 미완성 → 프로필 설정으로
  if (!user.profileCompleted) return <Navigate to="/profile-setup" replace />;
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
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin" />
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
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // 프로필 미완성 → 프로필 설정으로
  if (!user.profileCompleted) return <Navigate to="/profile-setup" replace />;
  if (user.status === "approved") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

// 프로필 설정 필요 라우트 가드 (구글 로그인 후 프로필 미완성)
function RequireProfileSetup({ children }: { children: React.ReactNode }) {
  const newGoogleUser = useAuth((s) => s.newGoogleUser);
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const loading = useAuth((s) => s.loading);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin" />
      </div>
    );
  }

  // 이미 프로필 완성된 유저는 대시보드로
  if (user?.profileCompleted && user?.status === "approved") return <Navigate to="/dashboard" replace />;

  // 신규 구글 유저 또는 프로필 미완성 유저
  if (!newGoogleUser && !user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

// 공개 검색 유입 페이지(seoRoutes.json에 등록된 라우트)만 색인 허용, 나머지는 로그인 게이트 뒤라 색인 제외
function SeoDefaults() {
  const { pathname } = useLocation();
  // Cloudflare Pages는 /pricing → /pricing/ 로 308 리다이렉트하므로 끝 슬래시를 정규화해서 조회한다
  const normalizedPath = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const meta = (seoRoutes as Record<string, { title: string; description: string }>)[normalizedPath];

  return (
    <Helmet>
      <title>{meta ? meta.title : "Law-Caddy"}</title>
      {meta && <meta name="description" content={meta.description} />}
      <meta name="robots" content={meta ? "index, follow" : "noindex, follow"} />
      {/* Cloudflare Pages가 서브페이지는 끝 슬래시 URL로 리다이렉트하므로, canonical도 그 최종 URL과 맞춘다 */}
      {meta && (
        <link
          rel="canonical"
          href={`https://law-caddy.com${normalizedPath === "/" ? "/" : `${normalizedPath}/`}`}
        />
      )}
    </Helmet>
  );
}

// 미인증 전용 라우트 (이미 로그인된 경우 대시보드로)
function PublicOnly({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const newGoogleUser = useAuth((s) => s.newGoogleUser);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#01261f]/20 border-t-[#01261f] rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.profileCompleted && user?.status === "approved") return <Navigate to="/dashboard" replace />;
  // 구글 로그인했지만 프로필 미완성 → 프로필 설정으로
  if (newGoogleUser || (user && !user.profileCompleted)) return <Navigate to="/profile-setup" replace />;

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
      <SeoDefaults />
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          {/* 완전 공개 라우트 (인증 불요) */}
          <Route path="/sign/:token" element={<SigningPage />} />

          {/* 공개 라우트 */}
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/profile-setup" element={<RequireProfileSetup><ProfileSetupPage /></RequireProfileSetup>} />
          <Route path="/pending" element={<RequirePending><PendingPage /></RequirePending>} />

          {/* 검색 유입용 SEO 서브페이지 (인증 불요) */}
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/ai-agents" element={<AiAgentsPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/faq" element={<FaqPage />} />

          {/* 인증 필요 라우트 */}
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/record" element={<RequireAuth><RecordPage /></RequireAuth>} />
          <Route path="/freeform" element={<RequireAuth><FreeformPage /></RequireAuth>} />
          <Route path="/record/agents" element={<RequireAuth><AgentsPage /></RequireAuth>} />
          <Route path="/record/checkpoint" element={<RequireAuth><CheckpointPage /></RequireAuth>} />
          <Route path="/record/document" element={<RequireAuth><DocumentPage /></RequireAuth>} />
          <Route path="/cases" element={<RequireAuth><CasesPage /></RequireAuth>} />
          <Route path="/cases/:id" element={<RequireAuth><CaseDetailPage /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
          <Route path="/documents" element={<RequireAuth><DocumentsPage /></RequireAuth>} />
          <Route path="/clients" element={<RequireAuth><ClientsPage /></RequireAuth>} />
          <Route path="/finance" element={<RequireAuth><FinancePage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/payment/success" element={<RequireAuth><PaymentSuccessPage /></RequireAuth>} />
          <Route path="/payment/fail" element={<RequireAuth><PaymentFailPage /></RequireAuth>} />

          {/* 랜딩 + 기본 라우트 */}
          <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
