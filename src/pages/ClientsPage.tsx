// 의뢰인 모아보기 — 사건 데이터를 의뢰인 단위로 묶어 연락처·사건 이력을 한눈에 (CRM 라이트)
// 별도 컬렉션 없이 cases를 집계한다. 본격 CRM(주소·메모·태그)이 필요해지면 clients 컬렉션으로 승격.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, ChevronDown, ChevronRight, Phone, FolderOpen, AlertTriangle } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getCases } from "../services/firebase/firestore";
import type { Case } from "../types/case";
import { isDemoMode } from "../config/demo";
import { friendlyError } from "../utils/friendlyError";

interface ClientGroup {
  name: string;
  phone: string | null;
  cases: Case[];
  activeCount: number;
  /** 최근 사건 등록일 (초) — 정렬용 */
  latest: number;
}

const STATUS_STYLES: Record<string, string> = {
  "진행중": "bg-success/15 text-success",
  "완료": "bg-text-dim/15 text-text-dim",
  "보류": "bg-warning/15 text-warning",
};

function formatPhone(p: string): string {
  return p.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

export default function ClientsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setCases(await getCases(user.uid));
    } catch (err) {
      setError(friendlyError(err, "의뢰인 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const groups: ClientGroup[] = useMemo(() => {
    const map = new Map<string, ClientGroup>();
    for (const c of cases) {
      const name = c.clientName.trim();
      if (!name) continue;
      const g = map.get(name) ?? { name, phone: null, cases: [], activeCount: 0, latest: 0 };
      g.cases.push(c);
      if (c.status === "진행중") g.activeCount++;
      if (!g.phone && c.clientPhone) g.phone = c.clientPhone;
      g.latest = Math.max(g.latest, c.createdAt?.seconds ?? 0);
      map.set(name, g);
    }
    return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
  }, [cases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    // 검색어에 숫자가 없으면 전화번호 대조를 건너뛴다 — "".includes("")는 항상 참이다
    const qDigits = q.replace(/\D/g, "");
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (qDigits !== "" && (g.phone ?? "").includes(qDigits)),
    );
  }, [groups, search]);

  return (
    <AppLayout title="의뢰인" subtitle={`총 ${groups.length}명 · 사건 ${cases.length}건`}>
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* 검색 */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="의뢰인 이름 또는 전화번호 검색..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim">
            {groups.length === 0 ? "아직 등록된 의뢰인이 없습니다." : "검색 결과가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((g) => {
            const isOpen = expanded === g.name;
            return (
              <div key={g.name} className="bg-surface border border-border rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : g.name)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-surface-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gold-dim flex items-center justify-center text-gold font-semibold shrink-0">
                    {g.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold text-text-primary">{g.name}</span>
                      {g.activeCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                          진행중 {g.activeCount}건
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-dim">
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        사건 {g.cases.length}건
                      </span>
                      {g.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(g.phone)}
                        </span>
                      )}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="w-5 h-5 text-text-dim shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-text-dim shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {g.cases.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/cases/${c.id}`)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-hover transition-colors"
                      >
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_STYLES[c.status] ?? ""}`}>
                          {c.status}
                        </span>
                        <span className="text-xs text-text-dim shrink-0">{c.caseType}</span>
                        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
                          {c.caseNumber ? `${c.caseNumber} · ` : ""}
                          {c.description || "(개요 없음)"}
                        </span>
                        <ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
