// CODEF API 프론트엔드 클라이언트
//
// 모든 요청은 /api/codef/* 백엔드 프록시를 경유합니다.
// Firebase Auth 토큰을 Authorization 헤더에 첨부하여 인증합니다.

import { authHeaders } from "./api-auth";
import type {
  AIMatchResult,
  AIClassifyResult,
} from "../types/codef";

// ─────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────

/** 백엔드 에러 응답 구조 */
interface CodefProxyError {
  error: string;
  detail?: string;
}

/**
 * CODEF 프록시 엔드포인트에 POST 요청을 보냅니다.
 * 에러 발생 시 한국어 메시지를 포함한 Error를 throw합니다.
 */
async function codefPost<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const headers = await authHeaders({ "Content-Type": "application/json" });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as CodefProxyError;
      errorMessage = errorBody?.detail ?? errorBody?.error ?? errorMessage;
    } catch {
      /* JSON 파싱 실패 시 HTTP 상태 메시지 사용 */
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

// ─────────────────────────────────────────────
// CODEF 계좌 연결
// ─────────────────────────────────────────────

/** 계좌 연결 요청 파라미터 */
export interface ConnectAccountParams {
  type: "bank" | "card" | "hometax";
  organization: string;    // CODEF 기관코드
  loginType: string;       // 인증 방식 (공동인증서, ID/PW 등)
  id: string;              // 로그인 ID
  password: string;        // 로그인 비밀번호 (암호화 전송)
}

/** 계좌 연결 응답 */
interface ConnectAccountResponse {
  connectedId: string;
}

/**
 * CODEF에 은행/카드/홈택스 계정을 연결합니다.
 *
 * @param params - 연결 요청 파라미터
 * @returns connectedId (이후 동기화에 사용)
 * @throws 연결 실패 시 한국어 에러 메시지
 */
export async function connectCodefAccount(
  params: ConnectAccountParams,
): Promise<ConnectAccountResponse> {
  try {
    return await codefPost<ConnectAccountResponse>("/api/codef/connect", {
      type: params.type,
      organization: params.organization,
      loginType: params.loginType,
      id: params.id,
      password: params.password,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 연결 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 연결 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 은행 거래내역 동기화
// ─────────────────────────────────────────────

/** 은행 거래내역 동기화 파라미터 */
export interface SyncBankParams {
  connectedId: string;
  organization: string;     // 기관코드
  account: string;          // 계좌번호
  startDate: string;        // YYYYMMDD
  endDate: string;          // YYYYMMDD
}

/** 은행 거래 원시 데이터 (CODEF 응답) */
export interface RawBankTransaction {
  transactionDate: string;   // YYYYMMDD
  transactionTime: string;   // HHmmss
  type: string;              // "입금" | "출금"
  amount: number;
  balance: number;
  counterpartyName: string;
  memo: string;
}

/**
 * CODEF를 통해 은행 거래내역을 조회합니다.
 *
 * @param params - 동기화 파라미터
 * @returns 거래내역 배열
 */
export async function syncBankTransactions(
  params: SyncBankParams,
): Promise<RawBankTransaction[]> {
  try {
    return await codefPost<RawBankTransaction[]>("/api/codef/bank-sync", {
      connectedId: params.connectedId,
      organization: params.organization,
      account: params.account,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`은행 거래내역 동기화 실패: ${error.message}`);
    }
    throw new Error("은행 거래내역 동기화 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 입금 AI 매칭
// ─────────────────────────────────────────────

/** AI 매칭 요청 - 입금 건 */
export interface DepositForMatching {
  id: string;
  transactionDate: string;
  amount: number;
  counterpartyName: string;
  memo: string;
}

/** AI 매칭 요청 - 사건 정보 */
export interface CaseForMatching {
  id: string;
  clientName: string;
  caseType: string;
}

/** AI 매칭 요청 - 수임료 정보 */
export interface FeeForMatching {
  id: string;
  clientName: string;
  totalOutstanding: number;
  nextInstallmentAmount?: number;
}

/** AI 매칭 요청 파라미터 */
export interface MatchDepositsParams {
  deposits: DepositForMatching[];
  cases: CaseForMatching[];
  fees: FeeForMatching[];
}

/**
 * 입금 거래를 사건/수임료와 AI 매칭합니다.
 * 백엔드에서 Claude API를 호출하여 매칭 결과를 반환합니다.
 *
 * @param params - 매칭 요청 (입금 목록 + 사건/수임료 목록)
 * @returns AI 매칭 결과 배열
 */
export async function matchDeposits(
  params: MatchDepositsParams,
): Promise<AIMatchResult[]> {
  try {
    return await codefPost<AIMatchResult[]>("/api/codef/match-deposits", {
      deposits: params.deposits,
      cases: params.cases,
      fees: params.fees,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`입금 AI 매칭 실패: ${error.message}`);
    }
    throw new Error("입금 AI 매칭 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 카드 승인내역 동기화
// ─────────────────────────────────────────────

/** 카드 거래내역 동기화 파라미터 */
export interface SyncCardParams {
  connectedId: string;
  organization: string;     // 카드사 기관코드
  cardNumber: string;       // 카드번호
  startDate: string;        // YYYYMMDD
  endDate: string;          // YYYYMMDD
}

/** 카드 거래 원시 데이터 (CODEF 응답) */
export interface RawCardTransaction {
  approvalDate: string;      // YYYYMMDD
  approvalTime: string;      // HHmmss
  approvalNumber: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  cardNumberMasked: string;  // ****1234
}

/**
 * CODEF를 통해 카드 승인내역을 조회합니다.
 *
 * @param params - 동기화 파라미터
 * @returns 카드 거래내역 배열
 */
export async function syncCardTransactions(
  params: SyncCardParams,
): Promise<RawCardTransaction[]> {
  try {
    return await codefPost<RawCardTransaction[]>("/api/codef/card-sync", {
      connectedId: params.connectedId,
      organization: params.organization,
      cardNumber: params.cardNumber,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 거래내역 동기화 실패: ${error.message}`);
    }
    throw new Error("카드 거래내역 동기화 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 카드 경비 AI 분류
// ─────────────────────────────────────────────

/** AI 분류 요청 - 카드 거래 */
export interface CardTransactionForClassification {
  id: string;
  approvalDate: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
}

/** AI 분류 요청 - 사건 정보 */
export interface CaseForClassification {
  id: string;
  clientName: string;
  caseType: string;
  description: string;
}

/** AI 분류 요청 파라미터 */
export interface ClassifyCardExpensesParams {
  transactions: CardTransactionForClassification[];
  cases: CaseForClassification[];
}

/**
 * 카드 거래를 사건비용/사무소경비로 AI 분류합니다.
 * 백엔드에서 Claude API를 호출하여 분류 결과를 반환합니다.
 *
 * @param params - 분류 요청 (카드 거래 + 사건 목록)
 * @returns AI 분류 결과 배열
 */
export async function classifyCardExpenses(
  params: ClassifyCardExpensesParams,
): Promise<AIClassifyResult[]> {
  try {
    return await codefPost<AIClassifyResult[]>("/api/codef/classify-expenses", {
      transactions: params.transactions,
      cases: params.cases,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 경비 AI 분류 실패: ${error.message}`);
    }
    throw new Error("카드 경비 AI 분류 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 홈택스 세금계산서 동기화
// ─────────────────────────────────────────────

/** 세금계산서 동기화 파라미터 */
export interface SyncTaxInvoicesParams {
  connectedId: string;
  bizNumber: string;        // 사업자등록번호
  startDate: string;        // YYYYMMDD
  endDate: string;          // YYYYMMDD
  invoiceType: "매출" | "매입" | "전체";
}

/** 세금계산서 원시 데이터 (CODEF 응답) */
export interface RawTaxInvoice {
  issueDate: string;            // YYYYMMDD
  approvalNumber: string;
  supplierBizNumber: string;
  supplierName: string;
  buyerBizNumber: string;
  buyerName: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  isElectronic: boolean;
}

/**
 * CODEF를 통해 홈택스 세금계산서를 조회합니다.
 *
 * @param params - 동기화 파라미터
 * @returns 세금계산서 배열
 */
export async function syncTaxInvoices(
  params: SyncTaxInvoicesParams,
): Promise<RawTaxInvoice[]> {
  try {
    return await codefPost<RawTaxInvoice[]>("/api/codef/hometax-sync", {
      connectedId: params.connectedId,
      bizNumber: params.bizNumber,
      startDate: params.startDate,
      endDate: params.endDate,
      invoiceType: params.invoiceType,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`세금계산서 동기화 실패: ${error.message}`);
    }
    throw new Error("세금계산서 동기화 중 알 수 없는 오류가 발생했습니다.");
  }
}
