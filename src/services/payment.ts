// Toss Payments 결제위젯 연동 서비스
import { authHeaders } from "./api-auth";
import { API_BASE } from "./apiBase";

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

/** 결제 주문번호를 생성합니다. (`/api/payment/confirm`이 이 형식을 파싱합니다) */
export function createOrderId(planId: string, uid: string): string {
  return `plan-${planId}-${uid}-${Date.now()}`;
}

export function getTossClientKey(): string {
  if (!TOSS_CLIENT_KEY) {
    throw new Error("VITE_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
  }
  return TOSS_CLIENT_KEY;
}

/** 결제 승인(confirm)을 서버에 요청합니다. 성공 시 사용자 plan이 갱신됩니다. */
export async function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<{ success: true; planId: string }> {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const resp = await fetch(`${API_BASE}/api/payment/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  const data = (await resp.json()) as { success?: boolean; planId?: string; error?: string; detail?: unknown };

  if (!resp.ok || !data.success) {
    throw new Error(data.error ?? "결제 승인에 실패했습니다.");
  }

  return { success: true, planId: data.planId! };
}
