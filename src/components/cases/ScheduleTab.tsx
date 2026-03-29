import { useState } from "react";
import {
  Clock,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Plus,
  Scale,
  FileText,
  Gavel,
  Timer,
  BookOpen,
} from "lucide-react";

interface ScheduleTabProps {
  caseId: string;
}

interface Deadline {
  id: number;
  title: string;
  dueDate: string;
  baseDateLabel: string;
  rule: string;
  status: "overdue" | "imminent" | "upcoming" | "comfortable";
  dDay: number;
  icon: React.ElementType;
  category: string;
}

const DUMMY_DEADLINES: Deadline[] = [
  {
    id: 1,
    title: "답변서 제출기한",
    dueDate: "2026-04-01",
    baseDateLabel: "소장 송달일 (2026.03.02)",
    rule: "30일 (민사소송법 \u00A7256)",
    status: "imminent",
    dDay: -6,
    icon: FileText,
    category: "서면 제출",
  },
  {
    id: 2,
    title: "준비서면 제출",
    dueDate: "2026-04-05",
    baseDateLabel: "제2회 변론기일 (2026.04.12)",
    rule: "기일 7일 전",
    status: "upcoming",
    dDay: -10,
    icon: FileText,
    category: "서면 제출",
  },
  {
    id: 3,
    title: "항소기간 만료",
    dueDate: "2026-03-28",
    baseDateLabel: "판결 송달일 (2026.03.14)",
    rule: "14일 (민소법 \u00A7396)",
    status: "overdue",
    dDay: 2,
    icon: Gavel,
    category: "불변기간",
  },
  {
    id: 4,
    title: "제1회 변론기일",
    dueDate: "2026-04-12",
    baseDateLabel: "법원 지정",
    rule: "",
    status: "upcoming",
    dDay: -17,
    icon: Scale,
    category: "기일",
  },
  {
    id: 5,
    title: "상속포기 기한",
    dueDate: "2026-06-15",
    baseDateLabel: "상속개시 인지일 (2026.03.15)",
    rule: "3개월 (민법 \u00A71019)",
    status: "comfortable",
    dDay: -81,
    icon: BookOpen,
    category: "법정기간",
  },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
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

function getStatusColor(status: Deadline["status"]): {
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

function getStatusLabel(status: Deadline["status"]): string {
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
  void caseId; // TODO: Firestore 연동 시 사용
  const [filter, setFilter] = useState<
    "all" | "overdue" | "imminent" | "upcoming"
  >("all");

  const sorted = [...DUMMY_DEADLINES].sort((a, b) => b.dDay - a.dDay);
  const filtered =
    filter === "all" ? sorted : sorted.filter((d) => d.status === filter);

  const overdueCount = DUMMY_DEADLINES.filter(
    (d) => d.status === "overdue"
  ).length;
  const imminentCount = DUMMY_DEADLINES.filter(
    (d) => d.status === "imminent" || d.status === "upcoming"
  ).length;
  const thisWeekCount = DUMMY_DEADLINES.filter(
    (d) => d.dDay >= -7 && d.dDay < 0
  ).length;

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Clock}
          label="진행 중 기한"
          value={`${imminentCount}건`}
          color="text-[#735c00]"
          bgColor="bg-[#735c00]/5"
          borderColor="border-[#735c00]/10"
          iconBg="bg-[#735c00]/10"
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
                ? "bg-[#735c00] text-white shadow-sm"
                : "bg-[#efeeea] text-[#1b1c1a]/60 hover:bg-[#e5e4e0] hover:text-[#1b1c1a]/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 기한 목록 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1b1c1a]/50 uppercase tracking-wider">
          다가오는 기한
        </h3>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[#1b1c1a]/40">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">해당 조건의 기한이 없습니다</p>
          </div>
        ) : (
          <div className="relative">
            {/* 타임라인 세로선 */}
            <div className="absolute left-[23px] top-4 bottom-4 w-px bg-[#efeeea]" />

            <div className="space-y-0">
              {filtered.map((deadline) => {
                const colors = getStatusColor(deadline.status);
                const Icon = deadline.icon;

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
                            <h4 className="text-[15px] font-semibold text-[#1b1c1a]">
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
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}
                              />
                              {getStatusLabel(deadline.status)}
                            </span>
                          </div>

                          {/* 날짜 */}
                          <p className="mt-1.5 text-sm text-[#1b1c1a]/70">
                            <span className="font-medium">
                              {formatDate(deadline.dueDate)}
                            </span>
                            {deadline.status === "overdue" && (
                              <span className="ml-2 text-red-600 font-semibold">
                                {Math.abs(deadline.dDay)}일 경과
                              </span>
                            )}
                          </p>

                          {/* 기산일 + 근거 */}
                          <div className="mt-2 flex flex-col gap-1">
                            <p className="text-xs text-[#1b1c1a]/50">
                              <span className="text-[#1b1c1a]/40">기산일</span>{" "}
                              {deadline.baseDateLabel}
                            </p>
                            {deadline.rule && (
                              <p className="text-xs text-[#1b1c1a]/50">
                                <span className="text-[#1b1c1a]/40">근거</span>{" "}
                                {deadline.rule}
                              </p>
                            )}
                          </div>

                          {/* 카테고리 */}
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#efeeea] text-[#1b1c1a]/50">
                              {deadline.category}
                            </span>
                          </div>
                        </div>

                        {/* 화살표 */}
                        <ChevronRight className="w-4 h-4 text-[#1b1c1a]/20 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 기한 추가 버튼 */}
      <div className="pt-2">
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#efeeea] text-[#1b1c1a]/30 cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">기한 추가</span>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#efeeea] text-[#1b1c1a]/40">
            준비 중
          </span>
        </button>
      </div>

      {/* 안내 문구 */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#efeeea]/60 border border-[#efeeea]">
        <Timer className="w-4 h-4 text-[#735c00] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#1b1c1a]/50 leading-relaxed">
          기한은 기산일과 법정 규정을 기준으로 자동 계산됩니다. 공휴일 및
          토요일이 만료일인 경우 다음 영업일로 연장됩니다. 정확한 기한은
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
    <div
      className={`rounded-xl border ${borderColor} ${bgColor} p-4 flex items-center gap-4`}
    >
      <div
        className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center`}
      >
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-[#1b1c1a]/50 font-medium">{label}</p>
        <p className={`text-xl font-bold ${color} mt-0.5`}>{value}</p>
      </div>
    </div>
  );
}
