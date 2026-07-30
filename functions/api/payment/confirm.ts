// Toss Payments 결제 승인 프록시
//
// POST /api/payment/confirm
// Body: { paymentKey, orderId, amount }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 프론트엔드 결제위젯이 성공 리다이렉트로 받은 paymentKey/orderId/amount를
// Toss 결제 승인(confirm) API로 서버사이드에서 확정하고, 성공 시 Firestore의
// 사용자 plan과 만료일(planExpiresAt)을 갱신합니다.
// orderId는 `plan-{planId}-{m|y}-{uid}-{timestamp}` 형식이어야 합니다.
// (m = 1개월, y = 12개월 이용·10개월 요금)

import type { Env } from "../_shared/types";
import { firestorePatchDocument } from "../_shared/firestore";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

// 플랜별 월 요금 (KRW) — 클라이언트가 보낸 금액을 신뢰하지 않고 서버에서 검증한다
// team 플랜은 팀 공유·권한 기능 구현 전이라 판매 중단(준비중) — 목록에서 빼면
// parseOrderId가 거부하므로 결제 승인 자체가 차단된다. 출시 시 69_000으로 복구할 것.
const PLAN_MONTHLY_PRICE: Record<string, number> = {
  starter: 49_000,
  pro: 89_000,
};

/** 연결제 청구 배수 (12개월 이용, 10개월 요금) */
const YEARLY_MULTIPLIER = 10;

type BillingPeriod = "m" | "y";

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

/** orderId(`plan-{planId}-{m|y}-{uid}-{timestamp}`)에서 planId·기간·uid를 추출합니다. */
function parseOrderId(
  orderId: string,
): { planId: string; period: BillingPeriod; uid: string } | null {
  const match = /^plan-([a-z]+)-([my])-([^-]+)-\d+$/.exec(orderId);
  if (!match) return null;
  const [, planId, period, uid] = match;
  if (!(planId in PLAN_MONTHLY_PRICE)) return null;
  return { planId, period: period as BillingPeriod, uid };
}

/** 결제 기간에 따른 만료일을 계산합니다. (월결제 +1개월, 연결제 +12개월) */
function calcExpiresAt(period: BillingPeriod, from: Date): Date {
  const expires = new Date(from);
  expires.setMonth(expires.getMonth() + (period === "y" ? 12 : 1));
  return expires;
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

    // 금액 서버 검증 — 클라이언트 조작 방지
    const monthly = PLAN_MONTHLY_PRICE[parsed.planId];
    const expectedAmount = parsed.period === "y" ? monthly * YEARLY_MULTIPLIER : monthly;
    if (body.amount !== expectedAmount) {
      return Response.json(
        { error: `결제 금액이 플랜 요금과 일치하지 않습니다. (기대: ${expectedAmount}원)` },
        { status: 400 },
      );
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

    const now = new Date();
    const expiresAt = calcExpiresAt(parsed.period, now);

    // 사용자 플랜 + 만료일 갱신
    await firestorePatchDocument(context.env, `users/${uid}`, {
      plan: { stringValue: parsed.planId },
      planExpiresAt: { timestampValue: expiresAt.toISOString() },
    });

    // 결제 기록 로그 (orderId를 문서 ID로 사용해 중복 승인 시에도 덮어쓰기만 발생)
    await firestorePatchDocument(context.env, `payments/${body.orderId}`, {
      uid: { stringValue: uid },
      planId: { stringValue: parsed.planId },
      period: { stringValue: parsed.period === "y" ? "yearly" : "monthly" },
      amount: { integerValue: String(body.amount) },
      paymentKey: { stringValue: body.paymentKey },
      method: { stringValue: tossData.method ?? "" },
      status: { stringValue: tossData.status ?? "" },
      confirmedAt: { timestampValue: now.toISOString() },
      expiresAt: { timestampValue: expiresAt.toISOString() },
    });

    return Response.json({
      success: true,
      planId: parsed.planId,
      period: parsed.period === "y" ? "yearly" : "monthly",
      expiresAt: expiresAt.toISOString(),
    });
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
