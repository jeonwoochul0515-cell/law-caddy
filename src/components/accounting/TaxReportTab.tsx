/**
 * 부가세/종합소득세 기초자료 탭 컴포넌트
 *
 * FinancePage에 탭으로 통합되어 사용됩니다.
 * - 부가세 신고 기초자료 (반기별)
 * - 종합소득세 신고 기초자료 (연간)
 */

import { useState, useCallback } from "react";
import {
  FileText,
  Download,
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import {
  generateVatReport,
  generateIncomeTaxPrep,
} from "../../services/taxCalculator";
import type {
  VatReport,
  IncomeTaxPrep,
} from "../../services/taxCalculator";
import {
  exportVatReportToExcel,
  exportIncomeTaxPrepToExcel,
} from "../../services/excelExport";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface TaxReportTabProps {
  /** 현재 로그인한 변호사 UID */
  ownerId: string;
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/** 금액 포맷: 1234567 → "1,234,567" */
function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/** 금액 포맷 (원 단위): 1234567 → "1,234,567원" */
function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 현재 연도 기준 최근 3년 옵션 */
function generateYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

/** 부가세 반기 옵션 */
interface VatPeriodOption {
  label: string;
  startMonth: string;
  endMonth: string;
  year: number;
}

function generateVatPeriodOptions(): VatPeriodOption[] {
  const currentYear = new Date().getFullYear();
  const options: VatPeriodOption[] = [];

  for (let y = currentYear; y >= currentYear - 2; y--) {
    options.push({
      label: `${y}년 하반기 (7~12월)`,
      startMonth: `${y}-07`,
      endMonth: `${y}-12`,
      year: y,
    });
    options.push({
      label: `${y}년 상반기 (1~6월)`,
      startMonth: `${y}-01`,
      endMonth: `${y}-06`,
      year: y,
    });
  }

  return options;
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

export default function TaxReportTab({ ownerId }: TaxReportTabProps) {
  // 보고서 유형 선택
  const [reportType, setReportType] = useState<"vat" | "income">("vat");

  // 부가세 기간 선택
  const vatPeriodOptions = generateVatPeriodOptions();
  const [selectedVatPeriod, setSelectedVatPeriod] = useState(0);

  // 종합소득세 연도 선택
  const yearOptions = generateYearOptions();
  const [selectedYear, setSelectedYear] = useState(yearOptions[0]);

  // 보고서 데이터
  const [vatReport, setVatReport] = useState<VatReport | null>(null);
  const [incomeTaxPrep, setIncomeTaxPrep] = useState<IncomeTaxPrep | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 보고서 생성 ──
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (reportType === "vat") {
        const period = vatPeriodOptions[selectedVatPeriod];
        const report = await generateVatReport(
          ownerId,
          period.startMonth,
          period.endMonth
        );
        setVatReport(report);
      } else {
        const prep = await generateIncomeTaxPrep(ownerId, selectedYear);
        setIncomeTaxPrep(prep);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "보고서 생성 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [reportType, ownerId, selectedVatPeriod, selectedYear, vatPeriodOptions]);

  // ── Excel 내보내기 ──
  const handleExport = useCallback(async () => {
    try {
      if (reportType === "vat" && vatReport) {
        await exportVatReportToExcel(vatReport);
      } else if (reportType === "income" && incomeTaxPrep) {
        await exportIncomeTaxPrepToExcel(incomeTaxPrep);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Excel 내보내기 중 오류가 발생했습니다.";
      setError(message);
    }
  }, [reportType, vatReport, incomeTaxPrep]);

  const hasReport =
    (reportType === "vat" && vatReport !== null) ||
    (reportType === "income" && incomeTaxPrep !== null);

  return (
    <div className="space-y-6">
      {/* ── 보고서 유형 선택 ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setReportType("vat")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              reportType === "vat"
                ? "bg-gold/20 text-gold border border-gold/30"
                : "bg-surface border border-border text-text-dim hover:text-text-primary"
            }`}
          >
            <Calculator className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            부가세 기초자료
          </button>
          <button
            onClick={() => setReportType("income")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              reportType === "income"
                ? "bg-gold/20 text-gold border border-gold/30"
                : "bg-surface border border-border text-text-dim hover:text-text-primary"
            }`}
          >
            <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            종합소득세 기초자료
          </button>
        </div>

        {/* 기간 선택 */}
        <div className="flex items-center gap-3 ml-auto">
          {reportType === "vat" ? (
            <div className="relative">
              <select
                value={selectedVatPeriod}
                onChange={(e) => setSelectedVatPeriod(Number(e.target.value))}
                className="appearance-none bg-surface border border-border rounded-xl px-4 py-2.5 pr-10 text-text-primary text-sm focus:outline-none focus:border-gold/40 transition-colors cursor-pointer"
              >
                {vatPeriodOptions.map((opt, idx) => (
                  <option key={idx} value={idx}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-surface border border-border rounded-xl px-4 py-2.5 pr-10 text-text-primary text-sm focus:outline-none focus:border-gold/40 transition-colors cursor-pointer"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}년 귀속
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-gold to-gold-bright text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            {loading ? "집계 중..." : "기초자료 집계"}
          </button>
        </div>
      </div>

      {/* ── 에러 메시지 ── */}
      {error && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-error flex-shrink-0" />
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* ── 부가세 보고서 ── */}
      {reportType === "vat" && vatReport && (
        <VatReportView report={vatReport} onExport={handleExport} />
      )}

      {/* ── 종합소득세 보고서 ── */}
      {reportType === "income" && incomeTaxPrep && (
        <IncomeTaxPrepView prep={incomeTaxPrep} onExport={handleExport} />
      )}

      {/* ── 빈 상태 ── */}
      {!loading && !error && !hasReport && (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center backdrop-blur-sm">
          <Calculator className="w-12 h-12 text-text-dim mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            세금 신고 기초자료
          </h3>
          <p className="text-sm text-text-dim max-w-md mx-auto mb-1">
            부가세 또는 종합소득세 신고에 필요한 기초자료를 자동으로 집계합니다.
          </p>
          <p className="text-xs text-text-dim max-w-md mx-auto">
            기간을 선택하고 "기초자료 집계" 버튼을 클릭하세요.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 부가세 보고서 뷰
// ─────────────────────────────────────────────

function VatReportView({
  report,
  onExport,
}: {
  report: VatReport;
  onExport: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {report.year}년 {report.period} 부가세 기초자료
          </h3>
          <p className="text-sm text-text-dim mt-1">
            {report.startMonth} ~ {report.endMonth} | 부가가치세법 제48조
          </p>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-surface border border-border text-text-primary hover:border-gold/30 transition-colors"
        >
          <Download className="w-4 h-4" />
          Excel 내보내기
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <span className="text-sm text-text-dim">매출세액</span>
          </div>
          <p className="text-2xl font-bold text-success">
            {formatWon(report.totalOutputVat)}
          </p>
          <p className="text-xs text-text-dim mt-1">
            공급가액 {formatWon(report.totalRevenueSupply)} | {report.revenueCount}건
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-info/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-info" />
            </div>
            <span className="text-sm text-text-dim">매입세액</span>
          </div>
          <p className="text-2xl font-bold text-info">
            {formatWon(report.totalInputVat)}
          </p>
          <p className="text-xs text-text-dim mt-1">
            공급가액 {formatWon(report.totalExpenseSupply)} | {report.expenseCount}건
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                report.isRefund ? "bg-info/10" : "bg-warning/10"
              }`}
            >
              <Calculator
                className={`w-4 h-4 ${
                  report.isRefund ? "text-info" : "text-warning"
                }`}
              />
            </div>
            <span className="text-sm text-text-dim">
              {report.isRefund ? "환급 예상세액" : "납부 예상세액"}
            </span>
          </div>
          <p
            className={`text-2xl font-bold ${
              report.isRefund ? "text-info" : "text-warning"
            }`}
          >
            {formatWon(Math.abs(report.netVat))}
          </p>
          {report.noEvidenceCount > 0 && (
            <p className="text-xs text-error mt-1">
              증빙 미비 {report.noEvidenceCount}건 주의
            </p>
          )}
        </div>
      </div>

      {/* 증빙유형별 매출 내역 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">매출 증빙유형별 내역</h4>
        </div>
        {report.revenueByEvidence.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-sm">
            해당 기간 매출 내역이 없습니다.
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
              <div className="col-span-3">증빙유형</div>
              <div className="col-span-2 text-center">건수</div>
              <div className="col-span-3 text-right">공급가액</div>
              <div className="col-span-2 text-right">부가세</div>
              <div className="col-span-2 text-right">합계</div>
            </div>
            <div className="divide-y divide-border">
              {report.revenueByEvidence.map((item) => (
                <div
                  key={item.evidenceType}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                >
                  <div className="col-span-3">
                    <EvidenceBadge type={item.evidenceType} />
                  </div>
                  <div className="col-span-2 text-sm text-center text-text-dim">
                    {item.count}건
                  </div>
                  <div className="col-span-3 text-sm text-right text-text-primary">
                    {formatAmount(item.supplyAmount)}
                  </div>
                  <div className="col-span-2 text-sm text-right text-text-dim">
                    {formatAmount(item.vatAmount)}
                  </div>
                  <div className="col-span-2 text-sm text-right font-medium text-success">
                    {formatAmount(item.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
              <span className="text-sm font-medium text-text-dim">매출 합계</span>
              <span className="text-sm font-bold text-success">
                {formatWon(report.totalRevenueAmount)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 증빙유형별 매입 내역 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">매입 증빙유형별 내역</h4>
        </div>
        {report.expenseByEvidence.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-sm">
            해당 기간 매입 내역이 없습니다.
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
              <div className="col-span-3">증빙유형</div>
              <div className="col-span-2 text-center">건수</div>
              <div className="col-span-3 text-right">공급가액</div>
              <div className="col-span-2 text-right">부가세</div>
              <div className="col-span-2 text-right">합계</div>
            </div>
            <div className="divide-y divide-border">
              {report.expenseByEvidence.map((item) => (
                <div
                  key={item.evidenceType}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                >
                  <div className="col-span-3">
                    <EvidenceBadge type={item.evidenceType} />
                  </div>
                  <div className="col-span-2 text-sm text-center text-text-dim">
                    {item.count}건
                  </div>
                  <div className="col-span-3 text-sm text-right text-text-primary">
                    {formatAmount(item.supplyAmount)}
                  </div>
                  <div className="col-span-2 text-sm text-right text-text-dim">
                    {formatAmount(item.vatAmount)}
                  </div>
                  <div className="col-span-2 text-sm text-right font-medium text-info">
                    {formatAmount(item.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
              <span className="text-sm font-medium text-text-dim">매입 합계</span>
              <span className="text-sm font-bold text-info">
                {formatWon(report.totalExpenseAmount)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 월별 부가세 상세 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">월별 부가세 내역</h4>
        </div>
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
          <div className="col-span-2">월</div>
          <div className="col-span-2 text-right">매출 공급가액</div>
          <div className="col-span-2 text-right">매출세액</div>
          <div className="col-span-2 text-right">매입 공급가액</div>
          <div className="col-span-2 text-right">매입세액</div>
          <div className="col-span-2 text-right">납부(환급)</div>
        </div>
        <div className="divide-y divide-border">
          {report.monthlyDetails.map((month) => (
            <div
              key={month.yearMonth}
              className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
            >
              <div className="col-span-2 text-sm text-text-primary font-medium">
                {month.yearMonth}
              </div>
              <div className="col-span-2 text-sm text-right text-text-dim">
                {formatAmount(month.revenueSupply)}
              </div>
              <div className="col-span-2 text-sm text-right text-success">
                {formatAmount(month.outputVat)}
              </div>
              <div className="col-span-2 text-sm text-right text-text-dim">
                {formatAmount(month.expenseSupply)}
              </div>
              <div className="col-span-2 text-sm text-right text-info">
                {formatAmount(month.inputVat)}
              </div>
              <div
                className={`col-span-2 text-sm text-right font-medium ${
                  month.netVat >= 0 ? "text-warning" : "text-info"
                }`}
              >
                {month.netVat >= 0 ? "" : "-"}
                {formatAmount(Math.abs(month.netVat))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 종합소득세 기초자료 뷰
// ─────────────────────────────────────────────

function IncomeTaxPrepView({
  prep,
  onExport,
}: {
  prep: IncomeTaxPrep;
  onExport: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {prep.year}년 귀속 종합소득세 기초자료
          </h3>
          <p className="text-sm text-text-dim mt-1">
            {prep.year}-01 ~ {prep.year}-12 | 소득세법 제70조 |{" "}
            {prep.monthsWithData}개월 데이터
          </p>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-surface border border-border text-text-primary hover:border-gold/30 transition-colors"
        >
          <Download className="w-4 h-4" />
          Excel 내보내기
        </button>
      </div>

      {/* 요약 카드: 총수입 / 필요경비 / 소득금액 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <span className="text-sm text-text-dim">총수입금액</span>
          </div>
          <p className="text-2xl font-bold text-success">
            {formatWon(prep.totalRevenue)}
          </p>
          <p className="text-xs text-text-dim mt-1">
            {prep.revenueCount}건 (공급가액 기준)
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-warning" />
            </div>
            <span className="text-sm text-text-dim">필요경비</span>
          </div>
          <p className="text-2xl font-bold text-warning">
            {formatWon(prep.totalExpenses)}
          </p>
          <p className="text-xs text-text-dim mt-1">
            거래 매입 + 사무소 경비
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                prep.netIncome >= 0 ? "bg-gold-dim" : "bg-error/10"
              }`}
            >
              <Calculator
                className={`w-4 h-4 ${
                  prep.netIncome >= 0 ? "text-gold" : "text-error"
                }`}
              />
            </div>
            <span className="text-sm text-text-dim">소득금액</span>
          </div>
          <p
            className={`text-2xl font-bold ${
              prep.netIncome >= 0 ? "text-gold" : "text-error"
            }`}
          >
            {formatWon(prep.netIncome)}
          </p>
          <p className="text-xs text-text-dim mt-1">
            총수입금액 - 필요경비
          </p>
        </div>
      </div>

      {/* 수입 세부유형별 내역 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">수입 유형별 내역</h4>
        </div>
        {prep.revenueBreakdown.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-sm">
            해당 연도 수입 내역이 없습니다.
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
              <div className="col-span-4">유형</div>
              <div className="col-span-2 text-center">건수</div>
              <div className="col-span-3 text-right">금액</div>
              <div className="col-span-3 text-right">비중</div>
            </div>
            <div className="divide-y divide-border">
              {prep.revenueBreakdown.map((item) => {
                const ratio =
                  prep.totalRevenue > 0
                    ? ((item.amount / prep.totalRevenue) * 100).toFixed(1)
                    : "0.0";
                return (
                  <div
                    key={item.subType}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                  >
                    <div className="col-span-4 text-sm text-text-primary">
                      {item.subType.replace(/_/g, " ")}
                    </div>
                    <div className="col-span-2 text-sm text-center text-text-dim">
                      {item.count}건
                    </div>
                    <div className="col-span-3 text-sm text-right font-medium text-success">
                      {formatAmount(item.amount)}
                    </div>
                    <div className="col-span-3 text-sm text-right text-text-dim">
                      {ratio}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
              <span className="text-sm font-medium text-text-dim">수입 합계</span>
              <span className="text-sm font-bold text-success">
                {formatWon(prep.totalRevenue)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 필요경비 카테고리별 내역 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">필요경비 카테고리별 내역</h4>
        </div>
        {prep.expenseBreakdown.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-sm">
            해당 연도 경비 내역이 없습니다.
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
              <div className="col-span-4">카테고리</div>
              <div className="col-span-2 text-center">건수</div>
              <div className="col-span-3 text-right">금액</div>
              <div className="col-span-3 text-right">비중</div>
            </div>
            <div className="divide-y divide-border">
              {prep.expenseBreakdown.map((item) => {
                const ratio =
                  prep.totalExpenses > 0
                    ? ((item.amount / prep.totalExpenses) * 100).toFixed(1)
                    : "0.0";
                return (
                  <div
                    key={item.category}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                  >
                    <div className="col-span-4 text-sm text-text-primary">
                      {item.category}
                    </div>
                    <div className="col-span-2 text-sm text-center text-text-dim">
                      {item.count > 0 ? `${item.count}건` : "-"}
                    </div>
                    <div className="col-span-3 text-sm text-right font-medium text-warning">
                      {formatAmount(item.amount)}
                    </div>
                    <div className="col-span-3 text-sm text-right text-text-dim">
                      {ratio}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
              <span className="text-sm font-medium text-text-dim">경비 합계</span>
              <span className="text-sm font-bold text-warning">
                {formatWon(prep.totalExpenses)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 월별 수입/지출 추이 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-text-primary">월별 수입/경비 추이</h4>
        </div>
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
          <div className="col-span-2">월</div>
          <div className="col-span-3 text-right">수입</div>
          <div className="col-span-3 text-right">경비</div>
          <div className="col-span-4 text-right">소득</div>
        </div>
        <div className="divide-y divide-border">
          {prep.monthlyDetails.map((month) => (
            <div
              key={month.yearMonth}
              className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
            >
              <div className="col-span-2 text-sm text-text-primary font-medium">
                {month.yearMonth}
              </div>
              <div className="col-span-3 text-sm text-right text-success">
                {formatAmount(month.revenue)}
              </div>
              <div className="col-span-3 text-sm text-right text-warning">
                {formatAmount(month.expenses)}
              </div>
              <div
                className={`col-span-4 text-sm text-right font-medium ${
                  month.income >= 0 ? "text-gold" : "text-error"
                }`}
              >
                {formatAmount(month.income)}
              </div>
            </div>
          ))}
        </div>
        {/* 연간 합계 */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-5 py-3 border-t border-border bg-navy-light/30 items-center">
          <div className="col-span-2 text-sm font-bold text-text-dim">연간 합계</div>
          <div className="col-span-3 text-sm text-right font-bold text-success">
            {formatAmount(prep.totalRevenue)}
          </div>
          <div className="col-span-3 text-sm text-right font-bold text-warning">
            {formatAmount(prep.totalExpenses)}
          </div>
          <div
            className={`col-span-4 text-sm text-right font-bold ${
              prep.netIncome >= 0 ? "text-gold" : "text-error"
            }`}
          >
            {formatAmount(prep.netIncome)}
          </div>
        </div>
      </div>

      {/* 안내 문구 */}
      <div className="bg-gold-dim/30 border border-gold/10 rounded-xl p-4">
        <p className="text-xs text-text-dim leading-relaxed">
          본 자료는 회계사무소에 제공할 세금 신고 기초자료입니다.
          실제 종합소득세 신고 시에는 소득공제, 세액공제 등 추가 항목이
          반영되어야 하며, 반드시 세무 전문가의 검토를 받으시기 바랍니다.
          (소득세법 제70조, 제80조)
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 증빙 유형 뱃지
// ─────────────────────────────────────────────

function EvidenceBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    세금계산서: "bg-info/15 text-info",
    현금영수증: "bg-success/15 text-success",
    카드매출전표: "bg-gold-dim text-gold",
    간이영수증: "bg-warning/15 text-warning",
    거래명세서: "bg-surface text-text-dim",
    없음: "bg-error/15 text-error",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[type] ?? "bg-surface text-text-dim"
      }`}
    >
      {type}
    </span>
  );
}
