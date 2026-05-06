// AI 카드 경비 분류 엔드포인트
// POST /api/codef/classify-expenses

import type { Env } from "../_shared/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const API_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "context-1m-2025-08-07";
const TEMPERATURE = 0;

/** 분류할 카드 거래 */
interface CardTransactionInput {
  id: string;
  approvalDate: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
}

/** 활성 사건 정보 */
interface CaseInput {
  id: string;
  clientName: string;
  caseType: string;
}

/** 분류 요청 바디 */
interface ClassifyRequest {
  cardTransactions: CardTransactionInput[];
  cases: CaseInput[];
  categories?: string[];
}

/** AI 분류 결과 항목 */
interface ClassifyResultItem {
  cardTransactionId: string;
  recordType: "case_expense" | "office_expense" | "ignore";
  category: string;
  isCaseRelated: boolean;
  linkedCaseId: string | null;
  confidence: number;
  reason: string;
}

/** Anthropic API 응답 구조 */
interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
}

/**
 * Claude 응답에서 JSON 배열을 추출합니다.
 * 마크다운 코드블록(```json ... ```)으로 감싸진 경우도 처리합니다.
 */
function extractJsonFromResponse(text: string): ClassifyResultItem[] {
  // 마크다운 코드블록 제거
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("AI 응답이 JSON 배열이 아닙니다.");
  }

  return parsed as ClassifyResultItem[];
}

/**
 * 분류 프롬프트를 구성합니다.
 */
function buildClassificationPrompt(
  transactions: CardTransactionInput[],
  cases: CaseInput[],
): string {
  const txLines = transactions.map(
    (t) =>
      `ID:${t.id} | ${t.approvalDate} | ${t.merchantName} (${t.merchantCategory}) | ${t.amount.toLocaleString()}원`,
  );

  const caseLines = cases.length > 0
    ? cases.map((c) => `${c.id}: ${c.clientName} (${c.caseType})`)
    : ["(등록된 사건 없음)"];

  return `당신은 법률사무소 경비 분류 AI입니다.
카드 사용 내역을 분석하여 적절한 계정과목으로 분류합니다.

[카드 사용 내역]
${txLines.join("\n")}

[활성 사건]
${caseLines.join("\n")}

분류 기준:
- 법원, 등기소, 공증사무소 관련 → case_expense (인지대/송달료/등기비용/공증비용)
- 주유소, 택시, 대중교통 → office_expense (교통비) 또는 case_expense (출장비, 사건 관련 시)
- 사무용품점, 문구 → office_expense (사무용품)
- 식당, 카페 → office_expense (접대비)
- 서점 → office_expense (도서구입)
- 통신사 → office_expense (통신비)
- 소프트웨어, 구독 서비스 → office_expense (소프트웨어)
- 주차장, 통행료 → office_expense (교통비) 또는 case_expense (출장비)
- 택배, 우편 → case_expense (복사/출력비) 또는 office_expense (사무용품)
- 의미 불명 소액 → ignore

recordType 값:
- "case_expense": 사건과 직접 관련된 비용 (인지대, 송달료, 감정료, 출장비, 등기비용, 공증비용 등)
- "office_expense": 사무소 일반 경비 (임대료, 사무용품, 통신비, 접대비, 교통비, 도서구입 등)
- "ignore": 분류 불가 또는 개인 지출로 추정

category 값 (case_expense인 경우):
인지대, 송달료, 감정료, 번역료, 출장비, 등기비용, 공증비용, 탐정조사비, 복사/출력비, 증인여비, 보증보험료, 기타

category 값 (office_expense인 경우):
임대료, 관리비, 통신비, 사무용품, 도서구입, 소프트웨어, 보험료, 변호사회비, 교육_연수비, 광고_마케팅, 접대비, 차량유지비, 교통비, 기타

JSON 배열로만 응답하세요. 다른 텍스트는 포함하지 마세요:
[{
  "cardTransactionId": "거래ID",
  "recordType": "case_expense" | "office_expense" | "ignore",
  "category": "분류 카테고리",
  "isCaseRelated": true/false,
  "linkedCaseId": "사건ID" | null,
  "confidence": 0.85,
  "reason": "분류 사유 (간결하게)"
}]`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string;
  if (!uid) {
    return Response.json(
      { error: "인증 필요" },
      { status: 401 },
    );
  }

  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Anthropic API 키가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    const body = (await context.request.json()) as Partial<ClassifyRequest>;

    // 입력 유효성 검사
    if (!body.cardTransactions || !Array.isArray(body.cardTransactions) || body.cardTransactions.length === 0) {
      return Response.json(
        { error: "cardTransactions 배열은 필수이며 비어있을 수 없습니다." },
        { status: 400 },
      );
    }

    if (!body.cases || !Array.isArray(body.cases)) {
      return Response.json(
        { error: "cases 배열은 필수 항목입니다." },
        { status: 400 },
      );
    }

    // 각 거래 항목 유효성 검사
    for (const tx of body.cardTransactions) {
      if (!tx.id || !tx.approvalDate || !tx.merchantName || typeof tx.amount !== "number") {
        return Response.json(
          { error: "각 카드 거래에는 id, approvalDate, merchantName, amount가 필요합니다." },
          { status: 400 },
        );
      }
    }

    const userPrompt = buildClassificationPrompt(
      body.cardTransactions,
      body.cases,
    );

    // Claude API 호출
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: "당신은 법률사무소 경비 분류 전문가입니다. 카드 사용 내역을 분석하여 정확한 계정과목으로 분류합니다. 반드시 JSON 배열로만 응답하세요.",
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as {
        error?: { message?: string };
      };
      return Response.json(
        {
          error: "Claude API 호출 실패",
          detail: errorBody?.error?.message ?? `HTTP ${response.status}`,
        },
        { status: response.status },
      );
    }

    const claudeResponse = (await response.json()) as AnthropicResponse;

    // 텍스트 응답 추출
    const textContent = claudeResponse.content.find((c) => c.type === "text");
    if (!textContent?.text) {
      return Response.json(
        { error: "AI 응답에서 텍스트를 추출할 수 없습니다." },
        { status: 500 },
      );
    }

    // JSON 파싱
    const classifications = extractJsonFromResponse(textContent.text);

    return Response.json({
      success: true,
      count: classifications.length,
      classifications,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";

    // JSON 파싱 실패 구분
    if (message.includes("JSON") || message.includes("parse")) {
      return Response.json(
        { error: "AI 응답 파싱 실패", detail: message },
        { status: 502 },
      );
    }

    return Response.json(
      { error: "경비 분류 처리 실패", detail: message },
      { status: 500 },
    );
  }
};
