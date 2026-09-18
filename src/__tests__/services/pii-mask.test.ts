// 민감정보 마스킹 검증 — 주민번호·계좌번호는 가리고 금액·날짜·사건번호는 건드리지 않는지
import { describe, it, expect } from "vitest";
import { maskSensitiveText } from "../../services/pii-mask";

describe("maskSensitiveText", () => {
  it("주민등록번호 뒷자리를 가린다", () => {
    const r = maskSensitiveText("의뢰인 주민번호 850315-1234567 입니다");
    expect(r.text).toBe("의뢰인 주민번호 850315-******* 입니다");
    expect(r.count).toBe(1);
  });

  it("하이픈 없는 주민번호도 가린다", () => {
    const r = maskSensitiveText("9001012345678");
    expect(r.text).toBe("900101-*******");
  });

  it("계좌번호는 은행명 뒤에 올 때만 가린다", () => {
    const r = maskSensitiveText("국민은행 123456-78-901234 로 5,000,000원 송금");
    expect(r.text).toContain("123*");
    expect(r.text).not.toContain("901234");
    expect(r.text).toContain("5,000,000원");
  });

  it("카드번호를 가린다", () => {
    const r = maskSensitiveText("카드 1234-5678-9012-3456");
    expect(r.text).toBe("카드 1234-****-****-****");
  });

  it("사건번호·날짜·금액은 그대로 둔다", () => {
    const src = "대법원 2017. 11. 29. 선고 2017다241819 판결, 2026. 4. 12. 금 500만 원";
    const r = maskSensitiveText(src);
    expect(r.text).toBe(src);
    expect(r.count).toBe(0);
  });

  it("빈 값은 그대로 돌려준다", () => {
    expect(maskSensitiveText("").text).toBe("");
    expect(maskSensitiveText(undefined).count).toBe(0);
  });
});
