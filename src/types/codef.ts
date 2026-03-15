/**
 * LAW-CADDY CODEF API 연동 데이터 모델
 *
 * CODEF API를 통한 은행/카드/홈택스 데이터 자동 수집 및
 * AI 기반 사건-거래 자동 매칭을 위한 타입 정의.
 *
 * Firestore 컬렉션 구조:
 *   codef_accounts/{accountId}         - CODEF 연결 계정 (은행/카드/홈택스)
 *   bank_transactions/{txId}           - 은행 거래내역
 *   pending_matches/{matchId}          - AI 매칭 대기 건
 *   card_transactions/{txId}           - 카드 거래내역
 *   tax_invoices/{invoiceId}           - 홈택스 세금계산서
 *
 * 관계:
 *   bank_transactions.codefAccountId   → codef_accounts.id
 *   bank_transactions.matchedCaseId    → cases.id
 *   bank_transactions.matchedFeeId     → fees.id
 *   card_transactions.codefAccountId   → codef_accounts.id
 *   card_transactions.linkedCaseId     → cases.id
 *   pending_matches.bankTransactionId  → bank_transactions.id
 *
 * 모든 컬렉션은 ownerId로 변호사(사무소) 데이터 격리.
 * Firestore 보안 규칙: request.auth.uid == resource.data.ownerId
 */

import type { Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────────
// CODEF 연결 계정
// ─────────────────────────────────────────────

/** CODEF 연결 계정 유형 */
export type CodefAccountType = "bank" | "card" | "hometax";

/** 동기화 상태 */
export type SyncStatus = "idle" | "syncing" | "error";

/** CODEF 연결 계정 */
export interface CodefAccount {
  id: string;
  ownerId: string;
  type: CodefAccountType;
  institutionCode: string;      // CODEF 기관코드
  institutionName: string;      // 표시용 기관명
  accountNumber?: string;       // 마스킹 (****1234)
  connectedId: string;          // CODEF connected ID
  alias: string;                // 사용자 설정 별명
  lastSyncAt?: Timestamp;
  syncStatus: SyncStatus;
  errorMessage?: string;
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// 은행 거래내역
// ─────────────────────────────────────────────

/** 은행 거래 유형 */
export type BankTransactionType = "입금" | "출금";

/** 매칭 상태 */
export type MatchStatus = "unmatched" | "auto_matched" | "manual_matched" | "ignored";

/** 은행 거래내역 */
export interface BankTransaction {
  id: string;
  ownerId: string;
  codefAccountId: string;
  transactionDate: string;        // YYYYMMDD
  transactionTime: string;        // HHmmss
  type: BankTransactionType;
  amount: number;
  balance: number;
  counterpartyName: string;       // 입금자/수취인
  memo: string;
  transactionHash: string;        // 중복 방지 키 (날짜+시간+금액+잔액 해시)
  matchStatus: MatchStatus;
  matchedCaseId?: string;
  matchedFeeId?: string;
  matchedTransactionId?: string;  // accounting transactions 연결
  matchConfidence?: number;       // AI 매칭 신뢰도 (0~1)
  matchReason?: string;           // AI 매칭 사유
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// AI 매칭
// ─────────────────────────────────────────────

/** 수임료 납부 유형 */
export type PaymentType = "착수금" | "분할납부" | "성공보수" | "자문료" | "기타";

/** AI 매칭 후보 */
export interface MatchCandidate {
  caseId: string;
  feeId: string;
  clientName: string;
  confidence: number;             // 0~1
  paymentType: PaymentType;
  reason: string;
}

/** 매칭 대기 상태 */
export type PendingMatchStatus = "pending" | "confirmed" | "rejected";

/** 매칭 대기 건 */
export interface PendingMatch {
  id: string;
  ownerId: string;
  bankTransactionId: string;
  bankTransactionSummary: string;  // "2025-03-15 / 5,000,000원 / 김○○"
  candidates: MatchCandidate[];
  status: PendingMatchStatus;
  confirmedCaseId?: string;
  confirmedFeeId?: string;
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// 카드 거래내역
// ─────────────────────────────────────────────

/** 카드 거래 분류 상태 */
export type ClassificationStatus =
  | "unclassified"
  | "auto_classified"
  | "manual_classified"
  | "ignored";

/** 카드 거래 분류 유형 */
export type ClassifiedType = "case_expense" | "office_expense" | "transaction" | "ignore";

/** 카드 거래내역 */
export interface CardTransaction {
  id: string;
  ownerId: string;
  codefAccountId: string;
  approvalDate: string;           // YYYYMMDD
  approvalTime: string;           // HHmmss
  approvalNumber: string;
  merchantName: string;
  merchantCategory: string;
  amount: number;
  cardNumberMasked: string;       // ****1234
  classificationStatus: ClassificationStatus;
  classifiedAs?: ClassifiedType;
  classifiedCategory?: string;    // 세부 분류 (예: "교통비", "인지대")
  linkedCaseId?: string;
  linkedRecordId?: string;        // 연결된 사건비용/경비 문서 ID
  classificationConfidence?: number;  // AI 분류 신뢰도 (0~1)
  classificationReason?: string;  // AI 분류 사유
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// 홈택스 세금계산서
// ─────────────────────────────────────────────

/** 세금계산서 유형 */
export type InvoiceType = "매출" | "매입";

/** 홈택스 세금계산서 */
export interface TaxInvoice {
  id: string;
  ownerId: string;
  invoiceType: InvoiceType;
  issueDate: string;              // YYYYMMDD
  approvalNumber: string;
  supplierBizNumber: string;      // 공급자 사업자등록번호
  supplierName: string;
  buyerBizNumber: string;         // 공급받는자 사업자등록번호
  buyerName: string;
  supplyAmount: number;           // 공급가액
  vatAmount: number;              // 부가세
  totalAmount: number;            // 합계금액
  isElectronic: boolean;          // 전자세금계산서 여부
  matchedTransactionId?: string;  // 연결된 매출/매입 거래
  matchStatus: MatchStatus;
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────
// API 응답/결과 타입
// ─────────────────────────────────────────────

/** CODEF API 응답 공통 구조 */
export interface CodefApiResponse<T = unknown> {
  result: {
    code: string;                 // "CF-00000" = 성공
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: T;
}

/** 동기화 결과 */
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  newCount: number;
  errorMessage?: string;
  syncedAt: string;               // ISO 8601
}

/** AI 매칭 결과 (Claude API → 은행 거래 매칭) */
export interface AIMatchResult {
  bankTransactionId: string;
  matchedCaseId: string;
  matchedFeeId: string;
  confidence: number;
  paymentType: PaymentType;
  reason: string;
}

/** AI 분류 결과 (Claude API → 카드 거래 분류) */
export interface AIClassifyResult {
  cardTransactionId: string;
  recordType: ClassifiedType;
  category: string;
  subType: string;
  isCaseRelated: boolean;
  linkedCaseId: string | null;
  confidence: number;
  reason: string;
}
