// 토스트 메시지를 보내는 쪽 — 컴포넌트가 아니라서 이 파일에 따로 둔다.
// 그리는 쪽은 <ToastHost/>(Toast.tsx)이고, 둘은 창(window) 이벤트로만 이어진다.
// 그래서 서비스·훅처럼 React 트리 밖에서도 toast.error(...)를 부를 수 있다.
//
// 쓰는 법.
//   import { toast } from "../components/ui/toast-bus";
//   toast.success("저장되었습니다");
//   toast.error("저장하지 못했습니다. 다시 시도해 주세요");
//   toast.error("삭제하지 못했습니다", { action: { label: "다시 시도", onClick: retry } });

export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  /** 자동으로 사라지는 시간(ms). 오류는 기본 8초, 나머지 4초. 0이면 닫을 때까지 유지 */
  duration?: number;
  /** 다음 행동 버튼 (예: 다시 시도) */
  action?: { label: string; onClick: () => void };
}

export interface ToastPayload extends ToastOptions {
  id: number;
  type: ToastType;
  message: string;
}

export const TOAST_EVENT = "lc-toast";

let seq = 0;

function emit(type: ToastType, message: string, options?: ToastOptions) {
  if (typeof window === "undefined") return;
  const payload: ToastPayload = { id: ++seq, type, message, ...options };
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export const toast = {
  success: (message: string, options?: ToastOptions) => emit("success", message, options),
  error: (message: string, options?: ToastOptions) => emit("error", message, options),
  info: (message: string, options?: ToastOptions) => emit("info", message, options),
};

/** 컴포넌트 안에서 훅 형태로 쓰고 싶을 때. 내부는 위 `toast`와 같다 */
export function useToast() {
  return toast;
}
