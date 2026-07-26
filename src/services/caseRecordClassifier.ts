// 사건기록 자동 분류기
// 1차: 파일명 휴리스틱 (즉시, 무료)
// 2차: 파싱된 본문 기반 LLM 분류 — docType="기타" 또는 submittedBy="미상" 인 경우만 호출
//
// 전자소송에서 다운받는 PDF는 파일명이 상당히 규칙적이라 1차만으로도 약 80~90% 분류 가능.
// 남은 "기타/미상" 건만 LLM이 본문 첫 2000자를 보고 재분류한다.

import type { CaseType } from "../types/agent";
import type { RecordDocType, RecordSubmittedBy } from "../types/caseRecord";
import { callClaude } from "./claude";
import { buildCaseRecordClassifyPrompt } from "./prompts";

/**
 * 문서 유형 추정을 위한 파일명 키워드 매핑.
 * 우선순위는 배열 순서대로 — 먼저 매칭되는 유형을 채택.
 * "갑제N호증", "을제N호증" 같은 증거 표기는 별도 정규식으로 처리한다.
 */
const DOC_TYPE_KEYWORDS: Array<{ type: RecordDocType; patterns: RegExp[] }> = [
  { type: "소장", patterns: [/소\s*장/] },
  { type: "답변서", patterns: [/답\s*변\s*서/] },
  { type: "준비서면", patterns: [/준\s*비\s*서\s*면/] },
  {
    type: "증거",
    patterns: [
      /갑\s*제?\s*\d+\s*호\s*증/,
      /을\s*제?\s*\d+\s*호\s*증/,
      /서\s*증/,
      /증\s*거/,
    ],
  },
  { type: "판결문", patterns: [/판\s*결/] },
  { type: "결정문", patterns: [/결\s*정/] },
];

/** 제출자 추정 키워드 */
const SUBMITTED_BY_KEYWORDS: Array<{ by: RecordSubmittedBy; patterns: RegExp[] }> = [
  // 법원 송부 문서: 판결·결정·명령 등
  { by: "법원", patterns: [/판\s*결/, /결\s*정/, /명\s*령/, /기\s*일\s*통\s*지/] },
  // "갑제N호증" → 원고 측 증거 / "을제N호증" → 피고 측 증거
  { by: "원고", patterns: [/갑\s*제?\s*\d+\s*호\s*증/, /원\s*고/] },
  { by: "피고", patterns: [/을\s*제?\s*\d+\s*호\s*증/, /피\s*고/] },
];

/** 분류 결과 — 휴리스틱 확신도(0~1) 함께 반환해 UI에서 회색 처리 여부 판단 */
export interface ClassificationResult {
  docType: RecordDocType;
  submittedBy: RecordSubmittedBy;
  /** 0: 미확정(기타/미상), 0.5: 한쪽만 확정, 1: 양쪽 확정 */
  confidence: 0 | 0.5 | 1;
}

/**
 * 파일명을 기반으로 문서 유형·제출자를 추정한다.
 * 확장자와 타임스탬프 접두사를 제거한 후 정규식을 돌린다.
 */
export function classifyByFileName(fileName: string): ClassificationResult {
  // 앞쪽 타임스탬프(`1744...`), 확장자 제거
  const base = fileName
    .replace(/^\d{10,}[_\- ]+/, "")
    .replace(/\.[^.]+$/, "");

  const docType = detectDocType(base);
  const submittedBy = detectSubmittedBy(base);

  const confidence: 0 | 0.5 | 1 =
    docType !== "기타" && submittedBy !== "미상"
      ? 1
      : docType !== "기타" || submittedBy !== "미상"
        ? 0.5
        : 0;

  return { docType, submittedBy, confidence };
}

function detectDocType(name: string): RecordDocType {
  for (const { type, patterns } of DOC_TYPE_KEYWORDS) {
    if (patterns.some((p) => p.test(name))) return type;
  }
  return "기타";
}

function detectSubmittedBy(name: string): RecordSubmittedBy {
  for (const { by, patterns } of SUBMITTED_BY_KEYWORDS) {
    if (patterns.some((p) => p.test(name))) return by;
  }
  return "미상";
}

/**
 * 현재 분류가 기본값("기타"/"미상")이면 true — LLM 보정 트리거 조건.
 */
export function needsLLMRefinement(
  docType: RecordDocType,
  submittedBy: RecordSubmittedBy,
): boolean {
  return docType === "기타" || submittedBy === "미상";
}

const VALID_DOC_TYPES: RecordDocType[] = [
  "소장",
  "답변서",
  "준비서면",
  "증거",
  "결정문",
  "판결문",
  "기타",
];

const VALID_SUBMITTED_BY: RecordSubmittedBy[] = [
  "원고",
  "피고",
  "법원",
  "기타",
  "미상",
];

/**
 * Claude 응답 문자열에서 첫 JSON 객체를 추출해 파싱한다.
 */
function extractAndParse(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) return null;
  try {
    return JSON.parse(raw.slice(first, last + 1));
  } catch {
    return null;
  }
}

/**
 * 파싱된 본문 앞부분을 보고 docType/submittedBy 를 LLM으로 재분류.
 *
 * 호출 조건:
 * - needsLLMRefinement(current) === true
 * - parsedText 가 50자 이상 존재
 *
 * 실패/타임아웃/저확신 시 현재 분류를 유지한다. UX 에 영향 주지 않도록 예외는 상위에서 삼킴.
 */
export async function classifyByLLM(params: {
  caseType: CaseType;
  fileName: string;
  parsedText: string;
  currentDocType: RecordDocType;
  currentSubmittedBy: RecordSubmittedBy;
}): Promise<ClassificationResult> {
  const fallback: ClassificationResult = {
    docType: params.currentDocType,
    submittedBy: params.currentSubmittedBy,
    confidence: 0,
  };

  if (!params.parsedText || params.parsedText.length < 50) return fallback;

  const prompt = buildCaseRecordClassifyPrompt({
    caseType: params.caseType,
    fileName: params.fileName,
    firstText: params.parsedText.slice(0, 2000),
    currentDocType: params.currentDocType,
    currentSubmittedBy: params.currentSubmittedBy,
  });

  const raw = await callClaude(
    prompt,
    "위 스키마를 지켜 JSON 한 줄만 출력하세요.",
    undefined,
    "low", // 사건기록 분류 — 정해진 스키마에 맞추는 기계적 작업
  );
  const parsed = extractAndParse(raw);
  if (!parsed) return fallback;

  const rawDocType = typeof parsed.docType === "string" ? parsed.docType : "";
  const rawSubmittedBy =
    typeof parsed.submittedBy === "string" ? parsed.submittedBy : "";
  const rawConfidence =
    typeof parsed.confidence === "string" ? parsed.confidence : "low";

  // 저확신이면 기본값 유지 (오분류 방지)
  if (rawConfidence === "low") return fallback;

  const docType = (VALID_DOC_TYPES as string[]).includes(rawDocType)
    ? (rawDocType as RecordDocType)
    : params.currentDocType;
  const submittedBy = (VALID_SUBMITTED_BY as string[]).includes(rawSubmittedBy)
    ? (rawSubmittedBy as RecordSubmittedBy)
    : params.currentSubmittedBy;

  const confidence: 0 | 0.5 | 1 =
    docType !== "기타" && submittedBy !== "미상"
      ? 1
      : docType !== "기타" || submittedBy !== "미상"
        ? 0.5
        : 0;

  return { docType, submittedBy, confidence };
}
