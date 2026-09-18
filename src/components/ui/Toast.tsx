// alert() 대신 쓰는 화면 하단 토스트 — 그리는 쪽.
//
// 구조. 창(window) 이벤트로 메시지를 보내고 <ToastHost/>(AppLayout에 한 번 마운트)가 받아 그린다.
//   - 보내는 쪽(`toast.success(...)`)은 toast-bus.ts에 있다. 컴포넌트가 아닌 곳에서도 부를 수 있다.
//   - React 트리 밖이라 Provider가 필요 없다. AppLayout 밖 화면(서명·포털·로그인)에서 쓰려면
//     그 화면에 <ToastHost/>를 직접 두면 된다.
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { TOAST_EVENT, type ToastPayload, type ToastType } from "./toast-bus";

const STYLE: Record<ToastType, { box: string; icon: typeof Info }> = {
  success: { box: "border-success/30 text-success", icon: CheckCircle2 },
  error: { box: "border-error/30 text-error", icon: AlertCircle },
  info: { box: "border-border-hover text-text-primary", icon: Info },
};

/** 토스트를 실제로 그리는 곳 — 레이아웃에 한 번만 둔다 */
export function ToastHost() {
  const [items, setItems] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const handler = (e: Event) => {
      const t = (e as CustomEvent<ToastPayload>).detail;
      setItems((prev) => [...prev.slice(-3), t]);
      const ms = t.duration ?? (t.type === "error" ? 8000 : 4000);
      if (ms > 0) {
        timers.set(
          t.id,
          setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), ms),
        );
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      timers.forEach((tm) => clearTimeout(tm));
    };
  }, []);

  if (items.length === 0) return null;

  const close = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[min(28rem,calc(100vw-2rem))] pointer-events-none"
      aria-live="polite"
    >
      {items.map((t) => {
        const s = STYLE[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl ${s.box}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="flex-1 text-sm leading-relaxed text-text-primary">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  close(t.id);
                  t.action?.onClick();
                }}
                className="shrink-0 min-h-11 px-3 text-sm font-semibold text-gold hover:text-gold-bright"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => close(t.id)}
              aria-label="알림 닫기"
              className="shrink-0 -mr-1 flex items-center justify-center w-11 h-11 -my-2 rounded-lg text-text-dim hover:text-text-primary hover:bg-surface-hover"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
