// Toss Payments 결제위젯 연동 서비스 — 주문번호 생성(진행 중 주문 재사용), 승인 요청, 결제 내역 조회
import type { Timestamp } from "firebase/firestore";
import { authHeaders } from "./api-auth";
import { API_BASE } from "./apiBase";

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

/** 결제 기간 단위. m = 1개월, y = 12개월(10개월 요금 = 2개월 무료) */
export type BillingPeriod = "m" | "y";

/** 연결제 시 청구 배수 (12개월 이용, 10개월 요금) */
export const YEARLY_MULTIPLIER = 10;

/** 결제 주문번호를 생성합니다. (`/api/payment/confirm`이 이 형식을 파싱합니다) */
export function createOrderId(planId: string, period: BillingPeriod, uid: string): string {
  return `plan-${planId}-${period}-${uid}-${Date.now()}`;
}

/** 진행 중인 주문번호를 브라우저에 잠시 보관하는 키 */
const PENDING_ORDER_KEY = "law-caddy-pending-order";
/** 이 시간 안에 다시 결제창을 열면 같은 주문번호를 쓴다 (토스가 같은 주문을 두 번 승인하지 않는다) */
const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

interface PendingOrder {
  orderId: string;
  planId: string;
  period: BillingPeriod;
  uid: string;
  createdAt: number;
}

/**
 * 같은 플랜·기간의 진행 중 주문이 있으면 그 주문번호를 재사용하고, 없으면 새로 만듭니다.
 * 결제창을 닫았다 다시 열거나 승인 화면에서 뒤로 갔다 다시 결제해도 주문이 둘로 늘지 않는다.
 */
export function getOrCreateOrderId(planId: string, period: BillingPeriod, uid: string): string {
  try {
    const raw = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (raw) {
      const pending = JSON.parse(raw) as PendingOrder;
      if (
        pending.planId === planId &&
        pending.period === period &&
        pending.uid === uid &&
        Date.now() - pending.createdAt < PENDING_ORDER_TTL_MS
      ) {
        return pending.orderId;
      }
    }
  } catch {
    /* sessionStorage를 못 쓰는 환경이면 매번 새로 만든다 */
  }
  const orderId = createOrderId(planId, period, uid);
  try {
    const pending: PendingOrder = { orderId, planId, period, uid, createdAt: Date.now() };
    sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(pending));
  } catch {
    /* 무시 */
  }
  return orderId;
}

/** 승인이 끝난 주문번호를 보관함에서 지웁니다 (다음 결제는 새 주문번호로) */
export function clearPendingOrder(): void {
  try {
    sessionStorage.removeItem(PENDING_ORDER_KEY);
  } catch {
    /* 무시 */
  }
}

export function getTossClientKey(): string {
  if (!TOSS_CLIENT_KEY) {
    throw new Error("VITE_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
  }
  return TOSS_CLIENT_KEY;
}

/** 승인 결과 */
export interface ConfirmResult {
  success: true;
  planId: string;
  period: string;
  expiresAt: string;
  /** 기존 이용 기간 뒤에 이어 붙였으면 그 기준일(ISO) */
  extendedFrom: string | null;
  receiptUrl: string | null;
  /** 같은 주문을 다시 승인 요청한 경우(새로고침 등) */
  alreadyProcessed: boolean;
}

/**
 * "결제는 됐는데 요금제 반영이 늦어지는" 경우 — 화면은 다시 결제하지 말라고 안내해야 한다.
 */
export class PaymentApplyDelayedError extends Error {
  readonly orderId: string;
  readonly receiptUrl: string | null;
  constructor(message: string, orderId: string, receiptUrl: string | null) {
    super(message);
    this.name = "PaymentApplyDelayedError";
    this.orderId = orderId;
    this.receiptUrl = receiptUrl;
  }
}

/** 결제 승인(confirm)을 서버에 요청합니다. 성공 시 사용자 plan과 만료일이 갱신됩니다. */
export async function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<ConfirmResult> {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const resp = await fetch(`${API_BASE}/api/payment/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  const data = (await resp.json()) as {
    success?: boolean;
    planId?: string;
    period?: string;
    expiresAt?: string;
    extendedFrom?: string | null;
    receiptUrl?: string | null;
    alreadyProcessed?: boolean;
    error?: string;
    reason?: string | null;
    code?: string;
    paid?: boolean;
    orderId?: string;
    detail?: unknown;
  };

  if (data.code === "PLAN_APPLY_FAILED" && data.paid) {
    throw new PaymentApplyDelayedError(
      data.error ?? "결제는 완료되었지만 요금제 반영이 지연되고 있습니다.",
      data.orderId ?? params.orderId,
      data.receiptUrl ?? null,
    );
  }

  if (!resp.ok || !data.success) {
    // 토스가 준 한국어 사유(reason)가 있으면 그것을 앞세운다
    const base = data.error ?? "결제 승인에 실패했습니다.";
    throw new Error(data.reason ? `${base} (${data.reason})` : base);
  }

  clearPendingOrder();

  return {
    success: true,
    planId: data.planId!,
    period: data.period ?? "monthly",
    expiresAt: data.expiresAt ?? "",
    extendedFrom: data.extendedFrom ?? null,
    receiptUrl: data.receiptUrl ?? null,
    alreadyProcessed: data.alreadyProcessed === true,
  };
}

/** 결제 기록 (payments 컬렉션 — 서버가 결제 승인 시 기록, 문서 ID = orderId) */
export interface PaymentRecord {
  id: string;
  uid: string;
  planId: string;
  /** monthly | yearly — 기간 개념 도입(2026-07) 이전 결제엔 없음 */
  period?: string;
  amount: number;
  method: string;
  status: string;
  confirmedAt?: Timestamp;
  expiresAt?: Timestamp;
  /** 기존 이용 기간 뒤에 이어 붙였으면 그 기준일 */
  extendedFrom?: Timestamp;
  /** 토스 매출전표(영수증) 주소 — 2026-09-11 이후 결제에만 있음 */
  receiptUrl?: string;
  /** 사용자 문서에 플랜이 반영됐는지 (false면 결제만 되고 반영이 지연된 건) */
  planApplied?: boolean;
}

/** 본인 결제 이력을 최신순으로 조회합니다. */
export async function getPaymentHistory(uid: string): Promise<PaymentRecord[]> {
  const { collection, query, where, getDocs } = await import("firebase/firestore");
  const { db } = await import("../config/firebase");

  const snapshot = await getDocs(
    query(collection(db!, "payments"), where("uid", "==", uid)),
  );
  const records = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      // 서버 REST가 integerValue(문자열)로 기록하므로 숫자로 정규화
      amount: Number(data.amount ?? 0),
    } as PaymentRecord;
  });
  return records.sort(
    (a, b) => (b.confirmedAt?.seconds ?? 0) - (a.confirmedAt?.seconds ?? 0),
  );
}
