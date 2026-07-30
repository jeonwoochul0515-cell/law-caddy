// 인증된 사용자용 메인 레이아웃
// Sidebar (좌측) + Header (상단) + 콘텐츠 영역

import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import PlanExpiryBanner from "./PlanExpiryBanner";
import BugReportButton from "../ui/BugReportButton";
import ApiStatusMonitor from "../ui/ApiStatusMonitor";
import useAuth from "../../hooks/useAuth";
import useSidebarCollapse from "../../hooks/useSidebarCollapse";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const { isCollapsed } = useSidebarCollapse();

  // Sidebar에 전달할 사용자 정보
  const sidebarUser = user
    ? { name: user.name, role: user.role }
    : null;

  // 사이드바 너비에 맞춘 좌측 여백
  const marginClass = isCollapsed ? "ml-16" : "ml-16 lg:ml-60";

  return (
    <div className="flex min-h-screen bg-[#f7f5ec]">
      {/* 사이드바 */}
      <Sidebar user={sidebarUser} onLogout={logout} />

      {/* 메인 콘텐츠 영역: 사이드바 너비만큼 좌측 여백 */}
      <div className={`${marginClass} flex flex-1 flex-col transition-all duration-300`}>
        {/* 헤더 */}
        <Header title={title} subtitle={subtitle} />

        {/* 플랜 만료 임박/만료 안내 */}
        <PlanExpiryBanner />

        {/* 콘텐츠 */}
        <main role="main" aria-label={title} className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* API 상태 모니터링 */}
      <ApiStatusMonitor />

      {/* 베타 버그 리포트 버튼 */}
      <BugReportButton />
    </div>
  );
}
