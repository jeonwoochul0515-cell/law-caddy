// 은행 거래 동기화 + AI 매칭 오케스트레이터
//
// 전체 플로우:
//   1. CODEF API로 은행 거래내역 수집
//   2. Firestore bank_transactions에 저장 (중복 방지)
//   3. 미매칭 입금 건을 AI 매칭 (사건/수임료 대조)
//   4. 높은 신뢰도(>=0.85): 자동 매출 생성
//   5. 낮은 신뢰도: 변호사 확인 대기 (pending_matches)

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  syncBankTransactions,
  matchDeposits,
} from "./codefApi";
import type { RawBankTransaction } from "./codefApi";
import {
  createRevenueFromFeePayment,
} from "./autoRevenue";
import type { FeePaymentType } from "./autoRevenue";
import { getFees } from "./firebase/accounting";
import { getCases } from "./firebase/firestore";
import type {
  CodefAccount,
  BankTransaction,
  MatchStatus,
  PendingMatch,
  PendingMatchStatus,
  PaymentType,
  AIMatchResult,
} from "../types/codef";
import type { Case } from "../types/case";
import type { Fee } from "../types/accounting";

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

/** 자동 매출 생성 최소 신뢰도 */
const AUTO_MATCH_THRESHOLD = 0.85;

// ─────────────────────────────────────────────
// 동기화 + 매칭 결과
// ─────────────────────────────────────────────

/** 동기화 + 매칭 결과 요약 */
export interface BankSyncResult {
  synced: number;          // 새로 저장된 거래 수
  autoMatched: number;     // 자동 매칭 + 매출 생성된 건수
  pendingReview: number;   // 변호사 확인 대기 건수
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/**
 * 거래 중복 방지 해시를 생성합니다.
 * 날짜_시간_금액_거래상대방 조합으로 고유 키를 만듭니다.
 */
function createTransactionHash(tx: RawBankTransaction): string {
  return `${tx.transactionDate}_${tx.transactionTime}_${tx.amount}_${tx.counterpartyName}`;
}

/**
 * Firestore에 이미 존재하는 transactionHash 목록을 조회합니다.
 */
async function getExistingHashes(
  ownerId: string,
  codefAccountId: string,
): Promise<Set<string>> {
  const q = query(
    collection(db!, "bank_transactions"),
    where("ownerId", "==", ownerId),
    where("codefAccountId", "==", codefAccountId),
  );
  const snapshot = await getDocs(q);
  const hashes = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.transactionHash) {
      hashes.add(data.transactionHash as string);
    }
  });
  return hashes;
}

/**
 * 미매칭 입금 거래를 조회합니다.
 */
async function getUnmatchedDeposits(
  ownerId: string,
  codefAccountId: string,
): Promise<Array<BankTransaction & { id: string }>> {
  const q = query(
    collection(db!, "bank_transactions"),
    where("ownerId", "==", ownerId),
    where("codefAccountId", "==", codefAccountId),
    where("type", "==", "입금"),
    where("matchStatus", "==", "unmatched"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Array<BankTransaction & { id: string }>;
}

/**
 * 미완납 수임료 중 다음 분할납부 금액을 조회합니다.
 */
function getNextInstallmentAmount(fee: Fee): number | undefined {
  // 분할납부 사용 건이 아니면 undefined
  if (!fee.useInstallment) return undefined;
  // totalOutstanding이 남은 금액
  return fee.totalOutstanding > 0 ? fee.totalOutstanding : undefined;
}

/**
 * PaymentType을 FeePaymentType으로 변환합니다.
 */
function toFeePaymentType(paymentType: PaymentType): FeePaymentType {
  switch (paymentType) {
    case "착수금": return "착수금";
    case "분할납부": return "분할납부";
    case "성공보수": return "성공보수";
    case "자문료": return "자문료";
    case "기타": return "착수금"; // 기타는 착수금으로 기본 처리
  }
}

/**
 * YYYYMMDD 날짜를 YYYY-MM-DD 형식으로 변환합니다.
 */
function formatDateForAccounting(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ─────────────────────────────────────────────
// 메인: 은행 동기화 + AI 매칭
// ─────────────────────────────────────────────

/**
 * 은행 거래내역 동기화 + AI 입금 매칭을 실행합니다.
 *
 * @param ownerId - 변호사 UID
 * @param codefAccount - CODEF 연결 계정 정보
 * @returns 동기화 + 매칭 결과 요약
 */
export async function runBankSyncAndMatch(
  ownerId: string,
  codefAccount: CodefAccount,
): Promise<BankSyncResult> {
  try {
    // ── 1. CODEF API로 거래내역 수집 ──
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const startDate = thirtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, "");
    const endDate = today.toISOString().slice(0, 10).replace(/-/g, "");

    const rawTransactions = await syncBankTransactions({
      connectedId: codefAccount.connectedId,
      organization: codefAccount.institutionCode,
      account: codefAccount.accountNumber ?? "",
      startDate,
      endDate,
    });

    // ── 2. 중복 제거 후 Firestore에 저장 ──
    const existingHashes = await getExistingHashes(ownerId, codefAccount.id);
    let syncedCount = 0;

    for (const raw of rawTransactions) {
      const hash = createTransactionHash(raw);

      // 이미 저장된 거래는 건너뛰기
      if (existingHashes.has(hash)) continue;

      const bankTx: Omit<BankTransaction, "id" | "createdAt"> = {
        ownerId,
        codefAccountId: codefAccount.id,
        transactionDate: raw.transactionDate,
        transactionTime: raw.transactionTime,
        type: raw.type === "입금" ? "입금" : "출금",
        amount: raw.amount,
        balance: raw.balance,
        counterpartyName: raw.counterpartyName,
        memo: raw.memo,
        transactionHash: hash,
        matchStatus: "unmatched" as MatchStatus,
      };

      await addDoc(collection(db!, "bank_transactions"), {
        ...bankTx,
        createdAt: serverTimestamp(),
      });

      syncedCount++;
    }

    // ── 3. 미매칭 입금 건 조회 ──
    const unmatchedDeposits = await getUnmatchedDeposits(ownerId, codefAccount.id);

    if (unmatchedDeposits.length === 0) {
      return { synced: syncedCount, autoMatched: 0, pendingReview: 0 };
    }

    // ── 4. 사건 + 수임료 목록 조회 (매칭 대조용) ──
    const [cases, fees] = await Promise.all([
      getCases(ownerId),
      getFees(ownerId),
    ]);

    // 진행중인 사건만 필터링
    const activeCases = cases.filter((c: Case) => c.status === "진행중");

    // 미완납 수임료만 필터링
    const outstandingFees = fees.filter((f: Fee) => f.totalOutstanding > 0);

    // ── 5. AI 매칭 호출 ──
    const matchResults = await matchDeposits({
      deposits: unmatchedDeposits.map((d) => ({
        id: d.id,
        transactionDate: d.transactionDate,
        amount: d.amount,
        counterpartyName: d.counterpartyName,
        memo: d.memo,
      })),
      cases: activeCases.map((c: Case) => ({
        id: c.id,
        clientName: c.clientName,
        caseType: c.caseType,
      })),
      fees: outstandingFees.map((f: Fee) => ({
        id: f.id,
        clientName: f.clientName,
        totalOutstanding: f.totalOutstanding,
        nextInstallmentAmount: getNextInstallmentAmount(f),
      })),
    });

    // ── 6. 매칭 결과 처리 ──
    let autoMatched = 0;
    let pendingReview = 0;

    for (const match of matchResults) {
      const deposit = unmatchedDeposits.find((d) => d.id === match.bankTransactionId);
      if (!deposit) continue;

      if (match.confidence >= AUTO_MATCH_THRESHOLD) {
        // 높은 신뢰도: 자동 매출 생성
        await handleAutoMatch(ownerId, deposit, match, outstandingFees);
        autoMatched++;
      } else {
        // 낮은 신뢰도: 변호사 확인 대기
        await createPendingMatch(ownerId, deposit, match);
        pendingReview++;
      }
    }

    return { synced: syncedCount, autoMatched, pendingReview };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`은행 동기화 + 매칭 실패: ${error.message}`);
    }
    throw new Error("은행 동기화 + 매칭 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 자동 매칭 처리
// ─────────────────────────────────────────────

/**
 * 높은 신뢰도 매칭 건에 대해 자동 매출을 생성합니다.
 */
async function handleAutoMatch(
  ownerId: string,
  deposit: BankTransaction & { id: string },
  match: AIMatchResult,
  fees: Fee[],
): Promise<void> {
  const fee = fees.find((f) => f.id === match.matchedFeeId);
  const clientName = fee?.clientName ?? deposit.counterpartyName;

  // 매출 자동 생성
  const transactionId = await createRevenueFromFeePayment({
    ownerId,
    caseId: match.matchedCaseId,
    feeId: match.matchedFeeId,
    clientName,
    paymentType: toFeePaymentType(match.paymentType),
    amount: deposit.amount,
    date: formatDateForAccounting(deposit.transactionDate),
    paymentMethod: "계좌이체",
  });

  // bank_transaction 상태 업데이트
  await updateDoc(doc(db!, "bank_transactions", deposit.id), {
    matchStatus: "auto_matched" as MatchStatus,
    matchedCaseId: match.matchedCaseId,
    matchedFeeId: match.matchedFeeId,
    matchedTransactionId: transactionId,
    matchConfidence: match.confidence,
    matchReason: match.reason,
  });
}

/**
 * 낮은 신뢰도 매칭 건을 pending_matches에 저장합니다.
 */
async function createPendingMatch(
  ownerId: string,
  deposit: BankTransaction & { id: string },
  match: AIMatchResult,
): Promise<void> {
  const summary = `${formatDateForAccounting(deposit.transactionDate)} / ${deposit.amount.toLocaleString()}원 / ${deposit.counterpartyName}`;

  const pendingMatch: Omit<PendingMatch, "id" | "createdAt"> = {
    ownerId,
    bankTransactionId: deposit.id,
    bankTransactionSummary: summary,
    candidates: [
      {
        caseId: match.matchedCaseId,
        feeId: match.matchedFeeId,
        clientName: deposit.counterpartyName,
        confidence: match.confidence,
        paymentType: match.paymentType,
        reason: match.reason,
      },
    ],
    status: "pending" as PendingMatchStatus,
  };

  await addDoc(collection(db!, "pending_matches"), {
    ...pendingMatch,
    createdAt: serverTimestamp(),
  });

  // bank_transaction 상태를 unmatched로 유지 (변호사 확인 전)
  await updateDoc(doc(db!, "bank_transactions", deposit.id), {
    matchConfidence: match.confidence,
    matchReason: match.reason,
  });
}

// ─────────────────────────────────────────────
// 변호사 수동 매칭 확인/거부
// ─────────────────────────────────────────────

/**
 * 변호사가 매칭 대기 건을 확인(승인)합니다.
 *
 * 1. 매출 자동 생성 (createRevenueFromFeePayment)
 * 2. bank_transaction 상태 → manual_matched
 * 3. pending_match 상태 → confirmed
 *
 * @param ownerId - 변호사 UID
 * @param pendingMatchId - pending_matches 문서 ID
 * @param selectedCaseId - 선택된 사건 ID
 * @param selectedFeeId - 선택된 수임료 ID
 * @param paymentType - 납부 유형
 */
export async function confirmMatch(
  ownerId: string,
  pendingMatchId: string,
  selectedCaseId: string,
  selectedFeeId: string,
  paymentType: FeePaymentType,
): Promise<void> {
  try {
    // pending_match 조회
    const { getDoc: firestoreGetDoc } = await import("firebase/firestore");
    const matchDoc = await firestoreGetDoc(doc(db!, "pending_matches", pendingMatchId));

    if (!matchDoc.exists()) {
      throw new Error("매칭 대기 건을 찾을 수 없습니다.");
    }

    const matchData = matchDoc.data() as PendingMatch;

    // bank_transaction 조회
    const bankTxDoc = await firestoreGetDoc(
      doc(db!, "bank_transactions", matchData.bankTransactionId),
    );

    if (!bankTxDoc.exists()) {
      throw new Error("은행 거래내역을 찾을 수 없습니다.");
    }

    const bankTx = bankTxDoc.data() as BankTransaction;

    // 수임료 조회 (의뢰인 이름용)
    const feeDoc = await firestoreGetDoc(doc(db!, "fees", selectedFeeId));
    const clientName = feeDoc.exists()
      ? (feeDoc.data() as Fee).clientName
      : bankTx.counterpartyName;

    // 1. 매출 생성
    const transactionId = await createRevenueFromFeePayment({
      ownerId,
      caseId: selectedCaseId,
      feeId: selectedFeeId,
      clientName,
      paymentType,
      amount: bankTx.amount,
      date: formatDateForAccounting(bankTx.transactionDate),
      paymentMethod: "계좌이체",
    });

    // 2. bank_transaction 상태 업데이트
    await updateDoc(doc(db!, "bank_transactions", matchData.bankTransactionId), {
      matchStatus: "manual_matched" as MatchStatus,
      matchedCaseId: selectedCaseId,
      matchedFeeId: selectedFeeId,
      matchedTransactionId: transactionId,
    });

    // 3. pending_match 상태 업데이트
    await updateDoc(doc(db!, "pending_matches", pendingMatchId), {
      status: "confirmed" as PendingMatchStatus,
      confirmedCaseId: selectedCaseId,
      confirmedFeeId: selectedFeeId,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`매칭 확인 실패: ${error.message}`);
    }
    throw new Error("매칭 확인 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 변호사가 매칭 대기 건을 거부합니다.
 *
 * 1. pending_match 상태 → rejected
 * 2. bank_transaction 상태 → ignored
 *
 * @param pendingMatchId - pending_matches 문서 ID
 */
export async function rejectMatch(pendingMatchId: string): Promise<void> {
  try {
    // pending_match 조회
    const { getDoc: firestoreGetDoc } = await import("firebase/firestore");
    const matchDoc = await firestoreGetDoc(doc(db!, "pending_matches", pendingMatchId));

    if (!matchDoc.exists()) {
      throw new Error("매칭 대기 건을 찾을 수 없습니다.");
    }

    const matchData = matchDoc.data() as PendingMatch;

    // 1. pending_match 상태 업데이트
    await updateDoc(doc(db!, "pending_matches", pendingMatchId), {
      status: "rejected" as PendingMatchStatus,
    });

    // 2. bank_transaction 상태 업데이트
    await updateDoc(doc(db!, "bank_transactions", matchData.bankTransactionId), {
      matchStatus: "ignored" as MatchStatus,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`매칭 거부 실패: ${error.message}`);
    }
    throw new Error("매칭 거부 중 알 수 없는 오류가 발생했습니다.");
  }
}
