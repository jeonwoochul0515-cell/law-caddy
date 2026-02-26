import type { ReactNode } from "react";

type BadgeVariant = "success" | "error" | "warning" | "info" | "gold" | "default";

interface BadgeProps {
  children: ReactNode;
  variant: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  gold: "bg-gold-dim text-gold",
  default: "bg-surface text-text-dim",
};

/** 상태 뱃지 */
export default function Badge({ children, variant }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
