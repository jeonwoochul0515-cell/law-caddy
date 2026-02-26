import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import useAuth from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PendingPage from "./pages/PendingPage";
import DashboardPage from "./pages/DashboardPage";
import RecordPage from "./pages/RecordPage";
import AgentsPage from "./pages/AgentsPage";
import CheckpointPage from "./pages/CheckpointPage";
import DocumentPage from "./pages/DocumentPage";
import CasesPage from "./pages/CasesPage";
import CaseDetailPage from "./pages/CaseDetailPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import LandingPage from "./pages/LandingPage";

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
  if (user.status === "pending") return <Navigate to="/pending" replace />;
  if (user.status === "rejected") return <Navigate to="/pending" replace />;

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
  if (user?.status === "pending") return <Navigate to="/pending" replace />;

  return <>{children}</>;
}

export default function App() {
  const initialize = useAuth((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
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
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />

        {/* 랜딩 + 기본 라우트 */}
        <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
