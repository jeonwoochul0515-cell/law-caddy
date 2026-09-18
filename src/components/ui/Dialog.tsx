// 모든 대화상자(모달)가 공유하는 껍데기 — role="dialog", Esc 닫기, 초점 가두기, 닫힐 때 원래 자리로 초점 복귀
//
// 쓰는 법.
//   <Dialog open={open} onClose={() => setOpen(false)} title="새 사건 등록" description="한 줄 설명(선택)">
//     …내용…
//   </Dialog>
//
//   - 제목은 aria-labelledby로 자동 연결된다. 제목 없이 쓰려면 ariaLabel을 넘긴다.
//   - 바깥(배경) 클릭으로 닫으려면 closeOnBackdrop. 입력 중인 글이 있으면 false로 두는 편이 안전하다
//     (버그 신고처럼 쓰던 글이 날아가는 사고 방지). 기본값은 false.
//   - 폭은 size로 고른다. sm 28rem / md 32rem / lg 42rem / xl 56rem.
//   - 내용이 화면보다 길면 안쪽이 스크롤된다(max-h 90dvh).
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** 제목이 없을 때 낭독기가 읽을 이름 */
  ariaLabel?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
  /** 닫기(X) 버튼 숨김 — 반드시 답을 골라야 하는 확인창 */
  hideClose?: boolean;
  /** 열릴 때 초점을 줄 요소를 고르는 선택자. 없으면 첫 입력칸, 그것도 없으면 첫 버튼 */
  initialFocus?: string;
  /** 하단 버튼 영역 */
  footer?: ReactNode;
  className?: string;
}

const SIZE: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  children,
  size = "md",
  closeOnBackdrop = false,
  hideClose = false,
  initialFocus,
  footer,
  className = "",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // Esc 핸들러가 항상 최신 onClose를 부르도록 ref에 담아 둔다.
  // 렌더 중에 ref를 쓰면 React 19가 경고하므로 커밋 뒤에 맞춘다(이벤트는 렌더 뒤에 터져 값이 유효하다).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 열릴 때: 초점 이동 + 배경 스크롤 잠금. 닫힐 때: 원래 요소로 초점 복귀
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget =
      (initialFocus ? panel?.querySelector<HTMLElement>(initialFocus) : null) ??
      panel?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    // 렌더 직후 한 프레임 뒤에 초점을 줘야 스크린리더가 대화상자 이름을 먼저 읽는다
    const raf = requestAnimationFrame(() => focusTarget?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // 초점 가두기 — 마지막에서 Tab이면 처음으로, 처음에서 Shift+Tab이면 마지막으로
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* 배경 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* 패널 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${SIZE[size]} max-h-[90dvh] flex flex-col bg-white border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none ${className}`}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-base font-semibold text-text-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1 text-sm text-text-dim leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="shrink-0 -mr-2 -mt-2 flex items-center justify-center w-11 h-11 rounded-lg text-text-dim hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && <div className="px-5 py-4 border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * "정말 지울까요?" 같은 확인창. confirm() 대신 쓴다.
 *   <ConfirmDialog open={ask} onClose={() => setAsk(false)} onConfirm={doDelete}
 *     title="이 사건을 삭제할까요?" description="기한·문서·녹음도 함께 지워집니다." confirmLabel="삭제" danger />
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제·로그아웃처럼 되돌리기 어려운 동작이면 빨간 버튼 */
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      hideClose
      initialFocus="[data-confirm-cancel]"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            data-confirm-cancel
            onClick={onClose}
            disabled={busy}
            className="min-h-11 px-4 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            className={`min-h-11 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
              danger ? "bg-error hover:opacity-90" : "bg-primary hover:opacity-90"
            }`}
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      }
    >
      <span className="sr-only">{confirmLabel} 또는 {cancelLabel}을 고르세요.</span>
    </Dialog>
  );
}
