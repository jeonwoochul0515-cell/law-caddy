// 개인정보 마스킹 유틸 테스트 — 사건기록 가드레일 핵심 검증
import { describe, it, expect } from "vitest";
import { maskPII } from "../../utils/piiMask";

describe("maskPII", () => {
  it("주민등록번호를 마스킹한다", () => {
    const { masked, counts } = maskPII("원고 홍길동(850101-1234567)은 피고에게");
    expect(masked).toContain("850101-1******");
    expect(masked).not.toContain("1234567");
    expect(counts["주민등록번호"]).toBe(1);
  });

  it("휴대전화번호를 마스킹한다", () => {
    const { masked } = maskPII("연락처: 010-1234-5678 및 01098765432");
    expect(masked).toContain("010-****-5678");
    expect(masked).toContain("010-****-5432");
    expect(masked).not.toContain("010-1234-5678");
  });

  it("이메일을 부분 마스킹한다", () => {
    const { masked } = maskPII("이메일 hong.gildong@example.com 으로 송달");
    expect(masked).toContain("ho***@example.com");
    expect(masked).not.toContain("hong.gildong@");
  });

  it("계좌번호 추정 패턴을 마스킹한다", () => {
    const { masked, counts } = maskPII("입금계좌 110-234-567890 (신한)");
    expect(masked).toContain("110-***-******");
    expect(counts["계좌번호"]).toBe(1);
  });

  it("사건번호·법조문·금액은 건드리지 않는다", () => {
    const src =
      "대법원 2020다12345 판결, 민법 제750조, 청구금액 10,000,000원, 2026. 3. 2. 소장 송달";
    const { masked, total } = maskPII(src);
    expect(masked).toBe(src);
    expect(total).toBe(0);
  });

  it("여러 패턴이 섞여 있어도 각각 정확히 마스킹한다", () => {
    const src =
      "피고 김철수(900215-2345678, 010-2222-3333, kim@test.co.kr)는 계좌 3333-04-1234567로";
    const { masked, total } = maskPII(src);
    expect(masked).toContain("900215-2******");
    expect(masked).toContain("010-****-3333");
    expect(masked).toContain("ki***@test.co.kr");
    expect(total).toBeGreaterThanOrEqual(4);
  });
});
