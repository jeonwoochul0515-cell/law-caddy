import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, FolderOpen } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getCases } from "../services/firebase/firestore";
import { CASE_TYPES } from "../config/constants";
import { isDemoMode, DEMO_CASES } from "../config/demo";
import type { Case } from "../types/case";

export default function CasesPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("전체");
  const [filterStatus, setFilterStatus] = useState<string>("전체");

  useEffect(() => {
    if (!user) return;

    // 데모 모드: 목 데이터 사용
    if (isDemoMode) {
      setCases(DEMO_CASES);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const data = await getCases(user.uid);
        setCases(data.length > 0 ? data : DEMO_CASES);
      } catch (err) {
        console.error("사건 목록 로딩 실패 — 데모 데이터로 대체:", err);
        setCases(DEMO_CASES);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const filtered = cases.filter((c) => {
    const matchSearch =
      c.clientName.includes(search) || c.description.includes(search);
    const matchType = filterType === "전체" || c.caseType === filterType;
    const matchStatus = filterStatus === "전체" || c.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const caseTypeColors: Record<string, string> = {
    "민사": "bg-info/15 text-info",
    "형사": "bg-error/15 text-error",
    "가사": "bg-success/15 text-success",
    "행정": "bg-warning/15 text-warning",
    "노동": "bg-gold-dim text-gold",
    "부동산": "bg-info/15 text-info",
    "채권·채무": "bg-warning/15 text-warning",
    "손해배상": "bg-error/15 text-error",
    "기타": "bg-surface text-text-dim",
  };

  return (
    <AppLayout title="사건 관리" subtitle={`총 ${cases.length}건`}>
      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="의뢰인 이름 또는 사건 내용 검색..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none"
        >
          <option value="전체">사건 유형: 전체</option>
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none"
        >
          <option value="전체">상태: 전체</option>
          <option value="진행중">진행중</option>
          <option value="완료">완료</option>
          <option value="보류">보류</option>
        </select>
      </div>

      {/* 사건 목록 */}
      {loading ? (
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim mb-4">
            {cases.length === 0 ? "아직 등록된 사건이 없습니다." : "검색 결과가 없습니다."}
          </p>
          {cases.length === 0 && (
            <button
              onClick={() => navigate("/record")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              첫 상담 시작하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              className="w-full bg-surface border border-border rounded-xl p-4 hover:border-border-hover transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${caseTypeColors[c.caseType] ?? caseTypeColors["기타"]}`}>
                    {c.caseType}
                  </span>
                  <div>
                    <p className="text-text-primary font-medium">{c.clientName}</p>
                    <p className="text-sm text-text-dim truncate max-w-[400px]">{c.description}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  c.status === "진행중" ? "bg-success/15 text-success"
                    : c.status === "완료" ? "bg-text-dim/15 text-text-dim"
                      : "bg-warning/15 text-warning"
                }`}>
                  {c.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
