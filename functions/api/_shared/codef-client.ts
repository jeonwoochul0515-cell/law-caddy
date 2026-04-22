// CODEF API 클라이언트 — Cloudflare Workers 호환
// Web Crypto API (crypto.subtle) 사용, Node.js 의존성 없음

/** CODEF API 기본 URL */
const CODEF_SANDBOX_URL = "https://development.codef.io";
const CODEF_PRODUCTION_URL = "https://api.codef.io";

// 정식버전: 2026-04-22 프로덕션 전환 (정식 client_id 발급 완료)
const CODEF_BASE_URL = CODEF_PRODUCTION_URL;
// 하위 린트 회피: 샌드박스 상수는 롤백용으로 보존
void CODEF_SANDBOX_URL;
const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";

/** CODEF 성공 응답 코드 */
const CODEF_SUCCESS_CODE = "CF-00000";

/** CODEF API 응답 구조 */
interface CodefResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: unknown;
}

/** Connected ID 등록 파라미터 */
export interface CreateConnectedIdParams {
  countryCode: string;
  businessType: string;
  clientType: string;
  organization: string;
  loginType: string;
  id: string;
  password: string; // RSA 암호화 전 평문
}

/** 은행 거래내역 조회 파라미터 */
export interface BankTransactionParams {
  connectedId: string;
  organization: string;
  account: string;
  startDate: string; // YYYYMMDD
  endDate: string;   // YYYYMMDD
}

/** 카드 승인내역 조회 파라미터 */
export interface CardApprovalParams {
  connectedId: string;
  organization: string;
  startDate: string; // YYYYMMDD
  endDate: string;   // YYYYMMDD
}

/** 홈택스 세금계산서 조회 파라미터 */
export interface TaxInvoiceParams {
  connectedId: string;
  invoiceType: "매출" | "매입";
  startDate: string; // YYYYMMDD
  endDate: string;   // YYYYMMDD
}

/** CODEF 은행 거래 원본 데이터 */
export interface CodefBankTransaction {
  resAccountTrDate: string;
  resAccountTrTime: string;
  resAccountIn: string;
  resAccountOut: string;
  resAfterTranBalance: string;
  resAccountDesc1: string;
  resAccountDesc2: string;
  resAccountDesc3: string;
}

/** CODEF 카드 승인 원본 데이터 */
export interface CodefCardApproval {
  resApprovalDate: string;
  resApprovalTime: string;
  resApprovalNo: string;
  resMemberStoreName: string;
  resMemberStoreType: string;
  resApprovalAmount: string;
  resCardNo: string;
}

/** CODEF 세금계산서 원본 데이터 */
export interface CodefTaxInvoice {
  resIssueDate: string;
  resApprovalNo: string;
  resSupBizNo: string;
  resSupCorpName: string;
  resBuyBizNo: string;
  resBuyCorpName: string;
  resSupplyValue: string;
  resTaxAmount: string;
  resTotalAmount: string;
  resIsElectronic: string;
}

/** CODEF 클라이언트 환경변수 */
interface CodefEnv {
  CODEF_CLIENT_ID: string;
  CODEF_CLIENT_SECRET: string;
  CODEF_PUBLIC_KEY: string;
}

/**
 * CODEF API 클라이언트
 *
 * Cloudflare Workers 환경에서 동작하며,
 * OAuth 토큰 관리 및 RSA 암호화를 Web Crypto API로 처리합니다.
 */
class CodefClient {
  private clientId: string;
  private clientSecret: string;
  private publicKey: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(clientId: string, clientSecret: string, publicKey: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.publicKey = publicKey;
  }

  // ──────────────────────────────────────────────
  // OAuth 토큰 관리
  // ──────────────────────────────────────────────

  /**
   * OAuth 액세스 토큰을 발급받습니다.
   * 토큰이 유효하면 캐시된 토큰을 반환합니다.
   * 만료 5분 전에 자동 갱신합니다.
   */
  async getAccessToken(): Promise<string> {
    // 유효한 토큰이 있으면 재사용 (만료 5분 전까지)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300_000) {
      return this.accessToken;
    }

    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);

    const response = await fetch(CODEF_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=read",
    });

    if (!response.ok) {
      throw new Error(`CODEF 토큰 발급 실패: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    // expires_in은 초 단위, 밀리초로 변환하여 만료 시점 기록
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }

  // ──────────────────────────────────────────────
  // RSA 암호화 (Web Crypto API)
  // ──────────────────────────────────────────────

  /**
   * RSA 공개키로 평문을 암호화합니다.
   * CODEF는 RSA PKCS1 v1.5 패딩을 사용합니다.
   * node-forge 라이브러리로 구현 (Web Crypto API는 PKCS1 encrypt 미지원).
   *
   * @param plainText - 암호화할 평문
   * @returns Base64 인코딩된 암호문
   */
  async encryptRSA(plainText: string): Promise<string> {
    const forge = await import("node-forge");

    // PEM 형식에서 Base64 키 데이터만 추출
    const pemContents = this.publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\s/g, "");

    // PEM 형식으로 변환하여 forge에 전달
    const pem = `-----BEGIN PUBLIC KEY-----\n${pemContents}\n-----END PUBLIC KEY-----`;
    const publicKey = forge.pki.publicKeyFromPem(pem);

    // RSA PKCS1 v1.5 암호화 (CODEF 요구사항)
    const encrypted = publicKey.encrypt(plainText, "RSAES-PKCS1-V1_5");

    // Binary string → Base64
    return forge.util.encode64(encrypted);
  }

  // ──────────────────────────────────────────────
  // Connected ID 관리
  // ──────────────────────────────────────────────

  /**
   * Connected ID를 등록합니다 (계좌/카드 연결).
   * 비밀번호는 자동으로 RSA 암호화됩니다.
   *
   * @param params - 연결 파라미터 (기관코드, 로그인 정보 등)
   * @returns connectedId
   */
  async createConnectedId(
    params: CreateConnectedIdParams,
  ): Promise<{ connectedId: string }> {
    const encryptedPassword = await this.encryptRSA(params.password);

    const body = {
      accountList: [
        {
          countryCode: params.countryCode,
          businessType: params.businessType,
          clientType: params.clientType,
          organization: params.organization,
          loginType: params.loginType,
          id: params.id,
          password: encryptedPassword,
        },
      ],
    };

    const data = (await this.callApi("/v1/account/create", body)) as {
      connectedId: string;
    };

    return { connectedId: data.connectedId };
  }

  // ──────────────────────────────────────────────
  // 은행 거래내역
  // ──────────────────────────────────────────────

  /**
   * 은행 거래내역을 조회합니다.
   *
   * @param params - 조회 파라미터 (connectedId, 계좌, 기간)
   * @returns 거래내역 배열
   */
  async getBankTransactions(
    params: BankTransactionParams,
  ): Promise<CodefBankTransaction[]> {
    const body = {
      connectedId: params.connectedId,
      organization: params.organization,
      account: params.account,
      startDate: params.startDate,
      endDate: params.endDate,
      orderBy: "0", // 최신순
      inquiryType: "1", // 전체
    };

    const data = (await this.callApi(
      "/v1/kr/bank/p/account/transaction-list",
      body,
    )) as { resTrHistoryList: CodefBankTransaction[] } | CodefBankTransaction[];

    // CODEF 응답 형식에 따라 배열 추출
    if (Array.isArray(data)) {
      return data;
    }
    return data.resTrHistoryList ?? [];
  }

  // ──────────────────────────────────────────────
  // 카드 승인내역
  // ──────────────────────────────────────────────

  /**
   * 카드 승인내역을 조회합니다.
   *
   * @param params - 조회 파라미터 (connectedId, 기관코드, 기간)
   * @returns 승인내역 배열
   */
  async getCardApprovals(
    params: CardApprovalParams,
  ): Promise<CodefCardApproval[]> {
    const body = {
      connectedId: params.connectedId,
      organization: params.organization,
      startDate: params.startDate,
      endDate: params.endDate,
      orderBy: "0",
      inquiryType: "0", // 승인내역
    };

    const data = (await this.callApi(
      "/v1/kr/card/p/account/approval-list",
      body,
    )) as { resApprovalList: CodefCardApproval[] } | CodefCardApproval[];

    if (Array.isArray(data)) {
      return data;
    }
    return data.resApprovalList ?? [];
  }

  // ──────────────────────────────────────────────
  // 홈택스 세금계산서
  // ──────────────────────────────────────────────

  /**
   * 홈택스 세금계산서를 조회합니다.
   *
   * @param params - 조회 파라미터 (connectedId, 매출/매입, 기간)
   * @returns 세금계산서 배열
   */
  async getTaxInvoices(
    params: TaxInvoiceParams,
  ): Promise<CodefTaxInvoice[]> {
    // 매출/매입에 따라 API 경로 분기
    const path =
      params.invoiceType === "매출"
        ? "/v1/kr/public/nt/tax-invoice/sales"
        : "/v1/kr/public/nt/tax-invoice/purchase";

    const body = {
      connectedId: params.connectedId,
      startDate: params.startDate,
      endDate: params.endDate,
      inquiryType: "0", // 전체
    };

    const data = (await this.callApi(path, body)) as
      | { resInvoiceList: CodefTaxInvoice[] }
      | CodefTaxInvoice[];

    if (Array.isArray(data)) {
      return data;
    }
    return data.resInvoiceList ?? [];
  }

  // ──────────────────────────────────────────────
  // 공통 API 호출
  // ──────────────────────────────────────────────

  /**
   * CODEF API를 호출합니다.
   * 토큰 자동 발급/갱신, 오류 처리를 포함합니다.
   *
   * @param path - API 경로 (예: "/v1/account/create")
   * @param body - 요청 바디
   * @returns 응답 data 필드
   */
  private async callApi(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const token = await this.getAccessToken();

    // CODEF는 URL-encoded JSON body를 요구 (SDK 동일 방식)
    const response = await fetch(`${CODEF_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeURIComponent(JSON.stringify(body)),
    });

    if (!response.ok) {
      throw new Error(`CODEF API 오류: HTTP ${response.status}`);
    }

    // CODEF는 URL-encoded JSON을 반환하는 경우가 있음
    const rawText = await response.text();
    let data: CodefResponse;
    try {
      data = JSON.parse(decodeURIComponent(rawText)) as CodefResponse;
    } catch {
      data = JSON.parse(rawText) as CodefResponse;
    }

    // 성공 코드 확인
    if (data.result?.code !== CODEF_SUCCESS_CODE) {
      throw new Error(
        `CODEF 오류: ${data.result?.code} - ${data.result?.message}` +
          (data.result?.extraMessage ? ` (${data.result.extraMessage})` : ""),
      );
    }

    return data.data;
  }
}

/**
 * CODEF API 클라이언트를 생성합니다.
 *
 * @param env - Cloudflare Workers 환경변수
 * @returns CodefClient 인스턴스
 */
export function createCodefClient(env: CodefEnv): CodefClient {
  return new CodefClient(
    env.CODEF_CLIENT_ID,
    env.CODEF_CLIENT_SECRET,
    env.CODEF_PUBLIC_KEY,
  );
}

export type { CodefClient };

// 프로덕션 전환 시 사용할 URL 상수도 export
export { CODEF_SANDBOX_URL, CODEF_PRODUCTION_URL };
