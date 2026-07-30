// 단건 결제 기반으로 전환하며 Subscription(자동갱신 구독) 타입은 제거됨.
// 현재 플랜 상태는 users.plan + users.planExpiresAt 로 관리한다.

export interface PlanLimits {
  recordings: number; // -1 = unlimited
  documents: number;  // -1 = unlimited
}

// (2026-07-31) Starter를 무료로 개방 — 가입하면 바로 월 5건 녹음·3건 문서를 쓸 수 있다.
// free와 starter는 같은 한도를 갖는다(기존 starter 결제자 보호 목적으로 키는 남겨둔다).
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { recordings: 5, documents: 3 },
  starter: { recordings: 5, documents: 3 },
  pro: { recordings: -1, documents: -1 },
  team: { recordings: -1, documents: -1 },
};
