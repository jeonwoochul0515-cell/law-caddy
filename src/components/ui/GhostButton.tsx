import type { ReactNode, MouseEventHandler } from "react";

interface GhostButtonProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
}

/** 고스트(아웃라인) 버튼 */
export default function GhostButton({
  children,
  onClick,
  className = "",
  disabled = false,
}: GhostButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-text-dim transition-colors duration-200 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
