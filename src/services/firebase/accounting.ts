// Firestore CRUD 서비스 — 재무/회계
// 수임료(Fees), 분할납부(Installments), 사건비용(CaseExpenses),
// 매출매입(Transactions), 사무소경비(OfficeExpenses),
// 예수금(Deposits), 월별요약(MonthlySummary)

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import type {
  Fee,
  Installment,
  CaseExpense,
  Transaction,
  OfficeExpense,
  Deposit,
  MonthlySummary,
} from "../../types/accounting";

// ──────────────────────────────────────────────
// Fee 집계 재계산 유틸리티
// ──────────────────────────────────────────────

/**
 * 수임료의 총 약정액, 총 입금액, 미수금, 상태를 재계산합니다.
 *
 * totalAgreedAmount = retainer.amount + 분할납부 총 예정액 + 성공보수 청구액(있을 때)
 * totalPaidAmount   = retainer.paidAmount + 분할납부 실납부 합계 + 성공보수 입금액
 * totalOutstanding  = max(0, totalAgreedAmount - totalPaidAmount)
 * status            = 완납 / 미완납 / 초과납부
 */
export function recalculateFeeTotals(
  fee: Fee,
  installments: Installment[],
): Pick<Fee, "totalAgreedAmount" | "totalPaidAmount" | "totalOutstanding" | "status" | "installmentCount" | "totalInstallmentAmount"> {
  // 착수금
  const retainerAgreed = fee.retainer.amount ?? 0;
  const retainerPaid = fee.retainer.paidAmount ?? 0;

  // 분할납부 (잔금)
  const installmentAgreed = installments.reduce((s, i) => s + i.amount, 0);
  const installmentPaid = installments.reduce((s, i) => s + i.paidAmount, 0);

  // 성공보수 — 청구 가능/완료/입금완료 상태일 때만 약정액에 포함
  let successFeeAgreed = 0;
  let successFeePaid = 0;
  if (fee.successFee.agreed) {
    const sf = fee.successFee;
    if (sf.status === "청구가능" || sf.status === "청구완료" || sf.status === "입금완료") {
      successFeeAgreed = sf.claimedAmount ?? sf.fixedAmount ?? 0;
    }
    successFeePaid = sf.paidAmount ?? 0;
  }

  const totalAgreedAmount = retainerAgreed + installmentAgreed + successFeeAgreed;
  const totalPaidAmount = retainerPaid + installmentPaid + successFeePaid;
  const totalOutstanding = Math.max(0, totalAgreedAmount - totalPaidAmount);

  let status: Fee["status"];
  if (fee.status === "면제") {
    status = "면제";
  } else if (totalPaidAmount > totalAgreedAmount && totalAgreedAmount > 0) {
    status = "초과납부";
  } else if (totalPaidAmount >= totalAgreedAmount && totalAgreedAmount > 0) {
    status = "완납";
  } else {
    status = "미완납";
  }

  return {
    totalAgreedAmount,
    totalPaidAmount,
    totalOutstanding,
    status,
    installmentCount: installments.length,
    totalInstallmentAmount: installmentAgreed,
  };
}

// ──────────────────────────────────────────────
// Fees (수임료)
// ──────────────────────────────────────────────

/** 수임료 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateFeeData = Omit<Fee, "id" | "createdAt" | "updatedAt">;

/**
 * 새 수임료를 생성합니다.
 *
 * @param data - 수임료 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 수임료 문서 ID
 */
export async function createFee(data: CreateFeeData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "fees"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`수임료 생성 실패: ${error.message}`);
    }
    throw new Error("수임료 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 수임료 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 수임료 목록 (최신순)
 */
export async function getFees(ownerId: string): Promise<Fee[]> {
  try {
    const q = query(
      collection(db!, "fees"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Fee[];
    // 복합 인덱스 없이 메모리에서 최신순 정렬
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`수임료 목록 조회 실패: ${error.message}`);
    }
    throw new Error("수임료 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 수임료 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 수임료 목록 (최신순)
 */
export async function getFeesByCase(caseId: string, ownerId: string): Promise<Fee[]> {
  try {
    const q = query(
      collection(db!, "fees"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Fee[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건별 수임료 조회 실패: ${error.message}`);
    }
    throw new Error("사건별 수임료 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 수임료를 조회합니다.
 * ownerId 검증을 통해 다른 사용자의 데이터 접근을 방지합니다.
 *
 * @param id - 수임료 문서 ID
 * @param ownerId - 변호사 UID (소유권 검증용)
 * @returns 수임료 데이터 또는 null
 */
export async function getFee(id: string, ownerId: string): Promise<Fee | null> {
  try {
    const docSnap = await getDoc(doc(db!, "fees", id));
    if (!docSnap.exists()) {
      return null;
    }
    const data = { ...docSnap.data(), id: docSnap.id } as Fee;
    // 소유권 검증: 다른 사용자의 수임료 접근 차단
    if (data.ownerId !== ownerId) {
      return null;
    }
    return data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`수임료 조회 실패: ${error.message}`);
    }
    throw new Error("수임료 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 수임료 정보를 업데이트합니다.
 *
 * @param id - 수임료 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateFee(
  id: string,
  data: Partial<Omit<Fee, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "fees", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`수임료 업데이트 실패: ${error.message}`);
    }
    throw new Error("수임료 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 수임료를 삭제합니다.
 *
 * @param id - 수임료 문서 ID
 */
export async function deleteFee(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "fees", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`수임료 삭제 실패: ${error.message}`);
    }
    throw new Error("수임료 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 미완납 수임료 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 미완납 수임료 목록 (최신순)
 */
export async function getOverdueFees(ownerId: string): Promise<Fee[]> {
  try {
    const q = query(
      collection(db!, "fees"),
      where("ownerId", "==", ownerId),
      where("status", "==", "미완납"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Fee[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`미완납 수임료 조회 실패: ${error.message}`);
    }
    throw new Error("미완납 수임료 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Installments (분할납부 — fees 서브컬렉션)
// ──────────────────────────────────────────────

/** 분할납부 생성 시 필요한 데이터 (id 제외) */
type CreateInstallmentData = Omit<Installment, "id">;

/**
 * 분할납부 스케줄을 생성합니다.
 *
 * @param feeId - 부모 수임료 문서 ID
 * @param data - 분할납부 데이터 (id 자동 생성)
 * @returns 생성된 분할납부 문서 ID
 */
export async function createInstallment(
  feeId: string,
  data: CreateInstallmentData
): Promise<string> {
  try {
    const docRef = await addDoc(
      collection(db!, "fees", feeId, "installments"),
      { ...data },
    );
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`분할납부 생성 실패: ${error.message}`);
    }
    throw new Error("분할납부 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 수임료의 분할납부 목록을 조회합니다.
 *
 * @param feeId - 부모 수임료 문서 ID
 * @returns 분할납부 목록 (회차순)
 */
export async function getInstallments(feeId: string): Promise<Installment[]> {
  try {
    const q = query(
      collection(db!, "fees", feeId, "installments"),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Installment[];
    // 회차(seq) 순으로 정렬
    return results.sort((a, b) => a.seq - b.seq);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`분할납부 목록 조회 실패: ${error.message}`);
    }
    throw new Error("분할납부 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 분할납부 정보를 업데이트합니다.
 *
 * @param feeId - 부모 수임료 문서 ID
 * @param installmentId - 분할납부 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateInstallment(
  feeId: string,
  installmentId: string,
  data: Partial<Omit<Installment, "id" | "feeId">>
): Promise<void> {
  try {
    await updateDoc(
      doc(db!, "fees", feeId, "installments", installmentId),
      { ...data },
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`분할납부 업데이트 실패: ${error.message}`);
    }
    throw new Error("분할납부 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 분할납부를 삭제합니다.
 *
 * @param feeId - 부모 수임료 문서 ID
 * @param installmentId - 분할납부 문서 ID
 */
export async function deleteInstallment(
  feeId: string,
  installmentId: string
): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(
      doc(db!, "fees", feeId, "installments", installmentId),
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`분할납부 삭제 실패: ${error.message}`);
    }
    throw new Error("분할납부 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Case Expenses (사건비용)
// ──────────────────────────────────────────────

/** 사건비용 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateCaseExpenseData = Omit<CaseExpense, "id" | "createdAt" | "updatedAt">;

/**
 * 새 사건비용을 생성합니다.
 *
 * @param data - 사건비용 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 사건비용 문서 ID
 */
export async function createCaseExpense(data: CreateCaseExpenseData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "case_expenses"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건비용 생성 실패: ${error.message}`);
    }
    throw new Error("사건비용 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 사건비용 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 사건비용 목록 (최신순)
 */
export async function getCaseExpenses(caseId: string, ownerId: string): Promise<CaseExpense[]> {
  try {
    const q = query(
      collection(db!, "case_expenses"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CaseExpense[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건비용 목록 조회 실패: ${error.message}`);
    }
    throw new Error("사건비용 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건비용 정보를 업데이트합니다.
 *
 * @param id - 사건비용 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateCaseExpense(
  id: string,
  data: Partial<Omit<CaseExpense, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "case_expenses", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건비용 업데이트 실패: ${error.message}`);
    }
    throw new Error("사건비용 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건비용을 삭제합니다.
 *
 * @param id - 사건비용 문서 ID
 */
export async function deleteCaseExpense(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "case_expenses", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건비용 삭제 실패: ${error.message}`);
    }
    throw new Error("사건비용 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 미정산 의뢰인 부담 사건비용을 조회합니다.
 * (bearer IN ["의뢰인", "선납후정산"] AND reimbursed=false)
 *
 * @param ownerId - 변호사 UID
 * @returns 미정산 사건비용 목록 (최신순)
 */
export async function getUnreimbursedExpenses(ownerId: string): Promise<CaseExpense[]> {
  try {
    // Firestore 'in' 연산자로 의뢰인 + 선납후정산 모두 조회
    const q = query(
      collection(db!, "case_expenses"),
      where("ownerId", "==", ownerId),
      where("bearer", "in", ["의뢰인", "선납후정산"]),
    );
    const snapshot = await getDocs(q);

    // 메모리에서 reimbursed 필터 (복합 인덱스 회피)
    const results = snapshot.docs
      .map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
      }) as CaseExpense)
      .filter((exp) => !exp.reimbursed);

    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`미정산 사건비용 조회 실패: ${error.message}`);
    }
    throw new Error("미정산 사건비용 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Transactions (매출/매입)
// ──────────────────────────────────────────────

/** 거래 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateTransactionData = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

/** 거래 조회 필터 */
interface TransactionFilters {
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  type?: "매출" | "매입";
}

/**
 * 새 거래를 생성합니다.
 *
 * @param data - 거래 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 거래 문서 ID
 */
export async function createTransaction(data: CreateTransactionData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "transactions"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거래 생성 실패: ${error.message}`);
    }
    throw new Error("거래 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 거래 목록을 조회합니다.
 * 선택적으로 날짜 범위 및 유형 필터를 적용할 수 있습니다.
 *
 * @param ownerId - 변호사 UID
 * @param filters - 선택적 필터 (startDate, endDate, type)
 * @returns 거래 목록 (날짜 최신순)
 */
export async function getTransactions(
  ownerId: string,
  filters?: TransactionFilters
): Promise<Transaction[]> {
  try {
    const q = query(
      collection(db!, "transactions"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    let results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Transaction[];

    // 메모리에서 필터 적용 (복합 인덱스 회피)
    if (filters?.type) {
      results = results.filter((tx) => tx.type === filters.type);
    }
    if (filters?.startDate) {
      results = results.filter((tx) => tx.date >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter((tx) => tx.date <= filters.endDate!);
    }

    // 거래일 최신순 정렬
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거래 목록 조회 실패: ${error.message}`);
    }
    throw new Error("거래 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 거래 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 거래 목록 (날짜 최신순)
 */
export async function getTransactionsByCase(
  caseId: string,
  ownerId: string
): Promise<Transaction[]> {
  try {
    const q = query(
      collection(db!, "transactions"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Transaction[];
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건별 거래 조회 실패: ${error.message}`);
    }
    throw new Error("사건별 거래 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 거래 정보를 업데이트합니다.
 *
 * @param id - 거래 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateTransaction(
  id: string,
  data: Partial<Omit<Transaction, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "transactions", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거래 업데이트 실패: ${error.message}`);
    }
    throw new Error("거래 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 거래를 삭제합니다.
 *
 * @param id - 거래 문서 ID
 */
export async function deleteTransaction(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "transactions", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거래 삭제 실패: ${error.message}`);
    }
    throw new Error("거래 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Office Expenses (사무소 경비)
// ──────────────────────────────────────────────

/** 사무소 경비 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateOfficeExpenseData = Omit<OfficeExpense, "id" | "createdAt" | "updatedAt">;

/**
 * 새 사무소 경비를 생성합니다.
 *
 * @param data - 사무소 경비 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 사무소 경비 문서 ID
 */
export async function createOfficeExpense(data: CreateOfficeExpenseData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "office_expenses"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사무소 경비 생성 실패: ${error.message}`);
    }
    throw new Error("사무소 경비 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 월의 사무소 경비 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @param yearMonth - 귀속 월 (YYYY-MM)
 * @returns 사무소 경비 목록 (최신순)
 */
export async function getOfficeExpenses(
  ownerId: string,
  yearMonth: string
): Promise<OfficeExpense[]> {
  try {
    const q = query(
      collection(db!, "office_expenses"),
      where("ownerId", "==", ownerId),
      where("yearMonth", "==", yearMonth),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as OfficeExpense[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사무소 경비 목록 조회 실패: ${error.message}`);
    }
    throw new Error("사무소 경비 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사무소 경비 정보를 업데이트합니다.
 *
 * @param id - 사무소 경비 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateOfficeExpense(
  id: string,
  data: Partial<Omit<OfficeExpense, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "office_expenses", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사무소 경비 업데이트 실패: ${error.message}`);
    }
    throw new Error("사무소 경비 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사무소 경비를 삭제합니다.
 *
 * @param id - 사무소 경비 문서 ID
 */
export async function deleteOfficeExpense(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "office_expenses", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사무소 경비 삭제 실패: ${error.message}`);
    }
    throw new Error("사무소 경비 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Deposits (예수금/보관금)
// ──────────────────────────────────────────────

/** 예수금 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateDepositData = Omit<Deposit, "id" | "createdAt" | "updatedAt">;

/**
 * 새 예수금을 생성합니다.
 *
 * @param data - 예수금 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 예수금 문서 ID
 */
export async function createDeposit(data: CreateDepositData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "deposits"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`예수금 생성 실패: ${error.message}`);
    }
    throw new Error("예수금 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 예수금 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 예수금 목록 (최신순)
 */
export async function getDeposits(ownerId: string): Promise<Deposit[]> {
  try {
    const q = query(
      collection(db!, "deposits"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Deposit[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`예수금 목록 조회 실패: ${error.message}`);
    }
    throw new Error("예수금 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 예수금 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 예수금 목록 (최신순)
 */
export async function getDepositsByCase(caseId: string, ownerId: string): Promise<Deposit[]> {
  try {
    const q = query(
      collection(db!, "deposits"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Deposit[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건별 예수금 조회 실패: ${error.message}`);
    }
    throw new Error("사건별 예수금 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 활성 예수금(보관중 또는 일부사용) 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 활성 예수금 목록 (최신순)
 */
export async function getActiveDeposits(ownerId: string): Promise<Deposit[]> {
  try {
    // Firestore 'in' 연산자로 두 상태를 한 번에 조회
    const q = query(
      collection(db!, "deposits"),
      where("ownerId", "==", ownerId),
      where("status", "in", ["보관중", "일부사용"]),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Deposit[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`활성 예수금 조회 실패: ${error.message}`);
    }
    throw new Error("활성 예수금 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 예수금 정보를 업데이트합니다.
 *
 * @param id - 예수금 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateDeposit(
  id: string,
  data: Partial<Omit<Deposit, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "deposits", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`예수금 업데이트 실패: ${error.message}`);
    }
    throw new Error("예수금 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 예수금을 삭제합니다.
 *
 * @param id - 예수금 문서 ID
 */
export async function deleteDeposit(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "deposits", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`예수금 삭제 실패: ${error.message}`);
    }
    throw new Error("예수금 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Monthly Summary (월별 요약)
// ──────────────────────────────────────────────

/** 월별 요약 저장 시 필요한 데이터 (타임스탬프 제외) */
type SaveMonthlySummaryData = Omit<MonthlySummary, "createdAt" | "updatedAt">;

/**
 * 특정 월의 월별 요약을 조회합니다.
 * 문서 ID 형식: {ownerId}_{YYYY-MM}
 *
 * @param ownerId - 변호사 UID
 * @param yearMonth - 조회 월 (YYYY-MM)
 * @returns 월별 요약 데이터 또는 null
 */
export async function getMonthlySummary(
  ownerId: string,
  yearMonth: string
): Promise<MonthlySummary | null> {
  try {
    const docId = `${ownerId}_${yearMonth}`;
    const docSnap = await getDoc(doc(db!, "monthly_summary", docId));
    if (!docSnap.exists()) {
      return null;
    }
    return { ...docSnap.data(), id: docSnap.id } as MonthlySummary;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`월별 요약 조회 실패: ${error.message}`);
    }
    throw new Error("월별 요약 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 월별 요약을 저장합니다 (upsert).
 * 기존 문서가 있으면 병합, 없으면 새로 생성합니다.
 *
 * @param data - 월별 요약 데이터
 */
export async function saveMonthlySummary(data: SaveMonthlySummaryData): Promise<void> {
  try {
    const docId = `${data.ownerId}_${data.yearMonth}`;
    // Check if document already exists to avoid overwriting createdAt
    const existing = await getDoc(doc(db!, "monthly_summary", docId));
    const timestamps: Record<string, ReturnType<typeof serverTimestamp>> = {
      updatedAt: serverTimestamp(),
    };
    if (!existing.exists()) {
      timestamps.createdAt = serverTimestamp();
    }
    await setDoc(
      doc(db!, "monthly_summary", docId),
      {
        ...data,
        id: docId,
        ...timestamps,
      },
      { merge: true },
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`월별 요약 저장 실패: ${error.message}`);
    }
    throw new Error("월별 요약 저장 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 최근 월별 요약 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @param limitCount - 조회 건수 (기본값: 12)
 * @returns 월별 요약 목록 (최신 월순)
 */
export async function getMonthlySummaries(
  ownerId: string,
  limitCount: number = 12
): Promise<MonthlySummary[]> {
  try {
    const q = query(
      collection(db!, "monthly_summary"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as MonthlySummary[];
    // yearMonth 기준 최신순 정렬 후 limitCount만큼 반환
    return results
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
      .slice(0, limitCount);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`월별 요약 목록 조회 실패: ${error.message}`);
    }
    throw new Error("월별 요약 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}
