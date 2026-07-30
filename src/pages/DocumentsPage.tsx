// 문서고 — 전 사건의 생성 문서를 한 곳에서 검색·조회하는 페이지
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, ChevronRight, FolderOpen, AlertTriangle } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getAllDocuments, getCases } from "../services/firebase/firestore";
import type { LegalDocument } from "../types/document";
import { isDemoMode } from "../config/demo";

const STATUS_LABELS: Record<LegalDocument["status"], { label: string; cls: string }> = {
  processing: { label: "분석 중", cls: "bg-info/15 text-info" },
  checkpoint: { label: "확인 대기", cls: "bg-warning/15 text-warning" },
  generating: { label: "생성 중", cls: "bg-info/15 text-info" },
  completed: { label: "완성", cls: "bg-success/15 text-success" },
};

export default function DocumentsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [caseNames, setCaseNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("전체");

  const load = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [docs, cases] = await Promise.all([
        getAllDocuments(user.uid),
        getCases(user.uid),
      ]);
      setDocuments(docs);
      setCaseNames(Object.fromEntries(cases.map((c) => [c.id, c.clientName])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  /** 존재하는 문서 유형만 필터 옵션으로 */
  const docTypes = useMemo(
    () => ["전체", ...Array.from(new Set(documents.map((d) => d.docType)))],
    [documents],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (filterType !== "전체" && d.docType !== filterType) return false;
      if (!q) return true;
      const clientName = caseNames[d.caseId] ?? "";
      return (
        d.docType.toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        (d.finalDocument ?? "").toLowerCase().includes(q)
      );
    });
  }, [documents, filterType, search, caseNames]);

  return (
    <AppLayout title="문서고" subtitle={`전 사건 문서 ${documents.length}건`}>
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* 검색 + 유형 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="의뢰인, 문서 유형, 본문 내용 검색..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none"
        >
          {docTypes.map((t) => (
            <option key={t} value={t}>{t === "전체" ? "유형: 전체" : t}</option>
          ))}
        </select>
      </div>

      {/* 문서 목록 */}
      {loading ? (
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim">
            {documents.length === 0
              ? "아직 생성된 문서가 없습니다. 상담을 진행하면 문서가 여기에 쌓입니다."
              : "검색 결과가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
            <div className="col-span-2">날짜</div>
            <div className="col-span-3">문서 유형</div>
            <div className="col-span-3">의뢰인 · 사건</div>
            <div className="col-span-2 text-center">상태</div>
            <div className="col-span-2 text-right">이동</div>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((d) => {
              const dateStr = d.createdAt?.toDate?.()
                ? d.createdAt.toDate().toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
                : "";
              const status = STATUS_LABELS[d.status] ?? STATUS_LABELS.completed;
              return (
                <button
                  key={d.id}
                  onClick={() => navigate(`/cases/${d.caseId}`)}
                  className="w-full grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3.5 text-left hover:bg-surface-hover transition-colors items-center"
                >
                  <div className="col-span-2 text-sm text-text-dim">{dateStr}</div>
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gold shrink-0" />
                    <span className="text-sm text-text-primary font-medium truncate">{d.docType}</span>
                  </div>
                  <div className="col-span-3 text-sm text-text-dim truncate">
                    {caseNames[d.caseId] ?? "(삭제된 사건)"}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="flex items-center gap-1 text-xs text-gold">
                      사건으로
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
