// 단건 결제 기반으로 전환하며 Subscription(자동갱신 구독) 타입은 제거됨.
// 현재 플랜 상태는 users.plan + users.planExpiresAt 로 관리한다.

export interface PlanLimits {
  recordings: number; // -1 = unlimited
  documents: number;  // -1 = unlimited
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { recordings: 0, documents: 0 },
  starter: { recordings: 5, documents: 3 },
  pro: { recordings: -1, documents: -1 },
  team: { recordings: -1, documents: -1 },
};
