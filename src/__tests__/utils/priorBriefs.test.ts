// 선행 서면 요약 압축 유틸 테스트
import { describe, it, expect } from "vitest";
import { buildPriorBriefSummaries, PRIOR_BRIEF_BUDGET } from "../../utils/priorBriefs";
import type { CaseRecord } from "../../types/caseRecord";
import type { Timestamp } from "firebase/firestore";

const ts = { seconds: 0, nanoseconds: 0 } as unknown as Timestamp;

function rec(partial: Partial<CaseRecord>): CaseRecord {
  return {
    id: "r1",
    caseId: "c1",
    ownerId: "u1",
    docType: "준비서면",
    submittedBy: "원고",
    fileName: "f.pdf",
    storageUrl: "gs://x",
    fileSizeMB: 1,
    ocrStatus: "parsed",
    maskedPII: true,
    uploadedAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

describe("buildPriorBriefSummaries", () => {
  it("대상 기록 자신은 제외한다", () => {
    const records = [
      rec({ id: "target", parsedTextSummary: "내 요약" }),
      rec({ id: "other", docType: "소장", parsedTextSummary: "상대 소장 요약" }),
    ];
    const result = buildPriorBriefSummaries(records, "target");
    expect(result).toContain("상대 소장 요약");
    expect(result).not.toContain("내 요약");
  });

  it("파싱 미완료 기록은 제외한다", () => {
    const records = [
      rec({ id: "a", ocrStatus: "pending", parsedTextSummary: "대기중" }),
      rec({ id: "b", ocrStatus: "parsed", parsedTextSummary: "완료됨" }),
    ];
    const result = buildPriorBriefSummaries(records, "target");
    expect(result).toContain("완료됨");
    expect(result).not.toContain("대기중");
  });

  it("분석 완료 기록은 주장 요지를 사용한다", () => {
    const records = [
      rec({
        id: "analyzed",
        docType: "답변서",
        submittedBy: "피고",
        parsedTextSummary: "원문 요약(사용 안 됨)",
        analysis: {
          claims: [
            { index: 1, summary: "계약은 무효다", citation: "x", basis: "", weakness: "", rebuttalPoint: "" },
            { index: 2, summary: "시효가 지났다", citation: "y", basis: "", weakness: "", rebuttalPoint: "" },
          ],
          rebuttalOutline: [],
          suggestedPrecedents: [],
          generatedAt: ts,
        },
      }),
    ];
    const result = buildPriorBriefSummaries(records, "target");
    expect(result).toContain("[답변서 · 피고]");
    expect(result).toContain("· 계약은 무효다");
    expect(result).toContain("· 시효가 지났다");
    expect(result).not.toContain("원문 요약(사용 안 됨)");
  });

  it("형제 기록이 없으면 빈 문자열", () => {
    expect(buildPriorBriefSummaries([rec({ id: "target" })], "target")).toBe("");
    expect(buildPriorBriefSummaries([], "target")).toBe("");
  });

  it("예산을 초과하면 잘라내고 중단한다", () => {
    const big = "가".repeat(3000);
    const records = [
      rec({ id: "a", parsedTextSummary: big }),
      rec({ id: "b", parsedTextSummary: big }),
      rec({ id: "c", parsedTextSummary: big }),
    ];
    const result = buildPriorBriefSummaries(records, "target");
    expect(result.length).toBeLessThanOrEqual(PRIOR_BRIEF_BUDGET + 50);
    expect(result).toContain("...");
  });
});
