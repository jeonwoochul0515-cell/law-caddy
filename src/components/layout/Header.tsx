// 상단 헤더 바
// 페이지 제목 + 부제목 (브레드크럼 스타일) + 알림 벨 + 사용자 드롭다운 자리

import { Bell } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-navy/80 px-6 backdrop-blur">
      {/* 좌측: 페이지 제목 + 부제목 */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        {subtitle && (
          <>
            <span className="text-text-dim">/</span>
            <span className="text-sm text-text-dim">{subtitle}</span>
          </>
        )}
      </div>

      {/* 우측: 알림 + 사용자 드롭다운 */}
      <div className="flex items-center gap-4">
        {/* 알림 벨 */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-text-dim transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
          aria-label="알림"
        >
          <Bell size={20} />
          {/* 알림 뱃지 (읽지 않은 알림이 있을 때 표시, 추후 구현) */}
        </button>

        {/* 사용자 드롭다운 자리 (추후 구현) */}
        <div className="h-8 w-8 rounded-full bg-surface-hover" />
      </div>
    </header>
  );
}
