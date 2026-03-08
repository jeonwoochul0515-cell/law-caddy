// 사이드바 네비게이션
// 모바일: 64px (아이콘 전용), 데스크톱: 240px (아이콘 + 텍스트)

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  FolderOpen,
  Settings,
  Shield,
} from "lucide-react";
import type { ReactNode } from "react";

/** 사이드바 사용자 타입 */
interface SidebarUser {
  name: string;
  role: "lawyer" | "admin";
}

interface SidebarProps {
  user: SidebarUser | null;
}

/** 네비게이션 항목 정의 */
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
  { to: "/settings", icon: <Settings size={20} />, label: "설정" },
  { to: "/admin", icon: <Shield size={20} />, label: "관리자", adminOnly: true },
];

/** 사용자 이름에서 이니셜 추출 (최대 2글자) */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // 한국어 이름인 경우 첫 글자만
  return name.trim().slice(0, 1).toUpperCase();
}

export default function Sidebar({ user }: SidebarProps) {
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col border-r border-border bg-navy lg:w-60">
      {/* 로고 */}
      <div className="flex h-16 items-center justify-center border-b border-border lg:justify-start lg:px-6">
        <span className="text-xl font-bold text-gold">LC</span>
        <span className="ml-2 hidden text-sm font-medium text-text-primary lg:inline">
          Law Caddy
        </span>
      </div>

      {/* 네비게이션 */}
      <nav aria-label="메인 네비게이션" className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                    "justify-center lg:justify-start",
                    isActive
                      ? "bg-gold-dim text-gold"
                      : "text-text-dim hover:bg-surface-hover hover:text-text-primary",
                  ].join(" ")
                }
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 하단: 사용자 정보 */}
      {user && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            {/* 아바타 (이니셜) */}
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gold-dim">
              <span className="text-xs font-semibold text-gold">
                {getInitials(user.name)}
              </span>
            </div>
            {/* 이름 (데스크톱에서만 표시) */}
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-medium text-text-primary">
                {user.name}
              </p>
              <p className="text-xs text-text-dim">
                {user.role === "admin" ? "관리자" : "변호사"}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
