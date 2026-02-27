// 6개 AI 에이전트 프롬프트 빌더
// CLAUDE.md 섹션 5.3에 정의된 프롬프트를 그대로 구현

import type { DocType, CaseType } from "../types/agent";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";

/**
 * 모든 법률 에이전트에 공통 적용되는 할루시네이션 방지 규칙
 */
const ANTI_HALLUCINATION_RULES = `
[필수 준수 사항 — 정확성 규칙]
- 판례를 인용할 때: 실제 존재 여부가 불확실한 사건번호는 절대 기재하지 마세요. 대신 "대법원 OO년도 판결 취지에 따르면" 등 일반적 표현을 사용하세요.
- 법조문을 인용할 때: 조문 번호가 정확히 기억나지 않으면 "관련 법조문에 의하면" 또는 "해당 법률 규정에 따르면"으로 기재하고, 변호사가 확인하도록 [확인 필요]를 표시하세요.
- 사실관계: 제공된 정보에 없는 날짜, 금액, 인물, 장소를 절대 추가하지 마세요.
- 확실하지 않은 내용에는 반드시 [확인 필요] 또는 [변호사 검토 필요]를 표시하세요.
- 존재하지 않는 판례번호(예: 2019다234567)를 생성하지 마세요.`;

/** 에이전트 공통 컨텍스트 */
export interface AgentContext {
  clientName: string;
  caseType?: CaseType;
  caseDesc: string;
  docType?: DocType;
  transcript?: string;
  checkpointAnswers?: CheckpointAnswer[];
  checkQuestions?: CheckQuestion[];
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
  ];
  if (ctx.caseType) {
    lines.push(`사건 유형: ${ctx.caseType}`);
  }
  lines.push(`사건 개요: ${ctx.caseDesc}`);
  if (ctx.docType) {
    lines.push(`문서 유형: ${ctx.docType}`);
  }

  if (ctx.transcript) {
    lines.push("");
    lines.push("[실제 STT 대화록]");
    lines.push(ctx.transcript);
  }

  return lines.join("\n");
}

/**
 * 체크포인트 상세 응답을 텍스트로 포맷팅
 */
function formatCheckpointAnswers(
  questions: CheckQuestion[],
  answers: CheckpointAnswer[],
): string {
  if (!answers || answers.length === 0) {
    return "[체크포인트 응답 없음]";
  }

  const lines = answers
    .filter((a) => a.text.trim())
    .map((a) => {
      const q = questions.find((q) => q.id === a.questionId);
      const parts: string[] = [];
      parts.push(`### 질문 ${a.questionId}: ${q?.question ?? ""}`);
      parts.push(`답변: ${a.text}`);
      if (a.files.length > 0) {
        parts.push(`첨부 파일: ${a.files.length}건`);
      }
      if (a.audioBlob) {
        parts.push(`음성 설명 첨부됨`);
      }
      return parts.join("\n");
    });

  return `[체크포인트 상세 응답 결과]\n\n${lines.join("\n\n")}`;
}

/** 판례 검색 에이전트 프롬프트 */
function buildPrecedentPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 한국 법률 판례 검색 전문가입니다.
${ANTI_HALLUCINATION_RULES}

${context}

유사 판례의 법리와 판단 경향을 분석하세요:

## 유사 판례 법리 분석 (3~5건)
각 판례마다:
- 판례 유형 및 법원 (예: "대법원 OO년대 부동산 이중매매 관련 판결")
- 핵심 법리 및 판단 요지
- 본 사건 시사점 (유리/불리)
※ 정확한 사건번호가 확실하지 않으면 번호를 기재하지 말고 판례의 법리 내용에 집중하세요.

## 판례 동향 - 최근 법원 판단 경향

## 본 사건 적용 전략

한국어로 체계적으로 작성하세요.`;
}

/** 적법성 검증 에이전트 프롬프트 */
function buildLegalPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법적 적법성 검증 전문가입니다.
${ANTI_HALLUCINATION_RULES}

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
${ANTI_HALLUCINATION_RULES}

${context}

## 핵심 쟁점 (3가지) - 각각: 쟁점명, 설명, 관련 법조문 (조문번호가 불확실하면 [확인 필요] 표시), 유리/불리 판단

## 관련 판례 법리 (2건) - 사건번호 대신 법리 내용과 판단 경향을 기술

## 종합 의견 - 위험도, 권고 전략

한국어로 작성하세요.`;
}

/** 문서 작성 에이전트 - 체크포인트 질문 생성 프롬프트 (선배 변호사 멘토링 스타일) */
function buildDocgenQuestionsPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  const docTypeText = ctx.docType ? `"${ctx.docType}"` : "법률 문서";
  return `당신은 20년 경력의 대한민국 선배 변호사입니다.
후배 변호사가 의뢰인 상담을 마치기 직전입니다. 의뢰인이 아직 상담실에 있습니다.

${context}

${docTypeText} 문서 작성에 필요한 모든 정보를 이 한 번에 빠짐없이 확보할 수 있도록,
의뢰인에게 추가로 확인해야 할 사항을 8~15개 질문으로 정리하세요.

절대 금지 (중복 질문 방지):
- 위 사건 개요, STT 대화록, 업로드된 파일에 이미 나온 정보를 다시 묻지 마세요
- 이미 확보된 사실(이름, 사건 경위, 금액 등)은 질문에서 제외하세요
- 오직 아직 확보되지 않은 추가 정보만 질문하세요

핵심 원칙 (선배의 노하우):
- 두 번 세 번 만나지 않고 한 번에 끝내는 것이 목표
- 증거자료는 "어떤 서류/사진"이 필요한지 구체적으로 지정
- 사실관계는 날짜, 금액, 장소, 인물 등 빠짐없이 (단, 이미 파악된 것은 제외)
- 상대방 주장·반론 가능성까지 미리 대비
- 문서 양식에 필요한 구체적 기재사항(주소, 등록번호, 계좌번호 등)을 역산해서 질문
- 실무 절차(시효, 기한, 관할, 송달주소 등) 빠뜨리지 않기
- 의뢰인의 희망사항(합의 vs 소송, 급한 정도, 예산)도 반드시 확인

각 질문의 hints에는:
- 어떤 자료를 첨부하면 좋은지 (사진, 계약서 사본, 통장 내역 등)
- 어떤 수준의 상세함이 필요한지
- 녹음이나 메모로 남기면 좋은 내용인지

반드시 아래 JSON 형식으로만 응답하세요:
[{"id":1,"question":"질문","why":"이 정보가 필요한 이유","category":"증거확보|사실관계|법리검토|전략수립|절차확인","hints":["힌트1","힌트2"]}]`;
}

/** 문서 작성 에이전트 - 최종 문서 생성 프롬프트 */
function buildDocgenPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  const checkAnswersText =
    ctx.checkpointAnswers && ctx.checkQuestions
      ? formatCheckpointAnswers(ctx.checkQuestions, ctx.checkpointAnswers)
      : "[체크포인트 응답 없음]";

  return `당신은 법률 문서 작성 AI입니다.
${ANTI_HALLUCINATION_RULES}

${context}

${checkAnswersText}

"${ctx.docType}" 초안을 작성하세요:
- 실제 한국 법률 문서 양식, 개인정보 ○○ 마스킹
- 법적 근거 명시 (조문번호가 불확실하면 [확인 필요] 표시)
- 제공된 사실관계만 사용, 추측이나 가정을 사실처럼 기재하지 않기
- 금액·날짜·당사자 정보는 제공된 정보만 사용 (없으면 ○○ 처리)
- 마지막에 "※ AI 생성 초안, 변호사 최종 검토 필요" 추가

한국어로 작성하세요.`;
}

/** 검토·감수 에이전트 프롬프트 */
function buildReviewPrompt(ctx: AgentContext): string {
  const context = buildContextBlock(ctx);
  return `당신은 법률 문서 검토·감수 AI입니다.
${ANTI_HALLUCINATION_RULES}

${context}

## 품질 평가 (5점 척도) - 형식, 법적 정확성, 논리, 설득력, 완성도

## 정확성 검증
- 인용된 법조문 번호가 실제 존재하는지, 내용이 맞는지 확인하고 [확인 필요] 항목을 표시
- 사실관계가 제공된 정보와 일치하는지 확인
- 존재가 불확실한 판례번호가 있으면 지적

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
        docType: context.docType ?? "상담 요약 리포트",
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

/**
 * 사건 유형 자동 분류 프롬프트를 생성합니다.
 * AI 에이전트 분석 결과를 바탕으로 사건 유형을 판별합니다.
 */
export function buildCaseTypeClassificationPrompt(
  caseDesc: string,
  analysisResult: string,
): string {
  return `당신은 한국 법률 사건 유형 분류 전문가입니다.

아래 사건 개요와 AI 쟁점 분석 결과를 참고하여 사건 유형을 정확히 하나만 선택하세요.

[사건 개요]
${caseDesc}

[쟁점 분석 결과]
${analysisResult}

[사건 유형 목록]
민사, 형사, 가사, 행정, 노동, 부동산, 채권·채무, 손해배상, 기타

반드시 위 목록 중 하나만 정확히 출력하세요. 다른 텍스트는 포함하지 마세요.`;
}

/**
 * 문서 채팅 AI 비서 시스템 프롬프트를 생성합니다.
 */
export function buildDocumentChatPrompt(
  docType: DocType,
  document: string,
): string {
  return `당신은 대한민국 법률 문서 전문 AI 비서입니다.
${ANTI_HALLUCINATION_RULES}

아래는 변호사가 작성한 "${docType}" 초안입니다:

---
${document}
---

변호사가 이 문서에 대해 질문하거나 수정을 요청합니다. 다음 규칙을 따르세요:

1. 문서 내용에 대한 질문에 정확하고 명확하게 답변
2. 법조문·판례를 언급할 때: 조문번호가 확실한 것만 기재, 불확실하면 [확인 필요] 표시
3. 문서 수정을 요청받으면 수정된 전체 문서를 아래 형식으로 제공:

===수정안===
(수정된 문서 전체 내용)
===끝===

4. 수정안 앞에 무엇을 왜 수정했는지 간단히 설명
5. 한국어로 전문적이되 이해하기 쉽게 작성
6. 확실하지 않은 정보는 "~로 추정됩니다" 또는 "변호사 확인이 필요합니다"로 표현`;
}
