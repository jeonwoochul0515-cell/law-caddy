// 사건 상세 > 일정 탭 — Firestore deadlines 컬렉션 기반 기한 관리
import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Scale,
  FileText,
  Gavel,
  Timer,
  BookOpen,
  Loader2,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import {
  createDeadline,
  getDeadlines,
  updateDeadline,
  deleteDeadline,
} from "../../services/firebase/firestore";
import {
  DEADLINE_CATEGORIES,
  calcDDay,
  calcStatus,
  type CaseDeadline,
  type DeadlineCategory,
  type DeadlineStatus,
} from "../../types/deadline";

interface ScheduleTabProps {
  caseId: string;
}

const CATEGORY_ICONS: Record<DeadlineCategory, React.ElementType> = {
  "서면 제출": FileText,
  불변기간: Gavel,
  기일: Scale,
  법정기간: BookOpen,
  기타: Clock,
};

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[d.getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function getDDayLabel(dDay: number): string {
  if (dDay > 0) return `D+${dDay}`;
  if (dDay === 0) return "D-Day";
  return `D${dDay}`;
}

function getStatusColor(status: DeadlineStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  badge: string;
} {
  switch (status) {
    case "overdue":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        dot: "bg-red-500",
        badge: "bg-red-100 text-red-700 ring-red-200",
      };
    case "imminent":
      return {
        bg: "bg-orange-50",
        text: "text-orange-700",
        border: "border-orange-200",
        dot: "bg-orange-500",
        badge: "bg-orange-100 text-orange-700 ring-orange-200",
      };
    case "upcoming":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        dot: "bg-amber-500",
        badge: "bg-amber-100 text-amber-700 ring-amber-200",
      };
    case "comfortable":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
        badge: "bg-emerald-100 text-emerald-700 ring-emerald-200",
      };
  }
}

function getStatusLabel(status: DeadlineStatus): string {
  switch (status) {
    case "overdue":
      return "지연";
    case "imminent":
      return "임박";
    case "upcoming":
      return "예정";
    case "comfortable":
      return "여유";
  }
}

export default function ScheduleTab({ caseId }: ScheduleTabProps) {
  const user = useAuth((s) => s.user);
  const [deadlines, setDeadlines] = useState<CaseDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue" | "imminent" | "upcoming">("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** 수정 중인 기한 ID — null이면 신규 등록 모드 */
  const [editingId, setEditingId] = useState<string | null>(null);

  // 추가/수정 폼 상태
  const [formTitle, setFormTitle] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formCategory, setFormCategory] = useState<DeadlineCategory>("서면 제출");
  const [formBaseDateLabel, setFormBaseDateLabel] = useState("");
  const [formRule, setFormRule] = useState("");

  function resetForm() {
    setFormTitle("");
    setFormDueDate("");
    setFormBaseDateLabel("");
    setFormRule("");
    setFormCategory("서면 제출");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(deadline: CaseDeadline) {
    setFormTitle(deadline.title);
    setFormDueDate(deadline.dueDate);
    setFormCategory(deadline.category);
    setFormBaseDateLabel(deadline.baseDateLabel ?? "");
    setFormRule(deadline.rule ?? "");
    setEditingId(deadline.id);
    setShowForm(true);
  }

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const result = await getDeadlines(caseId, user.uid);
      setDeadlines(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "기한 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [caseId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!user || !formTitle.trim() || !formDueDate) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        // 빈 값은 ""로 저장해 기존 값을 지운다 (렌더링은 falsy 체크라 표시되지 않음)
        await updateDeadline(editingId, {
          title: formTitle.trim(),
          dueDate: formDueDate,
          category: formCategory,
          baseDateLabel: formBaseDateLabel.trim(),
          rule: formRule.trim(),
        });
      } else {
        await createDeadline({
          caseId,
          ownerId: user.uid,
          title: formTitle.trim(),
          dueDate: formDueDate,
          category: formCategory,
          ...(formBaseDateLabel.trim() ? { baseDateLabel: formBaseDateLabel.trim() } : {}),
          ...(formRule.trim() ? { rule: formRule.trim() } : {}),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : editingId ? "기한 수정에 실패했습니다." : "기한 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 기한을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      await deleteDeadline(id);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "기한 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  // D-Day·상태를 오늘 날짜 기준으로 계산해 부착
  const enriched = deadlines.map((d) => {
    const dDay = calcDDay(d.dueDate);
    return { ...d, dDay, status: calcStatus(dDay) };
  });

  const sorted = [...enriched].sort((a, b) => b.dDay - a.dDay);
  const filtered = filter === "all" ? sorted : sorted.filter((d) => d.status === filter);

  const overdueCount = enriched.filter((d) => d.status === "overdue").length;
  const imminentCount = enriched.filter(
    (d) => d.status === "imminent" || d.status === "upcoming",
  ).length;
  const thisWeekCount = enriched.filter((d) => d.dDay >= -7 && d.dDay <= 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#1e2a22]/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Clock}
          label="진행 중 기한"
          value={`${imminentCount}건`}
          color="text-[#2e6242]"
          bgColor="bg-[#2e6242]/5"
          borderColor="border-[#2e6242]/10"
          iconBg="bg-[#2e6242]/10"
        />
        <SummaryCard
          icon={CalendarDays}
          label="이번 주 마감"
          value={`${thisWeekCount}건`}
          color="text-amber-700"
          bgColor="bg-amber-50"
          borderColor="border-amber-100"
          iconBg="bg-amber-100"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="지연 기한"
          value={`${overdueCount}건`}
          color="text-red-600"
          bgColor="bg-red-50"
          borderColor="border-red-100"
          iconBg="bg-red-100"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: "all", label: "전체" },
            { key: "overdue", label: "지연" },
            { key: "imminent", label: "임박" },
            { key: "upcoming", label: "예정" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === key
                ? "bg-[#2e6242] text-white shadow-sm"
                : "bg-[#ede7d8] text-[#1e2a22]/60 hover:bg-[#e5e4e0] hover:text-[#1e2a22]/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 기한 목록 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1e2a22]/50 uppercase tracking-wider">
          다가오는 기한
        </h3>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[#1e2a22]/40">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {deadlines.length === 0
                ? "등록된 기한이 없습니다. 아래 버튼으로 기한을 추가하세요."
                : "해당 조건의 기한이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* 타임라인 세로선 */}
            <div className="absolute left-[23px] top-4 bottom-4 w-px bg-[#ede7d8]" />

            <div className="space-y-0">
              {filtered.map((deadline) => {
                const colors = getStatusColor(deadline.status);
                const Icon = CATEGORY_ICONS[deadline.category] ?? Clock;

                return (
                  <div key={deadline.id} className="relative flex gap-4 py-3">
                    {/* 타임라인 노드 */}
                    <div className="relative z-10 flex-shrink-0 mt-1">
                      <div
                        className={`w-[46px] h-[46px] rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center`}
                      >
                        <Icon className={`w-5 h-5 ${colors.text}`} />
                      </div>
                    </div>

                    {/* 내용 */}
                    <div
                      className={`flex-1 rounded-xl border ${colors.border} bg-white p-4 shadow-sm hover:shadow-md transition-shadow`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* 제목 + 배지 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-[15px] font-semibold text-[#1e2a22]">
                              {deadline.title}
                            </h4>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ring-1 ring-inset ${colors.badge}`}
                            >
                              {getDDayLabel(deadline.dDay)}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${colors.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                              {getStatusLabel(deadline.status)}
                            </span>
                          </div>

                          {/* 날짜 */}
                          <p className="mt-1.5 text-sm text-[#1e2a22]/70">
                            <span className="font-medium">{formatDate(deadline.dueDate)}</span>
                            {deadline.status === "overdue" && (
                              <span className="ml-2 text-red-600 font-semibold">
                                {Math.abs(deadline.dDay)}일 경과
                              </span>
                            )}
                          </p>

                          {/* 기산일 + 근거 */}
                          {(deadline.baseDateLabel || deadline.rule) && (
                            <div className="mt-2 flex flex-col gap-1">
                              {deadline.baseDateLabel && (
                                <p className="text-xs text-[#1e2a22]/50">
                                  <span className="text-[#1e2a22]/40">기산일</span>{" "}
                                  {deadline.baseDateLabel}
                                </p>
                              )}
                              {deadline.rule && (
                                <p className="text-xs text-[#1e2a22]/50">
                                  <span className="text-[#1e2a22]/40">근거</span> {deadline.rule}
                                </p>
                              )}
                            </div>
                          )}

                          {/* 카테고리 */}
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#ede7d8] text-[#1e2a22]/50">
                              {deadline.category}
                            </span>
                          </div>
                        </div>

                        {/* 수정·삭제 버튼 */}
                        <div className="flex-shrink-0 flex items-center gap-0.5">
                          <button
                            onClick={() => startEdit(deadline)}
                            className="p-1.5 rounded-lg text-[#1e2a22]/25 hover:text-[#2e6242] hover:bg-[#2e6242]/10 transition-colors"
                            title="기한 수정"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(deadline.id)}
                            disabled={deletingId === deadline.id}
                            className="p-1.5 rounded-lg text-[#1e2a22]/25 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="기한 삭제"
                          >
                            {deletingId === deadline.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 기한 추가 */}
      <div className="pt-2">
        {showForm ? (
          <div className="rounded-xl border border-[#ede7d8] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#1e2a22]">
                {editingId ? "기한 수정" : "새 기한 추가"}
              </h4>
              <button
                onClick={resetForm}
                className="p-1 rounded-lg text-[#1e2a22]/40 hover:text-[#1e2a22] hover:bg-[#ede7d8] transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#1e2a22]/60 mb-1">
                  제목 <span className="text-red-500">*</span>
                </label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="예: 답변서 제출기한"
                  className="w-full px-3 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22] placeholder:text-[#1e2a22]/30 focus:border-[#2e6242]/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a22]/60 mb-1">
                  마감일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22] focus:border-[#2e6242]/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a22]/60 mb-1">분류</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as DeadlineCategory)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22] bg-white focus:border-[#2e6242]/40 focus:outline-none"
                >
                  {DEADLINE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a22]/60 mb-1">
                  기산일 설명 (선택)
                </label>
                <input
                  value={formBaseDateLabel}
                  onChange={(e) => setFormBaseDateLabel(e.target.value)}
                  placeholder="예: 소장 송달일 (2026.03.02)"
                  className="w-full px-3 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22] placeholder:text-[#1e2a22]/30 focus:border-[#2e6242]/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1e2a22]/60 mb-1">
                  법적 근거 (선택)
                </label>
                <input
                  value={formRule}
                  onChange={(e) => setFormRule(e.target.value)}
                  placeholder="예: 30일 (민사소송법 §256)"
                  className="w-full px-3 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22] placeholder:text-[#1e2a22]/30 focus:border-[#2e6242]/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-[#ede7d8] text-sm text-[#1e2a22]/60 hover:text-[#1e2a22] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !formTitle.trim() || !formDueDate}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2e6242] text-white text-sm font-medium hover:bg-[#5d4a00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "수정 저장" : "등록"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#ede7d8] text-[#1e2a22]/50 hover:border-[#2e6242]/30 hover:text-[#2e6242] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">기한 추가</span>
          </button>
        )}
      </div>

      {/* 안내 문구 */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#ede7d8]/60 border border-[#ede7d8]">
        <Timer className="w-4 h-4 text-[#2e6242] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#1e2a22]/50 leading-relaxed">
          지연·임박·예정 상태는 오늘 날짜 기준으로 자동 계산됩니다. 공휴일 및
          토요일이 만료일인 경우 다음 영업일로 연장될 수 있으니, 정확한 기한은
          담당 법원의 송달일 기준으로 직접 확인하시기 바랍니다.
        </p>
      </div>
    </div>
  );
}

/* ---------- 요약 카드 서브 컴포넌트 ---------- */

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  borderColor,
  iconBg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
}) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-[#1e2a22]/50 font-medium">{label}</p>
        <p className={`text-xl font-bold ${color} mt-0.5`}>{value}</p>
      </div>
    </div>
  );
}
