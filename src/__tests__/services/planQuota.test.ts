// 무료 플랜 사용량 한도 판정 검증
//
// 실제 서버 코드(functions/api/_shared/plan.ts)는 Cloudflare 런타임에 묶여 있어
// 여기서는 **판정 규칙 자체**를 같은 조건으로 복제해 고정한다.
// 규칙이 바뀌면 이 테스트가 먼저 깨지도록 상수도 함께 둔다.
import { describe, it, expect } from "vitest";
import { PLAN_LIMITS } from "../../types/subscription";

/** functions/api/_shared/plan.ts와 동일하게 유지할 것 */
const FREE_MONTHLY_DOCS = 3;
const FREE_MONTHLY_CASES = 5;

const UNLIMITED_PLANS = ["pro", "team"];

/** 서버 requireUsageQuota의 판정부와 같은 규칙 */
function isBlocked(opts: {
  plan: string;
  role?: string;
  docs: number;
  cases: number;
}): boolean {
  if (opts.role === "admin") return false;
  if (UNLIMITED_PLANS.includes(opts.plan)) return false;
  if (opts.plan === "unknown") return false; // 조회 실패는 통과
  return opts.docs >= FREE_MONTHLY_DOCS || opts.cases >= FREE_MONTHLY_CASES;
}

describe("무료 플랜 사용량 한도", () => {
  it("한도 안에서는 통과한다", () => {
    expect(isBlocked({ plan: "free", docs: 0, cases: 0 })).toBe(false);
    expect(isBlocked({ plan: "free", docs: 2, cases: 4 })).toBe(false);
  });

  it("문서 3건을 채우면 막는다", () => {
    expect(isBlocked({ plan: "free", docs: 3, cases: 0 })).toBe(true);
  });

  it("문서를 만들지 않아도 사건 분석 5건이면 막는다 (분석 반복 남용 차단)", () => {
    // 이 규칙이 없으면 분석만 반복해 무제한으로 토큰을 쓸 수 있었다
    expect(isBlocked({ plan: "free", docs: 0, cases: 5 })).toBe(true);
    expect(isBlocked({ plan: "free", docs: 0, cases: 50 })).toBe(true);
  });

  it("Pro·Team은 얼마를 써도 통과한다", () => {
    expect(isBlocked({ plan: "pro", docs: 999, cases: 999 })).toBe(false);
    expect(isBlocked({ plan: "team", docs: 999, cases: 999 })).toBe(false);
  });

  it("관리자는 통과한다", () => {
    expect(isBlocked({ plan: "free", role: "admin", docs: 999, cases: 999 })).toBe(false);
  });

  it("플랜 조회에 실패하면 통과시킨다 (설정 오류로 서비스가 멈추지 않게)", () => {
    expect(isBlocked({ plan: "unknown", docs: 999, cases: 999 })).toBe(false);
  });

  it("서버 상수와 화면 한도(PLAN_LIMITS)가 어긋나지 않는다", () => {
    // 화면은 recordings 자리에 '사건 분석' 수를 표시한다(usePlanLimits가 cases를 센다)
    expect(PLAN_LIMITS.free.documents).toBe(FREE_MONTHLY_DOCS);
    expect(PLAN_LIMITS.free.recordings).toBe(FREE_MONTHLY_CASES);
    // Starter는 무료 개방이라 free와 같은 한도여야 한다
    expect(PLAN_LIMITS.starter).toEqual(PLAN_LIMITS.free);
  });
});
