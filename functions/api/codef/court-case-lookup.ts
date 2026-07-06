// CODEF 대법원 나의사건검색 프록시
//
// POST /api/codef/court-case-lookup
// Body: { caseNumber, courtName? }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// CODEF API를 호출하여 대법원 나의사건검색 결과를 조회하고 반환합니다.
// 공개 정보이므로 별도 본인인증(connectedId)이 필요하지 않습니다.
// 수집된 이벤트의 Firestore 저장(cases 컬렉션 병합)은 프론트엔드에서 수행합니다.

import type { Env } from "../_shared/types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_URL = "https://api.codef.io"; // production (2026-04-22 전환)

// TODO: CODEF 개발자센터에서 "대법원 > 나의사건검색"의 정확한 경로와 기관코드를 확인 후 교체
// 현재 값은 CODEF 공식 문서 기반 추정치
const COURT_CASE_LOOKUP_PATH = "/v1/kr/public/ck/case-status/my-case";
const COURT_ORGANIZATION_CODE = "0001"; // 대법원

interface CourtCaseLookupRequest {
  caseNumber: string;
  courtName?: string;
}

/** CODEF 나의사건검색 응답 항목 (진행 이벤트) */
interface CodefCourtEvent {
  resReceiptDate?: string;  // 접수/발생 일자 YYYYMMDD 또는 YYYY-MM-DD
  resDate?: string;         // 이벤트 일자 (응답 구조에 따라 다를 수 있음)
  resType?: string;         // 이벤트 유형 (접수, 송달, 기일지정, 판결 등)
  resContents?: string;     // 상세 내용
  resContent?: string;      // 상세 내용 (별칭)
}

interface CodefCourtCaseResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data:
    | CodefCourtEvent[]
    | {
        resCaseNumber?: string;
        resCourtName?: string;
        resProgressList?: CodefCourtEvent[];
        resListData?: CodefCourtEvent[];
      };
}

/** CODEF OAuth2 액세스 토큰 발급 */
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

/** CODEF 응답 날짜(YYYYMMDD 또는 YYYY-MM-DD)를 YYYY-MM-DD로 정규화 */
function normalizeDate(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return raw;
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
    const body = (await context.request.json()) as CourtCaseLookupRequest;

    // 필수 파라미터 검증
    if (!body.caseNumber) {
      return Response.json(
        {
          error: "필수 파라미터가 누락되었습니다.",
          detail: "caseNumber가 필요합니다.",
        },
        { status: 400 },
      );
    }

    // 사건번호 형식 검증 (한글·숫자·공백 허용, 공백 제거 후 최소 길이 체크)
    const trimmedCaseNumber = body.caseNumber.trim();
    if (trimmedCaseNumber.length < 6) {
      return Response.json(
        {
          error: "사건번호가 너무 짧습니다.",
          detail: "예: 2024가단12345",
        },
        { status: 400 },
      );
    }

    const caseNumberPattern = /^[가-힣0-9\s]+$/;
    if (!caseNumberPattern.test(trimmedCaseNumber)) {
      return Response.json(
        {
          error: "사건번호 형식이 올바르지 않습니다.",
          detail: "한글·숫자·공백만 사용할 수 있습니다.",
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

    // 2) 대법원 나의사건검색 API 호출
    const requestBody: Record<string, string> = {
      organization: COURT_ORGANIZATION_CODE,
      caseNumber: trimmedCaseNumber,
    };
    if (body.courtName) {
      requestBody.courtName = body.courtName;
    }

    const codefResp = await fetch(
      `${CODEF_API_URL}${COURT_CASE_LOOKUP_PATH}`,
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

    // CODEF 응답 파싱 (URL-encoded JSON일 수 있음)
    const rawText = await codefResp.text();
    let codefData: CodefCourtCaseResponse;
    try {
      codefData = JSON.parse(
        decodeURIComponent(rawText),
      ) as CodefCourtCaseResponse;
    } catch {
      codefData = JSON.parse(rawText) as CodefCourtCaseResponse;
    }

    // CODEF 결과 코드 확인
    if (codefData.result.code !== "CF-00000") {
      return Response.json(
        {
          error: "CODEF 나의사건검색 조회 실패",
          detail: codefData.result.message,
          code: codefData.result.code,
        },
        { status: 400 },
      );
    }

    // 3) 이벤트 목록 추출 (응답 구조가 배열 또는 중첩 객체)
    let rawEvents: CodefCourtEvent[] = [];
    let resolvedCourtName: string = body.courtName ?? "";

    if (Array.isArray(codefData.data)) {
      rawEvents = codefData.data;
    } else if (codefData.data) {
      rawEvents =
        codefData.data.resProgressList ??
        codefData.data.resListData ??
        [];
      if (codefData.data.resCourtName) {
        resolvedCourtName = codefData.data.resCourtName;
      }
    }

    // 4) 프론트엔드 친화적 형식으로 변환
    const events = rawEvents.map((ev) => ({
      date: normalizeDate(ev.resDate ?? ev.resReceiptDate),
      type: (ev.resType ?? "").trim(),
      content: (ev.resContents ?? ev.resContent ?? "").trim(),
    }));

    return Response.json({
      success: true,
      caseNumber: trimmedCaseNumber,
      courtName: resolvedCourtName,
      events,
    });
  } catch (error) {
    return Response.json(
      {
        error: "대법원 나의사건검색 조회 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
