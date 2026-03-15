// AI 기반 은행 입금 ↔ 사건 수임료 매칭
//
// POST /api/codef/match-deposits
// Body: { deposits, cases, fees }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// Claude API를 사용하여 은행 입금 내역과 사건/수임료를 자동 매칭합니다.

import type { Env } from "../_shared/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const API_VERSION = "2023-06-01";

interface Deposit {
  id: string;
  transactionDate: string;
  amount: number;
  counterpartyName: string;
  memo: string;
}

interface CaseInfo {
  id: string;
  clientName: string;
  caseType: string;
}

interface FeeInfo {
  id: string;
  caseId: string;
  clientName: string;
  totalOutstanding: number;
  nextInstallment: number;
  retainerFee: number;
  feeType: string;
}

interface MatchDepositsRequest {
  deposits: Deposit[];
  cases: CaseInfo[];
  fees: FeeInfo[];
}

interface MatchResult {
  bankTransactionId: string;
  matchedCaseId: string;
  matchedFeeId: string;
  confidence: number;
  paymentType: string;
  reason: string;
}

function buildMatchingPrompt(
  deposits: Deposit[],
  cases: CaseInfo[],
  fees: FeeInfo[],
): string {
  const depositsText = deposits
    .map(
      (d) =>
        `ID:${d.id} | ${d.transactionDate} | ${d.amount.toLocaleString()}원 | 입금자: ${d.counterpartyName} | 메모: ${d.memo || "(없음)"}`,
    )
    .join("\n");

  const casesText = cases
    .map((c) => `사건ID:${c.id} | 의뢰인: ${c.clientName} | 유형: ${c.caseType}`)
    .join("\n");

  const feesText = fees
    .map(
      (f) =>
        `수임료ID:${f.id} | 사건ID:${f.caseId} | 의뢰인: ${f.clientName} | 미수금: ${f.totalOutstanding.toLocaleString()}원 | 다음분할금: ${f.nextInstallment.toLocaleString()}원 | 착수금: ${f.retainerFee.toLocaleString()}원 | 유형: ${f.feeType}`,
    )
    .join("\n");

  return `당신은 법률사무소 재무 매칭 AI입니다.
은행 입금 내역을 분석하여 어떤 사건의 수임료 입금인지 매칭합니다.

[입금 내역]
${depositsText}

[활성 사건]
${casesText}

[수임료 정보]
${feesText}

매칭 규칙:
1. 입금자명과 의뢰인명이 동일하거나 포함관계 → 신뢰도 +0.4
2. 금액이 미수금/착수금/분할납부액과 정확히 일치 → 신뢰도 +0.4
3. 메모에 사건 관련 키워드(사건번호, 착수금, 수임료 등) 포함 → 신뢰도 +0.2
4. 신뢰도 합산 0.5 미만이면 매칭하지 않음
5. 하나의 입금이 여러 사건에 매칭 가능한 경우, 가장 높은 신뢰도만 반환
6. 매칭 불가한 입금은 결과에서 제외

paymentType 판단 기준:
- 금액이 착수금과 일치 → "착수금"
- 금액이 분할납부액과 일치 → "분할납부"
- 금액이 미수금 전체와 일치 → "잔금"
- 위 조건에 해당하지 않으면 → "기타입금"

반드시 아래 JSON 배열 형식으로만 응답하세요. 설명 텍스트 없이 JSON만 반환하세요:
[{"bankTransactionId":"입금ID","matchedCaseId":"사건ID","matchedFeeId":"수임료ID","confidence":0.95,"paymentType":"착수금","reason":"입금자명 일치, 금액 정확 일치"}]

매칭 결과가 없으면 빈 배열 []을 반환하세요.`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string;

  if (!uid) {
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const apiKey = context.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Anthropic API 키가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const body = (await context.request.json()) as MatchDepositsRequest;

    // 필수 파라미터 검증
    if (!body.deposits || !Array.isArray(body.deposits)) {
      return Response.json(
        { error: "deposits 배열이 필요합니다." },
        { status: 400 },
      );
    }

    if (!body.cases || !Array.isArray(body.cases)) {
      return Response.json(
        { error: "cases 배열이 필요합니다." },
        { status: 400 },
      );
    }

    if (!body.fees || !Array.isArray(body.fees)) {
      return Response.json(
        { error: "fees 배열이 필요합니다." },
        { status: 400 },
      );
    }

    // 입금 내역이 없으면 빈 결과 반환
    if (body.deposits.length === 0) {
      return Response.json({
        success: true,
        matches: [],
        totalDeposits: 0,
        matchedCount: 0,
      });
    }

    // 사건/수임료가 없으면 매칭 불가
    if (body.cases.length === 0 || body.fees.length === 0) {
      return Response.json({
        success: true,
        matches: [],
        totalDeposits: body.deposits.length,
        matchedCount: 0,
        message: "매칭할 사건 또는 수임료 정보가 없습니다.",
      });
    }

    // Claude API로 매칭 요청
    const prompt = buildMatchingPrompt(body.deposits, body.cases, body.fees);

    const claudeResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.1,
        system:
          "당신은 법률사무소 재무 매칭 전문 AI입니다. 반드시 유효한 JSON 배열로만 응답하세요.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errorBody = (await claudeResp.json()) as {
        error?: { message?: string };
      };
      return Response.json(
        {
          error: "AI 매칭 API 호출 실패",
          detail:
            errorBody?.error?.message ?? `HTTP ${claudeResp.status}`,
        },
        { status: claudeResp.status },
      );
    }

    const claudeData = (await claudeResp.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const responseText =
      claudeData.content
        ?.find((c) => c.type === "text")
        ?.text?.trim() ?? "[]";

    // JSON 파싱 (코드블록으로 감싸져 있을 수 있음)
    let matches: MatchResult[];
    try {
      const jsonText = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      matches = JSON.parse(jsonText) as MatchResult[];
    } catch {
      return Response.json(
        {
          error: "AI 매칭 결과 파싱 실패",
          detail: "AI 응답을 JSON으로 변환할 수 없습니다.",
          rawResponse: responseText,
        },
        { status: 500 },
      );
    }

    // 유효성 검증: 신뢰도 0.5 미만 필터링
    const validMatches = matches.filter(
      (m) =>
        m.bankTransactionId &&
        m.matchedCaseId &&
        m.confidence >= 0.5,
    );

    return Response.json({
      success: true,
      matches: validMatches,
      totalDeposits: body.deposits.length,
      matchedCount: validMatches.length,
    });
  } catch (error) {
    return Response.json(
      {
        error: "입금 매칭 처리 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
