/**
 * 부가세/종합소득세 기초자료 자동 집계 서비스
 *
 * 회계사무소에 넘길 세금 신고 기초자료를 자동으로 집계한다.
 * 실제 세금 계산이 아닌, 회계사가 신고에 사용할 기초 데이터 정리 목적.
 *
 * 관련 법령:
 *   - 부가가치세법 제48조 (확정신고와 납부)
 *   - 부가가치세법 시행령 제91조 (신고기한)
 *   - 소득세법 제70조 (종합소득 과세표준 확정신고)
 *   - 소득세법 제80조 (결정과 경정)
 */

import { getTransactions } from "./firebase/accounting";
import { getMonthlySummaries } from "./firebase/accounting";
import type {
  Transaction,
  EvidenceType,
  ExpenseSubType,
} from "../types/accounting";

// ─────────────────────────────────────────────
// 부가세 신고 기초자료 타입
// ─────────────────────────────────────────────

/** 증빙 유형별 세액 집계 */
export interface VatEvidenceBreakdown {
  /** 증빙 유형 */
  evidenceType: EvidenceType;
  /** 건수 */
  count: number;
  /** 공급가액 합계 */
  supplyAmount: number;
  /** 부가세액 합계 */
  vatAmount: number;
  /** 합계금액 */
  totalAmount: number;
}

/** 월별 부가세 내역 */
export interface VatMonthlyDetail {
  /** 귀속월 (YYYY-MM) */
  yearMonth: string;
  /** 매출세액 */
  outputVat: number;
  /** 매입세액 */
  inputVat: number;
  /** 납부세액 (매출세액 - 매입세액) */
  netVat: number;
  /** 매출 공급가액 */
  revenueSupply: number;
  /** 매입 공급가액 */
  expenseSupply: number;
}

/** 부가세 신고 기초자료 */
export interface VatReport {
  /** 사업자(변호사) ID */
  ownerId: string;
  /** 과세기간 반기 ("상반기" | "하반기") */
  period: "상반기" | "하반기";
  /** 과세기간 연도 */
  year: number;
  /** 과세기간 시작월 (YYYY-MM) */
  startMonth: string;
  /** 과세기간 종료월 (YYYY-MM) */
  endMonth: string;

  // ── 매출 집계 ──
  /** 매출 공급가액 합계 */
  totalRevenueSupply: number;
  /** 매출세액 합계 */
  totalOutputVat: number;
  /** 매출 합계금액 (공급가액 + 세액) */
  totalRevenueAmount: number;
  /** 매출 건수 */
  revenueCount: number;
  /** 매출 증빙유형별 내역 */
  revenueByEvidence: VatEvidenceBreakdown[];

  // ── 매입 집계 ──
  /** 매입 공급가액 합계 */
  totalExpenseSupply: number;
  /** 매입세액 합계 */
  totalInputVat: number;
  /** 매입 합계금액 (공급가액 + 세액) */
  totalExpenseAmount: number;
  /** 매입 건수 */
  expenseCount: number;
  /** 매입 증빙유형별 내역 */
  expenseByEvidence: VatEvidenceBreakdown[];

  // ── 납부세액 ──
  /** 납부(환급) 예상세액 = 매출세액 - 매입세액 */
  netVat: number;
  /** 양수면 납부, 음수면 환급 */
  isRefund: boolean;

  // ── 월별 상세 ──
  monthlyDetails: VatMonthlyDetail[];

  // ── 메타 ──
  /** 보고서 생성 시각 */
  generatedAt: string;
  /** 증빙 미비 건수 */
  noEvidenceCount: number;
}

// ─────────────────────────────────────────────
// 종합소득세 기초자료 타입
// ─────────────────────────────────────────────

/** 비용 카테고리별 집계 (종합소득세 필요경비) */
export interface ExpenseCategoryBreakdown {
  /** 카테고리 이름 (한글) */
  category: string;
  /** 해당 카테고리의 세부유형 목록 */
  subTypes: ExpenseSubType[];
  /** 합계 금액 */
  amount: number;
  /** 건수 */
  count: number;
}

/** 월별 수입/지출 요약 (종합소득세용) */
export interface IncomeTaxMonthlyDetail {
  /** 귀속월 (YYYY-MM) */
  yearMonth: string;
  /** 총수입금액 */
  revenue: number;
  /** 필요경비 합계 */
  expenses: number;
  /** 소득금액 (수입 - 경비) */
  income: number;
}

/** 종합소득세 신고 기초자료 */
export interface IncomeTaxPrep {
  /** 사업자(변호사) ID */
  ownerId: string;
  /** 귀속연도 */
  year: number;

  // ── 수입 집계 ──
  /** 총수입금액 (공급가액 기준) */
  totalRevenue: number;
  /** 수입 건수 */
  revenueCount: number;
  /** 수입 세부 유형별 내역 */
  revenueBreakdown: Array<{
    subType: string;
    amount: number;
    count: number;
  }>;

  // ── 필요경비 집계 ──
  /** 필요경비 합계 */
  totalExpenses: number;
  /** 경비 건수 */
  expenseCount: number;
  /** 경비 카테고리별 내역 */
  expenseBreakdown: ExpenseCategoryBreakdown[];

  // ── 소득금액 ──
  /** 소득금액 = 총수입금액 - 필요경비 */
  netIncome: number;

  // ── 월별 상세 ──
  monthlyDetails: IncomeTaxMonthlyDetail[];

  // ── 사무소 경비 상세 (MonthlySummary 기반) ──
  officeExpensesSummary: {
    임대료: number;
    공과금: number;
    통신비: number;
    사무용품: number;
    인건비: number;
    보험료: number;
    변호사회비: number;
    광고마케팅: number;
    접대비: number;
    교통비: number;
    교육연수비: number;
    기타경비: number;
  };

  // ── 메타 ──
  /** 보고서 생성 시각 */
  generatedAt: string;
  /** 데이터가 존재하는 월 수 */
  monthsWithData: number;
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/** 증빙유형별로 거래를 그룹화하여 VatEvidenceBreakdown 배열을 생성 */
function groupByEvidence(transactions: Transaction[]): VatEvidenceBreakdown[] {
  const map = new Map<EvidenceType, VatEvidenceBreakdown>();

  for (const tx of transactions) {
    const et = tx.evidenceType;
    const existing = map.get(et);
    if (existing) {
      existing.count += 1;
      existing.supplyAmount += tx.vat.supplyAmount;
      existing.vatAmount += tx.vat.vatAmount;
      existing.totalAmount += tx.vat.totalAmount;
    } else {
      map.set(et, {
        evidenceType: et,
        count: 1,
        supplyAmount: tx.vat.supplyAmount,
        vatAmount: tx.vat.vatAmount,
        totalAmount: tx.vat.totalAmount,
      });
    }
  }

  // 세금계산서 > 카드 > 현금영수증 > 간이영수증 > 거래명세서 > 없음 순
  const order: EvidenceType[] = [
    "세금계산서",
    "카드매출전표",
    "현금영수증",
    "간이영수증",
    "거래명세서",
    "없음",
  ];

  return order
    .filter((et) => map.has(et))
    .map((et) => map.get(et)!);
}

/** YYYY-MM 형식의 월 범위에 해당하는 거래를 필터 */
function filterByMonthRange(
  transactions: Transaction[],
  startMonth: string,
  endMonth: string
): Transaction[] {
  const startDate = `${startMonth}-01`;
  // endMonth의 마지막 날 계산
  const [endYear, endMon] = endMonth.split("-").map(Number);
  const lastDay = new Date(endYear, endMon, 0).getDate();
  const endDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;

  return transactions.filter((tx) => tx.date >= startDate && tx.date <= endDate);
}

/** YYYY-MM 형식의 월 목록 생성 (startMonth ~ endMonth) */
function generateMonthList(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [startY, startM] = startMonth.split("-").map(Number);
  const [endY, endM] = endMonth.split("-").map(Number);

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

// ─────────────────────────────────────────────
// 경비 카테고리 매핑 (종합소득세 필요경비 분류)
// ─────────────────────────────────────────────

/** ExpenseSubType → 종합소득세 필요경비 카테고리 매핑 */
const EXPENSE_CATEGORY_MAP: Record<ExpenseSubType, string> = {
  사무실임대료: "임대료",
  사무용품: "사무용품",
  통신비: "통신비",
  도서구입: "사무용품",
  교육비: "교육연수비",
  교통비: "교통비",
  접대비: "접대비",
  광고비: "광고마케팅",
  보험료: "보험료",
  회비: "변호사회비",
  인건비: "인건비",
  외주비: "인건비",
  기타매입: "기타경비",
};

// ─────────────────────────────────────────────
// 부가세 신고 기초자료 생성
// ─────────────────────────────────────────────

/**
 * 부가세 신고 기초자료를 생성합니다.
 *
 * 개인사업자(변호사) 부가세 신고 기간:
 *   - 상반기 (1기): 1월 ~ 6월 → 7월 25일까지 확정신고
 *   - 하반기 (2기): 7월 ~ 12월 → 다음해 1월 25일까지 확정신고
 *
 * @param ownerId - 변호사 UID
 * @param startMonth - 시작월 (YYYY-MM, 예: "2026-01")
 * @param endMonth - 종료월 (YYYY-MM, 예: "2026-06")
 * @returns VatReport - 부가세 신고 기초자료
 */
export async function generateVatReport(
  ownerId: string,
  startMonth: string,
  endMonth: string
): Promise<VatReport> {
  // 모든 거래 조회 후 기간 필터링
  const allTransactions = await getTransactions(ownerId);
  const periodTransactions = filterByMonthRange(allTransactions, startMonth, endMonth);

  // 매출 / 매입 분리
  const revenueTransactions = periodTransactions.filter((tx) => tx.type === "매출");
  const expenseTransactions = periodTransactions.filter((tx) => tx.type === "매입");

  // 매출 집계
  const totalRevenueSupply = revenueTransactions.reduce(
    (sum, tx) => sum + tx.vat.supplyAmount,
    0
  );
  const totalOutputVat = revenueTransactions.reduce(
    (sum, tx) => sum + tx.vat.vatAmount,
    0
  );
  const totalRevenueAmount = revenueTransactions.reduce(
    (sum, tx) => sum + tx.vat.totalAmount,
    0
  );

  // 매입 집계
  const totalExpenseSupply = expenseTransactions.reduce(
    (sum, tx) => sum + tx.vat.supplyAmount,
    0
  );
  const totalInputVat = expenseTransactions.reduce(
    (sum, tx) => sum + tx.vat.vatAmount,
    0
  );
  const totalExpenseAmount = expenseTransactions.reduce(
    (sum, tx) => sum + tx.vat.totalAmount,
    0
  );

  // 납부세액
  const netVat = totalOutputVat - totalInputVat;

  // 증빙유형별 분류
  const revenueByEvidence = groupByEvidence(revenueTransactions);
  const expenseByEvidence = groupByEvidence(expenseTransactions);

  // 증빙 미비 건수
  const noEvidenceCount = periodTransactions.filter(
    (tx) => tx.evidenceType === "없음"
  ).length;

  // 월별 상세
  const monthList = generateMonthList(startMonth, endMonth);
  const monthlyDetails: VatMonthlyDetail[] = monthList.map((ym) => {
    const monthRevenue = revenueTransactions.filter((tx) =>
      tx.date.startsWith(ym)
    );
    const monthExpense = expenseTransactions.filter((tx) =>
      tx.date.startsWith(ym)
    );

    const outputVat = monthRevenue.reduce((s, tx) => s + tx.vat.vatAmount, 0);
    const inputVat = monthExpense.reduce((s, tx) => s + tx.vat.vatAmount, 0);

    return {
      yearMonth: ym,
      outputVat,
      inputVat,
      netVat: outputVat - inputVat,
      revenueSupply: monthRevenue.reduce((s, tx) => s + tx.vat.supplyAmount, 0),
      expenseSupply: monthExpense.reduce((s, tx) => s + tx.vat.supplyAmount, 0),
    };
  });

  // 반기 판단
  const startMon = parseInt(startMonth.split("-")[1], 10);
  const period: "상반기" | "하반기" = startMon <= 6 ? "상반기" : "하반기";
  const year = parseInt(startMonth.split("-")[0], 10);

  return {
    ownerId,
    period,
    year,
    startMonth,
    endMonth,
    totalRevenueSupply,
    totalOutputVat,
    totalRevenueAmount,
    revenueCount: revenueTransactions.length,
    revenueByEvidence,
    totalExpenseSupply,
    totalInputVat,
    totalExpenseAmount,
    expenseCount: expenseTransactions.length,
    expenseByEvidence,
    netVat,
    isRefund: netVat < 0,
    monthlyDetails,
    generatedAt: new Date().toISOString(),
    noEvidenceCount,
  };
}

// ─────────────────────────────────────────────
// 종합소득세 기초자료 생성
// ─────────────────────────────────────────────

/**
 * 종합소득세 신고 기초자료를 생성합니다.
 *
 * 종합소득세 신고 기간: 매년 5월 1일 ~ 5월 31일 (전년도 소득 신고)
 * 변호사는 개인사업자로서 사업소득 신고.
 *
 * 이 함수는 실제 세액 계산이 아닌, 회계사에게 넘길 기초자료를 정리합니다:
 *   - 총수입금액 (사업소득 수입)
 *   - 필요경비 (카테고리별 분류)
 *   - 소득금액 (수입 - 경비)
 *
 * @param ownerId - 변호사 UID
 * @param year - 귀속연도 (예: 2025)
 * @returns IncomeTaxPrep - 종합소득세 기초자료
 */
export async function generateIncomeTaxPrep(
  ownerId: string,
  year: number
): Promise<IncomeTaxPrep> {
  const startMonth = `${year}-01`;
  const endMonth = `${year}-12`;

  // 거래 내역과 월별 요약을 병렬 조회
  const [allTransactions, monthlySummaries] = await Promise.all([
    getTransactions(ownerId),
    getMonthlySummaries(ownerId, 12),
  ]);

  // 해당 연도 거래만 필터
  const yearTransactions = filterByMonthRange(allTransactions, startMonth, endMonth);
  const revenueTransactions = yearTransactions.filter((tx) => tx.type === "매출");
  const expenseTransactions = yearTransactions.filter((tx) => tx.type === "매입");

  // 해당 연도 월별 요약만 필터
  const yearSummaries = monthlySummaries.filter((s) =>
    s.yearMonth.startsWith(`${year}-`)
  );

  // ── 수입 집계 ──
  const totalRevenue = revenueTransactions.reduce(
    (sum, tx) => sum + tx.vat.supplyAmount,
    0
  );

  // 수입 세부유형별 내역
  const revenueSubTypeMap = new Map<string, { amount: number; count: number }>();
  for (const tx of revenueTransactions) {
    const existing = revenueSubTypeMap.get(tx.subType);
    if (existing) {
      existing.amount += tx.vat.supplyAmount;
      existing.count += 1;
    } else {
      revenueSubTypeMap.set(tx.subType, {
        amount: tx.vat.supplyAmount,
        count: 1,
      });
    }
  }
  const revenueBreakdown = Array.from(revenueSubTypeMap.entries()).map(
    ([subType, data]) => ({
      subType,
      amount: data.amount,
      count: data.count,
    })
  );
  // 금액 내림차순 정렬
  revenueBreakdown.sort((a, b) => b.amount - a.amount);

  // ── 필요경비 집계 (거래 기반) ──
  const expenseCategoryMap = new Map<
    string,
    { subTypes: Set<ExpenseSubType>; amount: number; count: number }
  >();

  for (const tx of expenseTransactions) {
    const category =
      EXPENSE_CATEGORY_MAP[tx.subType as ExpenseSubType] ?? "기타경비";
    const existing = expenseCategoryMap.get(category);
    if (existing) {
      existing.subTypes.add(tx.subType as ExpenseSubType);
      existing.amount += tx.vat.supplyAmount;
      existing.count += 1;
    } else {
      expenseCategoryMap.set(category, {
        subTypes: new Set([tx.subType as ExpenseSubType]),
        amount: tx.vat.supplyAmount,
        count: 1,
      });
    }
  }

  const totalExpensesFromTx = expenseTransactions.reduce(
    (sum, tx) => sum + tx.vat.supplyAmount,
    0
  );

  // ── 사무소 경비 (MonthlySummary 기반) ──
  const officeExpensesSummary = {
    임대료: 0,
    공과금: 0,
    통신비: 0,
    사무용품: 0,
    인건비: 0,
    보험료: 0,
    변호사회비: 0,
    광고마케팅: 0,
    접대비: 0,
    교통비: 0,
    교육연수비: 0,
    기타경비: 0,
  };

  for (const summary of yearSummaries) {
    officeExpensesSummary.임대료 += summary.expenses.officeRent;
    officeExpensesSummary.공과금 += summary.expenses.utilities;
    officeExpensesSummary.통신비 += summary.expenses.communication;
    officeExpensesSummary.사무용품 += summary.expenses.supplies;
    officeExpensesSummary.인건비 += summary.expenses.payroll;
    officeExpensesSummary.보험료 += summary.expenses.insurance;
    officeExpensesSummary.변호사회비 += summary.expenses.associationDues;
    officeExpensesSummary.광고마케팅 += summary.expenses.marketing;
    officeExpensesSummary.접대비 += summary.expenses.entertainment;
    officeExpensesSummary.교통비 += summary.expenses.transportation;
    officeExpensesSummary.교육연수비 += summary.expenses.education;
    officeExpensesSummary.기타경비 += summary.expenses.otherExpenses;
  }

  const totalOfficeExpenses = Object.values(officeExpensesSummary).reduce(
    (sum, v) => sum + v,
    0
  );

  // 사무소 경비를 카테고리 맵에 합산 (거래 기반 경비와 병합)
  for (const [cat, amount] of Object.entries(officeExpensesSummary)) {
    if (amount === 0) continue;
    const existing = expenseCategoryMap.get(cat);
    if (existing) {
      existing.amount += amount;
    } else {
      expenseCategoryMap.set(cat, {
        subTypes: new Set<ExpenseSubType>(),
        amount,
        count: 0,
      });
    }
  }

  const expenseBreakdown: ExpenseCategoryBreakdown[] = Array.from(
    expenseCategoryMap.entries()
  ).map(([category, data]) => ({
    category,
    subTypes: Array.from(data.subTypes),
    amount: data.amount,
    count: data.count,
  }));
  // 금액 내림차순 정렬
  expenseBreakdown.sort((a, b) => b.amount - a.amount);

  const totalExpenses = totalExpensesFromTx + totalOfficeExpenses;
  const netIncome = totalRevenue - totalExpenses;

  // ── 월별 상세 ──
  const monthList = generateMonthList(startMonth, endMonth);
  const monthlyDetails: IncomeTaxMonthlyDetail[] = monthList.map((ym) => {
    const monthRevenue = revenueTransactions
      .filter((tx) => tx.date.startsWith(ym))
      .reduce((s, tx) => s + tx.vat.supplyAmount, 0);

    const monthExpenseTx = expenseTransactions
      .filter((tx) => tx.date.startsWith(ym))
      .reduce((s, tx) => s + tx.vat.supplyAmount, 0);

    // 해당 월의 사무소 경비
    const monthSummary = yearSummaries.find((s) => s.yearMonth === ym);
    const monthOfficeExp = monthSummary?.expenses.totalExpenses ?? 0;

    const totalMonthExpense = monthExpenseTx + monthOfficeExp;

    return {
      yearMonth: ym,
      revenue: monthRevenue,
      expenses: totalMonthExpense,
      income: monthRevenue - totalMonthExpense,
    };
  });

  const monthsWithData = monthlyDetails.filter(
    (m) => m.revenue > 0 || m.expenses > 0
  ).length;

  return {
    ownerId,
    year,
    totalRevenue,
    revenueCount: revenueTransactions.length,
    revenueBreakdown,
    totalExpenses,
    expenseCount: expenseTransactions.length,
    expenseBreakdown,
    netIncome,
    monthlyDetails,
    officeExpensesSummary,
    generatedAt: new Date().toISOString(),
    monthsWithData,
  };
}
