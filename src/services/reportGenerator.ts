/**
 * 월별 정산 보고서 생성 서비스
 *
 * Firestore의 fees, transactions, case_expenses, office_expenses, deposits
 * 컬렉션을 조회하여 MonthlySummary를 집계한다.
 *
 * 복합 인덱스 의존성 없이, ownerId 단일 필터 후 메모리에서 날짜 필터링.
 */

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type {
  MonthlySummary,
  Fee,
  Transaction,
  CaseExpense,
  OfficeExpense,
  Deposit,
  Installment,
} from "../types/accounting";

// ── 유틸 ──

/** "YYYY-MM" → { startDate: "YYYY-MM-01", endDate: "YYYY-MM-{last}" } */
function getMonthRange(yearMonth: string): {
  startDate: string;
  endDate: string;
} {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** 날짜(YYYY-MM-DD)가 월 범위 안에 있는지 */
function isInMonth(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

// ── 매출 세부유형 매핑 ──

const REVENUE_SUBTYPE_MAP: Record<string, keyof MonthlySummary["revenue"]> = {
  "수임료_착수금": "retainerFees",
  "수임료_잔금": "balanceFees",
  "수임료_성공보수": "successFees",
  "자문료": "consultingFees",
  "강의료": "otherRevenue",
  "원고료": "otherRevenue",
  "기타매출": "otherRevenue",
};

// ── 사무소경비 카테고리 매핑 ──

type ExpenseKey = keyof MonthlySummary["expenses"];
const OFFICE_EXPENSE_MAP: Record<string, ExpenseKey> = {
  "임대료": "officeRent",
  "관리비": "officeRent",
  "공과금_전기": "utilities",
  "공과금_수도": "utilities",
  "공과금_가스": "utilities",
  "통신비_인터넷": "communication",
  "통신비_전화": "communication",
  "사무용품": "supplies",
  "도서구입": "supplies",
  "소프트웨어": "supplies",
  "장비_구입": "otherExpenses",
  "장비_유지보수": "otherExpenses",
  "보험료": "insurance",
  "변호사회비": "associationDues",
  "교육_연수비": "education",
  "광고_마케팅": "marketing",
  "접대비": "entertainment",
  "차량유지비": "transportation",
  "세금_공과": "otherExpenses",
  "기타": "otherExpenses",
  // 인건비 카테고리
  "급여": "payroll",
  "상여금": "payroll",
  "퇴직금": "payroll",
  "4대보험_사업자부담": "payroll",
  "일용직": "payroll",
  "프리랜서_외주": "payroll",
};

// ── 사건비용 카테고리 매핑 ──

type CaseExpKey = keyof MonthlySummary["caseExpenses"];
const CASE_EXPENSE_MAP: Record<string, CaseExpKey> = {
  "인지대": "courtFees",
  "송달료": "courtFees",
  "감정료": "expertFees",
  "번역료": "expertFees",
  "출장비": "travelExpenses",
  "등기비용": "otherCaseCosts",
  "공증비용": "otherCaseCosts",
  "탐정조사비": "otherCaseCosts",
  "복사/출력비": "otherCaseCosts",
  "증인여비": "otherCaseCosts",
  "보증보험료": "otherCaseCosts",
  "기타": "otherCaseCosts",
};

// ── 메인 함수 ──

export async function generateMonthlySummary(
  ownerId: string,
  yearMonth: string
): Promise<MonthlySummary> {
  if (!db) {
    throw new Error("Firebase가 초기화되지 않았습니다.");
  }

  const { startDate, endDate } = getMonthRange(yearMonth);

  // 모든 컬렉션을 병렬로 조회
  const [feesSnap, txSnap, caseExpSnap, officeExpSnap, depositsSnap] =
    await Promise.all([
      getDocs(
        query(collection(db, "fees"), where("ownerId", "==", ownerId))
      ),
      getDocs(
        query(
          collection(db, "transactions"),
          where("ownerId", "==", ownerId)
        )
      ),
      getDocs(
        query(
          collection(db, "case_expenses"),
          where("ownerId", "==", ownerId)
        )
      ),
      getDocs(
        query(
          collection(db, "office_expenses"),
          where("ownerId", "==", ownerId)
        )
      ),
      getDocs(
        query(collection(db, "deposits"), where("ownerId", "==", ownerId))
      ),
    ]);

  // ── 1. 수임료 → 매출 (착수금, 잔금, 성공보수) ──
  const fees = feesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Fee);

  // 분할납부 내역 조회 (모든 installments를 1회만 가져와 재사용)
  const allInstallments: Installment[] = [];
  await Promise.all(
    fees.map(async (fee) => {
      if (!fee.useInstallment || !db) return;
      const instSnap = await getDocs(
        collection(db, "fees", fee.id, "installments")
      );
      instSnap.docs.forEach((d) => {
        allInstallments.push({ id: d.id, ...d.data() } as Installment);
      });
    })
  );

  // 해당 월에 납부된 분할납부만 필터
  const installmentResults = allInstallments.filter(
    (inst) => inst.paid && inst.paidDate && isInMonth(inst.paidDate, startDate, endDate)
  );

  // 수임료 기반 매출 집계
  let retainerFees = 0;
  let balanceFees = 0;
  let successFees = 0;

  for (const fee of fees) {
    // 착수금: 해당 월에 납부됨
    if (
      fee.retainer?.paid &&
      fee.retainer.paidDate &&
      isInMonth(fee.retainer.paidDate, startDate, endDate)
    ) {
      retainerFees += fee.retainer.paidAmount ?? 0;
    }
    // 성공보수: 해당 월에 입금됨
    if (
      fee.successFee?.status === "입금완료" &&
      fee.successFee.paidDate &&
      isInMonth(fee.successFee.paidDate, startDate, endDate)
    ) {
      successFees += fee.successFee.paidAmount ?? 0;
    }
  }

  // 분할납부 = 잔금
  for (const inst of installmentResults) {
    balanceFees += inst.paidAmount;
  }

  // ── 2. 거래(transactions) 집계 ──
  const allTransactions = txSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Transaction
  );
  const monthTx = allTransactions.filter((tx) =>
    isInMonth(tx.date, startDate, endDate)
  );

  // 매출 거래에서 자문료/기타 매출 집계
  let consultingFees = 0;
  let otherRevenue = 0;

  // 매입 거래 → 비용에 반영 (transactions 중 매입은 office_expenses 와 별도)
  let outputVat = 0;
  let inputVat = 0;

  // 증빙 현황
  let taxInvoiceIssued = 0;
  let taxInvoiceReceived = 0;
  let cashReceiptIssued = 0;
  let cardSalesCount = 0;
  let cardPurchaseCount = 0;
  let noEvidenceCount = 0;

  for (const tx of monthTx) {
    if (tx.type === "매출") {
      outputVat += tx.vat?.vatAmount ?? 0;
      const key = REVENUE_SUBTYPE_MAP[tx.subType];
      if (key === "consultingFees") {
        consultingFees += tx.vat?.supplyAmount ?? 0;
      } else if (key === "otherRevenue") {
        otherRevenue += tx.vat?.supplyAmount ?? 0;
      }
      // 착수금/잔금/성공보수는 fee에서 이미 집계 → 중복 방지
      // 증빙
      if (tx.evidenceType === "세금계산서") taxInvoiceIssued++;
      if (tx.evidenceType === "현금영수증") cashReceiptIssued++;
      if (tx.evidenceType === "카드매출전표") cardSalesCount++;
      if (tx.evidenceType === "없음") noEvidenceCount++;
    } else {
      // 매입
      inputVat += tx.vat?.vatAmount ?? 0;
      if (tx.evidenceType === "세금계산서") taxInvoiceReceived++;
      if (tx.evidenceType === "카드매출전표") cardPurchaseCount++;
      if (tx.evidenceType === "없음") noEvidenceCount++;
    }
  }

  const totalRevenue =
    retainerFees + balanceFees + successFees + consultingFees + otherRevenue;

  // ── 3. 사건비용 집계 ──
  const allCaseExps = caseExpSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as CaseExpense
  );
  const monthCaseExps = allCaseExps.filter((e) =>
    isInMonth(e.date, startDate, endDate)
  );

  const caseExpenses: MonthlySummary["caseExpenses"] = {
    courtFees: 0,
    expertFees: 0,
    travelExpenses: 0,
    otherCaseCosts: 0,
    totalCaseCosts: 0,
    clientBorne: 0,
    firmBorne: 0,
    unreimbursed: 0,
  };

  for (const exp of monthCaseExps) {
    const key = CASE_EXPENSE_MAP[exp.category] ?? "otherCaseCosts";
    (caseExpenses[key] as number) += exp.amount;
    caseExpenses.totalCaseCosts += exp.amount;

    if (exp.bearer === "의뢰인" || exp.bearer === "선납후정산") {
      caseExpenses.clientBorne += exp.amount;
      if (!exp.reimbursed) {
        caseExpenses.unreimbursed += exp.amount;
      }
    } else {
      caseExpenses.firmBorne += exp.amount;
    }
  }

  // ── 4. 사무소 경비 집계 ──
  const allOfficeExps = officeExpSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as OfficeExpense
  );
  const monthOfficeExps = allOfficeExps.filter(
    (e) => e.yearMonth === yearMonth
  );

  const expenses: MonthlySummary["expenses"] = {
    officeRent: 0,
    utilities: 0,
    communication: 0,
    supplies: 0,
    payroll: 0,
    insurance: 0,
    associationDues: 0,
    marketing: 0,
    entertainment: 0,
    transportation: 0,
    education: 0,
    otherExpenses: 0,
    totalExpenses: 0,
  };

  for (const exp of monthOfficeExps) {
    const key = OFFICE_EXPENSE_MAP[exp.category] ?? "otherExpenses";
    (expenses[key] as number) += exp.amount;
    expenses.totalExpenses += exp.amount;
  }

  // ── 5. 예수금 집계 ──
  const allDeposits = depositsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Deposit
  );

  const depositSummary: MonthlySummary["depositSummary"] = {
    totalHolding: 0,
    receivedThisMonth: 0,
    usedThisMonth: 0,
    returnedThisMonth: 0,
  };

  for (const dep of allDeposits) {
    // 현재 보관 중 총액
    if (dep.status === "보관중" || dep.status === "일부사용" || dep.status === "공탁중") {
      depositSummary.totalHolding += dep.remainingAmount;
    }
    // 이번 달 신규 입금
    if (isInMonth(dep.receivedDate, startDate, endDate)) {
      depositSummary.receivedThisMonth += dep.originalAmount;
    }
    // 이번 달 사용
    for (const usage of dep.usageHistory ?? []) {
      if (isInMonth(usage.date, startDate, endDate)) {
        depositSummary.usedThisMonth += usage.amount;
      }
    }
    // 이번 달 반환
    if (
      dep.returnedDate &&
      isInMonth(dep.returnedDate, startDate, endDate) &&
      dep.returnedAmount
    ) {
      depositSummary.returnedThisMonth += dep.returnedAmount;
    }
  }

  // ── 6. 미수금 현황 ──
  const receivables: MonthlySummary["receivables"] = {
    totalOutstanding: 0,
    overdueAmount: 0,
    overdueCount: 0,
  };

  for (const fee of fees) {
    if (fee.status === "미완납") {
      receivables.totalOutstanding += fee.totalOutstanding;
    }
  }

  // 분할납부 연체 확인 (이미 조회한 allInstallments 재사용)
  for (const inst of allInstallments) {
    if (inst.overdue && !inst.paid) {
      receivables.overdueAmount += inst.amount - (inst.paidAmount ?? 0);
      receivables.overdueCount++;
    }
  }

  // ── 7. 손익 ──
  const grossProfit = totalRevenue - caseExpenses.firmBorne;
  const operatingProfit = grossProfit - expenses.totalExpenses;

  const profitLoss: MonthlySummary["profitLoss"] = {
    grossProfit,
    operatingProfit,
    netIncome: operatingProfit, // 세전 간이 기준
  };

  // ── 조립 ──
  const summaryId = `${ownerId}_${yearMonth}`;
  const now = Timestamp.now();

  // 기존 요약이 있으면 상태/타임스탬프 보존
  const existingSnap = await getDoc(doc(db, "monthly_summary", summaryId));
  const existing = existingSnap.exists()
    ? (existingSnap.data() as Partial<MonthlySummary>)
    : null;

  const summary: MonthlySummary = {
    id: summaryId,
    ownerId,
    yearMonth,
    revenue: {
      retainerFees,
      balanceFees,
      successFees,
      consultingFees,
      otherRevenue,
      totalRevenue,
    },
    expenses,
    caseExpenses,
    vat: {
      outputVat,
      inputVat,
      netVat: outputVat - inputVat,
    },
    evidence: {
      taxInvoiceIssued,
      taxInvoiceReceived,
      cashReceiptIssued,
      cardSalesCount,
      cardPurchaseCount,
      noEvidenceCount,
    },
    depositSummary,
    receivables,
    profitLoss,
    // 기존 보고서가 있으면 상태를 보존, 없으면 "작성중"
    status: existing?.status ?? "작성중",
    confirmedAt: existing?.confirmedAt,
    sentToAccountant: existing?.sentToAccountant,
    sentAt: existing?.sentAt,
    accountantNotes: existing?.accountantNotes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // Firestore에 저장 (merge 대신 전체 덮어쓰기 — summary가 이미 완전한 문서)
  await setDoc(doc(db, "monthly_summary", summaryId), summary);

  return summary;
}

/** 기존 월별 요약을 Firestore에서 조회 */
export async function getMonthlySummary(
  ownerId: string,
  yearMonth: string
): Promise<MonthlySummary | null> {
  if (!db) return null;
  const summaryId = `${ownerId}_${yearMonth}`;
  const snap = await getDoc(doc(db, "monthly_summary", summaryId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MonthlySummary;
}

/** 월별 요약 상태 업데이트 */
export async function updateMonthlySummaryStatus(
  summaryId: string,
  status: MonthlySummary["status"]
): Promise<void> {
  if (!db) throw new Error("Firebase가 초기화되지 않았습니다.");
  const now = Timestamp.now();
  const updates: Record<string, unknown> = {
    status,
    updatedAt: now,
  };
  if (status === "확정") {
    updates.confirmedAt = now;
  }
  if (status === "전달완료") {
    updates.sentToAccountant = true;
    updates.sentAt = now;
  }
  await setDoc(doc(db, "monthly_summary", summaryId), updates, {
    merge: true,
  });
}
