// 인증된 사용자용 메인 레이아웃
// Sidebar (좌측) + Header (상단) + 콘텐츠 영역

import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import useAuth from "../../hooks/useAuth";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const user = useAuth((state) => state.user);

  // Sidebar에 전달할 사용자 정보
  const sidebarUser = user
    ? { name: user.name, role: user.role }
    : null;

  return (
    <div className="flex min-h-screen bg-navy">
      {/* 사이드바 */}
      <Sidebar user={sidebarUser} />

      {/* 메인 콘텐츠 영역: 사이드바 너비만큼 좌측 여백 */}
      <div className="ml-16 flex flex-1 flex-col lg:ml-60">
        {/* 헤더 */}
        <Header title={title} subtitle={subtitle} />

        {/* 콘텐츠 */}
        <main role="main" aria-label={title} className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
