import type { ReactNode, MouseEventHandler } from "react";

interface PillProps {
  children: ReactNode;
  active?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/** 필터 태그 (pill) */
export default function Pill({ children, active = false, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-200 ${
        active
          ? "bg-gold-dim border-gold text-gold"
          : "bg-surface border-border text-text-dim hover:border-border-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
