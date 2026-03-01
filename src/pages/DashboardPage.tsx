import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, FolderOpen, FileText, TrendingUp, Plus } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db, isDemoMode } from "../config/firebase";
import type { Case } from "../types/case";

interface Stats {
  totalCases: number;
  activeCases: number;
  totalDocuments: number;
  totalRecordings: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [stats, setStats] = useState<Stats>({ totalCases: 0, activeCases: 0, totalDocuments: 0, totalRecordings: 0 });
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // 데모 모드: Firebase 미설정
    if (isDemoMode) {
      setStats({ totalCases: 0, activeCases: 0, totalDocuments: 0, totalRecordings: 0 });
      setRecentCases([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // 사건 통계
        const casesQ = query(collection(db!, "cases"), where("ownerId", "==", user.uid));
        const casesSnap = await getDocs(casesQ);
        const cases = casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Case);
        const activeCases = cases.filter((c) => c.status === "진행중").length;

        // 최근 사건 (최대 5건)
        const recentQ = query(
          collection(db!, "cases"),
          where("ownerId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        const recentSnap = await getDocs(recentQ);
        const recent = recentSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Case);

        // 문서 수
        const docsQ = query(collection(db!, "documents"), where("ownerId", "==", user.uid));
        const docsSnap = await getDocs(docsQ);

        // 녹음 수
        const recsQ = query(collection(db!, "recordings"), where("ownerId", "==", user.uid));
        const recsSnap = await getDocs(recsQ);

        setStats({
          totalCases: cases.length,
          activeCases,
          totalDocuments: docsSnap.size,
          totalRecordings: recsSnap.size,
        });
        setRecentCases(recent);
      } catch (err) {
        console.error("대시보드 데이터 로딩 실패:", err);
        setStats({ totalCases: 0, activeCases: 0, totalDocuments: 0, totalRecordings: 0 });
        setRecentCases([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const statCards = [
    { label: "전체 사건", value: stats.totalCases, icon: FolderOpen, color: "text-info" },
    { label: "진행중", value: stats.activeCases, icon: TrendingUp, color: "text-success" },
    { label: "생성 문서", value: stats.totalDocuments, icon: FileText, color: "text-gold" },
    { label: "상담 녹음", value: stats.totalRecordings, icon: Mic, color: "text-warning" },
  ];

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
    <AppLayout title="대시보드" subtitle="오늘의 업무 현황">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-dim">{card.label}</span>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-text-primary">
              {loading ? "-" : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* 빠른 실행 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => navigate("/record")}
          className="flex items-center gap-4 bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20 rounded-2xl p-6 hover:border-gold/40 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-gold-dim rounded-full flex items-center justify-center">
            <Mic className="w-6 h-6 text-gold" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">새 상담 시작</p>
            <p className="text-sm text-text-dim">녹음 또는 파일 업로드로 AI 분석 시작</p>
          </div>
        </button>

        <button
          onClick={() => navigate("/cases")}
          className="flex items-center gap-4 bg-surface border border-border rounded-2xl p-6 hover:border-border-hover transition-colors text-left"
        >
          <div className="w-12 h-12 bg-info/10 rounded-full flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-info" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">사건 관리</p>
            <p className="text-sm text-text-dim">진행중인 사건 확인 및 관리</p>
          </div>
        </button>
      </div>

      {/* 최근 사건 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-text-primary">최근 사건</h3>
          <button
            onClick={() => navigate("/cases")}
            className="text-sm text-gold hover:text-gold-bright transition-colors"
          >
            전체 보기
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-text-dim">로딩 중...</div>
        ) : recentCases.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-text-dim mb-4">아직 등록된 사건이 없습니다.</p>
            <button
              onClick={() => navigate("/record")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              첫 상담 시작하기
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentCases.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${caseTypeColors[c.caseType] ?? caseTypeColors["기타"]}`}
                  >
                    {c.caseType}
                  </span>
                  <div>
                    <p className="text-text-primary font-medium">{c.clientName}</p>
                    <p className="text-sm text-text-dim truncate max-w-[300px]">{c.description}</p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    c.status === "진행중"
                      ? "bg-success/15 text-success"
                      : c.status === "완료"
                        ? "bg-text-dim/15 text-text-dim"
                        : "bg-warning/15 text-warning"
                  }`}
                >
                  {c.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
