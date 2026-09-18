// AI로 나가는 컨텍스트에서 무엇을 가리고 무엇을 남기는지
//
// 여기서 지키는 경계가 변호사법 제26조다. 프롬프트에 "응답에 개인정보를 쓰지 말라"고
// 적은 것은 출력 규칙일 뿐이라 입력은 원문 그대로 나가고 있었다. 이 함수가 그 앞에 선다.
import { describe, it, expect } from "vitest";
import { maskAgentContext } from "../../services/pii-mask";

const 전사문 =
  "변호사: 성함이 어떻게 되시죠?\n의뢰인: 김철수입니다. 주민번호는 850315-1234567이고 연락처는 010-1234-5678입니다.";

describe("에이전트 컨텍스트 마스킹", () => {
  it("전사문의 주민번호·연락처를 가린다", () => {
    const { context, total } = maskAgentContext({ transcript: 전사문 });
    expect(context.transcript).not.toContain("850315-1234567");
    expect(context.transcript).not.toContain("010-1234-5678");
    expect(context.transcript).toContain("850315-*******");
    expect(total).toBe(2);
  });

  it("사건 설명·이전 전사문·첨부 텍스트를 모두 거친다", () => {
    const { context, total } = maskAgentContext({
      caseDesc: "피고 연락처 010-1111-2222",
      previousTranscripts: "지난 상담에서 kim@test.com 을 알려 주셨습니다",
      fileContents: "계좌 110-234-567890",
      transcript: "",
    });
    expect(context.caseDesc).toContain("010-****-2222");
    expect(context.previousTranscripts).toContain("ki***@test.com");
    expect(context.fileContents).not.toContain("567890");
    expect(total).toBe(3);
  });

  it("의뢰인 이름과 변호사 프로필은 건드리지 않는다 — 서면에 실제로 들어가는 값이다", () => {
    const input = {
      clientName: "김철수",
      lawyerName: "이변호",
      firmName: "법률사무소 청송law",
      lawyerPhone: "051-714-1515",
      caseDesc: "임대차 보증금 반환",
    };
    const { context, total } = maskAgentContext(input);
    expect(context.clientName).toBe("김철수");
    expect(context.lawyerName).toBe("이변호");
    expect(context.firmName).toBe("법률사무소 청송law");
    expect(context.lawyerPhone).toBe("051-714-1515");
    expect(total).toBe(0);
  });

  it("원본 객체를 바꾸지 않는다", () => {
    const original = { transcript: 전사문 };
    maskAgentContext(original);
    expect(original.transcript).toContain("850315-1234567");
  });

  it("두 번 거쳐도 결과가 같다 — 경로가 겹쳐도 안전하다", () => {
    const once = maskAgentContext({ transcript: 전사문 });
    const twice = maskAgentContext(once.context);
    expect(twice.context.transcript).toBe(once.context.transcript);
    expect(twice.total).toBe(0);
  });

  it("빈 컨텍스트는 그대로 둔다", () => {
    const { context, total } = maskAgentContext({ caseDesc: "", transcript: undefined });
    expect(context.caseDesc).toBe("");
    expect(context.transcript).toBeUndefined();
    expect(total).toBe(0);
  });
});
