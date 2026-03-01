import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid, Clock, FileText, Loader2 } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useCaseDetail from "../hooks/useCaseDetail";
import CaseHeader from "../components/cases/CaseHeader";
import OverviewTab from "../components/cases/OverviewTab";
import TimelineTab from "../components/cases/TimelineTab";
import DocumentsTab from "../components/cases/DocumentsTab";

type TabKey = "overview" | "timeline" | "docs";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const user = useAuth((s) => s.user);

  const {
    caseData,
    documents,
    recordings,
    opponentDocs,
    loading,
    error,
    updateStatus,
    addNote,
    uploadOpponentDoc,
    removeOpponentDoc,
  } = useCaseDetail(id ?? "");

  const handleNavigateToRecord = () => {
    if (!caseData) return;
    navigate("/record", {
      state: {
        caseId: caseData.id,
        clientName: caseData.clientName,
        caseDesc: caseData.description,
      },
    });
  };

  if (loading) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
          <Loader2 className="w-5 h-5 animate-spin" />
          로딩 중...
        </div>
      </AppLayout>
    );
  }

  if (error || !caseData) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="text-center py-16">
          <p className="text-text-dim mb-4">
            {error ?? "사건을 찾을 수 없습니다."}
          </p>
          <button
            onClick={() => navigate("/cases")}
            className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
          >
            사건 목록으로
          </button>
        </div>
      </AppLayout>
    );
  }

  const timeline = caseData.timeline ?? [];
  const docsRecCount = documents.length + recordings.length + opponentDocs.length;

  const tabs: { key: TabKey; label: string; count?: number; icon: React.ElementType }[] = [
    { key: "overview", label: "개요", icon: LayoutGrid },
    { key: "timeline", label: "타임라인", count: timeline.length, icon: Clock },
    { key: "docs", label: "문서·녹음", count: docsRecCount, icon: FileText },
  ];

  return (
    <AppLayout title={caseData.clientName} subtitle={caseData.caseType}>
      {/* 뒤로가기 */}
      <button
        onClick={() => navigate("/cases")}
        className="flex items-center gap-2 text-text-dim hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">사건 목록</span>
      </button>

      {/* 사건 헤더 */}
      <CaseHeader caseData={caseData} onStatusChange={updateStatus} />

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-gold-dim text-gold border border-gold/30"
                : "bg-surface text-text-dim border border-border hover:border-border-hover"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1 ${tab === t.key ? "text-gold/70" : "text-text-dim/60"}`}>
                ({t.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "overview" && (
        <OverviewTab
          caseData={caseData}
          documents={documents}
          recordings={recordings}
          opponentDocs={opponentDocs}
          onNavigateToRecord={handleNavigateToRecord}
          onSwitchTab={(t) => setTab(t as TabKey)}
        />
      )}

      {tab === "timeline" && (
        <TimelineTab timeline={timeline} onAddNote={addNote} />
      )}

      {tab === "docs" && (
        <DocumentsTab
          documents={documents}
          recordings={recordings}
          opponentDocs={opponentDocs}
          onNavigateToRecord={handleNavigateToRecord}
          onUploadOpponentDoc={uploadOpponentDoc}
          onRemoveOpponentDoc={removeOpponentDoc}
          caseDesc={caseData?.description}
          firmName={user?.firmName}
          lawyerName={user?.name}
        />
      )}
    </AppLayout>
  );
}
