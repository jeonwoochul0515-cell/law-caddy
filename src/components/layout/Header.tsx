// 상단 헤더 바
// 페이지 제목 + 부제목 (브레드크럼 스타일) + 알림 벨

import NotificationBell from "./NotificationBell";

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

      {/* 우측: 알림 벨 */}
      <div className="flex items-center gap-4">
        <NotificationBell />
      </div>
    </header>
  );
}
