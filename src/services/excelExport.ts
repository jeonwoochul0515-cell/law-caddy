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
import type { VatReport, IncomeTaxPrep } from "./taxCalculator";

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

export async function exportMonthlySummaryToExcel(
  summary: MonthlySummary,
  transactions?: Transaction[]
): Promise<void> {
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

  // Sheet 8: 거래 상세 (transactions가 제공된 경우)
  if (transactions && transactions.length > 0) {
    const txHeader = [
      "날짜",
      "유형",
      "세부유형",
      "적요",
      "거래처/의뢰인",
      "공급가액",
      "부가세",
      "합계",
      "결제수단",
      "증빙유형",
    ];
    const txRows: (string | number)[][] = [
      [`${ym} 거래 상세`],
      [],
      txHeader,
      ...transactions.map((tx) => [
        tx.date,
        tx.type,
        tx.subType,
        tx.description ?? "",
        tx.clientName ?? "",
        won(tx.vat?.supplyAmount),
        won(tx.vat?.vatAmount),
        won(tx.vat?.totalAmount),
        tx.paymentMethod ?? "",
        tx.evidenceType ?? "",
      ]),
    ];
    // 합계 행
    const totalSupply = transactions.reduce((s, tx) => s + won(tx.vat?.supplyAmount), 0);
    const totalVat = transactions.reduce((s, tx) => s + won(tx.vat?.vatAmount), 0);
    const totalAmount = transactions.reduce((s, tx) => s + won(tx.vat?.totalAmount), 0);
    txRows.push([]);
    txRows.push(["", "", "", "합계", "", totalSupply, totalVat, totalAmount, "", ""]);

    const txWs = createSheet(XLSX, txRows, [12, 6, 16, 30, 14, 14, 14, 14, 10, 14]);
    XLSX.utils.book_append_sheet(wb, txWs, "거래상세");
  }

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

// ── 부가세 신고 기초자료 Excel ──

export async function exportVatReportToExcel(report: VatReport): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const title = `${report.year}년_${report.period}`;

  // Sheet 1: 부가세 요약
  const summaryData: (string | number)[][] = [
    [`${title} 부가세 신고 기초자료`],
    [],
    ["과세기간", `${report.startMonth} ~ ${report.endMonth}`],
    ["생성일시", report.generatedAt.slice(0, 10)],
    [],
    ["구분", "공급가액", "부가세액", "합계금액", "건수"],
    [
      "매출",
      won(report.totalRevenueSupply),
      won(report.totalOutputVat),
      won(report.totalRevenueAmount),
      report.revenueCount,
    ],
    [
      "매입",
      won(report.totalExpenseSupply),
      won(report.totalInputVat),
      won(report.totalExpenseAmount),
      report.expenseCount,
    ],
    [],
    [
      report.isRefund ? "환급 예상세액" : "납부 예상세액",
      "",
      won(Math.abs(report.netVat)),
      "",
      "",
    ],
    [],
    ["증빙 미비 건수", report.noEvidenceCount, "", "", ""],
  ];
  const summaryWs = createSheet(XLSX, summaryData, [20, 16, 16, 16, 10]);
  XLSX.utils.book_append_sheet(wb, summaryWs, "부가세요약");

  // Sheet 2: 매출 증빙유형별
  const revEvidenceData: (string | number)[][] = [
    [`${title} 매출 증빙유형별 내역`],
    [],
    ["증빙유형", "건수", "공급가액", "부가세액", "합계금액"],
    ...report.revenueByEvidence.map((item) => [
      item.evidenceType,
      item.count,
      won(item.supplyAmount),
      won(item.vatAmount),
      won(item.totalAmount),
    ]),
    [],
    [
      "합계",
      report.revenueCount,
      won(report.totalRevenueSupply),
      won(report.totalOutputVat),
      won(report.totalRevenueAmount),
    ],
  ];
  const revEvidenceWs = createSheet(XLSX, revEvidenceData, [16, 10, 16, 16, 16]);
  XLSX.utils.book_append_sheet(wb, revEvidenceWs, "매출증빙별");

  // Sheet 3: 매입 증빙유형별
  const expEvidenceData: (string | number)[][] = [
    [`${title} 매입 증빙유형별 내역`],
    [],
    ["증빙유형", "건수", "공급가액", "부가세액", "합계금액"],
    ...report.expenseByEvidence.map((item) => [
      item.evidenceType,
      item.count,
      won(item.supplyAmount),
      won(item.vatAmount),
      won(item.totalAmount),
    ]),
    [],
    [
      "합계",
      report.expenseCount,
      won(report.totalExpenseSupply),
      won(report.totalInputVat),
      won(report.totalExpenseAmount),
    ],
  ];
  const expEvidenceWs = createSheet(XLSX, expEvidenceData, [16, 10, 16, 16, 16]);
  XLSX.utils.book_append_sheet(wb, expEvidenceWs, "매입증빙별");

  // Sheet 4: 월별 부가세 상세
  const monthlyData: (string | number)[][] = [
    [`${title} 월별 부가세 내역`],
    [],
    ["월", "매출 공급가액", "매출세액", "매입 공급가액", "매입세액", "납부(환급)"],
    ...report.monthlyDetails.map((m) => [
      m.yearMonth,
      won(m.revenueSupply),
      won(m.outputVat),
      won(m.expenseSupply),
      won(m.inputVat),
      won(m.netVat),
    ]),
    [],
    [
      "합계",
      won(report.totalRevenueSupply),
      won(report.totalOutputVat),
      won(report.totalExpenseSupply),
      won(report.totalInputVat),
      won(report.netVat),
    ],
  ];
  const monthlyWs = createSheet(XLSX, monthlyData, [12, 16, 16, 16, 16, 16]);
  XLSX.utils.book_append_sheet(wb, monthlyWs, "월별상세");

  XLSX.writeFile(wb, `부가세_기초자료_${title}.xlsx`);
}

// ── 종합소득세 기초자료 Excel ──

export async function exportIncomeTaxPrepToExcel(data: IncomeTaxPrep): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const title = `${data.year}년_귀속`;

  // Sheet 1: 소득금액 요약
  const summaryData: (string | number)[][] = [
    [`${title} 종합소득세 신고 기초자료`],
    [],
    ["귀속연도", `${data.year}년`],
    ["생성일시", data.generatedAt.slice(0, 10)],
    ["데이터 존재 월수", `${data.monthsWithData}개월`],
    [],
    ["구분", "금액(원)"],
    ["총수입금액", won(data.totalRevenue)],
    ["(-) 필요경비", won(data.totalExpenses)],
    [],
    ["소득금액", won(data.netIncome)],
    [],
    ["※ 본 자료는 회계사무소 제출용 기초자료이며, 실제 세액 계산은 포함되지 않습니다.", ""],
  ];
  const summaryWs = createSheet(XLSX, summaryData, [50, 20]);
  XLSX.utils.book_append_sheet(wb, summaryWs, "소득요약");

  // Sheet 2: 수입 유형별 내역
  const revenueData: (string | number)[][] = [
    [`${title} 수입 유형별 내역`],
    [],
    ["유형", "건수", "금액(원)", "비중(%)"],
    ...data.revenueBreakdown.map((item) => [
      item.subType.replace(/_/g, " "),
      item.count,
      won(item.amount),
      data.totalRevenue > 0
        ? Number(((item.amount / data.totalRevenue) * 100).toFixed(1))
        : 0,
    ]),
    [],
    ["합계", data.revenueCount, won(data.totalRevenue), 100],
  ];
  const revenueWs = createSheet(XLSX, revenueData, [20, 10, 18, 10]);
  XLSX.utils.book_append_sheet(wb, revenueWs, "수입내역");

  // Sheet 3: 필요경비 카테고리별 내역
  const expenseData: (string | number)[][] = [
    [`${title} 필요경비 카테고리별 내역`],
    [],
    ["카테고리", "건수", "금액(원)", "비중(%)"],
    ...data.expenseBreakdown.map((item) => [
      item.category,
      item.count > 0 ? item.count : "-",
      won(item.amount),
      data.totalExpenses > 0
        ? Number(((item.amount / data.totalExpenses) * 100).toFixed(1))
        : 0,
    ]),
    [],
    ["합계", data.expenseCount, won(data.totalExpenses), 100],
  ];
  const expenseWs = createSheet(XLSX, expenseData, [18, 10, 18, 10]);
  XLSX.utils.book_append_sheet(wb, expenseWs, "경비내역");

  // Sheet 4: 사무소 경비 상세
  const officeData: (string | number)[][] = [
    [`${title} 사무소 경비 상세`],
    [],
    ["항목", "연간 합계(원)"],
    ["임대료", won(data.officeExpensesSummary.임대료)],
    ["공과금", won(data.officeExpensesSummary.공과금)],
    ["통신비", won(data.officeExpensesSummary.통신비)],
    ["사무용품", won(data.officeExpensesSummary.사무용품)],
    ["인건비", won(data.officeExpensesSummary.인건비)],
    ["보험료", won(data.officeExpensesSummary.보험료)],
    ["변호사회비", won(data.officeExpensesSummary.변호사회비)],
    ["광고/마케팅", won(data.officeExpensesSummary.광고마케팅)],
    ["접대비", won(data.officeExpensesSummary.접대비)],
    ["교통비", won(data.officeExpensesSummary.교통비)],
    ["교육/연수비", won(data.officeExpensesSummary.교육연수비)],
    ["기타 경비", won(data.officeExpensesSummary.기타경비)],
    [],
    [
      "합계",
      won(
        Object.values(data.officeExpensesSummary).reduce((s, v) => s + v, 0)
      ),
    ],
  ];
  const officeWs = createSheet(XLSX, officeData, [18, 18]);
  XLSX.utils.book_append_sheet(wb, officeWs, "사무소경비");

  // Sheet 5: 월별 수입/경비 추이
  const monthlyData: (string | number)[][] = [
    [`${title} 월별 수입/경비 추이`],
    [],
    ["월", "수입(원)", "경비(원)", "소득(원)"],
    ...data.monthlyDetails.map((m) => [
      m.yearMonth,
      won(m.revenue),
      won(m.expenses),
      won(m.income),
    ]),
    [],
    [
      "합계",
      won(data.totalRevenue),
      won(data.totalExpenses),
      won(data.netIncome),
    ],
  ];
  const monthlyWs = createSheet(XLSX, monthlyData, [12, 18, 18, 18]);
  XLSX.utils.book_append_sheet(wb, monthlyWs, "월별추이");

  XLSX.writeFile(wb, `종합소득세_기초자료_${title}.xlsx`);
}
