// 카드 거래 동기화 + AI 경비 분류 오케스트레이터
//
// 전체 플로우:
//   1. CODEF API로 카드 승인내역 수집
//   2. Firestore card_transactions에 저장 (승인번호 기준 중복 방지)
//   3. 미분류 거래를 AI 분류 (사건비용/사무소경비/무시)
//   4. 높은 신뢰도(>=0.8): 자동 사건비용 또는 사무소경비 생성
//   5. 낮은 신뢰도: 변호사 확인 대기

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
  syncCardTransactions,
  classifyCardExpenses,
} from "./codefApi";
import {
  createCaseExpense,
  createOfficeExpense,
} from "./firebase/accounting";
import { getCases } from "./firebase/firestore";
import type {
  CodefAccount,
  CardTransaction,
  ClassificationStatus,
  ClassifiedType,
  AIClassifyResult,
} from "../types/codef";
import type { Case } from "../types/case";
import type { CaseExpenseCategory } from "../types/accounting";

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

/** 자동 분류 최소 신뢰도 */
const AUTO_CLASSIFY_THRESHOLD = 0.8;

// ─────────────────────────────────────────────
// 결과 타입
// ─────────────────────────────────────────────

/** 카드 동기화 + 분류 결과 요약 */
export interface CardSyncResult {
  synced: number;            // 새로 저장된 거래 수
  autoClassified: number;    // 자동 분류된 건수
  pendingReview: number;     // 변호사 확인 대기 건수
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/**
 * 이미 저장된 승인번호 목록을 조회합니다 (중복 방지).
 */
async function getExistingApprovalNumbers(
  ownerId: string,
  codefAccountId: string,
): Promise<Set<string>> {
  const q = query(
    collection(db!, "card_transactions"),
    where("ownerId", "==", ownerId),
    where("codefAccountId", "==", codefAccountId),
  );
  const snapshot = await getDocs(q);
  const numbers = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.approvalNumber) {
      numbers.add(data.approvalNumber as string);
    }
  });
  return numbers;
}

/**
 * 미분류 카드 거래를 조회합니다.
 */
async function getUnclassifiedTransactions(
  ownerId: string,
  codefAccountId: string,
): Promise<Array<CardTransaction & { id: string }>> {
  const q = query(
    collection(db!, "card_transactions"),
    where("ownerId", "==", ownerId),
    where("codefAccountId", "==", codefAccountId),
    where("classificationStatus", "==", "unclassified"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as Array<CardTransaction & { id: string }>;
}

/**
 * YYYYMMDD 날짜를 YYYY-MM-DD 형식으로 변환합니다.
 */
function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * YYYYMMDD 날짜에서 YYYY-MM 귀속월을 추출합니다.
 */
function extractYearMonth(yyyymmdd: string): string {
  if (yyyymmdd.length < 6) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}`;
}

// ─────────────────────────────────────────────
// 메인: 카드 동기화 + AI 분류
// ─────────────────────────────────────────────

/**
 * 카드 거래내역 동기화 + AI 경비 분류를 실행합니다.
 *
 * @param ownerId - 변호사 UID
 * @param codefAccount - CODEF 연결 계정 정보
 * @returns 동기화 + 분류 결과 요약
 */
export async function runCardSyncAndClassify(
  ownerId: string,
  codefAccount: CodefAccount,
): Promise<CardSyncResult> {
  try {
    // ── 1. CODEF API로 카드 거래내역 수집 ──
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const startDate = thirtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, "");
    const endDate = today.toISOString().slice(0, 10).replace(/-/g, "");

    const rawTransactions = await syncCardTransactions({
      connectedId: codefAccount.connectedId,
      organization: codefAccount.institutionCode,
      cardNumber: codefAccount.accountNumber ?? "",
      startDate,
      endDate,
    });

    // ── 2. 승인번호 기준 중복 제거 후 Firestore에 저장 ──
    const existingApprovals = await getExistingApprovalNumbers(ownerId, codefAccount.id);
    let syncedCount = 0;

    for (const raw of rawTransactions) {
      // 승인번호 기준 중복 방지
      if (existingApprovals.has(raw.approvalNumber)) continue;

      const cardTx: Omit<CardTransaction, "id" | "createdAt"> = {
        ownerId,
        codefAccountId: codefAccount.id,
        approvalDate: raw.approvalDate,
        approvalTime: raw.approvalTime,
        approvalNumber: raw.approvalNumber,
        merchantName: raw.merchantName,
        merchantCategory: raw.merchantCategory,
        amount: raw.amount,
        cardNumberMasked: raw.cardNumberMasked,
        classificationStatus: "unclassified" as ClassificationStatus,
      };

      await addDoc(collection(db!, "card_transactions"), {
        ...cardTx,
        createdAt: serverTimestamp(),
      });

      syncedCount++;
    }

    // ── 3. 미분류 거래 조회 ──
    const unclassified = await getUnclassifiedTransactions(ownerId, codefAccount.id);

    if (unclassified.length === 0) {
      return { synced: syncedCount, autoClassified: 0, pendingReview: 0 };
    }

    // ── 4. 진행중인 사건 목록 조회 ──
    const cases = await getCases(ownerId);
    const activeCases = cases.filter((c: Case) => c.status === "진행중");

    // ── 5. AI 분류 호출 ──
    const classifyResults = await classifyCardExpenses({
      transactions: unclassified.map((tx) => ({
        id: tx.id,
        approvalDate: tx.approvalDate,
        merchantName: tx.merchantName,
        merchantCategory: tx.merchantCategory,
        amount: tx.amount,
      })),
      cases: activeCases.map((c: Case) => ({
        id: c.id,
        clientName: c.clientName,
        caseType: c.caseType,
        description: c.description,
      })),
    });

    // ── 6. 분류 결과 처리 ──
    let autoClassified = 0;
    let pendingReview = 0;

    for (const result of classifyResults) {
      const cardTx = unclassified.find((tx) => tx.id === result.cardTransactionId);
      if (!cardTx) continue;

      if (result.confidence >= AUTO_CLASSIFY_THRESHOLD) {
        // 높은 신뢰도: 자동 분류 + 비용 레코드 생성
        await handleAutoClassification(ownerId, cardTx, result);
        autoClassified++;
      } else {
        // 낮은 신뢰도: 분류 정보 저장, 변호사 확인 대기
        await updateDoc(doc(db!, "card_transactions", cardTx.id), {
          classificationStatus: "unclassified" as ClassificationStatus,
          classifiedAs: result.recordType,
          classifiedCategory: result.category,
          linkedCaseId: result.linkedCaseId ?? undefined,
          classificationConfidence: result.confidence,
          classificationReason: result.reason,
        });
        pendingReview++;
      }
    }

    return { synced: syncedCount, autoClassified, pendingReview };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 동기화 + 분류 실패: ${error.message}`);
    }
    throw new Error("카드 동기화 + 분류 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ─────────────────────────────────────────────
// 자동 분류 처리
// ─────────────────────────────────────────────

/**
 * 높은 신뢰도 분류 건에 대해 자동으로 비용 레코드를 생성합니다.
 */
async function handleAutoClassification(
  ownerId: string,
  cardTx: CardTransaction & { id: string },
  result: AIClassifyResult,
): Promise<void> {
  let linkedRecordId: string | undefined;

  if (result.recordType === "case_expense" && result.linkedCaseId) {
    // 사건비용 생성
    linkedRecordId = await createCaseExpense({
      caseId: result.linkedCaseId,
      ownerId,
      clientName: "", // 사건에서 자동 조회 가능
      category: result.category as CaseExpenseCategory,
      description: `${cardTx.merchantName} (카드 자동 분류)`,
      amount: cardTx.amount,
      date: formatDate(cardTx.approvalDate),
      bearer: "사무소",
      reimbursed: false,
      paymentMethod: "카드",
      paidBy: ownerId,
      evidenceType: "카드영수증",
      attachments: [],
    });
  } else if (result.recordType === "office_expense") {
    // 사무소 경비 생성
    linkedRecordId = await createOfficeExpense({
      ownerId,
      category: result.category as "사무용품", // AI 분류된 카테고리 사용
      costType: "변동비",
      description: `${cardTx.merchantName} (카드 자동 분류)`,
      amount: cardTx.amount,
      date: formatDate(cardTx.approvalDate),
      yearMonth: extractYearMonth(cardTx.approvalDate),
      recurring: false,
      paymentMethod: "카드",
      evidenceType: "카드영수증",
      attachments: [],
      confirmed: false,
    });
  }

  // card_transaction 상태 업데이트
  await updateDoc(doc(db!, "card_transactions", cardTx.id), {
    classificationStatus: "auto_classified" as ClassificationStatus,
    classifiedAs: result.recordType,
    classifiedCategory: result.category,
    linkedCaseId: result.linkedCaseId ?? undefined,
    linkedRecordId: linkedRecordId ?? undefined,
    classificationConfidence: result.confidence,
    classificationReason: result.reason,
  });
}

// ─────────────────────────────────────────────
// 변호사 수동 분류 확인/수정
// ─────────────────────────────────────────────

/** 분류 확인/수정 파라미터 */
export interface ClassificationConfirmation {
  recordType: "case_expense" | "office_expense" | "ignore";
  category: string;
  linkedCaseId?: string;
}

/**
 * 변호사가 카드 거래 분류를 확인하거나 수정합니다.
 *
 * recordType이 "ignore"인 경우 비용 레코드를 생성하지 않고
 * card_transaction만 ignored 상태로 업데이트합니다.
 *
 * @param cardTransactionId - card_transactions 문서 ID
 * @param classification - 확인/수정된 분류 정보
 */
export async function confirmClassification(
  cardTransactionId: string,
  classification: ClassificationConfirmation,
): Promise<void> {
  try {
    // card_transaction 조회
    const { getDoc: firestoreGetDoc } = await import("firebase/firestore");
    const txDoc = await firestoreGetDoc(doc(db!, "card_transactions", cardTransactionId));

    if (!txDoc.exists()) {
      throw new Error("카드 거래내역을 찾을 수 없습니다.");
    }

    const cardTx = txDoc.data() as CardTransaction;

    // "ignore"이면 비용 생성 없이 상태만 업데이트
    if (classification.recordType === "ignore") {
      await updateDoc(doc(db!, "card_transactions", cardTransactionId), {
        classificationStatus: "manual_classified" as ClassificationStatus,
        classifiedAs: "ignore" as ClassifiedType,
        classifiedCategory: classification.category,
      });
      return;
    }

    let linkedRecordId: string | undefined;

    if (classification.recordType === "case_expense" && classification.linkedCaseId) {
      // 사건비용 생성
      linkedRecordId = await createCaseExpense({
        caseId: classification.linkedCaseId,
        ownerId: cardTx.ownerId,
        clientName: "",
        category: classification.category as CaseExpenseCategory,
        description: `${cardTx.merchantName} (수동 분류)`,
        amount: cardTx.amount,
        date: formatDate(cardTx.approvalDate),
        bearer: "사무소",
        reimbursed: false,
        paymentMethod: "카드",
        paidBy: cardTx.ownerId,
        evidenceType: "카드영수증",
        attachments: [],
      });
    } else if (classification.recordType === "office_expense") {
      // 사무소 경비 생성
      linkedRecordId = await createOfficeExpense({
        ownerId: cardTx.ownerId,
        category: classification.category as "사무용품",
        costType: "변동비",
        description: `${cardTx.merchantName} (수동 분류)`,
        amount: cardTx.amount,
        date: formatDate(cardTx.approvalDate),
        yearMonth: extractYearMonth(cardTx.approvalDate),
        recurring: false,
        paymentMethod: "카드",
        evidenceType: "카드영수증",
        attachments: [],
        confirmed: true, // 변호사 수동 확인이므로 confirmed
      });
    }

    // card_transaction 상태 업데이트
    await updateDoc(doc(db!, "card_transactions", cardTransactionId), {
      classificationStatus: "manual_classified" as ClassificationStatus,
      classifiedAs: classification.recordType as ClassifiedType,
      classifiedCategory: classification.category,
      linkedCaseId: classification.linkedCaseId ?? undefined,
      linkedRecordId: linkedRecordId ?? undefined,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`카드 거래 분류 확인 실패: ${error.message}`);
    }
    throw new Error("카드 거래 분류 확인 중 알 수 없는 오류가 발생했습니다.");
  }
}
