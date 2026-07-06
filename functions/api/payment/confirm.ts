// Toss Payments 결제 승인 프록시
//
// POST /api/payment/confirm
// Body: { paymentKey, orderId, amount }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 프론트엔드 결제위젯이 성공 리다이렉트로 받은 paymentKey/orderId/amount를
// Toss 결제 승인(confirm) API로 서버사이드에서 확정하고, 성공 시 Firestore의
// 사용자 plan을 갱신합니다. orderId는 `plan-{planId}-{uid}-{timestamp}` 형식이어야 합니다.

import type { Env } from "../_shared/types";
import { firestorePatchDocument } from "../_shared/firestore";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const VALID_PLAN_IDS = ["starter", "pro", "team"] as const;
type PlanId = (typeof VALID_PLAN_IDS)[number];

interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

interface TossConfirmResponse {
  status: string;
  method: string;
  totalAmount: number;
  [key: string]: unknown;
}

/** orderId(`plan-{planId}-{uid}-{timestamp}`)에서 planId와 uid를 추출합니다. */
function parseOrderId(orderId: string): { planId: PlanId; uid: string } | null {
  const match = /^plan-([a-z]+)-([^-]+)-\d+$/.exec(orderId);
  if (!match) return null;
  const [, planId, uid] = match;
  if (!VALID_PLAN_IDS.includes(planId as PlanId)) return null;
  return { planId: planId as PlanId, uid };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await context.request.json()) as ConfirmRequest;

    if (!body.paymentKey || !body.orderId || typeof body.amount !== "number") {
      return Response.json(
        { error: "paymentKey, orderId, amount가 필요합니다." },
        { status: 400 },
      );
    }

    const parsed = parseOrderId(body.orderId);
    if (!parsed) {
      return Response.json({ error: "orderId 형식이 올바르지 않습니다." }, { status: 400 });
    }

    // 결제 요청을 만든 본인만 승인 확정 가능 (다른 사용자의 orderId 도용 방지)
    if (parsed.uid !== uid) {
      return Response.json({ error: "본인의 결제만 승인할 수 있습니다." }, { status: 403 });
    }

    const tossResp = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${context.env.TOSS_SECRET_KEY}:`),
      },
      body: JSON.stringify({
        paymentKey: body.paymentKey,
        orderId: body.orderId,
        amount: body.amount,
      }),
    });

    const tossData = (await tossResp.json()) as TossConfirmResponse;

    if (!tossResp.ok) {
      return Response.json(
        { error: "결제 승인 실패", detail: tossData },
        { status: tossResp.status },
      );
    }

    // 사용자 플랜 갱신
    await firestorePatchDocument(context.env, `users/${uid}`, {
      plan: { stringValue: parsed.planId },
    });

    // 결제 기록 로그 (orderId를 문서 ID로 사용해 중복 승인 시에도 덮어쓰기만 발생)
    await firestorePatchDocument(context.env, `payments/${body.orderId}`, {
      uid: { stringValue: uid },
      planId: { stringValue: parsed.planId },
      amount: { integerValue: String(body.amount) },
      paymentKey: { stringValue: body.paymentKey },
      method: { stringValue: tossData.method ?? "" },
      status: { stringValue: tossData.status ?? "" },
      confirmedAt: { timestampValue: new Date().toISOString() },
    });

    return Response.json({ success: true, planId: parsed.planId });
  } catch (error) {
    return Response.json(
      {
        error: "결제 승인 처리 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
