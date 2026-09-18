// 요금제 한도·표기 상수 — 화면(usePlanLimits·PlanSelector·UsageSummary)과 서버(plan.ts)가 같은 숫자·이름을 쓴다.
// 단건 결제 기반으로 전환하며 Subscription(자동갱신 구독) 타입은 제거됨.
// 현재 플랜 상태는 users.plan + users.planExpiresAt 로 관리한다.

export interface PlanLimits {
  recordings: number; // -1 = unlimited  (화면·서버 모두 "사건 분석" 횟수로 쓴다)
  documents: number;  // -1 = unlimited
}

// (2026-07-31) Starter를 무료로 개방 — 가입하면 바로 월 5건 사건 분석·3건 문서를 쓸 수 있다.
// free와 starter는 같은 한도를 갖는다(기존 starter 결제자 보호 목적으로 키는 남겨둔다).
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { recordings: 5, documents: 3 },
  starter: { recordings: 5, documents: 3 },
  pro: { recordings: -1, documents: -1 },
  team: { recordings: -1, documents: -1 },
};

/**
 * 무료 한도의 이름 — 화면 어디서든 이 문구를 쓴다.
 * (2026-09-11) 카드는 "녹음", 사용량은 "사건 분석", 오류는 "사건 분석"으로 제각각이던 것을 통일.
 * 실제로 세는 값은 이번 달 만든 사건 수(=AI 분석 횟수)와 완성된 문서 수다.
 */
export const FREE_LIMIT_LABELS = {
  analysis: "사건 분석",
  documents: "문서 생성",
  /** 한도가 초기화되는 기준 — 달력 월 1일 00:00 (한국 시간) */
  period: "매월 1일 초기화 (달력 월 기준)",
} as const;

/** 요금제 화면으로 가는 경로 — 배너·오류 안내·문자에서 같은 주소를 쓴다 (SettingsPage가 ?tab=plan을 읽는다) */
export const PLAN_UPGRADE_PATH = "/settings?tab=plan";

/** 유료 전용 기능(문자 발송)을 무료 사용자에게 안내할 때 쓰는 문구 */
export const PAID_ONLY_MESSAGE = "문자 발송은 Pro 요금제에서 쓸 수 있습니다.";

/** 요금제 표시 이름 */
export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Starter (무료)",
  starter: "Starter (무료)",
  pro: "Pro",
  team: "Team",
};

/** planExpiresAt(밀리초)을 반영한 실질 플랜 — 만료되면 free. 만료일이 없으면 만료 없음(관리자 수동 부여 보호) */
export function resolveEffectivePlan(rawPlan: string | undefined, expiresAtMs: number | null | undefined, nowMs = Date.now()): string {
  const expired = typeof expiresAtMs === "number" && expiresAtMs < nowMs;
  return expired ? "free" : (rawPlan ?? "free");
}
