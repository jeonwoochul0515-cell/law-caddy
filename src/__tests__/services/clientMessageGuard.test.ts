// 의뢰인에게 나가는 문자 검사기
//
// 이 문자는 되돌릴 수 없다. 한 번 나가면 의뢰인 휴대폰에 남고, 기대가 만들어지고,
// 결과가 다르면 직업 상 책임으로 돌아온다. 그래서 무엇을 "경고만" 하고 무엇을
// "막을지"의 기준이 이 파일의 핵심이다.
import { describe, it, expect } from "vitest";
import {
  checkClientMessage,
  hasBlockingWarning,
  buildSignature,
  appendSignature,
} from "../../services/clientMessageGuard";

/** 본문을 검사해 발송이 막히는지 */
function blocked(text: string): boolean {
  return hasBlockingWarning(checkClientMessage(text));
}

describe("발송을 막는 것", () => {
  it("승패를 단정하면 막는다", () => {
    expect(blocked("이 사건은 승소합니다.")).toBe(true);
    expect(blocked("반드시 이기실 수 있습니다.")).toBe(true);
    expect(blocked("결과는 보장합니다.")).toBe(true);
  });

  it("금액을 단정하면 막는다", () => {
    expect(blocked("보증금 5,000만원을 돌려받으실 수 있습니다.")).toBe(true);
  });

  it("AI·자동 처리를 언급하면 막는다", () => {
    expect(blocked("AI가 분석한 결과입니다.")).toBe(true);
    expect(blocked("에이전트가 검토했습니다.")).toBe(true);
    expect(blocked("자동 생성된 안내입니다.")).toBe(true);
  });
});

describe("경고만 하고 막지는 않는 것", () => {
  it("작업량 숫자는 확인만 받는다 — 실제로 센 값일 수도 있다", () => {
    const warnings = checkClientMessage("판례 12건을 검토했습니다.");
    expect(warnings.some((w) => w.kind === "fabricated_number")).toBe(true);
    expect(hasBlockingWarning(warnings)).toBe(false);
  });
});

describe("통과해야 하는 것", () => {
  it("여지를 남긴 표현은 막지 않는다", () => {
    expect(blocked("판례에 비추어 청구가 인정될 여지가 있습니다.")).toBe(false);
    expect(blocked("상황에 따라 결과가 달라질 수 있습니다.")).toBe(false);
  });

  it("사실 전달은 막지 않는다", () => {
    expect(blocked("9월 30일에 첫 변론기일이 잡혔습니다. 법원은 부산지방법원입니다.")).toBe(false);
    expect(blocked("소장을 접수했습니다. 접수증을 첨부합니다.")).toBe(false);
  });

  it("빈 본문은 경고가 없다", () => {
    expect(checkClientMessage("")).toEqual([]);
  });
});

describe("경고 내용", () => {
  it("걸린 표현과 고칠 방향을 함께 알려준다", () => {
    const [w] = checkClientMessage("승소합니다");
    expect(w.matched).toContain("승소");
    expect(w.reason).toMatch(/바꿔/);
  });
});

describe("서명", () => {
  it("사무소·변호사·연락처를 한 줄로 만든다", () => {
    expect(
      buildSignature({ firmName: "청송law", lawyerName: "김창희", phone: "051-714-1515" }),
    ).toBe("청송law 김창희 변호사 · 051-714-1515");
  });

  it("정보가 없으면 빈 문자열", () => {
    expect(buildSignature({})).toBe("");
  });

  it("본문 끝에 붙인다", () => {
    const out = appendSignature("안내드립니다.", {
      firmName: "청송law",
      lawyerName: "김창희",
      phone: "051-714-1515",
    });
    expect(out).toContain("안내드립니다.");
    expect(out.trimEnd().endsWith("051-714-1515")).toBe(true);
  });

  it("이미 연락처가 들어 있으면 또 붙이지 않는다", () => {
    const body = "문의는 051-714-1515로 주세요.";
    expect(appendSignature(body, { firmName: "청송law", phone: "051-714-1515" })).toBe(body);
  });
});
