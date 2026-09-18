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
//
// (2026-09-11) 고친 것
//   - 연장 결제: 기존 만료일이 아직 미래면 그 날짜에 기간을 더한다 (남은 기간을 잃지 않는다)
//   - 같은 orderId를 다시 보내면(새로고침 등) Toss를 다시 부르지 않고 저장된 결과를 돌려준다
//   - Toss 승인 성공 후 Firestore 기록에 실패하면 "돈은 나갔는데 플랜 미적용"을 구분해 알린다
//     (code PLAN_APPLY_FAILED, paid: true) — 화면이 "다시 결제하지 마세요"로 안내한다
//   - 토스 영수증 URL(receipt.url)을 payments 문서에 저장한다
//   - 승인 직후 같은 isolate의 요금제 캐시를 비운다 (결제 직후 60초간 무료 판정되던 문제)

import type { Env } from "../_shared/types";
import {
  firestoreGetDocument,
  firestorePatchDocument,
  readString,
  type FirestoreValue,
} from "../_shared/firestore";
import { invalidatePlanCache } from "../_shared/plan";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

// 플랜별 월 요금 (KRW) — 클라이언트가 보낸 금액을 신뢰하지 않고 서버에서 검증한다
// 목록에서 빠진 플랜은 parseOrderId가 거부하므로 결제 승인 자체가 차단된다.
//  - starter: 2026-07-31 무료로 개방 — 결제 상품이 아니다.
//  - team: 팀 공유·권한 기능 구현 전이라 판매 중단(출시 시 69_000으로 복구).
const PLAN_MONTHLY_PRICE: Record<string, number> = {
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
  orderName?: string;
  approvedAt?: string;
  /** 토스 매출전표(영수증) — 결제 내역 화면의 "영수증 보기" 링크에 쓴다 */
  receipt?: { url?: string };
  code?: string;
  message?: string;
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

/** FirestoreValue에서 timestamp를 Date로 추출합니다. */
function readTimestamp(value: FirestoreValue | undefined): Date | null {
  if (!value || !("timestampValue" in value)) return null;
  const d = new Date(value.timestampValue);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readBool(value: FirestoreValue | undefined): boolean {
  return !!value && "booleanValue" in value && value.booleanValue === true;
}

/** 승인 응답 본문 (화면이 그대로 표시한다) */
function successBody(params: {
  planId: string;
  period: BillingPeriod;
  expiresAt: string;
  extendedFrom: string | null;
  receiptUrl: string | null;
  alreadyProcessed: boolean;
}) {
  return {
    success: true,
    planId: params.planId,
    period: params.period === "y" ? "yearly" : "monthly",
    expiresAt: params.expiresAt,
    /** 기존 이용 기간 뒤에 이어 붙였으면 그 기준일(ISO), 아니면 null */
    extendedFrom: params.extendedFrom,
    receiptUrl: params.receiptUrl,
    /** 같은 주문을 다시 승인 요청한 경우(새로고침 등) true */
    alreadyProcessed: params.alreadyProcessed,
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: ConfirmRequest;
  try {
    body = (await context.request.json()) as ConfirmRequest;
  } catch {
    return Response.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }

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

  const paymentPath = `payments/${body.orderId}`;

  // ── 0. 같은 주문을 이미 처리했으면 Toss를 다시 부르지 않는다 (새로고침·재시도 대응) ──
  try {
    const existingPayment = await firestoreGetDocument(context.env, paymentPath);
    const pf = existingPayment?.fields;
    if (pf && readBool(pf.planApplied)) {
      const expiresAt = readTimestamp(pf.expiresAt);
      return Response.json(
        successBody({
          planId: parsed.planId,
          period: parsed.period,
          expiresAt: expiresAt?.toISOString() ?? "",
          extendedFrom: readTimestamp(pf.extendedFrom)?.toISOString() ?? null,
          receiptUrl: readString(pf.receiptUrl) ?? null,
          alreadyProcessed: true,
        }),
      );
    }
  } catch (error) {
    // 기록 조회 실패는 승인 흐름을 막지 않는다 (아래에서 Toss가 중복을 거른다)
    console.error("[payment] 기존 결제 기록 조회 실패:", error instanceof Error ? error.message : String(error));
  }

  // ── 1. 기존 이용 기간 확인 — 연장이면 남은 기간 뒤에 이어 붙인다 ──
  let existingExpires: Date | null = null;
  let existingPlan = "free";
  try {
    const userDoc = await firestoreGetDocument(context.env, `users/${uid}`);
    existingExpires = readTimestamp(userDoc?.fields?.planExpiresAt);
    existingPlan = readString(userDoc?.fields?.plan) ?? "free";
  } catch (error) {
    console.error("[payment] 사용자 문서 조회 실패 — 오늘부터 계산합니다:", error instanceof Error ? error.message : String(error));
  }

  // ── 2. Toss 승인 (여기서 돈이 빠진다) ──
  let tossData: TossConfirmResponse;
  try {
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

    tossData = (await tossResp.json()) as TossConfirmResponse;

    if (!tossResp.ok) {
      return Response.json(
        {
          error: "결제 승인 실패",
          // 토스가 준 한국어 사유를 그대로 화면에 보여준다
          reason: tossData.message ?? null,
          tossCode: tossData.code ?? null,
          detail: tossData,
        },
        { status: tossResp.status },
      );
    }
  } catch (error) {
    return Response.json(
      {
        error: "결제 승인 처리 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  // ── 3. 승인은 끝났다 — 이제부터 실패하면 "돈은 나갔고 반영만 늦은" 상태다 ──
  const now = new Date();
  const sameProduct = existingPlan === parsed.planId;
  const extendFrom =
    sameProduct && existingExpires && existingExpires.getTime() > now.getTime() ? existingExpires : null;
  const expiresAt = calcExpiresAt(parsed.period, extendFrom ?? now);
  const receiptUrl = typeof tossData.receipt?.url === "string" ? tossData.receipt.url : null;

  const paymentFields: Record<string, FirestoreValue> = {
    uid: { stringValue: uid },
    planId: { stringValue: parsed.planId },
    period: { stringValue: parsed.period === "y" ? "yearly" : "monthly" },
    amount: { integerValue: String(body.amount) },
    paymentKey: { stringValue: body.paymentKey },
    method: { stringValue: tossData.method ?? "" },
    status: { stringValue: tossData.status ?? "" },
    orderName: { stringValue: tossData.orderName ?? "" },
    confirmedAt: { timestampValue: now.toISOString() },
    expiresAt: { timestampValue: expiresAt.toISOString() },
    ...(extendFrom ? { extendedFrom: { timestampValue: extendFrom.toISOString() } } : {}),
    ...(receiptUrl ? { receiptUrl: { stringValue: receiptUrl } } : {}),
    /** 사용자 문서에 플랜이 실제로 반영됐는지 — 아래 단계가 실패하면 false로 남는다 */
    planApplied: { booleanValue: false },
  };

  try {
    // 결제 기록을 먼저 남긴다 (플랜 반영이 실패해도 "돈이 나간 사실"은 조회할 수 있어야 한다)
    await firestorePatchDocument(context.env, paymentPath, paymentFields);

    // 사용자 플랜 + 만료일 갱신
    await firestorePatchDocument(context.env, `users/${uid}`, {
      plan: { stringValue: parsed.planId },
      planExpiresAt: { timestampValue: expiresAt.toISOString() },
    });

    await firestorePatchDocument(context.env, paymentPath, {
      planApplied: { booleanValue: true },
    });
  } catch (error) {
    console.error("[payment] 승인 후 플랜 반영 실패:", body.orderId, error instanceof Error ? error.message : String(error));
    return Response.json(
      {
        error: "결제는 완료되었지만 요금제 반영이 지연되고 있습니다. 다시 결제하지 마세요.",
        code: "PLAN_APPLY_FAILED",
        paid: true,
        orderId: body.orderId,
        receiptUrl,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  // 결제 직후 바로 유료 기능을 쓸 수 있게 같은 isolate의 판정 캐시를 비운다
  invalidatePlanCache(uid);

  return Response.json(
    successBody({
      planId: parsed.planId,
      period: parsed.period,
      expiresAt: expiresAt.toISOString(),
      extendedFrom: extendFrom?.toISOString() ?? null,
      receiptUrl,
      alreadyProcessed: false,
    }),
  );
};
