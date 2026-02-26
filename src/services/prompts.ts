// 6개 AI 에이전트 프롬프트 빌더
// CLAUDE.md 섹션 5.3에 정의된 프롬프트를 그대로 구현

import type { DocType, CaseType } from "../types/agent";

/** 에이전트 공통 컨텍스트 */
export interface AgentContext {
  clientName: string;
  caseType: CaseType;
  caseDesc: string;
  docType: DocType;
  transcript?: string;
  checkAnswers?: Record<number, "yes" | "no" | "partial">;
}

/** 의뢰인 메시지 전용 컨텍스트 */
export interface ClientMessageContext {
  firmName: string;
  lawyerName: string;
  docType: DocType;
  caseDesc: string;
}

/** 에이전트 ID (docgen_questions, client_message 포함) */
export type PromptAgentId =
  | "precedent"
  | "legal"
  | "stt"
  | "analysis"
  | "docgen_questions"
  | "docgen"
  | "review"
  | "client_message";

/**
 * 공통 컨텍스트 블록 생성
 */
function buildContextBlock(ctx: AgentContext): string {
  const lines: string[] = [
    `의뢰인: ${ctx.clientName}`,
    `사건 유형: ${ctx.caseType}`,
    `사건 개요: ${ctx.caseDesc}`,
    `문서 유형: ${ctx.docType}`,
  ];

  if (ctx.transcript) {
    lines.push("");
    lines.push("[실제 STT 대화록]");
    lines.push(ctx.transcript);
  }

  return lines.join("\n");
}

/**
 * 체크포인트 응답 결과를 텍스트로 포맷팅
 */
function formatCheckAnswers(
  checkAnswers: Record<number, "yes" | "no" | "partial">
): string {
  const entries = Object.entries(checkAnswers);
  if (entries.length === 0) {
    return "[체크포인트 응답 없음]";
  }

  const lines = entries.map(([id, answer]) => {
    const answerText =
      answer === "yes" ? "예" : answer === "no" ? "아니오" : "부분적";
    return `- 질문 ${id}: ${answerText}`;
  });

  return `[체크포인트 응답 결과]\n${lines.join("\n")}`;
}

/** 판례 검색 에이전트 프롬프트 */
function buildPrecedentPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 한국 법률 판례 검색 전문가입니다.

${context}

유사 판례를 검색하여 분석하세요:

## 유사 판례 (3~5건)
각 판례마다: 사건번호, 판결 요지, 핵심 쟁점 및 법원의 판단, 본 사건 시사점 (유리/불리)

## 판례 동향 - 최근 법원 판단 경향

## 본 사건 적용 전략

한국어로 체계적으로 작성하세요.`;
}

/** 적법성 검증 에이전트 프롬프트 */
function buildLegalPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법적 적법성 검증 전문가입니다.

${context}

변호사가 의뢰인 상담을 녹음·AI 분석·문서 작성하는 것의 적법성:
1. 통신비밀보호법
2. 변호사법
3. 개인정보보호법
4. 변호사윤리장전
5. 종합 판단

한국어로 작성하세요.`;
}

/** STT 에이전트 프롬프트 (RTZR 실패 시 폴백용) */
function buildSttPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법률 전문 음성 변환 에이전트입니다.

${context}

변호사-의뢰인 상담 대화록을 생성하세요:
- 10-12턴 대화, [변호사]/[의뢰인] 표시
- 사실관계, 날짜, 금액, 증거 포함
- 법적 쟁점이 드러나도록

한국어로 자연스럽게 작성하세요.`;
}

/** 쟁점 분석 에이전트 프롬프트 */
function buildAnalysisPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법률 쟁점 분석 AI입니다.

${context}

## 핵심 쟁점 (3가지) - 각각: 쟁점명, 설명, 관련 법조문, 유리/불리 판단

## 관련 판례 2건

## 종합 의견 - 위험도, 권고 전략, 예상 기간·비용

한국어로 작성하세요.`;
}

/** 문서 작성 에이전트 - 체크포인트 질문 생성 프롬프트 */
function buildDocgenQuestionsPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법률 문서 작성 전문가입니다.

${context}

"${ctx.docType}" 문서를 작성하기 전에, 변호사가 반드시 확인해야 할 사항 3~5개를 질문 형태로 제시하세요.

반드시 아래 JSON 형식으로만 응답하세요:
[{"id":1,"question":"질문","why":"이유","category":"증거확보|사실관계|법리검토|전략수립|절차확인"}]`;
}

/** 문서 작성 에이전트 - 최종 문서 생성 프롬프트 */
function buildDocgenPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  const checkAnswersText = ctx.checkAnswers
    ? formatCheckAnswers(ctx.checkAnswers)
    : "[체크포인트 응답 없음]";

  return `당신은 법률 문서 작성 AI입니다.

${context}

${checkAnswersText}

"${ctx.docType}" 초안을 작성하세요:
- 실제 한국 법률 문서 양식, 개인정보 ○○ 마스킹
- 법적 근거 명시, 구체적 수치 포함
- 마지막에 "※ AI 생성 초안, 변호사 최종 검토 필요" 추가

한국어로 작성하세요.`;
}

/** 검토·감수 에이전트 프롬프트 */
function buildReviewPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법률 문서 검토·감수 AI입니다.

${context}

## 품질 평가 (5점 척도) - 형식, 법적 정확성, 논리, 설득력, 완성도

## 수정 제안 5가지

## 추가 보강 - 증거자료, 법리 보강, 상대방 반론 대응

한국어로 작성하세요.`;
}

/**
 * 에이전트 ID에 따라 시스템 프롬프트를 생성합니다.
 *
 * @param agentId - 에이전트 식별자
 * @param context - 에이전트에 전달할 컨텍스트
 * @returns 시스템 프롬프트 문자열
 */
export function buildPrompt(agentId: PromptAgentId, context: AgentContext): string {
  switch (agentId) {
    case "precedent":
      return buildPrecedentPrompt(context);
    case "legal":
      return buildLegalPrompt(context);
    case "stt":
      return buildSttPrompt(context);
    case "analysis":
      return buildAnalysisPrompt(context);
    case "docgen_questions":
      return buildDocgenQuestionsPrompt(context);
    case "docgen":
      return buildDocgenPrompt(context);
    case "review":
      return buildReviewPrompt(context);
    case "client_message":
      // client_message는 별도 컨텍스트가 필요하므로, 기본 컨텍스트로 간략히 생성
      return buildClientMessagePrompt({
        firmName: "",
        lawyerName: "",
        docType: context.docType,
        caseDesc: context.caseDesc,
      });
  }
}

/**
 * 의뢰인 카카오톡 메시지 프롬프트를 생성합니다.
 *
 * @param context - 의뢰인 메시지용 컨텍스트
 * @returns 시스템 프롬프트 문자열
 */
export function buildClientMessagePrompt(context: ClientMessageContext): string {
  return `당신은 친절한 법률 비서입니다. 변호사가 의뢰인에게 보낼 카카오톡 메시지를 작성하세요.

규칙:
1. 법률 용어를 일상 언어로 쉽게 설명
2. "${context.docType}"을 쉬운 비유로 설명
3. 현재 진행상황 + 다음 단계 안내
4. 이모지 적절히 사용 (과하지 않게)
5. 200~300자 이내
6. 존댓말 + 따뜻한 톤
7. "궁금하신 점 있으시면 편하게 연락 주세요 😊" 포함
8. ${context.firmName} ${context.lawyerName} 변호사 서명

사건 개요: ${context.caseDesc}`;
}
