// 통합 캘린더 — 전 사건의 기한·기일을 월간 달력 + 목록으로 한눈에 보는 페이지
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Scale } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getAllDeadlines, getCases } from "../services/firebase/firestore";
import { calcDDay, calcStatus, type CaseDeadline, type DeadlineStatus } from "../types/deadline";
import { isDemoMode } from "../config/demo";

/** 상태별 칩 색상 (다크 테마) */
const STATUS_CHIP: Record<DeadlineStatus, string> = {
  overdue: "bg-error/20 text-error border-error/30",
  imminent: "bg-warning/20 text-warning border-warning/30",
  upcoming: "bg-gold-dim text-gold border-gold/30",
  comfortable: "bg-success/15 text-success border-success/30",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface EnrichedDeadline extends CaseDeadline {
  dDay: number;
  status: DeadlineStatus;
  clientName: string;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [deadlines, setDeadlines] = useState<CaseDeadline[]>([]);
  const [caseNames, setCaseNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 표시 중인 달 (1일로 고정)
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [allDeadlines, cases] = await Promise.all([
        getAllDeadlines(user.uid),
        getCases(user.uid),
      ]);
      setDeadlines(allDeadlines);
      setCaseNames(Object.fromEntries(cases.map((c) => [c.id, c.clientName])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "일정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const enriched: EnrichedDeadline[] = useMemo(
    () =>
      deadlines.map((d) => {
        const dDay = calcDDay(d.dueDate);
        return {
          ...d,
          dDay,
          status: calcStatus(dDay),
          clientName: caseNames[d.caseId] ?? "",
        };
      }),
    [deadlines, caseNames],
  );

  /** 날짜(YYYY-MM-DD) → 그 날의 기한 목록 */
  const byDate = useMemo(() => {
    const map = new Map<string, EnrichedDeadline[]>();
    for (const d of enriched) {
      const list = map.get(d.dueDate) ?? [];
      list.push(d);
      map.set(d.dueDate, list);
    }
    return map;
  }, [enriched]);

  // 달력 그리드: 앞쪽 빈 칸 + 말일까지
  const monthGrid = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= lastDate; day++) {
      cells.push({
        date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
      });
    }
    return cells;
  }, [viewMonth]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  /** 이번 달 목록 (날짜순) */
  const monthList = useMemo(() => {
    const key = ymKey(viewMonth);
    return enriched
      .filter((d) => d.dueDate.startsWith(key))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [enriched, viewMonth]);

  const overdueAll = useMemo(
    () => enriched.filter((d) => d.status === "overdue").sort((a, b) => b.dDay - a.dDay),
    [enriched],
  );

  const moveMonth = (delta: number) =>
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <AppLayout title="일정 캘린더" subtitle="전 사건의 기한·기일을 한눈에">
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* 지연 경고 배너 */}
      {overdueAll.length > 0 && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-error/10 border border-error/30 text-sm">
          <AlertTriangle className="w-4 h-4 text-error flex-shrink-0" />
          <span className="text-error font-medium">지연된 기한 {overdueAll.length}건</span>
          <span className="text-text-dim truncate">
            {overdueAll.slice(0, 2).map((d) => `${d.clientName} ${d.title}`).join(" · ")}
            {overdueAll.length > 2 && ` 외 ${overdueAll.length - 2}건`}
          </span>
        </div>
      )}

      {/* 월 이동 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => moveMonth(-1)}
          className="p-2 text-text-dim hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
          </h2>
          <button
            onClick={() => setViewMonth(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); })}
            className="px-2.5 py-1 text-xs text-text-dim border border-border rounded-lg hover:border-gold/30 hover:text-gold transition-colors"
          >
            오늘
          </button>
        </div>
        <button
          onClick={() => moveMonth(1)}
          className="p-2 text-text-dim hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 달력 그리드 */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-6">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-2 text-center text-xs font-medium ${i === 0 ? "text-error/70" : i === 6 ? "text-info/70" : "text-text-dim"}`}
            >
              {w}
            </div>
          ))}
        </div>
        {loading ? (
          <div className="p-12 text-center text-text-dim">로딩 중...</div>
        ) : (
          <div className="grid grid-cols-7">
            {monthGrid.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} className="min-h-[92px] border-b border-r border-border/50" />;
              const items = byDate.get(cell.date) ?? [];
              const isToday = cell.date === todayStr;
              return (
                <div
                  key={cell.date}
                  className={`min-h-[92px] p-1.5 border-b border-r border-border/50 ${isToday ? "bg-gold-dim/40" : ""}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full mb-1 ${
                      isToday ? "bg-gold text-navy font-bold" : "text-text-dim"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((d) => (
                      <button
                        key={d.id}
                        onClick={() => navigate(`/cases/${d.caseId}`)}
                        title={`${d.clientName} — ${d.title}`}
                        className={`w-full text-left px-1.5 py-0.5 rounded border text-[11px] leading-tight truncate transition-opacity hover:opacity-80 ${STATUS_CHIP[d.status]}`}
                      >
                        {d.clientName && <span className="font-medium">{d.clientName} </span>}
                        {d.title}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <p className="text-[10px] text-text-dim px-1">+{items.length - 3}건</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 이번 달 목록 */}
      <div className="bg-surface border border-border rounded-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <CalendarDays className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold text-text-primary">
            {viewMonth.getMonth() + 1}월 기한 목록 ({monthList.length}건)
          </h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-dim">로딩 중...</div>
        ) : monthList.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-sm">
            이 달에 등록된 기한이 없습니다. 사건 상세의 [일정 관리] 탭에서 기한을 추가하세요.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {monthList.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/cases/${d.caseId}`)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                <span className={`px-2 py-0.5 rounded-md border text-xs font-bold shrink-0 ${STATUS_CHIP[d.status]}`}>
                  {d.dDay > 0 ? `D+${d.dDay}` : d.dDay === 0 ? "D-Day" : `D${d.dDay}`}
                </span>
                <span className="text-sm text-text-dim shrink-0 w-20">{d.dueDate.slice(5).replace("-", ".")}</span>
                <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
                  {d.clientName && <span className="font-medium">{d.clientName} · </span>}
                  {d.title}
                </span>
                <span className="flex items-center gap-1 text-xs text-text-dim shrink-0">
                  <Scale className="w-3 h-3" />
                  {d.category}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
