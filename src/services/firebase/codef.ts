// Firestore CRUD 서비스 — CODEF 연동
// CODEF 연결 계정(CodefAccounts), 은행 거래(BankTransactions),
// 매칭 대기(PendingMatches), 카드 거래(CardTransactions),
// 세금계산서(TaxInvoices)

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import type {
  CodefAccount,
  BankTransaction,
  PendingMatch,
  CardTransaction,
  TaxInvoice,
} from "../../types/codef";

// ──────────────────────────────────────────────
// CODEF Accounts (연결 계정)
// ──────────────────────────────────────────────

/** 연결 계정 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateCodefAccountData = Omit<CodefAccount, "id" | "createdAt">;

/**
 * 새 CODEF 연결 계정을 생성합니다.
 *
 * @param data - 연결 계정 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createCodefAccount(data: CreateCodefAccountData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "codef_accounts"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 생성 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 CODEF 연결 계정을 조회합니다.
 * ownerId 검증을 통해 다른 사용자의 데이터 접근을 방지합니다.
 *
 * @param id - 문서 ID
 * @param ownerId - 변호사 UID (소유권 검증용)
 * @returns 연결 계정 데이터 또는 null
 */
export async function getCodefAccount(id: string, ownerId: string): Promise<CodefAccount | null> {
  try {
    const docSnap = await getDoc(doc(db!, "codef_accounts", id));
    if (!docSnap.exists()) {
      return null;
    }
    const data = { ...docSnap.data(), id: docSnap.id } as CodefAccount;
    // 소유권 검증: 다른 사용자의 데이터 접근 차단
    if (data.ownerId !== ownerId) {
      return null;
    }
    return data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 조회 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 CODEF 연결 계정 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 연결 계정 목록 (최신순)
 */
export async function getCodefAccountsByOwner(ownerId: string): Promise<CodefAccount[]> {
  try {
    const q = query(
      collection(db!, "codef_accounts"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CodefAccount[];
    // 최신순 정렬
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 목록 조회 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * CODEF 연결 계정 정보를 업데이트합니다.
 *
 * @param id - 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateCodefAccount(
  id: string,
  data: Partial<Omit<CodefAccount, "id" | "createdAt">>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "codef_accounts", id), {
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 업데이트 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * CODEF 연결 계정을 삭제합니다.
 *
 * @param id - 문서 ID
 */
export async function deleteCodefAccount(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "codef_accounts", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`CODEF 계정 삭제 실패: ${error.message}`);
    }
    throw new Error("CODEF 계정 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Bank Transactions (은행 거래내역)
// ──────────────────────────────────────────────

/** 은행 거래 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateBankTransactionData = Omit<BankTransaction, "id" | "createdAt">;

/**
 * 새 은행 거래내역을 생성합니다.
 *
 * @param data - 거래내역 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createBankTransaction(data: CreateBankTransactionData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "bank_transactions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`은행 거래내역 생성 실패: ${error.message}`);
    }
    throw new Error("은행 거래내역 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 CODEF 계정의 은행 거래내역을 조회합니다.
 *
 * @param codefAccountId - CODEF 연결 계정 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 거래내역 목록 (날짜 최신순)
 */
export async function getBankTransactionsByAccount(
  codefAccountId: string,
  ownerId: string,
): Promise<BankTransaction[]> {
  try {
    const q = query(
      collection(db!, "bank_transactions"),
      where("codefAccountId", "==", codefAccountId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as BankTransaction[];
    // 거래일 + 시간 최신순 정렬
    return results.sort((a, b) => {
      const dateCompare = b.transactionDate.localeCompare(a.transactionDate);
      if (dateCompare !== 0) return dateCompare;
      return b.transactionTime.localeCompare(a.transactionTime);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`은행 거래내역 조회 실패: ${error.message}`);
    }
    throw new Error("은행 거래내역 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 미매칭 은행 거래내역을 조회합니다.
 * (matchStatus === "unmatched"인 입금 건만)
 *
 * @param ownerId - 변호사 UID
 * @returns 미매칭 거래내역 목록 (날짜 최신순)
 */
export async function getUnmatchedBankTransactions(
  ownerId: string,
): Promise<BankTransaction[]> {
  try {
    const q = query(
      collection(db!, "bank_transactions"),
      where("ownerId", "==", ownerId),
      where("matchStatus", "==", "unmatched"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as BankTransaction[];
    return results.sort((a, b) => {
      const dateCompare = b.transactionDate.localeCompare(a.transactionDate);
      if (dateCompare !== 0) return dateCompare;
      return b.transactionTime.localeCompare(a.transactionTime);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`미매칭 거래내역 조회 실패: ${error.message}`);
    }
    throw new Error("미매칭 거래내역 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 은행 거래내역의 매칭 상태를 업데이트합니다.
 *
 * @param id - 문서 ID
 * @param data - 업데이트할 필드 (매칭 관련)
 */
export async function updateBankTransaction(
  id: string,
  data: Partial<Pick<
    BankTransaction,
    "matchStatus" | "matchedCaseId" | "matchedFeeId" | "matchedTransactionId" | "matchConfidence" | "matchReason"
  >>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "bank_transactions", id), {
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`은행 거래내역 업데이트 실패: ${error.message}`);
    }
    throw new Error("은행 거래내역 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Pending Matches (매칭 대기 건)
// ──────────────────────────────────────────────

/** 매칭 대기 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreatePendingMatchData = Omit<PendingMatch, "id" | "createdAt">;

/**
 * 새 매칭 대기 건을 생성합니다.
 *
 * @param data - 매칭 대기 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createPendingMatch(data: CreatePendingMatchData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "pending_matches"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`매칭 대기 생성 실패: ${error.message}`);
    }
    throw new Error("매칭 대기 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 대기 중인 매칭 건을 조회합니다.
 * (status === "pending"인 건만)
 *
 * @param ownerId - 변호사 UID
 * @returns 대기 중인 매칭 건 목록 (최신순)
 */
export async function getPendingMatchesByOwner(ownerId: string): Promise<PendingMatch[]> {
  try {
    const q = query(
      collection(db!, "pending_matches"),
      where("ownerId", "==", ownerId),
      where("status", "==", "pending"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as PendingMatch[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`매칭 대기 목록 조회 실패: ${error.message}`);
    }
    throw new Error("매칭 대기 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 매칭 대기 건을 확인/거부합니다.
 *
 * @param id - 문서 ID
 * @param data - 확인/거부 데이터
 */
export async function updatePendingMatch(
  id: string,
  data: Partial<Pick<PendingMatch, "status" | "confirmedCaseId" | "confirmedFeeId">>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "pending_matches", id), {
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`매칭 대기 업데이트 실패: ${error.message}`);
    }
    throw new Error("매칭 대기 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Card Transactions (카드 거래내역)
// ──────────────────────────────────────────────

/** 카드 거래 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateCardTransactionData = Omit<CardTransaction, "id" | "createdAt">;

/**
 * 새 카드 거래내역을 생성합니다.
 *
 * @param data - 카드 거래 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createCardTransaction(data: CreateCardTransactionData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "card_transactions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 거래내역 생성 실패: ${error.message}`);
    }
    throw new Error("카드 거래내역 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 CODEF 계정의 카드 거래내역을 조회합니다.
 *
 * @param codefAccountId - CODEF 연결 계정 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 카드 거래내역 목록 (날짜 최신순)
 */
export async function getCardTransactionsByAccount(
  codefAccountId: string,
  ownerId: string,
): Promise<CardTransaction[]> {
  try {
    const q = query(
      collection(db!, "card_transactions"),
      where("codefAccountId", "==", codefAccountId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CardTransaction[];
    // 승인일 + 시간 최신순 정렬
    return results.sort((a, b) => {
      const dateCompare = b.approvalDate.localeCompare(a.approvalDate);
      if (dateCompare !== 0) return dateCompare;
      return b.approvalTime.localeCompare(a.approvalTime);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 거래내역 조회 실패: ${error.message}`);
    }
    throw new Error("카드 거래내역 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 미분류 카드 거래내역을 조회합니다.
 * (classificationStatus === "unclassified"인 건만)
 *
 * @param ownerId - 변호사 UID
 * @returns 미분류 카드 거래내역 목록 (날짜 최신순)
 */
export async function getUnclassifiedCardTransactions(
  ownerId: string,
): Promise<CardTransaction[]> {
  try {
    const q = query(
      collection(db!, "card_transactions"),
      where("ownerId", "==", ownerId),
      where("classificationStatus", "==", "unclassified"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CardTransaction[];
    return results.sort((a, b) => {
      const dateCompare = b.approvalDate.localeCompare(a.approvalDate);
      if (dateCompare !== 0) return dateCompare;
      return b.approvalTime.localeCompare(a.approvalTime);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`미분류 카드 거래내역 조회 실패: ${error.message}`);
    }
    throw new Error("미분류 카드 거래내역 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 카드 거래내역의 분류 정보를 업데이트합니다.
 *
 * @param id - 문서 ID
 * @param data - 업데이트할 필드 (분류 관련)
 */
export async function updateCardTransaction(
  id: string,
  data: Partial<Pick<
    CardTransaction,
    | "classificationStatus"
    | "classifiedAs"
    | "classifiedCategory"
    | "linkedCaseId"
    | "linkedRecordId"
    | "classificationConfidence"
    | "classificationReason"
  >>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "card_transactions", id), {
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 거래내역 업데이트 실패: ${error.message}`);
    }
    throw new Error("카드 거래내역 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Tax Invoices (홈택스 세금계산서)
// ──────────────────────────────────────────────

/** 세금계산서 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateTaxInvoiceData = Omit<TaxInvoice, "id" | "createdAt">;

/**
 * 새 세금계산서를 생성합니다.
 *
 * @param data - 세금계산서 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createTaxInvoice(data: CreateTaxInvoiceData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "tax_invoices"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`세금계산서 생성 실패: ${error.message}`);
    }
    throw new Error("세금계산서 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 세금계산서 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 세금계산서 목록 (발행일 최신순)
 */
export async function getTaxInvoicesByOwner(ownerId: string): Promise<TaxInvoice[]> {
  try {
    const q = query(
      collection(db!, "tax_invoices"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as TaxInvoice[];
    // 발행일 최신순 정렬
    return results.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`세금계산서 목록 조회 실패: ${error.message}`);
    }
    throw new Error("세금계산서 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 미매칭 세금계산서를 조회합니다.
 * (matchStatus === "unmatched"인 건만)
 *
 * @param ownerId - 변호사 UID
 * @returns 미매칭 세금계산서 목록 (발행일 최신순)
 */
export async function getUnmatchedTaxInvoices(ownerId: string): Promise<TaxInvoice[]> {
  try {
    const q = query(
      collection(db!, "tax_invoices"),
      where("ownerId", "==", ownerId),
      where("matchStatus", "==", "unmatched"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as TaxInvoice[];
    return results.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`미매칭 세금계산서 조회 실패: ${error.message}`);
    }
    throw new Error("미매칭 세금계산서 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 세금계산서의 매칭 상태를 업데이트합니다.
 *
 * @param id - 문서 ID
 * @param data - 업데이트할 필드 (매칭 관련)
 */
export async function updateTaxInvoice(
  id: string,
  data: Partial<Pick<TaxInvoice, "matchedTransactionId" | "matchStatus">>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "tax_invoices", id), {
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`세금계산서 업데이트 실패: ${error.message}`);
    }
    throw new Error("세금계산서 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}
