import { useEffect, useState, useMemo, useCallback } from "react";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Landmark,
  FileWarning,
  ChevronDown,
  ChevronRight,
  Calendar,
  Receipt,
  LayoutDashboard,
  FileSpreadsheet,
  Calculator,
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import AppLayout from "../components/layout/AppLayout";
import MonthlyReportTab from "../components/accounting/MonthlyReportTab";
import TaxReportTab from "../components/accounting/TaxReportTab";
import useAuth from "../hooks/useAuth";
import { db } from "../config/firebase";
import type { Fee } from "../types/accounting";
import type { Transaction } from "../types/accounting";
import type { OfficeExpense } from "../types/accounting";
import type { Deposit } from "../types/accounting";

type FinanceTab = "dashboard" | "monthly-report" | "tax-report";


// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/** 금액 포맷: 1234567 → "1,234,567원" */
function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 짧은 금액 포맷: 10000000 → "1,000만" (요약 카드용) */
function formatWonShort(amount: number): string {
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(1)}억`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  }
  return amount.toLocaleString("ko-KR");
}

/** YYYY-MM 형식의 월 목록 생성 (최근 12개월) */
function generateMonthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    options.push({ value, label });
  }
  return options;
}

/** 날짜 문자열(YYYY-MM-DD)이 주어진 YYYY-MM에 속하는지 확인 */
function isInMonth(dateStr: string, yearMonth: string): boolean {
  return dateStr.startsWith(yearMonth);
}

/** 연체일수 계산 (dueDate 기준) */
function calcOverdueDays(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/** 보관일수 계산 */
function calcHoldingDays(receivedDate: string): number {
  const received = new Date(receivedDate);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - received.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─────────────────────────────────────────────
// 페이지 컴포넌트
// ─────────────────────────────────────────────

export default function FinancePage() {
  const user = useAuth((s) => s.user);

  // 기간 선택
  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  // 데이터 상태
  const [fees, setFees] = useState<Fee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [officeExpenses, setOfficeExpenses] = useState<OfficeExpense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<FinanceTab>("dashboard");

  // 섹션 접기/펼치기
  const [expandedRevenue, setExpandedRevenue] = useState(true);
  const [expandedExpense, setExpandedExpense] = useState(true);
  const [expandedOutstanding, setExpandedOutstanding] = useState(true);
  const [expandedDeposits, setExpandedDeposits] = useState(true);

  // ── 데이터 fetch ──
  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // 수임료
      const feesSnap = await getDocs(
        query(collection(db!, "fees"), where("ownerId", "==", user.uid))
      );
      const allFees = feesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Fee);

      // 거래 (매출/매입)
      const txSnap = await getDocs(
        query(collection(db!, "transactions"), where("ownerId", "==", user.uid))
      );
      const allTx = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);

      // 사무소 경비
      const offSnap = await getDocs(
        query(collection(db!, "office_expenses"), where("ownerId", "==", user.uid))
      );
      const allOff = offSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OfficeExpense);

      // 예수금
      const depSnap = await getDocs(
        query(collection(db!, "deposits"), where("ownerId", "==", user.uid))
      );
      const allDep = depSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Deposit);

      setFees(allFees);
      setTransactions(allTx);
      setOfficeExpenses(allOff);
      setDeposits(allDep);
    } catch (err) {
      console.error("재무 데이터 로딩 실패:", err);
      setFees([]);
      setTransactions([]);
      setOfficeExpenses([]);
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 신규 사용자 — 어떤 종류의 재무 데이터도 없는 상태
  const isEmpty =
    fees.length === 0 &&
    transactions.length === 0 &&
    officeExpenses.length === 0 &&
    deposits.length === 0;

  // ── 기간 필터링된 데이터 ──
  const monthlyTransactions = useMemo(
    () => transactions.filter((tx) => isInMonth(tx.date, selectedMonth)),
    [transactions, selectedMonth]
  );

  const monthlyOfficeExpenses = useMemo(
    () => officeExpenses.filter((oe) => oe.yearMonth === selectedMonth),
    [officeExpenses, selectedMonth]
  );

  const revenueTransactions = useMemo(
    () =>
      [...monthlyTransactions.filter((tx) => tx.type === "매출")].sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
    [monthlyTransactions]
  );

  const expenseTransactions = useMemo(
    () =>
      [...monthlyTransactions.filter((tx) => tx.type === "매입")].sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
    [monthlyTransactions]
  );

  const sortedOfficeExpenses = useMemo(
    () => [...monthlyOfficeExpenses].sort((a, b) => b.date.localeCompare(a.date)),
    [monthlyOfficeExpenses]
  );

  // 미완납 수임료
  const outstandingFees = useMemo(
    () =>
      [...fees.filter((f) => f.status === "미완납")].sort((a, b) =>
        b.createdAt && a.createdAt
          ? b.createdAt.toMillis() - a.createdAt.toMillis()
          : 0
      ),
    [fees]
  );

  // 보관중/일부사용 예수금
  const activeDeposits = useMemo(
    () =>
      deposits
        .filter((d) => d.status === "보관중" || d.status === "일부사용")
        .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)),
    [deposits]
  );

  // ── 집계 ──
  const totalRevenue = useMemo(
    () => revenueTransactions.reduce((sum, tx) => sum + tx.vat.totalAmount, 0),
    [revenueTransactions]
  );

  const totalExpenseTx = useMemo(
    () => expenseTransactions.reduce((sum, tx) => sum + tx.vat.totalAmount, 0),
    [expenseTransactions]
  );

  const totalOfficeExp = useMemo(
    () => sortedOfficeExpenses.reduce((sum, oe) => sum + oe.amount, 0),
    [sortedOfficeExpenses]
  );

  const totalExpenses = totalExpenseTx + totalOfficeExp;
  const operatingProfit = totalRevenue - totalExpenses;

  const totalOutstanding = useMemo(
    () => outstandingFees.reduce((sum, f) => sum + f.totalOutstanding, 0),
    [outstandingFees]
  );

  const totalDepositsHeld = useMemo(
    () => activeDeposits.reduce((sum, d) => sum + d.remainingAmount, 0),
    [activeDeposits]
  );

  const missingEvidenceCount = useMemo(
    () =>
      monthlyTransactions.filter((tx) => tx.evidenceType === "없음").length +
      sortedOfficeExpenses.filter((oe) => oe.evidenceType === "없음").length,
    [monthlyTransactions, sortedOfficeExpenses]
  );

  // ── 요약 카드 ──
  const summaryCards = [
    {
      label: "총 매출",
      value: totalRevenue,
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "총 매입/경비",
      value: totalExpenses,
      icon: TrendingDown,
      color: "text-text-dim",
      bg: "bg-surface",
    },
    {
      label: "영업이익",
      value: operatingProfit,
      icon: TrendingUp,
      color: operatingProfit >= 0 ? "text-success" : "text-error",
      bg: operatingProfit >= 0 ? "bg-success/10" : "bg-error/10",
    },
    {
      label: "미수금",
      value: totalOutstanding,
      icon: AlertCircle,
      color: totalOutstanding > 0 ? "text-error" : "text-text-dim",
      bg: totalOutstanding > 0 ? "bg-error/10" : "bg-surface",
    },
    {
      label: "보관 예수금",
      value: totalDepositsHeld,
      icon: Landmark,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "증빙 미비 건수",
      value: missingEvidenceCount,
      icon: FileWarning,
      color: missingEvidenceCount > 0 ? "text-warning" : "text-text-dim",
      bg: missingEvidenceCount > 0 ? "bg-warning/10" : "bg-surface",
      isCount: true,
    },
  ];

  // ── 증빙 유형 뱃지 ──
  function evidenceBadge(type: string) {
    const styles: Record<string, string> = {
      "세금계산서": "bg-info/15 text-info",
      "현금영수증": "bg-success/15 text-success",
      "카드매출전표": "bg-gold-dim text-gold",
      "간이영수증": "bg-warning/15 text-warning",
      "거래명세서": "bg-surface text-text-dim",
      "없음": "bg-error/15 text-error",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[type] ?? "bg-surface text-text-dim"}`}
      >
        {type}
      </span>
    );
  }

  const TABS: { key: FinanceTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: "dashboard", label: "현황 대시보드", icon: LayoutDashboard },
    { key: "monthly-report", label: "월별 정산", icon: FileSpreadsheet },
    { key: "tax-report", label: "세무 자료", icon: Calculator },
  ];

  return (
    <AppLayout title="재무 관리" subtitle="매출, 경비, 미수금 현황">
      {/* ── 탭 네비게이션 ── */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-gold"
                  : "text-text-dim hover:text-text-primary"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── 월별 정산 탭 ── */}
      {activeTab === "monthly-report" && user && (
        <MonthlyReportTab ownerId={user.uid} />
      )}

      {/* ── 세무 자료 탭 ── */}
      {activeTab === "tax-report" && user && (
        <TaxReportTab ownerId={user.uid} />
      )}

      {/* ── 현황 대시보드 탭 ── */}
      {activeTab === "dashboard" && (
        <>
      {/* ── 빈 상태 안내 (신규 사용자) ── */}
      {!loading && isEmpty && (
        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-gold-dim to-surface border border-gold/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold/15 flex items-center justify-center flex-shrink-0">
              <Receipt className="w-6 h-6 text-gold" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-text-primary mb-2">
                재무 관리를 시작해보세요
              </h3>
              <p className="text-sm text-text-dim leading-relaxed mb-4">
                아직 등록된 거래가 없습니다. 사건별 수임료·경비·예수금은
                <strong className="text-text-primary"> 사건 상세 페이지의 [재무] 탭</strong>에서,
                사무실 운영 경비는 <strong className="text-text-primary">[월별 정산] 탭</strong>에서 추가할 수 있어요.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text-dim">
                  💼 사건 → 재무 탭에서 수임료 입력
                </span>
                <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text-dim">
                  📑 월별 정산 탭에서 사무실 경비 등록
                </span>
                <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text-dim">
                  📊 등록한 데이터는 자동으로 이 화면에 집계
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 기간 선택 ── */}
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-5 h-5 text-text-dim" />
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="appearance-none bg-surface border border-border rounded-xl px-4 py-2.5 pr-10 text-text-primary text-sm focus:outline-none focus:border-gold/40 transition-colors cursor-pointer"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
        </div>
      </div>

      {/* ── 요약 카드 그리드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center`}
              >
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <span className="text-sm text-text-dim">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>
              {loading ? (
                <span className="text-text-dim">-</span>
              ) : card.isCount ? (
                <>
                  {card.value}
                  <span className="text-sm font-normal ml-1">건</span>
                </>
              ) : (
                <>
                  {formatWonShort(card.value)}
                  <span className="text-sm font-normal ml-0.5">원</span>
                </>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* ── 매출 내역 ── */}
      <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm mb-6">
        <button
          onClick={() => setExpandedRevenue((p) => !p)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-success" />
            <h3 className="font-semibold text-text-primary">매출 내역</h3>
            <span className="text-sm text-text-dim">
              ({revenueTransactions.length}건)
            </span>
          </div>
          {expandedRevenue ? (
            <ChevronDown className="w-5 h-5 text-text-dim" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-dim" />
          )}
        </button>

        {expandedRevenue && (
          <div className="border-t border-border">
            {loading ? (
              <div className="p-8 text-center text-text-dim">로딩 중...</div>
            ) : revenueTransactions.length === 0 ? (
              <div className="p-8 text-center text-text-dim">
                해당 기간 매출 내역이 없습니다.
              </div>
            ) : (
              <>
                {/* 테이블 헤더 */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
                  <div className="col-span-2">날짜</div>
                  <div className="col-span-2">구분</div>
                  <div className="col-span-4">의뢰인/사건</div>
                  <div className="col-span-2 text-right">금액</div>
                  <div className="col-span-2 text-center">증빙</div>
                </div>
                <div className="divide-y divide-border">
                  {revenueTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                    >
                      <div className="col-span-2 text-sm text-text-dim">
                        {tx.date}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-success/15 text-success">
                          {tx.subType}
                        </span>
                      </div>
                      <div className="col-span-4 text-sm text-text-primary truncate">
                        {tx.clientName ?? tx.description}
                      </div>
                      <div className="col-span-2 text-sm text-right font-medium text-success">
                        {formatWon(tx.vat.totalAmount)}
                      </div>
                      <div className="col-span-2 text-center">
                        {evidenceBadge(tx.evidenceType)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 매출 합계 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
                  <span className="text-sm font-medium text-text-dim">합계</span>
                  <span className="text-sm font-bold text-success">
                    {formatWon(totalRevenue)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── 매입/경비 내역 ── */}
      <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm mb-6">
        <button
          onClick={() => setExpandedExpense((p) => !p)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-text-dim" />
            <h3 className="font-semibold text-text-primary">매입/경비 내역</h3>
            <span className="text-sm text-text-dim">
              ({expenseTransactions.length + sortedOfficeExpenses.length}건)
            </span>
          </div>
          {expandedExpense ? (
            <ChevronDown className="w-5 h-5 text-text-dim" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-dim" />
          )}
        </button>

        {expandedExpense && (
          <div className="border-t border-border">
            {loading ? (
              <div className="p-8 text-center text-text-dim">로딩 중...</div>
            ) : expenseTransactions.length + sortedOfficeExpenses.length === 0 ? (
              <div className="p-8 text-center text-text-dim">
                해당 기간 경비 내역이 없습니다.
              </div>
            ) : (
              <>
                {/* 테이블 헤더 */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
                  <div className="col-span-2">날짜</div>
                  <div className="col-span-2">카테고리</div>
                  <div className="col-span-4">적요</div>
                  <div className="col-span-2 text-right">금액</div>
                  <div className="col-span-2 text-center">증빙</div>
                </div>
                <div className="divide-y divide-border">
                  {/* 매입 거래 */}
                  {expenseTransactions.map((tx) => (
                    <div
                      key={`tx-${tx.id}`}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                    >
                      <div className="col-span-2 text-sm text-text-dim">
                        {tx.date}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-warning/15 text-warning">
                          {tx.subType}
                        </span>
                      </div>
                      <div className="col-span-4 text-sm text-text-primary truncate">
                        {tx.description}
                      </div>
                      <div className="col-span-2 text-sm text-right font-medium text-text-primary">
                        {formatWon(tx.vat.totalAmount)}
                      </div>
                      <div className="col-span-2 text-center">
                        {evidenceBadge(tx.evidenceType)}
                      </div>
                    </div>
                  ))}
                  {/* 사무소 경비 */}
                  {sortedOfficeExpenses.map((oe) => (
                    <div
                      key={`oe-${oe.id}`}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                    >
                      <div className="col-span-2 text-sm text-text-dim">
                        {oe.date}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gold-dim text-gold">
                          {oe.category}
                        </span>
                      </div>
                      <div className="col-span-4 text-sm text-text-primary truncate">
                        {oe.description}
                      </div>
                      <div className="col-span-2 text-sm text-right font-medium text-text-primary">
                        {formatWon(oe.amount)}
                      </div>
                      <div className="col-span-2 text-center">
                        {evidenceBadge(oe.evidenceType)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 경비 합계 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
                  <span className="text-sm font-medium text-text-dim">합계</span>
                  <span className="text-sm font-bold text-text-primary">
                    {formatWon(totalExpenses)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── 미수금 현황 ── */}
      <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm mb-6">
        <button
          onClick={() => setExpandedOutstanding((p) => !p)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-error" />
            <h3 className="font-semibold text-text-primary">미수금 현황</h3>
            <span className="text-sm text-text-dim">
              ({outstandingFees.length}건)
            </span>
          </div>
          {expandedOutstanding ? (
            <ChevronDown className="w-5 h-5 text-text-dim" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-dim" />
          )}
        </button>

        {expandedOutstanding && (
          <div className="border-t border-border">
            {loading ? (
              <div className="p-8 text-center text-text-dim">로딩 중...</div>
            ) : outstandingFees.length === 0 ? (
              <div className="p-8 text-center text-text-dim">
                미수금이 없습니다.
              </div>
            ) : (
              <>
                {/* 테이블 헤더 */}
                <div className="hidden lg:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
                  <div className="col-span-2">의뢰인</div>
                  <div className="col-span-2">사건유형</div>
                  <div className="col-span-2 text-right">약정액</div>
                  <div className="col-span-2 text-right">입금액</div>
                  <div className="col-span-2 text-right">미수금</div>
                  <div className="col-span-2 text-center">연체일수</div>
                </div>
                <div className="divide-y divide-border">
                  {outstandingFees.map((fee) => {
                    const overdueDays = fee.retainer.paidDate
                      ? 0
                      : fee.contract.signedDate
                        ? calcOverdueDays(fee.contract.signedDate)
                        : 0;
                    const isOverdue = overdueDays > 30;

                    return (
                      <div
                        key={fee.id}
                        className={`grid grid-cols-1 lg:grid-cols-12 gap-1 lg:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center ${
                          isOverdue ? "bg-error/5" : ""
                        }`}
                      >
                        <div className="col-span-2 text-sm font-medium text-text-primary">
                          {fee.clientName}
                        </div>
                        <div className="col-span-2 text-sm text-text-dim">
                          {fee.contract.contractType}
                        </div>
                        <div className="col-span-2 text-sm text-right text-text-dim">
                          {formatWon(fee.totalAgreedAmount)}
                        </div>
                        <div className="col-span-2 text-sm text-right text-success">
                          {formatWon(fee.totalPaidAmount)}
                        </div>
                        <div className="col-span-2 text-sm text-right font-medium text-error">
                          {formatWon(fee.totalOutstanding)}
                        </div>
                        <div className="col-span-2 text-center">
                          {overdueDays > 0 ? (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                isOverdue
                                  ? "bg-error/15 text-error font-medium"
                                  : "bg-warning/15 text-warning"
                              }`}
                            >
                              {overdueDays}일
                            </span>
                          ) : (
                            <span className="text-xs text-text-dim">-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 미수금 합계 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
                  <span className="text-sm font-medium text-text-dim">
                    미수금 합계
                  </span>
                  <span className="text-sm font-bold text-error">
                    {formatWon(totalOutstanding)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── 예수금 현황 ── */}
      <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm mb-6">
        <button
          onClick={() => setExpandedDeposits((p) => !p)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-info" />
            <h3 className="font-semibold text-text-primary">예수금 현황</h3>
            <span className="text-sm text-text-dim">
              ({activeDeposits.length}건)
            </span>
          </div>
          {expandedDeposits ? (
            <ChevronDown className="w-5 h-5 text-text-dim" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-dim" />
          )}
        </button>

        {expandedDeposits && (
          <div className="border-t border-border">
            {loading ? (
              <div className="p-8 text-center text-text-dim">로딩 중...</div>
            ) : activeDeposits.length === 0 ? (
              <div className="p-8 text-center text-text-dim">
                보관중인 예수금이 없습니다.
              </div>
            ) : (
              <>
                {/* 테이블 헤더 */}
                <div className="hidden lg:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
                  <div className="col-span-2">의뢰인</div>
                  <div className="col-span-2">유형</div>
                  <div className="col-span-2 text-right">원금</div>
                  <div className="col-span-2 text-right">잔액</div>
                  <div className="col-span-2 text-center">상태</div>
                  <div className="col-span-2 text-center">보관일수</div>
                </div>
                <div className="divide-y divide-border">
                  {activeDeposits.map((dep) => {
                    const holdingDays = calcHoldingDays(dep.receivedDate);
                    return (
                      <div
                        key={dep.id}
                        className="grid grid-cols-1 lg:grid-cols-12 gap-1 lg:gap-2 px-5 py-3 hover:bg-surface-hover transition-colors items-center"
                      >
                        <div className="col-span-2 text-sm font-medium text-text-primary">
                          {dep.clientName}
                        </div>
                        <div className="col-span-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-info/15 text-info">
                            {dep.type}
                          </span>
                        </div>
                        <div className="col-span-2 text-sm text-right text-text-dim">
                          {formatWon(dep.originalAmount)}
                        </div>
                        <div className="col-span-2 text-sm text-right font-medium text-info">
                          {formatWon(dep.remainingAmount)}
                        </div>
                        <div className="col-span-2 text-center">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              dep.status === "보관중"
                                ? "bg-info/15 text-info"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            {dep.status}
                          </span>
                        </div>
                        <div className="col-span-2 text-center text-sm text-text-dim">
                          {holdingDays}일
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 예수금 합계 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-navy-light/30">
                  <span className="text-sm font-medium text-text-dim">
                    보관 예수금 합계
                  </span>
                  <span className="text-sm font-bold text-info">
                    {formatWon(totalDepositsHeld)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </section>
        </>
      )}
    </AppLayout>
  );
}
