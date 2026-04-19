// 사건 기반 AI 어시스턴트
// 사건의 모든 자료(메타·녹음·문서·사건기록·재무·타임라인)를 큰 텍스트 블록으로 직렬화하고
// Prompt Caching 의 sharedPrefix 로 활용한다. 같은 사건에 5분 내 연속 질문 시 input 비용 90% 할인.
//
// 본 어댑터는 "데이터 수집 + 직렬화" 만 담당하고, 호출은 callClaudeChat 측에서 수행.

import type { Case } from "../types/case";
import type { Recording } from "../types/recording";
import type { LegalDocument } from "../types/document";
import type { CaseRecord } from "../types/caseRecord";
import type { Fee, Installment, CaseExpense, Deposit } from "../types/accounting";

/**
 * 사건 컨텍스트 직렬화 결과.
 * - prefix: Prompt Caching 대상이 되는 큰 자료 묶음 (안정적, 5분간 캐시)
 * - meta: 캐시 효과 모니터링용 메타 (토큰 추정 등)
 */
export interface CaseAssistantContext {
  prefix: string;
  meta: {
    sourceCount: number;       // 포함된 자료 개수 (녹음+문서+기록+재무 합)
    approxChars: number;       // prefix 글자 수 (토큰 ≈ 글자 수 / 2~3)
    truncated: boolean;        // 어떤 자료라도 절단됐으면 true
  };
}

/**
 * 직렬화 시 적용할 자료별 최대 글자 수.
 * 1M context 모델이라 여유 있지만, 캐시 hit 효율과 응답 속도를 위해 적정선 설정.
 */
const LIMITS = {
  /** 녹음 transcript 1건당 최대 (긴 상담은 잘림) */
  RECORDING: 8000,
  /** 작성된 문서 1건당 최대 */
  DOCUMENT: 5000,
  /** 사건기록 parsedText 1건당 최대 */
  CASE_RECORD: 6000,
  /** 자료별 처리 갯수 상한 (가장 최근 N건) */
  COUNT_PER_TYPE: 20,
} as const;

interface BuildContextInput {
  caseData: Case;
  recordings?: Recording[];
  documents?: LegalDocument[];
  caseRecords?: CaseRecord[];
  fee?: Fee | null;
  installments?: Installment[];
  caseExpenses?: CaseExpense[];
  deposits?: Deposit[];
}

/**
 * 사건의 모든 자료를 큰 텍스트 블록으로 직렬화한다.
 * 출력은 마크다운 섹션 구조 — Claude 가 섹션별로 인용·참조하기 편하도록.
 */
export function buildCaseAssistantContext(
  input: BuildContextInput,
): CaseAssistantContext {
  const sections: string[] = [];
  let truncated = false;
  let sourceCount = 0;

  // 1. 사건 기본정보
  sections.push(formatCaseBasics(input.caseData));

  // 2. 타임라인
  if (input.caseData.timeline && input.caseData.timeline.length > 0) {
    sections.push(formatTimeline(input.caseData.timeline));
  }

  // 3. 상담 녹음 (transcript 가 있는 것만)
  const recordings = (input.recordings ?? [])
    .filter((r) => r.transcript && r.transcript.trim().length > 0)
    .slice(0, LIMITS.COUNT_PER_TYPE);
  if (recordings.length > 0) {
    const { text, anyTruncated } = formatRecordings(recordings);
    sections.push(text);
    sourceCount += recordings.length;
    if (anyTruncated) truncated = true;
  }

  // 4. 작성된 법률 문서
  const documents = (input.documents ?? []).slice(0, LIMITS.COUNT_PER_TYPE);
  if (documents.length > 0) {
    const { text, anyTruncated } = formatDocuments(documents);
    sections.push(text);
    sourceCount += documents.length;
    if (anyTruncated) truncated = true;
  }

  // 5. 사건기록 (parsedText 있는 것만)
  const caseRecords = (input.caseRecords ?? [])
    .filter((r) => r.ocrStatus === "parsed" && r.parsedText)
    .slice(0, LIMITS.COUNT_PER_TYPE);
  if (caseRecords.length > 0) {
    const { text, anyTruncated } = formatCaseRecords(caseRecords);
    sections.push(text);
    sourceCount += caseRecords.length;
    if (anyTruncated) truncated = true;
  }

  // 6. 재무 (수임료·경비·예수금)
  const finance = formatFinance(input.fee, input.installments, input.caseExpenses, input.deposits);
  if (finance) {
    sections.push(finance);
    sourceCount += 1;
  }

  const prefix = sections.join("\n\n");

  return {
    prefix,
    meta: {
      sourceCount,
      approxChars: prefix.length,
      truncated,
    },
  };
}

// ──────────────────────────────────────────────
// 섹션 포매터
// ──────────────────────────────────────────────

function formatCaseBasics(c: Case): string {
  const lines = [
    "# 사건 기본정보",
    `- 사건ID: ${c.id}`,
    `- 의뢰인: ${c.clientName}`,
    `- 사건유형: ${c.caseType}`,
    `- 진행상태: ${c.status}`,
    `- 사건개요: ${c.description || "(미입력)"}`,
  ];
  return lines.join("\n");
}

function formatTimeline(timeline: NonNullable<Case["timeline"]>): string {
  const items = timeline
    .slice()
    .sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0))
    .map((e) => {
      const dateStr = e.date?.toDate?.()
        ? e.date.toDate().toISOString().slice(0, 10)
        : "?";
      return `- [${dateStr}] (${e.type}) ${e.label} — ${e.detail || ""}`.trim();
    });
  return ["# 사건 타임라인", ...items].join("\n");
}

function formatRecordings(recordings: Recording[]): { text: string; anyTruncated: boolean } {
  let anyTruncated = false;
  const blocks = recordings.map((r, idx) => {
    const original = r.transcript ?? "";
    const trimmed = original.length > LIMITS.RECORDING
      ? original.slice(0, LIMITS.RECORDING) + `\n... (이하 ${original.length - LIMITS.RECORDING}자 생략)`
      : original;
    if (original.length > LIMITS.RECORDING) anyTruncated = true;
    const dateStr = r.createdAt?.toDate?.()
      ? r.createdAt.toDate().toISOString().slice(0, 10)
      : "?";
    return [
      `## 녹음 ${idx + 1} — ${r.fileName} (${dateStr})`,
      trimmed,
    ].join("\n");
  });
  return { text: ["# 상담 녹음 대화록", ...blocks].join("\n\n"), anyTruncated };
}

function formatDocuments(documents: LegalDocument[]): { text: string; anyTruncated: boolean } {
  let anyTruncated = false;
  const blocks = documents.map((d, idx) => {
    const body = d.finalDocument ?? "";
    const trimmed = body.length > LIMITS.DOCUMENT
      ? body.slice(0, LIMITS.DOCUMENT) + `\n... (이하 ${body.length - LIMITS.DOCUMENT}자 생략)`
      : body;
    if (body.length > LIMITS.DOCUMENT) anyTruncated = true;
    return [
      `## 문서 ${idx + 1} — ${d.docType}`,
      trimmed || "(본문 없음)",
    ].join("\n");
  });
  return { text: ["# 작성된 법률 문서", ...blocks].join("\n\n"), anyTruncated };
}

function formatCaseRecords(records: CaseRecord[]): { text: string; anyTruncated: boolean } {
  let anyTruncated = false;
  const blocks = records.map((r, idx) => {
    const body = r.parsedText ?? "";
    const trimmed = body.length > LIMITS.CASE_RECORD
      ? body.slice(0, LIMITS.CASE_RECORD) + `\n... (이하 ${body.length - LIMITS.CASE_RECORD}자 생략)`
      : body;
    if (body.length > LIMITS.CASE_RECORD) anyTruncated = true;

    // 분석 결과 임베드가 있으면 요약 포함 — 별도 섹션이 아닌 카드 형태로 간단히
    const analysisLine = r.analysis
      ? `\n[AI 분석 요약] 주장 ${r.analysis.claims.length}개 / 판례 제안 ${r.analysis.suggestedPrecedents.length}건`
      : "";

    return [
      `## 사건기록 ${idx + 1} — ${r.docType} (${r.submittedBy}) — ${r.fileName}`,
      `제출일: ${r.submittedAt ?? "(미상)"}${analysisLine}`,
      "",
      trimmed,
    ].join("\n");
  });
  return { text: ["# 사건기록 (전자소송 PDF)", ...blocks].join("\n\n"), anyTruncated };
}

function formatFinance(
  fee?: Fee | null,
  installments?: Installment[],
  expenses?: CaseExpense[],
  deposits?: Deposit[],
): string | null {
  const lines: string[] = [];
  if (fee) {
    lines.push(`- 수임료 합계: ${fee.totalAgreedAmount?.toLocaleString() ?? "?"}원, 납부 ${fee.totalPaidAmount?.toLocaleString() ?? "0"}원, 잔액 ${fee.totalOutstanding?.toLocaleString() ?? "?"}원, 상태=${fee.status ?? "?"}`);
  }
  if (installments && installments.length > 0) {
    lines.push(`- 분할납부 ${installments.length}건 (납부완료 ${installments.filter((i) => i.paid).length}건)`);
  }
  if (expenses && expenses.length > 0) {
    const total = expenses.reduce((a, e) => a + (e.amount ?? 0), 0);
    lines.push(`- 사건비용 ${expenses.length}건, 합계 ${total.toLocaleString()}원`);
  }
  if (deposits && deposits.length > 0) {
    const total = deposits.reduce((a, d) => a + (d.amount ?? 0), 0);
    lines.push(`- 예수금 ${deposits.length}건, 합계 ${total.toLocaleString()}원`);
  }
  if (lines.length === 0) return null;
  return ["# 재무 현황", ...lines].join("\n");
}
