// 개인정보 마스킹 — 가려야 할 것을 가리고, 가리면 안 되는 것은 건드리지 않는지
//
// 이 유틸에서 더 위험한 실패는 "놓치는 것"이 아니라 "멀쩡한 원문을 훼손하는 것"이다.
// 계약일이 2026-**-**로 뭉개진 채 AI에 가면 분석이 통째로 틀어진다.
import { describe, it, expect } from "vitest";
import { maskPII, maskMany } from "../../services/pii-mask";

describe("가려야 하는 것", () => {
  it("주민등록번호 뒷자리를 통째로 가린다", () => {
    const r = maskPII("의뢰인 주민번호 850315-1234567 입니다");
    expect(r.masked).toBe("의뢰인 주민번호 850315-******* 입니다");
    expect(r.counts.주민등록번호).toBe(1);
  });

  it("하이픈 없는 주민번호도 가린다", () => {
    expect(maskPII("9001012345678").masked).toBe("900101-*******");
  });

  it("휴대전화 가운데 자리를 가린다", () => {
    const r = maskPII("연락처: 010-1234-5678 및 01098765432");
    expect(r.masked).toContain("010-****-5678");
    expect(r.masked).toContain("010-****-5432");
    expect(r.masked).not.toContain("010-1234-5678");
    expect(r.counts.휴대전화).toBe(2);
  });

  it("일반전화도 가린다", () => {
    expect(maskPII("사무실 051-714-1515").masked).toBe("사무실 051-****-1515");
  });

  it("이메일은 앞 두 글자만 남긴다", () => {
    const r = maskPII("이메일 hong.gildong@example.com 으로 송달");
    expect(r.masked).toContain("ho***@example.com");
    expect(r.masked).not.toContain("hong.gildong@");
  });

  it("카드번호를 가린다", () => {
    expect(maskPII("카드 1234-5678-9012-3456").masked).toBe("카드 1234-****-****-****");
  });

  it("은행명 뒤의 계좌번호를 가린다", () => {
    const r = maskPII("국민은행 123456-78-901234 로 5,000,000원 송금");
    expect(r.masked).toContain("123*");
    expect(r.masked).not.toContain("901234");
    expect(r.masked).toContain("5,000,000원");
  });

  it("은행명이 없어도 자릿수가 계좌 형식이면 가린다", () => {
    const r = maskPII("입금계좌 110-234-567890 (신한)");
    expect(r.masked).not.toContain("567890");
    expect(r.counts.계좌번호).toBeGreaterThan(0);
  });

  it("여권번호를 가린다", () => {
    expect(maskPII("여권 M12345678").masked).toBe("여권 M1*******");
  });

  it("한 문장에 섞여 있어도 모두 가린다", () => {
    const r = maskPII("피고 김철수(900215-2345678, 010-2222-3333, kim@test.co.kr)");
    expect(r.masked).toContain("900215-*******");
    expect(r.masked).toContain("010-****-3333");
    expect(r.masked).toContain("ki***@test.co.kr");
    expect(r.total).toBe(3);
  });
});

describe("건드리면 안 되는 것", () => {
  it("ISO 날짜를 계좌번호로 오인하지 않는다", () => {
    const src = "계약일 2026-09-19, 변제기 2026-12-31";
    const r = maskPII(src);
    expect(r.masked).toBe(src);
    expect(r.total).toBe(0);
  });

  it("사건번호·조문·금액·날짜를 그대로 둔다", () => {
    const src =
      "대법원 2017. 11. 29. 선고 2017다241819 판결, 민법 제750조, 청구금액 10,000,000원";
    const r = maskPII(src);
    expect(r.masked).toBe(src);
    expect(r.total).toBe(0);
  });

  it("사건번호 형식의 하이픈 문자열을 그대로 둔다", () => {
    const src = "사건번호 2024-가단-12345";
    expect(maskPII(src).masked).toBe(src);
  });

  it("빈 값은 그대로 돌려준다", () => {
    expect(maskPII("").masked).toBe("");
    expect(maskPII(undefined).total).toBe(0);
    expect(maskPII(null).masked).toBe("");
  });
});

describe("maskMany", () => {
  it("여러 텍스트를 한 번에 가리고 합계를 낸다", () => {
    const r = maskMany("주민번호 850315-1234567", undefined, "전화 010-1111-2222");
    expect(r.texts[0]).toContain("850315-*******");
    expect(r.texts[1]).toBe("");
    expect(r.texts[2]).toContain("010-****-2222");
    expect(r.total).toBe(2);
  });
});
