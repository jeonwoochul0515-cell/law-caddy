// 요금제 서버 검증 — 비용이 발생하는 엔드포인트를 지킨다.
//
// 왜 필요한가:
//   usePlanLimits는 React 훅이라 화면에서 버튼을 가려줄 뿐이다. API를 직접 호출하면
//   한도를 무시하고 Claude/STT를 무제한으로 쓸 수 있었다. 건당 수백~수천원이 그대로 손실.
//
// (2026-07-31) Starter를 무료로 개방하면서 판정이 두 갈래가 되었다:
//   - requireUsageQuota: 무료도 허용하되 **이번 달 사용량**으로 한도를 건다 (AI 분석·STT)
//   - requirePaidPlan:   실비가 나가는 기능은 여전히 유료 전용 (문자 발송)
//
// (2026-09-11) 두 가지 구멍을 막았다:
//   1. 사건·문서 건수만 세어 "직접 호출하면 무제한"이던 것 → 실제 호출 건수를
//      usage_monthly/{uid}_{YYYYMM}에 기록하고 상한(FREE_MONTHLY_CALLS)을 건다.
//   2. 문서 레코드가 생성 호출보다 먼저 만들어져 마지막 1건이 항상 막히던 off-by-one →
//      진행 중(processing/checkpoint/generating) 문서는 세지 않고, 사건 축은 진행 중 문서가
//      없을 때만 적용한다. 캐시도 60초→15초로 줄여 "될 때도 안 될 때도"를 없앴다.
//
// 판정 기준은 src/hooks/usePlanLimits.ts와 동일하게 맞춘다:
//   - planExpiresAt이 지났으면 free 취급
//   - planExpiresAt이 없으면 만료 없음 (관리자 수동 부여 등 기존 사용자 보호)
//   - plan이 없으면 free

import type { Env } from "./types";
import {
  firestoreGetDocument,
  firestorePatchDocument,
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
 * 화면 표기: "사건 분석 월 5건 / 문서 생성 월 3건" (FREE_LIMIT_LABELS)
 */
const FREE_MONTHLY_DOCS = 3;
const FREE_MONTHLY_CASES = 5;

/**
 * 무료 계정의 월간 실제 호출 상한 (Claude + STT 합산).
 * 정상 사용은 분석 5건 × 에이전트 6~8회 + 문서 3건 × (생성 1회 + 수정 대화 수 회) ≈ 60~80회다.
 * 사건·문서를 만들지 않고 API만 두드리는 우회를 막는 안전망이지, 정상 사용을 조이는 값이 아니다.
 */
const FREE_MONTHLY_CALLS = 150;

/** 문서 status 중 "아직 만드는 중" — 한도 계산에서 제외 (생성 호출이 곧 이 문서를 완성한다) */
const IN_PROGRESS_DOC_STATUSES = new Set(["processing", "checkpoint", "generating"]);

/** 요금제 화면 경로 — src/types/subscription.ts PLAN_UPGRADE_PATH와 같은 값 */
const PLAN_UPGRADE_PATH = "/settings?tab=plan";

/**
 * 사용자 문서 조회 캐시 (같은 사건에서 에이전트가 병렬로 여러 번 호출하므로).
 * 60초는 결제 직후·문서 완성 직후에 판정이 어긋나는 시간이 너무 길었다 → 15초.
 */
const CACHE_TTL_MS = 15_000;
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

/** 어떤 종류의 유료 호출인지 — usage_monthly 필드 구분용 */
export type UsageKind = "claude" | "transcribe";

/** FirestoreValue에서 timestamp를 밀리초로 추출합니다. */
function readTimestampMs(value: FirestoreValue | undefined): number | null {
  if (!value || !("timestampValue" in value)) return null;
  const ms = Date.parse(value.timestampValue);
  return Number.isNaN(ms) ? null : ms;
}

/** FirestoreValue에서 정수를 추출합니다 (integerValue 문자열 → number). */
function readInt(value: FirestoreValue | undefined): number {
  if (!value) return 0;
  if ("integerValue" in value) return Number(value.integerValue) || 0;
  if ("doubleValue" in value) return Math.floor(value.doubleValue) || 0;
  return 0;
}

/**
 * 결제 승인·플랜 변경 직후 같은 isolate의 캐시를 비웁니다.
 * (다른 isolate는 TTL 15초가 지나면 자연히 새로 읽는다)
 */
export function invalidatePlanCache(uid: string): void {
  planCache.delete(uid);
  for (const key of usageCache.keys()) {
    if (key.startsWith(`${uid}:`)) usageCache.delete(key);
  }
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
    ? "요금제 이용 기간이 끝나 무료 플랜으로 바뀌었습니다. 요금제 화면에서 연장 결제하면 바로 다시 쓸 수 있습니다."
    : "문자 발송은 Pro 요금제에서 쓸 수 있습니다. 요금제 화면에서 Pro로 올려 주세요.";

  return Response.json(
    {
      error: message,
      plan: check.plan,
      code: "PLAN_REQUIRED",
      /** 화면이 링크로 그릴 경로 */
      upgradePath: PLAN_UPGRADE_PATH,
    },
    { status: 402 },
  );
}

/** 지금 시각의 KST 연·월 정보 */
function kstNow(): { year: number; month: number; yearMonth: string; firstOfMonthIso: string } {
  const now = new Date();
  // KST 기준 월 경계 (UTC+9)
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth(); // 0-based
  return {
    year,
    month,
    yearMonth: `${year}${String(month + 1).padStart(2, "0")}`,
    firstOfMonthIso: new Date(Date.UTC(year, month, 1) - 9 * 3600_000).toISOString(),
  };
}

/** 사용량 조회 캐시 — 한 사건에서 에이전트가 병렬 호출하므로 짧게 캐싱한다 (키: uid:컬렉션) */
const usageCache = new Map<string, { count: MonthlyCount; expiresAt: number }>();

interface MonthlyCount {
  /** 이번 달 만든 문서 중 완성된 것 */
  completed: number;
  /** 이번 달 만든 문서 중 아직 만드는 중인 것 (checkpoint 대기 등) */
  inProgress: number;
  /** 이번 달 만든 전체 건수 */
  total: number;
}

/**
 * 이번 달 해당 컬렉션에 만든 문서 수를 셉니다.
 * 조회 실패 시 0(통과)으로 취급합니다 — 설정 문제로 서비스가 멈추는 것보다 낫다.
 */
async function countMonthly(env: Env, uid: string, collection: string): Promise<MonthlyCount> {
  const key = `${uid}:${collection}`;
  const cached = usageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.count;

  const count: MonthlyCount = { completed: 0, inProgress: 0, total: 0 };
  try {
    const docs = await firestoreQueryByFields(
      env,
      collection,
      [{ field: "ownerId", value: { stringValue: uid } }],
      300,
    );
    const since = kstNow().firstOfMonthIso;
    for (const d of docs) {
      if ((d.createTime ?? "") < since) continue;
      count.total++;
      const status = readString(d.fields?.status);
      if (status && IN_PROGRESS_DOC_STATUSES.has(status)) count.inProgress++;
      else count.completed++;
    }
  } catch (error) {
    console.error(
      `[plan] ${collection} 사용량 조회 실패 — 통과시킵니다:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  usageCache.set(key, { count, expiresAt: Date.now() + CACHE_TTL_MS });
  return count;
}

/**
 * 같은 isolate 안에서 병렬 호출이 서로의 증가분을 덮어쓰지 않도록 메모리에 합산해 둔다.
 * (Firestore REST에는 트랜잭션 증가 헬퍼가 없어 읽고-더하고-쓰기 방식이다.
 *  다른 isolate와 겹치면 일부가 덜 세어질 수 있으나, 상한은 안전망이므로 감수한다)
 */
const localUsage = new Map<string, { claude: number; transcribe: number }>();

/**
 * 실제 호출 1건을 usage_monthly/{uid}_{YYYYMM}에 기록하고 이번 달 누적 호출 수를 돌려줍니다.
 * 기록에 실패하면 메모리 값으로 계산해 통과시킵니다(비용 경로를 설정 오류로 막지 않기 위해).
 */
async function recordUsage(env: Env, uid: string, kind: UsageKind): Promise<number> {
  const { yearMonth } = kstNow();
  const docId = `${uid}_${yearMonth}`;
  const local = localUsage.get(docId) ?? { claude: 0, transcribe: 0 };
  local[kind] += 1;
  localUsage.set(docId, local);

  try {
    const existing = await firestoreGetDocument(env, `usage_monthly/${docId}`);
    const fields = existing?.fields ?? {};
    const claude = Math.max(readInt(fields.claudeCalls), local.claude);
    const transcribe = Math.max(readInt(fields.transcribeCalls), local.transcribe);
    // DB가 더 크면(다른 isolate가 세었으면) 그 값 위에 이번 1건을 얹는다
    const nextClaude = kind === "claude" ? Math.max(readInt(fields.claudeCalls) + 1, claude) : claude;
    const nextTranscribe =
      kind === "transcribe" ? Math.max(readInt(fields.transcribeCalls) + 1, transcribe) : transcribe;
    local.claude = nextClaude;
    local.transcribe = nextTranscribe;

    await firestorePatchDocument(env, `usage_monthly/${docId}`, {
      uid: { stringValue: uid },
      yearMonth: { stringValue: yearMonth },
      claudeCalls: { integerValue: String(nextClaude) },
      transcribeCalls: { integerValue: String(nextTranscribe) },
      totalCalls: { integerValue: String(nextClaude + nextTranscribe) },
      updatedAt: { timestampValue: new Date().toISOString() },
    });
    return nextClaude + nextTranscribe;
  } catch (error) {
    console.error(
      "[plan] 사용량 기록 실패 — 메모리 값으로 판정합니다:",
      error instanceof Error ? error.message : String(error),
    );
    return local.claude + local.transcribe;
  }
}

/** 한도 초과 402 응답 */
function quotaExceededResponse(check: PlanCheck, reason: string, limitKey: "analysis" | "documents" | "calls"): Response {
  return Response.json(
    {
      error: `무료 요금제의 ${reason}을 모두 썼습니다. 다음 달 1일에 다시 열리고, Pro 요금제로 올리면 지금 바로 제한 없이 쓸 수 있습니다.`,
      plan: check.plan,
      code: "QUOTA_EXCEEDED",
      limit: limitKey,
      /** 화면이 링크로 그릴 경로 */
      upgradePath: PLAN_UPGRADE_PATH,
    },
    { status: 402 },
  );
}

/**
 * 사용량 한도를 요구합니다 (AI 분석·음성 변환용).
 * 무료 플랜도 한도 안에서는 통과하고, 초과하면 402를 돌려줍니다.
 *
 * @param kind 호출 종류 — usage_monthly에 claudeCalls/transcribeCalls로 나뉘어 기록된다.
 *             (transcribe.ts에서 "transcribe"를 넘기면 STT 횟수가 따로 집계된다. 생략하면 claude)
 */
export async function requireUsageQuota(
  env: Env,
  uid: string | undefined,
  kind: UsageKind = "claude",
): Promise<Response | null> {
  if (!uid) return null; // 인증은 미들웨어가 이미 처리한다
  const check = await checkPaidPlan(env, uid);

  // 관리자·무제한 플랜은 통과
  if (check.role === "admin" || UNLIMITED_PLANS.includes(check.plan)) return null;
  // 조회 실패(unknown)는 통과 — 설정 문제로 서비스가 멈추지 않게
  if (check.plan === "unknown") return null;

  // 1) 실제 호출 건수 — 사건·문서를 만들지 않는 직접 호출도 여기서 걸린다
  const totalCalls = await recordUsage(env, uid, kind);
  if (totalCalls > FREE_MONTHLY_CALLS) {
    return quotaExceededResponse(check, `이번 달 AI 호출 한도(${FREE_MONTHLY_CALLS}회)`, "calls");
  }

  // 2) 두 축을 함께 본다: 문서 생성(결과물)과 사건 생성(=AI 분석 횟수)
  const [docs, cases] = await Promise.all([
    countMonthly(env, uid, "documents"),
    countMonthly(env, uid, "cases"),
  ]);

  // 완성된 문서가 3건이면 더 못 만든다 (진행 중 문서는 지금 이 호출이 완성시키는 것이라 세지 않는다)
  if (docs.completed >= FREE_MONTHLY_DOCS) {
    return quotaExceededResponse(check, `문서 생성 월 ${FREE_MONTHLY_DOCS}건`, "documents");
  }

  // 사건 5건이면 새 분석은 못 하지만, 이미 시작한 문서(체크포인트 대기)는 끝낼 수 있어야 한다
  if (cases.total >= FREE_MONTHLY_CASES && docs.inProgress === 0) {
    return quotaExceededResponse(check, `사건 분석 월 ${FREE_MONTHLY_CASES}건`, "analysis");
  }

  return null;
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

/** 테스트·문서용으로 한도 상수를 노출 */
export const FREE_QUOTA = {
  docs: FREE_MONTHLY_DOCS,
  cases: FREE_MONTHLY_CASES,
  calls: FREE_MONTHLY_CALLS,
} as const;
