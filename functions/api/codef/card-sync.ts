// CODEF 카드 승인내역 조회 프록시
//
// POST /api/codef/card-sync
// Body: { connectedId, organization, startDate, endDate }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// CODEF API를 호출하여 카드 승인내역을 조회하고 원본 결과를 반환합니다.
// Firestore 저장/중복 처리는 프론트엔드에서 수행합니다.

import type { Env } from "../_shared/types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_URL = "https://api.codef.io"; // production (2026-04-22 전환)

interface CardSyncRequest {
  connectedId: string;
  organization: string; // 카드사 기관코드 (예: "0301" = 비씨카드)
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
}

interface CodefCardApproval {
  resUsedDate: string; // 이용일자 YYYYMMDD
  resUsedTime: string; // 이용시간 HHmmss
  resApprovalNo: string; // 승인번호
  resMemberStoreName: string; // 가맹점명
  resMemberStoreType: string; // 가맹점 업종
  resUsedAmount: string; // 이용금액
  resCardNo: string; // 카드번호 (마스킹)
  resInstallmentCount: string; // 할부개월
  resApprovalStatus: string; // 승인상태 (1:승인, 2:취소)
}

interface CodefResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: CodefCardApproval[];
}

/** CODEF OAuth2 액세스 토큰을 발급받습니다. */
async function getCodefAccessToken(env: Env): Promise<string> {
  const resp = await fetch(CODEF_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        btoa(`${env.CODEF_CLIENT_ID}:${env.CODEF_CLIENT_SECRET}`),
    },
    body: "grant_type=client_credentials&scope=read",
  });

  if (!resp.ok) {
    throw new Error(`CODEF 토큰 발급 실패: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
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
    const body = (await context.request.json()) as CardSyncRequest;

    // 필수 파라미터 검증
    if (
      !body.connectedId ||
      !body.organization ||
      !body.startDate ||
      !body.endDate
    ) {
      return Response.json(
        {
          error: "필수 파라미터가 누락되었습니다.",
          detail:
            "connectedId, organization, startDate, endDate가 필요합니다.",
        },
        { status: 400 },
      );
    }

    // 날짜 형식 검증 (YYYYMMDD)
    const datePattern = /^\d{8}$/;
    if (
      !datePattern.test(body.startDate) ||
      !datePattern.test(body.endDate)
    ) {
      return Response.json(
        {
          error: "날짜 형식이 올바르지 않습니다.",
          detail: "YYYYMMDD 형식이어야 합니다. (예: 20260101)",
        },
        { status: 400 },
      );
    }

    // CODEF 환경변수 확인
    if (!context.env.CODEF_CLIENT_ID || !context.env.CODEF_CLIENT_SECRET) {
      return Response.json(
        { error: "CODEF API 설정이 완료되지 않았습니다." },
        { status: 503 },
      );
    }

    // 1) CODEF 액세스 토큰 발급
    const accessToken = await getCodefAccessToken(context.env);

    // 2) 카드 승인내역 조회 API 호출
    const requestBody = {
      connectedId: body.connectedId,
      organization: body.organization,
      startDate: body.startDate,
      endDate: body.endDate,
      orderBy: "0", // 최신순
      inquiryType: "0", // 전체 조회
    };

    const codefResp = await fetch(
      `${CODEF_API_URL}/v1/kr/card/p/account/approval-list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: encodeURIComponent(JSON.stringify(requestBody)),
      },
    );

    if (!codefResp.ok) {
      return Response.json(
        {
          error: "CODEF API 호출 실패",
          detail: `HTTP ${codefResp.status}`,
        },
        { status: codefResp.status },
      );
    }

    // CODEF 응답은 URL-encoded JSON인 경우가 있음
    const rawText = await codefResp.text();
    let codefData: CodefResponse;
    try {
      codefData = JSON.parse(decodeURIComponent(rawText)) as CodefResponse;
    } catch {
      codefData = JSON.parse(rawText) as CodefResponse;
    }

    // CODEF 결과 코드 확인
    if (codefData.result.code !== "CF-00000") {
      return Response.json(
        {
          error: "CODEF 카드 승인내역 조회 실패",
          detail: codefData.result.message,
          code: codefData.result.code,
        },
        { status: 400 },
      );
    }

    // 3) 승인내역을 프론트엔드 친화적 형식으로 변환
    const approvals = (codefData.data ?? []).map((tx) => ({
      approvalDate: tx.resUsedDate,
      approvalTime: tx.resUsedTime,
      approvalNumber: tx.resApprovalNo?.trim() ?? "",
      merchantName: tx.resMemberStoreName?.trim() ?? "",
      merchantCategory: tx.resMemberStoreType?.trim() ?? "",
      amount: parseInt(tx.resUsedAmount, 10) || 0,
      cardNumberMasked: tx.resCardNo?.trim() ?? "",
      installmentMonths: parseInt(tx.resInstallmentCount, 10) || 0,
      isApproved: tx.resApprovalStatus === "1",
      // 프론트엔드에서 중복 처리에 사용할 해시 소스
      hashSource: `${tx.resUsedDate}|${tx.resUsedTime}|${tx.resApprovalNo}|${tx.resUsedAmount}|${tx.resMemberStoreName?.trim()}`,
    }));

    return Response.json({
      success: true,
      totalCount: approvals.length,
      approvals,
    });
  } catch (error) {
    return Response.json(
      {
        error: "카드 승인내역 동기화 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
