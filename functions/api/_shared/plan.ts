// 요금제 서버 검증 — 비용이 발생하는 엔드포인트에서 무료 플랜을 차단한다.
//
// 왜 필요한가:
//   usePlanLimits는 React 훅이라 화면에서 버튼을 가려줄 뿐이다. API를 직접 호출하면
//   free 플랜도 Claude/STT를 무제한으로 쓸 수 있었다. 건당 수백~수천원이 그대로 손실.
//
// 판정 기준은 src/hooks/usePlanLimits.ts와 동일하게 맞춘다:
//   - planExpiresAt이 지났으면 free 취급
//   - planExpiresAt이 없으면 만료 없음 (관리자 수동 부여 등 기존 사용자 보호)
//   - plan이 없으면 free

import type { Env } from "./types";
import { firestoreGetDocument, readString, type FirestoreValue } from "./firestore";

/** 유료 기능을 쓸 수 있는 플랜 */
const PAID_PLANS = ["starter", "pro", "team"];

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
