/**
 * 월별 정산 보고서 탭
 *
 * 매출/비용/부가세/손익/미수금/예수금을 요약 카드로 표시하고
 * Excel 내보내기 및 회계사무소 전달 상태를 관리한다.
 */

import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  RefreshCw,
  Download,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Landmark,
  Receipt,
  Calculator,
  Loader2,
  ChevronDown,
  Briefcase,
} from "lucide-react";
import {
  generateMonthlySummary,
  getMonthlySummary,
  updateMonthlySummaryStatus,
} from "../../services/reportGenerator";
import { exportMonthlySummaryToExcel } from "../../services/excelExport";
import type { MonthlySummary } from "../../types/accounting";

interface MonthlyReportTabProps {
  ownerId: string;
}

/** 금액 포맷: 1234567 → "1,234,567" */
function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/** 최근 12개월 옵션 생성 */
function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    const label = `${year}년 ${month}월`;
    options.push({ value, label });
  }
  return options;
}

const STATUS_LABELS: Record<MonthlySummary["status"], string> = {
  "작성중": "작성중",
  "확정": "확정",
  "전달완료": "전달완료",
};

const STATUS_COLORS: Record<MonthlySummary["status"], string> = {
  "작성중": "bg-amber-500/15 text-amber-400",
  "확정": "bg-blue-500/15 text-blue-400",
  "전달완료": "bg-emerald-500/15 text-emerald-400",
};

const NEXT_STATUS: Record<MonthlySummary["status"], MonthlySummary["status"] | null> = {
  "작성중": "확정",
  "확정": "전달완료",
  "전달완료": null,
};

export default function MonthlyReportTab({ ownerId }: MonthlyReportTabProps) {
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기존 요약 조회
  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonthlySummary(ownerId, selectedMonth);
      setSummary(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "조회 실패";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [ownerId, selectedMonth]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // 보고서 생성/갱신
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await generateMonthlySummary(ownerId, selectedMonth);
      setSummary(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "생성 실패";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Excel 내보내기
  const handleExcelExport = async () => {
    if (!summary) return;
    try {
      await exportMonthlySummaryToExcel(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Excel 내보내기 실패";
      setError(msg);
    }
  };

  // 상태 변경
  const handleStatusChange = async () => {
    if (!summary || statusChanging) return;
    const next = NEXT_STATUS[summary.status];
    if (!next) return;

    setStatusChanging(true);
    setError(null);
    try {
      await updateMonthlySummaryStatus(summary.id, next);
      setSummary({ ...summary, status: next });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "상태 변경 실패";
      setError(msg);
    } finally {
      setStatusChanging(false);
    }
  };

  const selectedLabel =
    monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth;

  return (
    <div className="space-y-6">
      {/* 헤더: 월 선택 + 액션 버튼 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-gold" />
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-surface border border-border rounded-lg px-4 py-2 pr-8 text-text-primary text-sm focus:outline-none focus:border-gold/40 cursor-pointer"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/20 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {summary ? "갱신" : "생성"}
          </button>

          {summary && (
            <>
              <button
                onClick={handleExcelExport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Excel 내보내기
              </button>

              {NEXT_STATUS[summary.status] && (
                <button
                  onClick={handleStatusChange}
                  disabled={statusChanging}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {statusChanging ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {NEXT_STATUS[summary.status] === "확정"
                    ? "확정하기"
                    : "전달완료 처리"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3 text-error text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* 로딩 */}
      {(loading || generating) && (
        <div className="flex items-center justify-center py-16 text-text-dim">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          {generating ? "보고서 생성 중..." : "데이터 조회 중..."}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && !generating && !summary && (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim text-sm mb-1">
            {selectedLabel} 정산 보고서가 없습니다
          </p>
          <p className="text-text-dim/60 text-xs">
            &ldquo;생성&rdquo; 버튼을 눌러 보고서를 만들어 주세요
          </p>
        </div>
      )}

      {/* 보고서 본문 */}
      {!loading && !generating && summary && (
        <div className="space-y-5">
          {/* 상태 배지 */}
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[summary.status]}`}
            >
              {STATUS_LABELS[summary.status]}
            </span>
            <span className="text-text-dim text-xs">{selectedLabel} 정산 보고서</span>
          </div>

          {/* 매출 요약 */}
          <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-success" />
              <h3 className="text-text-primary font-semibold">매출 요약</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <RevenueItem label="착수금" amount={summary.revenue.retainerFees} />
              <RevenueItem label="잔금" amount={summary.revenue.balanceFees} />
              <RevenueItem label="성공보수" amount={summary.revenue.successFees} />
              <RevenueItem label="자문료" amount={summary.revenue.consultingFees} />
              <RevenueItem label="기타 매출" amount={summary.revenue.otherRevenue} />
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-text-dim text-sm">매출 합계</span>
              <span className="text-success font-bold text-lg">
                {formatAmount(summary.revenue.totalRevenue)}원
              </span>
            </div>
          </section>

          {/* 비용 요약 */}
          <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-5 h-5 text-error" />
              <h3 className="text-text-primary font-semibold">비용 요약</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <ExpenseItem label="임대료" amount={summary.expenses.officeRent} />
              <ExpenseItem label="공과금" amount={summary.expenses.utilities} />
              <ExpenseItem label="통신비" amount={summary.expenses.communication} />
              <ExpenseItem label="사무용품" amount={summary.expenses.supplies} />
              <ExpenseItem label="인건비" amount={summary.expenses.payroll} />
              <ExpenseItem label="보험료" amount={summary.expenses.insurance} />
              <ExpenseItem label="변호사회비" amount={summary.expenses.associationDues} />
              <ExpenseItem label="광고/마케팅" amount={summary.expenses.marketing} />
              <ExpenseItem label="접대비" amount={summary.expenses.entertainment} />
              <ExpenseItem label="교통비" amount={summary.expenses.transportation} />
              <ExpenseItem label="교육/연수비" amount={summary.expenses.education} />
              <ExpenseItem label="기타" amount={summary.expenses.otherExpenses} />
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-text-dim text-sm">비용 합계</span>
              <span className="text-error font-bold text-lg">
                {formatAmount(summary.expenses.totalExpenses)}원
              </span>
            </div>
          </section>

          {/* 사건비용 요약 */}
          <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-5 h-5 text-gold" />
              <h3 className="text-text-primary font-semibold">사건비용 요약</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <ExpenseItem label="인지대/송달료" amount={summary.caseExpenses.courtFees} />
              <ExpenseItem label="감정료/번역료" amount={summary.caseExpenses.expertFees} />
              <ExpenseItem label="출장비" amount={summary.caseExpenses.travelExpenses} />
              <ExpenseItem label="기타 사건비용" amount={summary.caseExpenses.otherCaseCosts} />
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-text-dim text-sm">사건비용 합계</span>
                <span className="text-text-primary font-bold text-lg">
                  {formatAmount(summary.caseExpenses.totalCaseCosts)}원
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">의뢰인 부담분</span>
                <span className="text-text-primary">{formatAmount(summary.caseExpenses.clientBorne)}원</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">사무소 부담분</span>
                <span className="text-text-primary">{formatAmount(summary.caseExpenses.firmBorne)}원</span>
              </div>
              {summary.caseExpenses.unreimbursed > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-400">미정산 의뢰인 부담분</span>
                  <span className="text-amber-400 font-medium">
                    {formatAmount(summary.caseExpenses.unreimbursed)}원
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* 부가세 현황 */}
          <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-gold" />
              <h3 className="text-text-primary font-semibold">부가세 현황</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-text-dim text-xs mb-1">매출세액</p>
                <p className="text-text-primary font-medium">
                  {formatAmount(summary.vat.outputVat)}원
                </p>
              </div>
              <div>
                <p className="text-text-dim text-xs mb-1">매입세액</p>
                <p className="text-text-primary font-medium">
                  {formatAmount(summary.vat.inputVat)}원
                </p>
              </div>
              <div>
                <p className="text-text-dim text-xs mb-1">
                  {summary.vat.netVat >= 0 ? "납부 예상" : "환급 예상"}
                </p>
                <p
                  className={`font-bold ${
                    summary.vat.netVat >= 0 ? "text-error" : "text-success"
                  }`}
                >
                  {formatAmount(Math.abs(summary.vat.netVat))}원
                </p>
              </div>
            </div>
            {/* 증빙 현황 */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-text-dim text-xs mb-2">증빙 현황</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <EvidenceBadge label="세금계산서(발행)" count={summary.evidence.taxInvoiceIssued} />
                <EvidenceBadge label="세금계산서(수취)" count={summary.evidence.taxInvoiceReceived} />
                <EvidenceBadge label="현금영수증" count={summary.evidence.cashReceiptIssued} />
                <EvidenceBadge label="카드매출" count={summary.evidence.cardSalesCount} />
                <EvidenceBadge label="카드매입" count={summary.evidence.cardPurchaseCount} />
                <EvidenceBadge
                  label="증빙미비"
                  count={summary.evidence.noEvidenceCount}
                  warn={summary.evidence.noEvidenceCount > 0}
                />
              </div>
            </div>
          </section>

          {/* 손익 계산 */}
          <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-gold" />
              <h3 className="text-text-primary font-semibold">손익 계산</h3>
            </div>
            <div className="space-y-3">
              <ProfitRow
                label="매출 합계"
                amount={summary.revenue.totalRevenue}
                positive
              />
              <ProfitRow
                label="(-) 사건비용 (사무소 부담)"
                amount={summary.caseExpenses.firmBorne}
              />
              <div className="border-t border-border pt-3">
                <ProfitRow
                  label="매출총이익"
                  amount={summary.profitLoss.grossProfit}
                  bold
                  positive={summary.profitLoss.grossProfit >= 0}
                />
              </div>
              <ProfitRow
                label="(-) 사무소 경비"
                amount={summary.expenses.totalExpenses}
              />
              <div className="border-t border-border pt-3">
                <ProfitRow
                  label="영업이익 (세전)"
                  amount={summary.profitLoss.operatingProfit}
                  bold
                  positive={summary.profitLoss.operatingProfit >= 0}
                />
              </div>
              <div className="border-t border-dashed border-border/50 pt-3 mt-1">
                <ProfitRow
                  label="당기순이익 (세전 간이)"
                  amount={summary.profitLoss.netIncome}
                  bold
                  positive={summary.profitLoss.netIncome >= 0}
                />
              </div>
            </div>
          </section>

          {/* 미수금 + 예수금 (2열 그리드) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 미수금 현황 */}
            <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-text-primary font-semibold">미수금 현황</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">미수 수임료 총액</span>
                  <span className="text-text-primary font-medium">
                    {formatAmount(summary.receivables.totalOutstanding)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">연체 금액</span>
                  <span
                    className={
                      summary.receivables.overdueAmount > 0
                        ? "text-error font-medium"
                        : "text-text-primary"
                    }
                  >
                    {formatAmount(summary.receivables.overdueAmount)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">연체 건수</span>
                  <span
                    className={
                      summary.receivables.overdueCount > 0
                        ? "text-error font-medium"
                        : "text-text-primary"
                    }
                  >
                    {summary.receivables.overdueCount}건
                  </span>
                </div>
              </div>
            </section>

            {/* 예수금 현황 */}
            <section className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <Landmark className="w-5 h-5 text-blue-400" />
                <h3 className="text-text-primary font-semibold">예수금 현황</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">보관 중 총액</span>
                  <span className="text-text-primary font-medium">
                    {formatAmount(summary.depositSummary.totalHolding)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">이번 달 입금</span>
                  <span className="text-success">
                    +{formatAmount(summary.depositSummary.receivedThisMonth)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">이번 달 사용</span>
                  <span className="text-error">
                    -{formatAmount(summary.depositSummary.usedThisMonth)}원
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim text-sm">이번 달 반환</span>
                  <span className="text-text-primary">
                    {formatAmount(summary.depositSummary.returnedThisMonth)}원
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ──

function RevenueItem({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="bg-navy-light rounded-xl p-3">
      <p className="text-text-dim text-xs mb-1">{label}</p>
      <p className="text-text-primary font-medium text-sm">
        {formatAmount(amount)}원
      </p>
    </div>
  );
}

function ExpenseItem({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-text-dim">{label}</span>
      <span className="text-text-primary">{formatAmount(amount)}원</span>
    </div>
  );
}

function EvidenceBadge({
  label,
  count,
  warn = false,
}: {
  label: string;
  count: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`text-center rounded-lg py-1.5 px-1 ${
        warn ? "bg-error/10" : "bg-navy-light"
      }`}
    >
      <p className={`font-bold ${warn ? "text-error" : "text-text-primary"}`}>
        {count}
      </p>
      <p className="text-text-dim text-[10px] leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function ProfitRow({
  label,
  amount,
  bold = false,
  positive,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  positive?: boolean;
}) {
  let colorClass = "text-text-primary";
  if (positive === true) colorClass = "text-success";
  if (positive === false) colorClass = "text-error";

  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? "text-text-primary font-medium" : "text-text-dim"}`}>
        {label}
      </span>
      <span className={`${bold ? "font-bold text-lg" : "font-medium"} ${colorClass}`}>
        {formatAmount(amount)}원
      </span>
    </div>
  );
}
