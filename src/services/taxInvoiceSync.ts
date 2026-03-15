/**
 * 홈택스 세금계산서 동기화 + 거래 자동 매칭 서비스
 *
 * 1. CODEF 홈택스 API를 통해 매출/매입 세금계산서 조회
 * 2. Firestore tax_invoices 컬렉션에 저장 (승인번호 기준 중복 제거)
 * 3. 기존 transactions와 자동 매칭 (날짜 ±3일 + 금액 일치 + 거래처 유사)
 * 4. 매칭 시 transaction.evidenceType = "세금계산서"로 갱신
 *
 * 관련 Firestore 컬렉션:
 *   tax_invoices/{invoiceId}    - 세금계산서 원본
 *   transactions/{txId}         - 매출/매입 거래
 */

import { authHeaders } from "./api-auth";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { isDemoMode } from "../config/firebase";
import type { TaxInvoice, InvoiceType } from "../types/codef";
import type { Transaction } from "../types/accounting";

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

/** API 응답의 세금계산서 항목 (Firestore 저장 전) */
interface RawInvoice {
  issueDate: string;
  approvalNumber: string;
  supplierBizNumber: string;
  supplierName: string;
  buyerBizNumber: string;
  buyerName: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  isElectronic: boolean;
  invoiceType: InvoiceType;
}

/** 동기화 결과 */
export interface TaxInvoiceSyncResult {
  /** 조회된 세금계산서 총 건수 */
  total: number;
  /** 신규 저장 건수 */
  newlyAdded: number;
  /** 자동 매칭 성공 건수 */
  autoMatched: number;
  /** 미매칭 건수 */
  unmatched: number;
}

/** 데모 모드용 더미 결과 */
const DEMO_RESULT: TaxInvoiceSyncResult = {
  total: 5,
  newlyAdded: 3,
  autoMatched: 2,
  unmatched: 1,
};

// ─────────────────────────────────────────────
// 메인 동기화 함수
// ─────────────────────────────────────────────

/**
 * 홈택스 세금계산서를 동기화하고 기존 거래와 자동 매칭합니다.
 *
 * @param ownerId    변호사 UID
 * @param connectedId CODEF connectedId
 * @param invoiceType "매출" 또는 "매입"
 * @param startDate  조회 시작일 (YYYYMMDD)
 * @param endDate    조회 종료일 (YYYYMMDD)
 */
export async function syncTaxInvoices(
  ownerId: string,
  connectedId: string,
  invoiceType: InvoiceType,
  startDate: string,
  endDate: string,
): Promise<TaxInvoiceSyncResult> {
  // 데모 모드: 실제 API 호출 없이 더미 결과 반환
  if (isDemoMode) {
    return DEMO_RESULT;
  }

  // 1) 백엔드 API 호출 — 홈택스 세금계산서 조회
  const resp = await fetch("/api/codef/hometax-sync", {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ connectedId, invoiceType, startDate, endDate }),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: string; detail?: string };
    throw new Error(
      err.detail ?? err.error ?? `세금계산서 조회 실패 (HTTP ${resp.status})`,
    );
  }

  const { invoices } = (await resp.json()) as { invoices: RawInvoice[] };

  if (!invoices || invoices.length === 0) {
    return { total: 0, newlyAdded: 0, autoMatched: 0, unmatched: 0 };
  }

  // 2) 기존 세금계산서 승인번호 조회 (중복 제거용)
  const existingApprovalNumbers = await getExistingApprovalNumbers(
    ownerId,
    invoiceType,
  );

  // 3) 기존 거래내역 조회 (자동 매칭용)
  const transactions = await getTransactionsForMatching(
    ownerId,
    invoiceType,
    startDate,
    endDate,
  );

  // 4) 신규 세금계산서 저장 + 자동 매칭
  let newlyAdded = 0;
  let autoMatched = 0;

  for (const invoice of invoices) {
    // 승인번호로 중복 확인
    if (existingApprovalNumbers.has(invoice.approvalNumber)) {
      continue;
    }

    // Firestore에 세금계산서 저장
    const invoiceDocRef = await addDoc(collection(db!, "tax_invoices"), {
      ownerId,
      invoiceType: invoice.invoiceType,
      issueDate: invoice.issueDate,
      approvalNumber: invoice.approvalNumber,
      supplierBizNumber: invoice.supplierBizNumber,
      supplierName: invoice.supplierName,
      buyerBizNumber: invoice.buyerBizNumber,
      buyerName: invoice.buyerName,
      supplyAmount: invoice.supplyAmount,
      vatAmount: invoice.vatAmount,
      totalAmount: invoice.totalAmount,
      isElectronic: invoice.isElectronic,
      matchStatus: "unmatched" as const,
      createdAt: serverTimestamp(),
    });

    newlyAdded++;

    // 거래 자동 매칭 시도
    const matchedTx = findMatchingTransaction(
      invoice,
      transactions,
      invoiceType,
    );

    if (matchedTx) {
      // 세금계산서에 매칭 정보 업데이트
      await updateDoc(doc(db!, "tax_invoices", invoiceDocRef.id), {
        matchedTransactionId: matchedTx.id,
        matchStatus: "auto_matched" as const,
      });

      // 거래에 증빙 정보 업데이트
      await updateDoc(doc(db!, "transactions", matchedTx.id), {
        evidenceType: "세금계산서" as const,
        taxInvoice: {
          issueDate: invoice.issueDate,
          issueNumber: invoice.approvalNumber,
          supplierBizNumber: invoice.supplierBizNumber,
          buyerBizNumber: invoice.buyerBizNumber,
          electronicIssued: invoice.isElectronic,
          reportedToNTS: true, // 홈택스에서 조회되었으므로 국세청 전송 완료
        },
        updatedAt: serverTimestamp(),
      });

      // 매칭된 거래는 목록에서 제거 (1:1 매칭)
      const matchedIdx = transactions.indexOf(matchedTx);
      if (matchedIdx !== -1) {
        transactions.splice(matchedIdx, 1);
      }

      autoMatched++;
    }
  }

  return {
    total: invoices.length,
    newlyAdded,
    autoMatched,
    unmatched: newlyAdded - autoMatched,
  };
}

// ─────────────────────────────────────────────
// Firestore 조회 헬퍼
// ─────────────────────────────────────────────

/**
 * 기존 세금계산서의 승인번호 집합을 조회합니다.
 * 중복 저장 방지에 사용합니다.
 */
async function getExistingApprovalNumbers(
  ownerId: string,
  invoiceType: InvoiceType,
): Promise<Set<string>> {
  const q = query(
    collection(db!, "tax_invoices"),
    where("ownerId", "==", ownerId),
    where("invoiceType", "==", invoiceType),
  );
  const snapshot = await getDocs(q);
  const numbers = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as TaxInvoice;
    if (data.approvalNumber) {
      numbers.add(data.approvalNumber);
    }
  });
  return numbers;
}

/**
 * 매칭 대상 거래내역을 조회합니다.
 * 날짜 범위를 ±3일 확장하여 조회합니다.
 */
async function getTransactionsForMatching(
  ownerId: string,
  invoiceType: InvoiceType,
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  // 매칭 날짜 범위 확장 (±3일)
  const expandedStart = adjustDate(startDate, -3);
  const expandedEnd = adjustDate(endDate, 3);

  // 매출 세금계산서 → 매출 거래, 매입 세금계산서 → 매입 거래
  const txType = invoiceType === "매출" ? "매출" : "매입";

  const q = query(
    collection(db!, "transactions"),
    where("ownerId", "==", ownerId),
    where("type", "==", txType),
  );
  const snapshot = await getDocs(q);

  const results = snapshot.docs
    .map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    }) as Transaction)
    .filter((tx) => {
      // 날짜 범위 필터 (YYYY-MM-DD 형식)
      const txDate = tx.date.replace(/-/g, "");
      return txDate >= expandedStart && txDate <= expandedEnd;
    })
    .filter((tx) => {
      // 이미 세금계산서 증빙이 있는 거래는 제외
      return tx.evidenceType !== "세금계산서";
    });

  return results;
}

// ─────────────────────────────────────────────
// 거래 자동 매칭
// ─────────────────────────────────────────────

/** 매칭 허용 날짜 차이 (일) */
const DATE_TOLERANCE_DAYS = 3;

/** 거래처명 유사도 임계값 */
const NAME_SIMILARITY_THRESHOLD = 0.5;

/**
 * 세금계산서와 매칭되는 기존 거래를 찾습니다.
 *
 * 매칭 기준:
 *   1. 금액 완전 일치 (공급가액+부가세 = 합계금액)
 *   2. 날짜 ±3일 이내
 *   3. 거래처명 유사도 50% 이상
 *
 * 여러 후보가 있으면 날짜가 가장 가까운 거래를 선택합니다.
 */
function findMatchingTransaction(
  invoice: RawInvoice,
  transactions: Transaction[],
  invoiceType: InvoiceType,
): Transaction | null {
  // 매칭 대상 거래처명: 매출이면 공급받는자, 매입이면 공급자
  const counterpartyName =
    invoiceType === "매출" ? invoice.buyerName : invoice.supplierName;

  const issueDateObj = parseDate(invoice.issueDate);
  if (!issueDateObj) return null;

  // 후보 거래 + 날짜 차이 수집
  const candidates: Array<{ tx: Transaction; dateDiff: number }> = [];

  for (const tx of transactions) {
    // 1) 금액 일치 확인 (합계금액 기준)
    if (tx.vat.totalAmount !== invoice.totalAmount) {
      continue;
    }

    // 2) 날짜 차이 확인 (±3일)
    const txDateStr = tx.date.replace(/-/g, "");
    const txDateObj = parseDate(txDateStr);
    if (!txDateObj) continue;

    const daysDiff = Math.abs(diffDays(issueDateObj, txDateObj));
    if (daysDiff > DATE_TOLERANCE_DAYS) {
      continue;
    }

    // 3) 거래처명 유사도 확인
    const txCounterparty = tx.clientName ?? "";
    const similarity = calcNameSimilarity(counterpartyName, txCounterparty);
    if (similarity < NAME_SIMILARITY_THRESHOLD) {
      continue;
    }

    candidates.push({ tx, dateDiff: daysDiff });
  }

  if (candidates.length === 0) return null;

  // 날짜가 가장 가까운 거래 선택
  candidates.sort((a, b) => a.dateDiff - b.dateDiff);
  return candidates[0].tx;
}

// ─────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────

/**
 * YYYYMMDD 문자열에 일수를 더하거나 빼서 새 YYYYMMDD를 반환합니다.
 */
function adjustDate(yyyymmdd: string, days: number): string {
  const d = parseDate(yyyymmdd);
  if (!d) return yyyymmdd;
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/** YYYYMMDD → Date 파싱 */
function parseDate(yyyymmdd: string): Date | null {
  if (yyyymmdd.length !== 8) return null;
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

/** Date → YYYYMMDD */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 두 Date 간 일수 차이 (절대값 아님) */
function diffDays(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * 두 문자열의 유사도를 계산합니다 (0~1).
 *
 * 방식:
 *   - 공백/특수문자 제거 후 비교
 *   - 한쪽이 다른 쪽을 포함하면 0.8 이상
 *   - 2-gram 기반 유사도
 */
function calcNameSimilarity(a: string, b: string): number {
  const cleanA = normalizeName(a);
  const cleanB = normalizeName(b);

  // 빈 문자열 처리
  if (!cleanA || !cleanB) return 0;

  // 완전 일치
  if (cleanA === cleanB) return 1.0;

  // 한쪽이 다른 쪽을 포함하면 높은 유사도
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
    return 0.85;
  }

  // 2-gram 유사도 (Dice coefficient)
  const gramsA = bigrams(cleanA);
  const gramsB = bigrams(cleanB);

  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersection = 0;
  gramsA.forEach((gram) => {
    if (gramsB.has(gram)) intersection++;
  });

  return (2 * intersection) / (gramsA.size + gramsB.size);
}

/** 문자열 정규화: 공백/특수문자 제거, 소문자 변환 */
function normalizeName(s: string): string {
  return s
    .replace(/[\s\-().,;:'"!@#$%^&*+=<>{}[\]/\\|`~]/g, "") // 공백/특수문자 제거
    .toLowerCase();
}

/** 문자열의 2-gram 집합 생성 */
function bigrams(s: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.slice(i, i + 2));
  }
  return result;
}
