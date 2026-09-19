// 문서고 — 전 사건의 생성 문서를 한 곳에서 검색·필터·정렬하고, 누르면 바로 그 문서를 연다
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, FileText, ChevronRight, FolderOpen, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getAllDocuments, getCases, deleteDocument } from "../services/firebase/firestore";
import type { LegalDocument } from "../types/document";
import type { Case } from "../types/case";
import { isDemoMode } from "../config/demo";
import { friendlyError } from "../utils/friendlyError";

const STATUS_LABELS: Record<LegalDocument["status"], { label: string; cls: string }> = {
  processing: { label: "분석 중", cls: "bg-info/15 text-info" },
  checkpoint: { label: "확인 대기", cls: "bg-warning/15 text-warning" },
  generating: { label: "생성 중", cls: "bg-info/15 text-info" },
  completed: { label: "완성", cls: "bg-success/15 text-success" },
};

type SortKey = "newest" | "oldest" | "type" | "client";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "최근 만든 순",
  oldest: "오래된 순",
  type: "문서 유형순",
  client: "의뢰인 이름순",
};

/** 문서 제목 — 변호사가 붙인 제목이 있으면 그것, 없으면 유형명 */
function docTitle(d: LegalDocument): string {
  return d.title?.trim() || d.docType;
}

export default function DocumentsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [cases, setCases] = useState<Record<string, Case>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("전체");
  const [filterCase, setFilterCase] = useState("전체");
  const [filterStatus, setFilterStatus] = useState<"전체" | LegalDocument["status"]>("전체");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [docs, caseList] = await Promise.all([
        getAllDocuments(user.uid),
        getCases(user.uid),
      ]);
      setDocuments(docs);
      setCases(Object.fromEntries(caseList.map((c) => [c.id, c])));
    } catch (err) {
      setError(friendlyError(err, "문서를 불러오지 못했습니다."));
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

  /** 문서가 있는 사건만 필터 옵션으로 (의뢰인 이름 기준) */
  const caseOptions = useMemo(() => {
    const ids = Array.from(new Set(documents.map((d) => d.caseId)));
    return ids
      .map((id) => ({ id, name: cases[id]?.clientName ?? "(삭제된 사건)" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [documents, cases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = documents.filter((d) => {
      if (filterType !== "전체" && d.docType !== filterType) return false;
      if (filterCase !== "전체" && d.caseId !== filterCase) return false;
      if (filterStatus !== "전체" && d.status !== filterStatus) return false;
      if (!q) return true;
      const clientName = cases[d.caseId]?.clientName ?? "";
      return (
        d.docType.toLowerCase().includes(q) ||
        docTitle(d).toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        (d.finalDocument ?? "").toLowerCase().includes(q)
      );
    });
    const created = (d: LegalDocument) => d.createdAt?.seconds ?? 0;
    switch (sortKey) {
      case "oldest":
        return list.sort((a, b) => created(a) - created(b));
      case "type":
        return list.sort((a, b) => a.docType.localeCompare(b.docType, "ko") || created(b) - created(a));
      case "client":
        return list.sort((a, b) =>
          (cases[a.caseId]?.clientName ?? "").localeCompare(cases[b.caseId]?.clientName ?? "", "ko")
          || created(b) - created(a));
      default:
        return list.sort((a, b) => created(b) - created(a));
    }
  }, [documents, filterType, filterCase, filterStatus, sortKey, search, cases]);

  /** 문서를 바로 연다 — 사건 정보가 없어도(삭제된 사건) 열리게 기본값을 채운다 */
  const openDocument = (d: LegalDocument) => {
    if (!user) return;
    const c = cases[d.caseId];
    navigate("/record/document", {
      state: {
        existingDocument: true,
        existingFinalDocument: d.finalDocument,
        documentId: d.id,
        caseId: c ? d.caseId : undefined,
        clientName: c?.clientName ?? "(삭제된 사건)",
        caseType: c?.caseType ?? "기타",
        caseDesc: c?.description ?? "",
        docType: d.docType,
        ownerId: user.uid,
        firmName: user.firmName ?? "",
        lawyerName: user.name ?? "",
        barLicenseNumber: user.barLicenseNumber ?? "",
        businessAddress: user.businessAddress ?? "",
        lawyerPhone: user.phone ?? "",
        agentResults: d.agentResults ?? {
          precedent: "", legal: "", rag_precedent: "", analysis: "", docgen: "", review: "",
        },
        checkQuestions: d.checkQuestions ?? [],
        checkpointAnswers: [],
      },
    });
  };

  const handleDelete = async (d: LegalDocument) => {
    const ok = window.confirm(`"${docTitle(d)}" 문서를 삭제합니다. 삭제한 문서는 되돌릴 수 없습니다. 계속할까요?`);
    if (!ok) return;
    setDeletingId(d.id);
    try {
      await deleteDocument(d.id);
      setDocuments((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      setError(friendlyError(err, "문서를 삭제하지 못했습니다."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout title="문서고" subtitle={`전 사건 문서 ${documents.length}건`}>
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="underline font-medium">다시 불러오기</button>
        </div>
      )}

      {/* 검색 + 필터 + 정렬 */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="의뢰인, 문서 제목·유형, 본문 내용 검색..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-[16px] sm:text-sm placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <select
            value={filterCase}
            onChange={(e) => setFilterCase(e.target.value)}
            aria-label="의뢰인(사건) 필터"
            className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none min-w-0"
          >
            <option value="전체">의뢰인: 전체</option>
            {caseOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="문서 유형 필터"
            className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none min-w-0"
          >
            {docTypes.map((t) => (
              <option key={t} value={t}>{t === "전체" ? "유형: 전체" : t}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            aria-label="상태 필터"
            className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none min-w-0"
          >
            <option value="전체">상태: 전체</option>
            {(Object.keys(STATUS_LABELS) as LegalDocument["status"][]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="정렬"
            className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none min-w-0"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 문서 목록 */}
      {loading ? (
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim mb-5">
            {documents.length === 0
              ? "아직 만든 문서가 없습니다. 상담을 녹음하거나 자료를 올리면 문서가 여기에 쌓입니다."
              : "검색 결과가 없습니다."}
          </p>
          {documents.length === 0 ? (
            <Link
              to="/record"
              className="inline-block px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              새 상담 시작하기
            </Link>
          ) : (
            <button
              onClick={() => { setSearch(""); setFilterType("전체"); setFilterCase("전체"); setFilterStatus("전체"); }}
              className="px-4 py-2.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
            >
              검색·필터 지우기
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs text-text-dim border-b border-border">
            <div className="col-span-2">날짜</div>
            <div className="col-span-3">문서</div>
            <div className="col-span-3">의뢰인 · 사건</div>
            <div className="col-span-2 text-center">상태</div>
            <div className="col-span-2 text-right">열기</div>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((d) => {
              const dateStr = d.createdAt?.toDate?.()
                ? d.createdAt.toDate().toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
                : "";
              const status = STATUS_LABELS[d.status] ?? STATUS_LABELS.completed;
              const c = cases[d.caseId];
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-5 py-3.5 hover:bg-surface-hover transition-colors items-center"
                >
                  <div className="col-span-2 text-sm text-text-dim">{dateStr}</div>
                  <button
                    onClick={() => openDocument(d)}
                    className="col-span-3 flex items-center gap-2 min-w-0 text-left"
                  >
                    <FileText className="w-4 h-4 text-gold shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-text-primary font-medium truncate">{docTitle(d)}</span>
                      {d.title && <span className="block text-[11px] text-text-dim truncate">{d.docType}</span>}
                    </span>
                  </button>
                  <div className="col-span-3 text-sm text-text-dim truncate">
                    {c ? (
                      <Link to={`/cases/${d.caseId}`} className="hover:text-gold transition-colors">
                        {c.clientName}
                        {c.caseType && <span className="text-text-dim/60"> · {c.caseType}</span>}
                      </Link>
                    ) : (
                      "(삭제된 사건)"
                    )}
                  </div>
                  <div className="col-span-2 sm:text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="col-span-2 flex sm:justify-end items-center gap-1">
                    <button
                      onClick={() => openDocument(d)}
                      className="flex items-center gap-1 px-3 py-2 min-h-[36px] text-xs text-gold border border-gold/30 rounded-lg hover:bg-gold-dim transition-colors"
                    >
                      문서 열기
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={deletingId === d.id}
                      aria-label={`${docTitle(d)} 삭제`}
                      title="삭제"
                      className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-text-dim hover:text-error transition-colors disabled:opacity-40"
                    >
                      {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
