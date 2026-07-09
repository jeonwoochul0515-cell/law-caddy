// 사이드바 네비게이션 — 프리미엄 라이트 테마
// 접기/펼치기 토글 지원: 접힘 시 w-16 (아이콘 전용), 펼침 시 w-60 (아이콘 + 텍스트)

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  FolderOpen,
  Calculator,
  Settings,
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ReactNode } from "react";
import useSidebarCollapse from "../../hooks/useSidebarCollapse";

interface SidebarUser {
  name: string;
  role: "lawyer" | "admin";
}

interface SidebarProps {
  user: SidebarUser | null;
  onLogout?: () => void;
}

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: <LayoutDashboard size={20} />, label: "대시보드" },
  { to: "/record", icon: <Mic size={20} />, label: "새 상담" },
  { to: "/cases", icon: <FolderOpen size={20} />, label: "사건 관리" },
  { to: "/finance", icon: <Calculator size={20} />, label: "재무 관리" },
  { to: "/settings", icon: <Settings size={20} />, label: "설정" },
  { to: "/admin", icon: <Shield size={20} />, label: "관리자", adminOnly: true },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 1).toUpperCase();
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebarCollapse();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  // 접힘 상태에 따른 너비 클래스
  const widthClass = isCollapsed ? "w-16" : "w-16 lg:w-60";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[#01261f]/8 bg-[#faf9f5] transition-all duration-300 ${widthClass}`}
    >
      {/* 로고 + 토글 버튼 */}
      <div className="relative flex h-16 items-center border-b border-[#01261f]/5">
        <NavLink
          to="/dashboard"
          className={`flex h-full flex-1 items-center hover:bg-[#01261f]/3 transition-colors ${
            isCollapsed
              ? "justify-center"
              : "justify-center lg:justify-start lg:px-6"
          }`}
        >
          <span className="text-2xl font-black italic font-serif text-[#01261f]">LC</span>
          {!isCollapsed && (
            <span className="ml-2 hidden text-base font-bold font-serif italic text-[#01261f] lg:inline">
              Law-Caddy
            </span>
          )}
        </NavLink>

        {/* 토글 버튼 — 데스크톱 전용 */}
        <button
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="absolute -right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center w-6 h-6 rounded-full border border-[#01261f]/10 bg-[#faf9f5] text-[#414846] hover:bg-[#01261f]/5 hover:text-[#01261f] transition-colors shadow-sm"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* 네비게이션 */}
      <nav
        aria-label="메인 네비게이션"
        className={`flex-1 overflow-y-auto py-4 ${
          isCollapsed ? "px-2" : "px-2 lg:px-3"
        }`}
      >
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                aria-label={item.label}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  [
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                    isCollapsed
                      ? "justify-center"
                      : "justify-center lg:justify-start",
                    isActive
                      ? "bg-[#01261f] text-[#faf9f5]"
                      : "text-[#414846] hover:bg-[#01261f]/5 hover:text-[#01261f]",
                  ].join(" ")
                }
              >
                {item.icon}
                {!isCollapsed && (
                  <span className="hidden lg:inline">{item.label}</span>
                )}
                {/* 접힘 상태 툴팁 */}
                {isCollapsed && (
                  <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-[#01261f] px-2.5 py-1.5 text-xs font-medium text-[#faf9f5] whitespace-nowrap shadow-lg group-hover:lg:block z-50">
                    {item.label}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 하단: 사용자 정보 */}
      {user && (
        <div className="border-t border-[#01261f]/5 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#1a3c34]">
              <span className="text-xs font-semibold text-[#faf9f5]">
                {getInitials(user.name)}
              </span>
            </div>
            {!isCollapsed && (
              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-sm font-medium text-[#1b1c1a]">
                  {user.name}
                </p>
                <p className="text-xs text-[#414846]">
                  {user.role === "admin" ? "관리자" : "변호사"}
                </p>
              </div>
            )}
            {!isCollapsed && onLogout && (
              <button
                onClick={onLogout}
                aria-label="로그아웃"
                className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-[#414846] hover:text-[#ba1a1a] hover:bg-[#ba1a1a]/8 transition-colors"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              aria-label="로그아웃"
              className={`mt-2 flex w-full items-center justify-center rounded-lg py-2 text-[#414846] hover:text-[#ba1a1a] hover:bg-[#ba1a1a]/8 transition-colors ${
                isCollapsed ? "" : "lg:hidden"
              }`}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
