import type { ReactNode, MouseEventHandler } from "react";

interface GlassProps {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  padding?: string;
}

/** 글래스모피즘 카드 래퍼 */
export default function Glass({
  children,
  className = "",
  onClick,
  padding = "p-6",
}: GlassProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-border rounded-2xl backdrop-blur-sm transition-colors duration-200 hover:border-border-hover ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
