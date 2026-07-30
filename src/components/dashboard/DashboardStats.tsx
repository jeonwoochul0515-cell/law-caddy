// 대시보드 통계 섹션 — 6개월 매출·경비 추이, 사건 유형 분포, 상담→수임 전환율
// 차트 라이브러리 없이 CSS 막대로 그린다.
import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { isDemoMode } from "../../config/demo";
import type { Transaction, OfficeExpense } from "../../types/accounting";
import type { Case } from "../../types/case";

interface DashboardStatsProps {
  ownerId: string;
  /** DashboardPage가 이미 조회한 사건 목록 재사용 (중복 쿼리 방지) */
  cases: Case[];
  /** DashboardPage가 이미 센 녹음 수 */
  recordingCount: number;
}

/** 최근 6개월 YYYY-MM 목록 (과거→현재) */
function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function formatWonShort(amount: number): string {
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}억`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000).toLocaleString()}만`;
  return amount.toLocaleString();
}

export default function DashboardStats({ ownerId, cases, recordingCount }: DashboardStatsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [officeExpenses, setOfficeExpenses] = useState<OfficeExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId || isDemoMode) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [txSnap, oeSnap] = await Promise.all([
          getDocs(query(collection(db!, "transactions"), where("ownerId", "==", ownerId))),
          getDocs(query(collection(db!, "office_expenses"), where("ownerId", "==", ownerId))),
        ]);
        setTransactions(txSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction));
        setOfficeExpenses(oeSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OfficeExpense));
      } catch (err) {
        console.error("통계 데이터 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerId]);

  const months = useMemo(() => recentMonths(6), []);

  /** 월별 매출/경비 합계 */
  const monthly = useMemo(
    () =>
      months.map((ym) => {
        const revenue = transactions
          .filter((t) => t.type === "매출" && t.date.startsWith(ym))
          .reduce((s, t) => s + t.vat.totalAmount, 0);
        const expense =
          transactions
            .filter((t) => t.type === "매입" && t.date.startsWith(ym))
            .reduce((s, t) => s + t.vat.totalAmount, 0) +
          officeExpenses.filter((o) => o.yearMonth === ym).reduce((s, o) => s + o.amount, 0);
        return { ym, revenue, expense };
      }),
    [months, transactions, officeExpenses],
  );

  const maxValue = Math.max(1, ...monthly.flatMap((m) => [m.revenue, m.expense]));

  /** 사건 유형 분포 (상위 5) */
  const typeDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) counts.set(c.caseType, (counts.get(c.caseType) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [cases]);
  const maxType = Math.max(1, ...typeDist.map(([, n]) => n));

  /** 상담(녹음)→사건 전환율 — 녹음 1건당 사건이 만들어진 비율의 근사값 */
  const conversion =
    recordingCount > 0
      ? Math.min(100, Math.round((cases.length / recordingCount) * 100))
      : null;

  const hasFinanceData = monthly.some((m) => m.revenue > 0 || m.expense > 0);

  if (loading) return null;

  return (
    <div className="grid lg:grid-cols-2 gap-6 mb-8">
      {/* 6개월 매출·경비 추이 */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-gold" />
          <h3 className="font-semibold text-text-primary text-sm">최근 6개월 매출 · 경비</h3>
        </div>
        {!hasFinanceData ? (
          <p className="text-sm text-text-dim py-6 text-center">
            재무 데이터가 쌓이면 월별 추이가 표시됩니다.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-3 h-36">
              {monthly.map((m) => (
                <div key={m.ym} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center gap-1 flex-1">
                    <div
                      className="w-2/5 bg-gradient-to-t from-gold to-gold-bright rounded-t"
                      style={{ height: `${(m.revenue / maxValue) * 100}%`, minHeight: m.revenue > 0 ? 3 : 0 }}
                      title={`매출 ${m.revenue.toLocaleString()}원`}
                    />
                    <div
                      className="w-2/5 bg-text-dim/30 rounded-t"
                      style={{ height: `${(m.expense / maxValue) * 100}%`, minHeight: m.expense > 0 ? 3 : 0 }}
                      title={`경비 ${m.expense.toLocaleString()}원`}
                    />
                  </div>
                  <span className="text-[10px] text-text-dim">{Number(m.ym.slice(5))}월</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 text-[11px] text-text-dim">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-t from-gold to-gold-bright" />
                매출 (이번 달 {formatWonShort(monthly[monthly.length - 1].revenue)}원)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-text-dim/30" />
                경비 (이번 달 {formatWonShort(monthly[monthly.length - 1].expense)}원)
              </span>
            </div>
          </>
        )}
      </div>

      {/* 유형 분포 + 전환율 */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-gold" />
          <h3 className="font-semibold text-text-primary text-sm">사건 구성 · 수임 전환</h3>
        </div>
        {typeDist.length === 0 ? (
          <p className="text-sm text-text-dim py-6 text-center">사건이 쌓이면 통계가 표시됩니다.</p>
        ) : (
          <div className="space-y-2.5">
            {typeDist.map(([type, n]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-text-dim w-16 shrink-0">{type}</span>
                <div className="flex-1 h-4 bg-navy-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full"
                    style={{ width: `${(n / maxType) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-text-primary w-10 text-right shrink-0">{n}건</span>
              </div>
            ))}
          </div>
        )}
        {conversion !== null && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <div>
              <p className="text-sm text-text-primary font-medium">상담 → 사건 전환율</p>
              <p className="text-[11px] text-text-dim mt-0.5">
                녹음 {recordingCount}건 대비 사건 {cases.length}건 (근사치)
              </p>
            </div>
            <span className="text-2xl font-bold text-gold">{conversion}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
