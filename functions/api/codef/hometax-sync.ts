// CODEF 홈택스 세금계산서 조회 프록시
//
// POST /api/codef/hometax-sync
// Body: { connectedId, invoiceType: "매출"|"매입", startDate, endDate }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// CODEF API를 호출하여 홈택스 세금계산서 목록을 조회하고 반환합니다.
// Firestore 저장/중복 처리/거래 매칭은 프론트엔드에서 수행합니다.

import type { Env } from "../_shared/types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_URL = "https://development.codef.io"; // sandbox

/** 매출/매입에 따른 CODEF API 엔드포인트 */
const INVOICE_ENDPOINTS = {
  매출: "/v1/kr/public/nt/tax-invoice/sales-list",
  매입: "/v1/kr/public/nt/tax-invoice/purchase-list",
} as const;

type InvoiceType = "매출" | "매입";

interface HometaxSyncRequest {
  connectedId: string;
  invoiceType: InvoiceType;
  startDate: string; // YYYYMMDD
  endDate: string;   // YYYYMMDD
}

/** CODEF 홈택스 세금계산서 응답 항목 */
interface CodefTaxInvoice {
  resIssueDate: string;           // 작성일자 YYYYMMDD
  resApprovalNo: string;          // 승인번호
  resSupBizNo: string;            // 공급자 사업자번호
  resSupCorpName: string;         // 공급자 상호
  resBuyBizNo: string;            // 공급받는자 사업자번호
  resBuyCorpName: string;         // 공급받는자 상호
  resSupplyValue: string;         // 공급가액
  resTaxAmount: string;           // 세액
  resTotalAmount: string;         // 합계금액
  resInvoiceType: string;         // 세금계산서 종류 (01: 일반, 02: 영세율 등)
  resElectronicYN: string;        // 전자세금계산서 여부 (Y/N)
}

interface CodefHometaxResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: CodefTaxInvoice[] | { resListData: CodefTaxInvoice[] };
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string;

  if (!uid) {
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const body = (await context.request.json()) as HometaxSyncRequest;

    // 필수 파라미터 검증
    if (
      !body.connectedId ||
      !body.invoiceType ||
      !body.startDate ||
      !body.endDate
    ) {
      return Response.json(
        {
          error: "필수 파라미터가 누락되었습니다.",
          detail:
            "connectedId, invoiceType, startDate, endDate가 필요합니다.",
        },
        { status: 400 },
      );
    }

    // invoiceType 검증
    if (body.invoiceType !== "매출" && body.invoiceType !== "매입") {
      return Response.json(
        {
          error: "invoiceType은 '매출' 또는 '매입'이어야 합니다.",
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

    // 2) 홈택스 세금계산서 조회 API 호출
    const endpoint = INVOICE_ENDPOINTS[body.invoiceType];
    const requestBody = {
      connectedId: body.connectedId,
      organization: "0004", // 국세청
      startDate: body.startDate,
      endDate: body.endDate,
      inquiryType: "0", // 전체
    };

    const codefResp = await fetch(`${CODEF_API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: encodeURIComponent(JSON.stringify(requestBody)),
    });

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
    let codefData: CodefHometaxResponse;
    try {
      codefData = JSON.parse(
        decodeURIComponent(rawText),
      ) as CodefHometaxResponse;
    } catch {
      codefData = JSON.parse(rawText) as CodefHometaxResponse;
    }

    // CODEF 결과 코드 확인
    if (codefData.result.code !== "CF-00000") {
      return Response.json(
        {
          error: "CODEF 세금계산서 조회 실패",
          detail: codefData.result.message,
          code: codefData.result.code,
        },
        { status: 400 },
      );
    }

    // 3) 세금계산서 목록 추출 (응답 구조가 배열 또는 { resListData: [] })
    const rawInvoices: CodefTaxInvoice[] = Array.isArray(codefData.data)
      ? codefData.data
      : (codefData.data as { resListData: CodefTaxInvoice[] }).resListData ??
        [];

    // 4) 프론트엔드 친화적 형식으로 변환
    const invoices = rawInvoices.map((inv) => ({
      issueDate: inv.resIssueDate,
      approvalNumber: inv.resApprovalNo,
      supplierBizNumber: inv.resSupBizNo?.replace(/-/g, "") ?? "",
      supplierName: inv.resSupCorpName?.trim() ?? "",
      buyerBizNumber: inv.resBuyBizNo?.replace(/-/g, "") ?? "",
      buyerName: inv.resBuyCorpName?.trim() ?? "",
      supplyAmount: parseInt(inv.resSupplyValue, 10) || 0,
      vatAmount: parseInt(inv.resTaxAmount, 10) || 0,
      totalAmount: parseInt(inv.resTotalAmount, 10) || 0,
      isElectronic: inv.resElectronicYN === "Y",
      invoiceType: body.invoiceType,
    }));

    return Response.json({
      success: true,
      invoiceType: body.invoiceType,
      totalCount: invoices.length,
      invoices,
    });
  } catch (error) {
    return Response.json(
      {
        error: "홈택스 세금계산서 동기화 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
