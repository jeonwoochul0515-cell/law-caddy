// 요금제 서버 검증 — 비용이 발생하는 엔드포인트를 지킨다.
//
// 왜 필요한가:
//   usePlanLimits는 React 훅이라 화면에서 버튼을 가려줄 뿐이다. API를 직접 호출하면
//   한도를 무시하고 Claude/STT를 무제한으로 쓸 수 있었다. 건당 수백~수천원이 그대로 손실.
//
// (2026-07-31) Starter를 무료로 개방하면서 판정이 두 갈래가 되었다:
//   - requireUsageQuota: 무료도 허용하되 **이번 달 문서 생성 수**로 한도를 건다 (AI 분석·STT)
//   - requirePaidPlan:   실비가 나가는 기능은 여전히 유료 전용 (문자 발송)
//
// 판정 기준은 src/hooks/usePlanLimits.ts와 동일하게 맞춘다:
//   - planExpiresAt이 지났으면 free 취급
//   - planExpiresAt이 없으면 만료 없음 (관리자 수동 부여 등 기존 사용자 보호)
//   - plan이 없으면 free

import type { Env } from "./types";
import {
  firestoreGetDocument,
  firestoreQueryByFields,
  readString,
  type FirestoreValue,
} from "./firestore";

/** 유료 기능(문자 발송 등 실비 발생)을 쓸 수 있는 플랜 */
const PAID_PLANS = ["starter", "pro", "team"];

/** 무제한 플랜 — 사용량 조회 자체를 생략한다 */
const UNLIMITED_PLANS = ["pro", "team"];

/**
 * 무료(Starter) 월 한도 — src/types/subscription.ts의 PLAN_LIMITS.free와 같은 값으로 유지할 것.
 * 서버는 문서 생성 수만 센다. 분석만 하고 문서를 만들지 않는 경우는 통과시킨다
 * (그 편이 체험을 막지 않으면서도 반복 남용은 막는 실용적인 선이다).
 */
const FREE_MONTHLY_DOCS = 3;

/** 사용자 문서 조회 캐시 (같은 사건에서 에이전트가 병렬로 여러 번 호출하므로) */
const CACHE_TTL_MS = 60_000;
const planCache = new Map<string, { result: PlanCheck; expiresAt: number }>();

export interface PlanCheck {
  /** 만료를 반영한 실질 플랜 */
  plan: string;
  role: string;
  /** 유료 기능 사용 가능 여부 */
  allowed: boolean;
  /** 만료로 인해 free로 강등되었는지 (안내 문구 구분용) */
  expired: boolean;
}

/** FirestoreValue에서 timestamp를 밀리초로 추출합니다. */
function readTimestampMs(value: FirestoreValue | undefined): number | null {
  if (!value || !("timestampValue" in value)) return null;
  const ms = Date.parse(value.timestampValue);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 사용자의 요금제를 조회해 유료 기능 사용 가능 여부를 판정합니다.
 *
 * 인프라 오류(서비스 계정 미설정, 네트워크 등)로 조회 자체가 실패하면 **허용**합니다.
 * 설정 문제로 전체 서비스가 멈추는 것보다 낫고, 그런 경우는 로그로 드러납니다.
 */
export async function checkPaidPlan(env: Env, uid: string): Promise<PlanCheck> {
  const cached = planCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let result: PlanCheck;

  try {
    const userDoc = await firestoreGetDocument(env, `users/${uid}`);
    const fields = userDoc?.fields ?? {};

    const role = readString(fields.role) ?? "lawyer";
    const rawPlan = readString(fields.plan) ?? "free";
    const expiresAtMs = readTimestampMs(fields.planExpiresAt);
    const expired = expiresAtMs !== null && expiresAtMs < Date.now();
    const plan = expired ? "free" : rawPlan;

    result = {
      plan,
      role,
      expired,
      // 관리자는 항상 허용
      allowed: role === "admin" || PAID_PLANS.includes(plan),
    };
  } catch (error) {
    console.error(
      "[plan] 요금제 조회 실패 — 통과시킵니다. 서비스 계정 환경변수를 확인하세요:",
      error instanceof Error ? error.message : String(error),
    );
    result = { plan: "unknown", role: "unknown", expired: false, allowed: true };
  }

  planCache.set(uid, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** 플랜 미달 시 반환할 402 응답을 만듭니다. */
export function planDeniedResponse(check: PlanCheck): Response {
  const message = check.expired
    ? "요금제가 만료되었습니다. 설정 > 요금제에서 연장해 주세요."
    : "유료 요금제가 필요한 기능입니다. 설정 > 요금제에서 업그레이드해 주세요.";

  return Response.json(
    { error: message, plan: check.plan, code: "PLAN_REQUIRED" },
    { status: 402 },
  );
}

/** 이번 달 1일 00:00(KST)의 ISO 문자열 */
function firstOfMonthIso(): string {
  const now = new Date();
  // KST 기준 월 경계 (UTC+9)
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
}

/** 사용량 조회 캐시 — 한 사건에서 에이전트가 병렬 호출하므로 짧게 캐싱한다 */
const usageCache = new Map<string, { count: number; expiresAt: number }>();

/** 이번 달 생성한 문서 수를 셉니다. 조회 실패 시 0(통과)으로 취급합니다. */
async function countMonthlyDocuments(env: Env, uid: string): Promise<number> {
  const cached = usageCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.count;

  let count = 0;
  try {
    const docs = await firestoreQueryByFields(
      env,
      "documents",
      [{ field: "ownerId", value: { stringValue: uid } }],
      200,
    );
    const since = firstOfMonthIso();
    count = docs.filter((d) => (d.createTime ?? "") >= since).length;
  } catch (error) {
    console.error(
      "[plan] 사용량 조회 실패 — 통과시킵니다:",
      error instanceof Error ? error.message : String(error),
    );
  }

  usageCache.set(uid, { count, expiresAt: Date.now() + CACHE_TTL_MS });
  return count;
}

/**
 * 사용량 한도를 요구합니다 (AI 분석·음성 변환용).
 * 무료 플랜도 한도 안에서는 통과하고, 초과하면 402를 돌려줍니다.
 */
export async function requireUsageQuota(
  env: Env,
  uid: string | undefined,
): Promise<Response | null> {
  if (!uid) return null; // 인증은 미들웨어가 이미 처리한다
  const check = await checkPaidPlan(env, uid);

  // 관리자·무제한 플랜은 통과
  if (check.role === "admin" || UNLIMITED_PLANS.includes(check.plan)) return null;
  // 조회 실패(unknown)는 통과 — 설정 문제로 서비스가 멈추지 않게
  if (check.plan === "unknown") return null;

  const used = await countMonthlyDocuments(env, uid);
  if (used < FREE_MONTHLY_DOCS) return null;

  return Response.json(
    {
      error: `무료 플랜의 이번 달 문서 생성 ${FREE_MONTHLY_DOCS}건을 모두 사용했습니다. 설정 > 요금제에서 Pro로 업그레이드하면 무제한으로 쓸 수 있습니다.`,
      plan: check.plan,
      code: "QUOTA_EXCEEDED",
    },
    { status: 402 },
  );
}

/**
 * 유료 플랜을 요구합니다. 통과하면 null, 막히면 반환할 Response를 돌려줍니다.
 *
 * 사용법:
 *   const denied = await requirePaidPlan(context.env, uid);
 *   if (denied) return denied;
 */
export async function requirePaidPlan(
  env: Env,
  uid: string | undefined,
): Promise<Response | null> {
  if (!uid) return null; // 인증은 미들웨어가 이미 처리한다
  const check = await checkPaidPlan(env, uid);
  return check.allowed ? null : planDeniedResponse(check);
}
