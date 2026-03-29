// 사이드바 네비게이션 — 프리미엄 라이트 테마
// 모바일: 64px (아이콘 전용), 데스크톱: 240px (아이콘 + 텍스트)

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  FolderOpen,
  Calculator,
  Settings,
  Shield,
  LogOut,
  Crown,
} from "lucide-react";
import { useState, type ReactNode } from "react";

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
  premium?: boolean;
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
  const [showPremiumToast, setShowPremiumToast] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  const handlePremiumClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowPremiumToast(true);
    setTimeout(() => setShowPremiumToast(false), 2500);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col border-r border-[#01261f]/8 bg-[#faf9f5] lg:w-60">
      {/* 로고 — 클릭 시 대시보드 */}
      <NavLink to="/dashboard" className="flex h-16 items-center justify-center border-b border-[#01261f]/5 lg:justify-start lg:px-6 hover:bg-[#01261f]/3 transition-colors">
        <span className="text-2xl font-black italic font-serif text-[#01261f]">LC</span>
        <span className="ml-2 hidden text-base font-bold font-serif italic text-[#01261f] lg:inline">
          Law-Caddy
        </span>
      </NavLink>

      {/* 네비게이션 */}
      <nav aria-label="메인 네비게이션" className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) =>
            item.premium ? (
              <li key={item.to}>
                <button
                  onClick={handlePremiumClick}
                  aria-label={item.label}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium justify-center lg:justify-start text-[#01261f]/25 cursor-not-allowed transition-colors"
                >
                  {item.icon}
                  <span className="hidden lg:inline">{item.label}</span>
                  <Crown size={14} className="hidden lg:inline text-[#735c00]/40" />
                </button>
              </li>
            ) : (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                      "justify-center lg:justify-start",
                      isActive
                        ? "bg-[#01261f] text-[#faf9f5]"
                        : "text-[#414846] hover:bg-[#01261f]/5 hover:text-[#01261f]",
                    ].join(" ")
                  }
                >
                  {item.icon}
                  <span className="hidden lg:inline">{item.label}</span>
                </NavLink>
              </li>
            ),
          )}
        </ul>

        {showPremiumToast && (
          <div className="mx-1 mt-3 rounded-lg bg-[#735c00]/8 border border-[#735c00]/15 p-3 text-xs text-[#735c00]">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={12} />
              <span className="font-semibold">프리미엄 기능</span>
            </div>
            <p className="text-[#414846]">재무 관리는 프리미엄 플랜에서 이용 가능합니다.</p>
          </div>
        )}
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
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-medium text-[#1b1c1a]">
                {user.name}
              </p>
              <p className="text-xs text-[#414846]">
                {user.role === "admin" ? "관리자" : "변호사"}
              </p>
            </div>
            {onLogout && (
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
              className="mt-2 flex w-full items-center justify-center rounded-lg py-2 text-[#414846] hover:text-[#ba1a1a] hover:bg-[#ba1a1a]/8 transition-colors lg:hidden"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
