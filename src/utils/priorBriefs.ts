// 같은 사건의 다른 서면을 분석 프롬프트용 "선행 서면 요약"으로 압축하는 유틸
import type { CaseRecord } from "../types/caseRecord";

/** 선행 서면 요약에 넣을 최대 문자 수 (프롬프트 비대화 방지) */
export const PRIOR_BRIEF_BUDGET = 4000;

/**
 * 같은 사건의 다른 파싱 완료 기록들을 "선행 서면 요약"으로 압축한다.
 * 이미 분석된 기록은 분석 주장 요지를, 아니면 파싱 요약(parsedTextSummary)을 사용한다.
 * targetId 기록 자신과 파싱 미완료 기록은 제외한다.
 */
export function buildPriorBriefSummaries(
  records: CaseRecord[],
  targetId: string,
): string {
  const siblings = records.filter(
    (r) => r.id !== targetId && r.ocrStatus === "parsed",
  );
  if (siblings.length === 0) return "";

  const lines: string[] = [];
  let used = 0;

  for (const r of siblings) {
    const header = `[${r.docType} · ${r.submittedBy}]`;
    let body: string;
    if (r.analysis && r.analysis.claims.length > 0) {
      // 분석 완료된 서면: 주장 요지만 모아 압축
      body = r.analysis.claims.map((c) => `· ${c.summary}`).join("\n");
    } else if (r.parsedTextSummary) {
      body = r.parsedTextSummary;
    } else {
      continue;
    }

    const block = `${header}\n${body}`;
    if (used + block.length > PRIOR_BRIEF_BUDGET) {
      const remaining = PRIOR_BRIEF_BUDGET - used;
      if (remaining > header.length + 10) {
        lines.push(`${header}\n${body.slice(0, remaining - header.length - 1)}...`);
      }
      break;
    }
    lines.push(block);
    used += block.length;
  }

  return lines.join("\n\n");
}
