import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, FolderOpen, FileText, TrendingUp, Plus, Sparkles, ArrowRight } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { collection, query, where, getDocs, orderBy, limit, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, isDemoMode } from "../config/firebase";
import type { Case } from "../types/case";
import FinanceSummaryWidget from "../components/accounting/FinanceSummaryWidget";
import OverdueAlertPanel from "../components/accounting/OverdueAlertPanel";
import DashboardStats from "../components/dashboard/DashboardStats";
import OnboardingGuide from "../components/dashboard/OnboardingGuide";

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
  const [allCases, setAllCases] = useState<Case[]>([]);
  /** 시작 가이드 표시 여부 — 사용자가 닫으면 Firestore에 기록해 다시 뜨지 않는다 */
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [feeCount, setFeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [financeStats, setFinanceStats] = useState({ revenue: 0, outstanding: 0, expenses: 0, deposits: 0 });
  const [financeLoading, setFinanceLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // 데모 모드: Firebase 미설정
    if (isDemoMode) {
      setStats({ totalCases: 0, activeCases: 0, totalDocuments: 0, totalRecordings: 0 });
      setRecentCases([]);
      setLoading(false);
      setFinanceLoading(false);
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

        // 수임료 건수 (시작 가이드 4단계 판정용)
        const feesSnap = await getDocs(
          query(collection(db!, "fees"), where("ownerId", "==", user.uid)),
        );
        setFeeCount(feesSnap.size);

        setStats({
          totalCases: cases.length,
          activeCases,
          totalDocuments: docsSnap.size,
          totalRecordings: recsSnap.size,
        });
        setRecentCases(recent);
        setAllCases(cases);
      } catch (err) {
        console.error("대시보드 데이터 로딩 실패:", err);
        setStats({ totalCases: 0, activeCases: 0, totalDocuments: 0, totalRecordings: 0 });
        setRecentCases([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // 재무 데이터 로딩
    const fetchFinance = async () => {
      try {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const [feesSnap, txSnap, officeSnap, depositsSnap] = await Promise.all([
          getDocs(query(collection(db!, "fees"), where("ownerId", "==", user.uid))),
          getDocs(query(collection(db!, "transactions"), where("ownerId", "==", user.uid))),
          getDocs(query(collection(db!, "office_expenses"), where("ownerId", "==", user.uid))),
          getDocs(query(collection(db!, "deposits"), where("ownerId", "==", user.uid))),
        ]);

        // 이번 달 매출: transactions 컬렉션에서 해당 월의 매출 거래만 합산
        // (FinancePage와 동일한 데이터 소스 사용)
        let revenue = 0;
        txSnap.docs.forEach((d) => {
          const data = d.data();
          const date = data.date as string;
          if (date?.startsWith(ym) && data.type === "매출") {
            const vat = data.vat as { totalAmount?: number } | undefined;
            revenue += (vat?.totalAmount as number) ?? 0;
          }
        });

        // 미수금: 전체 미완납 수임료 합산 (현재 상태 기준, 월 무관)
        let outstanding = 0;
        feesSnap.docs.forEach((d) => {
          const data = d.data();
          outstanding += (data.totalOutstanding as number) ?? 0;
        });

        // 이번 달 경비: office_expenses에서 해당 월만 + transactions 매입 거래
        let expenses = 0;
        officeSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.yearMonth === ym) expenses += (data.amount as number) ?? 0;
        });
        txSnap.docs.forEach((d) => {
          const data = d.data();
          const date = data.date as string;
          if (date?.startsWith(ym) && data.type === "매입") {
            const vat = data.vat as { totalAmount?: number } | undefined;
            expenses += (vat?.totalAmount as number) ?? 0;
          }
        });

        let depositTotal = 0;
        depositsSnap.docs.forEach((d) => {
          const data = d.data();
          const status = data.status as string;
          if (status === "보관중" || status === "일부사용" || status === "공탁중") {
            depositTotal += (data.remainingAmount as number) ?? 0;
          }
        });

        setFinanceStats({ revenue, outstanding, expenses, deposits: depositTotal });
      } catch (err) {
        console.error("재무 데이터 로딩 실패:", err);
      } finally {
        setFinanceLoading(false);
      }
    };
    fetchFinance();
  }, [user]);

  // 시작 가이드: 아직 네 단계를 다 거치지 않았고, 사용자가 닫지 않았을 때만 띄운다.
  // (users.onboardingDismissedAt이 있으면 이미 닫은 것)
  const onboardingProgress = {
    recordings: stats.totalRecordings,
    cases: stats.totalCases,
    documents: stats.totalDocuments,
    fees: feeCount,
  };
  const onboardingDone =
    onboardingProgress.recordings > 0 &&
    onboardingProgress.cases > 0 &&
    onboardingProgress.documents > 0 &&
    onboardingProgress.fees > 0;
  // ?guide=1 을 붙이면 이미 완료한 계정에서도 가이드를 볼 수 있다(확인용).
  const forceGuide =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("guide");
  const showGuide =
    forceGuide ||
    (!loading && !guideDismissed && !user?.onboardingDismissedAt && !onboardingDone);

  const handleDismissGuide = () => {
    setGuideDismissed(true);
    if (!user || isDemoMode) return;
    // 실패해도 화면에서는 이미 닫혔다 — 다음 로그인에 다시 뜨는 정도의 영향
    updateDoc(doc(db!, "users", user.uid), { onboardingDismissedAt: serverTimestamp() }).catch(
      (err) => console.warn("시작 가이드 닫기 저장 실패:", err),
    );
  };

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
      {/* 시작 가이드 — 첫 라운드를 마치면 자동으로 사라진다 */}
      {showGuide && (
        <OnboardingGuide progress={onboardingProgress} onDismiss={handleDismissGuide} />
      )}

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

      {/* 자유 지시 빠른 경로 (강조 CTA) */}
      <button
        onClick={() => navigate("/freeform")}
        className="group w-full relative overflow-hidden bg-gradient-to-r from-gold via-gold-bright to-gold text-navy rounded-2xl p-5 sm:p-6 mb-4 shadow-lg shadow-gold/20 hover:shadow-gold/40 transition-all text-left"
      >
        <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-navy/15 rounded-full flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-navy" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-base sm:text-lg">자유 지시로 빠르게 생성</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-navy text-gold rounded-full">NEW</span>
            </div>
            <p className="text-sm text-navy/80">
              양식 없이 AI에게 직접 시키기 · 체크포인트 생략 · 20~30초
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-navy shrink-0 group-hover:translate-x-1 transition-transform" />
        </div>
      </button>

      {/* 새 상담 시작 + 사건 관리 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => navigate("/record")}
          className="flex items-center gap-4 bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20 rounded-2xl p-5 hover:border-gold/40 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-gold-dim rounded-full flex items-center justify-center shrink-0">
            <Mic className="w-6 h-6 text-gold" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">새 상담 시작</p>
            <p className="text-sm text-text-dim mt-0.5">녹음 · 메모 · 파일 첨부 → AI 분석</p>
          </div>
        </button>

        <button
          onClick={() => navigate("/cases")}
          className="flex items-center gap-4 bg-surface border border-border rounded-2xl p-5 hover:border-border-hover transition-colors text-left"
        >
          <div className="w-12 h-12 bg-info/10 rounded-full flex items-center justify-center shrink-0">
            <FolderOpen className="w-6 h-6 text-info" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">사건 관리</p>
            <p className="text-sm text-text-dim mt-0.5">진행중인 사건 확인 및 관리</p>
          </div>
        </button>
      </div>

      {/* 재무 요약 */}
      <div className="mb-8">
        <FinanceSummaryWidget
          revenue={financeStats.revenue}
          outstanding={financeStats.outstanding}
          expenses={financeStats.expenses}
          deposits={financeStats.deposits}
          loading={financeLoading}
        />
      </div>

      {/* 연체 알림 */}
      {user && !isDemoMode && (
        <div className="mb-8">
          <OverdueAlertPanel ownerId={user.uid} />
        </div>
      )}

      {/* 통계 — 매출 추이·사건 구성·수임 전환 */}
      {user && !loading && (
        <DashboardStats
          ownerId={user.uid}
          cases={allCases}
          recordingCount={stats.totalRecordings}
        />
      )}

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
