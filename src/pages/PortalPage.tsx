// 의뢰인 포털 — 의뢰인이 토큰 링크로 열람하는 읽기 전용 진행 상황 페이지 (로그인 불요)
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Scale, CalendarDays, Activity, Loader2, ShieldCheck } from "lucide-react";
import { API_BASE } from "../services/apiBase";

interface PortalData {
  state: string;
  clientName: string;
  caseType: string;
  status: string;
  caseNumber: string | null;
  courtName: string | null;
  firmName: string;
  lawyerName: string;
  upcoming: Array<{ title: string; dueDate: string; category: string }>;
  recentActivity: Array<{ label: string; dateMs: number | null }>;
}

const STATUS_STYLES: Record<string, string> = {
  "진행중": "bg-emerald-100 text-emerald-700",
  "완료": "bg-slate-200 text-slate-600",
  "보류": "bg-amber-100 text-amber-700",
};

function formatDate(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatDue(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  // 토큰이 아예 없으면 요청 없이 곧바로 not-found
  const [state, setState] = useState<"loading" | "ok" | "not-found" | "error">(
    token ? "loading" : "not-found",
  );

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/portal/${token}`)
      .then(async (resp) => {
        if (resp.status === 404) {
          setState("not-found");
          return;
        }
        if (!resp.ok) {
          setState("error");
          return;
        }
        setData((await resp.json()) as PortalData);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, [token]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#f7f5ec] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#2e6242] animate-spin" />
      </div>
    );
  }

  if (state !== "ok" || !data) {
    return (
      <div className="min-h-screen bg-[#f7f5ec] flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <Scale className="w-12 h-12 text-[#1e2a22]/20 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-[#1e2a22] mb-2">
            {state === "not-found" ? "유효하지 않은 링크입니다" : "일시적인 오류가 발생했습니다"}
          </h1>
          <p className="text-sm text-[#1e2a22]/60 leading-relaxed">
            {state === "not-found"
              ? "링크가 만료되었거나 잘못된 주소입니다. 담당 변호사에게 새 링크를 요청해 주세요."
              : "잠시 후 다시 시도해 주세요."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5ec]" style={{ wordBreak: "keep-all" }}>
      <div className="max-w-lg mx-auto px-5 py-10">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-8">
          <Scale className="w-5 h-5 text-[#2e6242]" />
          <span className="text-sm font-semibold text-[#1e2a22]">{data.firmName || "법률사무소"}</span>
        </div>

        <h1 className="text-2xl font-bold text-[#1e2a22] mb-1">
          {data.clientName}님의 사건 진행 상황
        </h1>
        <p className="text-sm text-[#1e2a22]/50 mb-8">
          담당: {data.lawyerName ? `${data.lawyerName} 변호사` : "담당 변호사"}
        </p>

        {/* 사건 요약 카드 */}
        <div className="bg-white border border-[#ede7d8] rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2e6242]/10 text-[#2e6242]">
              {data.caseType}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[data.status] ?? ""}`}>
              {data.status}
            </span>
          </div>
          {(data.courtName || data.caseNumber) && (
            <p className="text-sm text-[#1e2a22]/70">
              {[data.courtName, data.caseNumber].filter(Boolean).join(" ")}
            </p>
          )}
        </div>

        {/* 다가오는 일정 */}
        <div className="bg-white border border-[#ede7d8] rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-[#2e6242]" />
            <h2 className="text-sm font-semibold text-[#1e2a22]">다가오는 일정</h2>
          </div>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-[#1e2a22]/40">예정된 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.upcoming.map((u, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#2e6242] shrink-0 w-24">{formatDue(u.dueDate)}</span>
                  <span className="text-sm text-[#1e2a22] flex-1">{u.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 진행 내역 */}
        <div className="bg-white border border-[#ede7d8] rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[#2e6242]" />
            <h2 className="text-sm font-semibold text-[#1e2a22]">최근 진행 내역</h2>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-[#1e2a22]/40">기록된 내역이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-xs text-[#1e2a22]/40 shrink-0 w-14 pt-0.5">{formatDate(a.dateMs)}</span>
                  <span className="text-sm text-[#1e2a22]/80 flex-1">{a.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 안내 */}
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-[#ede7d8]/60 border border-[#ede7d8]">
          <ShieldCheck className="w-4 h-4 text-[#2e6242] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#1e2a22]/50 leading-relaxed">
            이 페이지는 담당 변호사가 발급한 열람 전용 링크입니다. 궁금하신 점은
            담당 변호사에게 직접 문의해 주세요. 링크는 타인에게 공유하지 마세요.
          </p>
        </div>
      </div>
    </div>
  );
}
