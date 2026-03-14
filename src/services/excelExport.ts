/**
 * Excel 내보내기 서비스
 *
 * xlsx(SheetJS) 패키지를 사용하여 월별 정산, 거래 내역, 수임료 현황을
 * Excel 파일로 다운로드한다.
 *
 * 설치 필요: npm install xlsx
 */

// xlsx는 번들 크기가 크므로 (200KB+) 사용 시점에 동적 import
import type { MonthlySummary, Transaction, Fee } from "../types/accounting";

/** xlsx 모듈을 동적으로 로드 (코드 스플리팅) */
async function loadXLSX() {
  return await import("xlsx");
}

// ── 유틸 ──

/** 숫자를 안전하게 반환 (undefined/NaN → 0) */
function won(amount: number | undefined | null): number {
  return typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
}

/** 시트에 열 너비 설정 */
function setColWidths(
  ws: Record<string, unknown>,
  widths: number[]
): void {
  (ws as { "!cols"?: Array<{ wch: number }> })["!cols"] = widths.map((w) => ({ wch: w }));
}

/** 2차원 배열로 시트 생성 + 열 너비 적용 */
function createSheet(
  XLSX: Awaited<ReturnType<typeof loadXLSX>>,
  data: (string | number)[][],
  colWidths: number[]
) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  setColWidths(ws, colWidths);
  return ws;
}

// ── 월별 정산 보고서 Excel ──

export async function exportMonthlySummaryToExcel(summary: MonthlySummary): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const ym = summary.yearMonth;

  // Sheet 1: 매출요약
  const revenueData: (string | number)[][] = [
    [`${ym} 매출 요약`],
    [],
    ["항목", "금액(원)"],
    ["착수금 수입", won(summary.revenue.retainerFees)],
    ["잔금 수입", won(summary.revenue.balanceFees)],
    ["성공보수 수입", won(summary.revenue.successFees)],
    ["자문료", won(summary.revenue.consultingFees)],
    ["기타 매출", won(summary.revenue.otherRevenue)],
    [],
    ["매출 합계", won(summary.revenue.totalRevenue)],
  ];
  const revenueWs = createSheet(XLSX, revenueData, [20, 18]);
  XLSX.utils.book_append_sheet(wb, revenueWs, "매출요약");

  // Sheet 2: 비용요약
  const expenseData: (string | number)[][] = [
    [`${ym} 비용 요약`],
    [],
    ["항목", "금액(원)"],
    ["임대료", won(summary.expenses.officeRent)],
    ["공과금", won(summary.expenses.utilities)],
    ["통신비", won(summary.expenses.communication)],
    ["사무용품", won(summary.expenses.supplies)],
    ["인건비", won(summary.expenses.payroll)],
    ["보험료", won(summary.expenses.insurance)],
    ["변호사회비", won(summary.expenses.associationDues)],
    ["광고/마케팅", won(summary.expenses.marketing)],
    ["접대비", won(summary.expenses.entertainment)],
    ["교통비/차량유지비", won(summary.expenses.transportation)],
    ["교육/연수비", won(summary.expenses.education)],
    ["기타 비용", won(summary.expenses.otherExpenses)],
    [],
    ["비용 합계", won(summary.expenses.totalExpenses)],
  ];
  const expenseWs = createSheet(XLSX, expenseData, [22, 18]);
  XLSX.utils.book_append_sheet(wb, expenseWs, "비용요약");

  // Sheet 3: 사건비용
  const caseExpData: (string | number)[][] = [
    [`${ym} 사건비용 요약`],
    [],
    ["항목", "금액(원)"],
    ["인지대/송달료", won(summary.caseExpenses.courtFees)],
    ["감정료/번역료", won(summary.caseExpenses.expertFees)],
    ["출장비", won(summary.caseExpenses.travelExpenses)],
    ["기타 사건비용", won(summary.caseExpenses.otherCaseCosts)],
    [],
    ["사건비용 합계", won(summary.caseExpenses.totalCaseCosts)],
    [],
    ["부담 구분", "금액(원)"],
    ["의뢰인 부담분", won(summary.caseExpenses.clientBorne)],
    ["사무소 부담분", won(summary.caseExpenses.firmBorne)],
    ["미정산 의뢰인 부담분", won(summary.caseExpenses.unreimbursed)],
  ];
  const caseExpWs = createSheet(XLSX, caseExpData, [22, 18]);
  XLSX.utils.book_append_sheet(wb, caseExpWs, "사건비용");

  // Sheet 4: 부가세
  const vatData: (string | number)[][] = [
    [`${ym} 부가세 현황`],
    [],
    ["항목", "금액(원)"],
    ["매출세액", won(summary.vat.outputVat)],
    ["매입세액", won(summary.vat.inputVat)],
    [],
    [
      (summary.vat?.netVat ?? 0) >= 0 ? "납부 예상액" : "환급 예상액",
      won(Math.abs(summary.vat?.netVat ?? 0)),
    ],
    [],
    ["증빙 현황", "건수"],
    ["세금계산서 발행", summary.evidence.taxInvoiceIssued],
    ["세금계산서 수취", summary.evidence.taxInvoiceReceived],
    ["현금영수증 발행", summary.evidence.cashReceiptIssued],
    ["카드 매출", summary.evidence.cardSalesCount],
    ["카드 매입", summary.evidence.cardPurchaseCount],
    ["증빙 미비", summary.evidence.noEvidenceCount],
  ];
  const vatWs = createSheet(XLSX, vatData, [22, 18]);
  XLSX.utils.book_append_sheet(wb, vatWs, "부가세");

  // Sheet 5: 손익
  const plData: (string | number)[][] = [
    [`${ym} 손익 계산`],
    [],
    ["항목", "금액(원)"],
    ["매출 합계", won(summary.revenue.totalRevenue)],
    ["(-) 사건비용(사무소 부담)", won(summary.caseExpenses.firmBorne)],
    [],
    ["매출총이익", won(summary.profitLoss.grossProfit)],
    ["(-) 사무소 경비", won(summary.expenses.totalExpenses)],
    [],
    ["영업이익 (세전)", won(summary.profitLoss.operatingProfit)],
    [],
    ["당기순이익 (세전 간이)", won(summary.profitLoss.netIncome)],
  ];
  const plWs = createSheet(XLSX, plData, [28, 18]);
  XLSX.utils.book_append_sheet(wb, plWs, "손익");

  // Sheet 6: 미수금
  const receivablesData: (string | number)[][] = [
    [`${ym} 미수금 현황`],
    [],
    ["항목", "금액/건수"],
    ["미수 수임료 총액", won(summary.receivables.totalOutstanding)],
    ["연체 금액", won(summary.receivables.overdueAmount)],
    ["연체 건수", `${summary.receivables?.overdueCount ?? 0}건`],
  ];
  const receivablesWs = createSheet(XLSX, receivablesData, [22, 18]);
  XLSX.utils.book_append_sheet(wb, receivablesWs, "미수금");

  // Sheet 7: 예수금
  const depositData: (string | number)[][] = [
    [`${ym} 예수금 현황`],
    [],
    ["항목", "금액(원)"],
    ["보관 중 총액", won(summary.depositSummary.totalHolding)],
    ["이번 달 신규 입금", won(summary.depositSummary.receivedThisMonth)],
    ["이번 달 사용", won(summary.depositSummary.usedThisMonth)],
    ["이번 달 반환", won(summary.depositSummary.returnedThisMonth)],
  ];
  const depositWs = createSheet(XLSX, depositData, [22, 18]);
  XLSX.utils.book_append_sheet(wb, depositWs, "예수금");

  XLSX.writeFile(wb, `월별정산_${ym}.xlsx`);
}

// ── 거래 내역 Excel ──

export async function exportTransactionsToExcel(
  transactions: Transaction[],
  yearMonth: string
): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const header = [
    "날짜",
    "유형",
    "세부유형",
    "적요",
    "공급가액",
    "부가세",
    "합계",
    "결제수단",
    "증빙유형",
  ];

  const rows: (string | number)[][] = [
    [`${yearMonth} 거래 내역`],
    [],
    header,
    ...transactions.map((tx) => [
      tx.date,
      tx.type,
      tx.subType,
      tx.description ?? "",
      won(tx.vat?.supplyAmount),
      won(tx.vat?.vatAmount),
      won(tx.vat?.totalAmount),
      tx.paymentMethod ?? "",
      tx.evidenceType ?? "",
    ]),
  ];

  const ws = createSheet(XLSX, rows, [12, 6, 16, 30, 14, 14, 14, 10, 14]);
  XLSX.utils.book_append_sheet(wb, ws, "거래내역");

  XLSX.writeFile(wb, `거래내역_${yearMonth}.xlsx`);
}

// ── 수임료 현황 Excel ──

export async function exportFeeStatusToExcel(fees: Fee[]): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const header = [
    "의뢰인",
    "약정수임료",
    "납부액",
    "미수금",
    "상태",
    "계약일",
  ];

  const rows: (string | number)[][] = [
    ["수임료 현황"],
    [],
    header,
    ...fees.map((fee) => [
      fee.clientName,
      won(fee.totalAgreedAmount),
      won(fee.totalPaidAmount),
      won(fee.totalOutstanding),
      fee.status,
      fee.contract?.signedDate ?? "-",
    ]),
  ];

  // 합계 행
  const totalAgreed = fees.reduce((s, f) => s + won(f.totalAgreedAmount), 0);
  const totalPaid = fees.reduce((s, f) => s + won(f.totalPaidAmount), 0);
  const totalOutstanding = fees.reduce((s, f) => s + won(f.totalOutstanding), 0);
  rows.push([]);
  rows.push(["합계", won(totalAgreed), won(totalPaid), won(totalOutstanding), "", ""]);

  const ws = createSheet(XLSX, rows, [14, 16, 16, 16, 10, 14]);
  XLSX.utils.book_append_sheet(wb, ws, "수임료현황");

  XLSX.writeFile(wb, "수임료현황.xlsx");
}
