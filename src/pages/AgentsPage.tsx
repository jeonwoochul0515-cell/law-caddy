import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, ChevronRight, Sparkles, FileText, AlertTriangle, FolderPlus } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAgents from "../hooks/useAgents";
import useCases from "../hooks/useCases";
import { AGENTS, DOC_TYPES } from "../config/constants";
import { isDemoMode } from "../config/demo";
import type { AgentId } from "../types/agent";
import type { DocType } from "../types/document";
import type { CaseType } from "../types/case";

const CASE_TYPE_COLORS: Record<string, string> = {
  "민사": "bg-info/15 text-info border-info/30",
  "형사": "bg-error/15 text-error border-error/30",
  "가사": "bg-success/15 text-success border-success/30",
  "행정": "bg-amber/15 text-amber border-amber/30",
  "노동": "bg-blue/15 text-blue border-blue/30",
  "부동산": "bg-gold/15 text-gold border-gold/30",
  "채권·채무": "bg-info/15 text-info border-info/30",
  "손해배상": "bg-error/15 text-error border-error/30",
  "기타": "bg-surface text-text-dim border-border",
};

export default function AgentsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    files: File[];
    typedNotes?: string;
    clientName: string;
    caseDesc: string;
    ownerId: string;
    firmName: string;
    lawyerName: string;
  } | null;

  const { agents, isRunning, classifiedCaseType, isClassifying, runAllAgents } = useAgents();
  const { addCase } = useCases();
  const [activeTab, setActiveTab] = useState<AgentId>("precedent");
  const [started, setStarted] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<DocType | null>(null);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [caseError, setCaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!state || started) return;
    setStarted(true);
    // 직접 입력한 텍스트가 있으면 사건 개요에 추가
    const fullDesc = state.typedNotes
      ? `${state.caseDesc}\n\n[추가 자료]\n${state.typedNotes}`
      : state.caseDesc;
    runAllAgents({
      clientName: state.clientName,
      caseDesc: fullDesc,
      transcript: "",
    });
  }, [state, started, runAllAgents]);

  const handleCreateCase = async () => {
    if (!state || !classifiedCaseType || isCreatingCase || createdCaseId) return;
    setIsCreatingCase(true);
    setCaseError(null);

    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 800));
        setCreatedCaseId(`demo-case-${Date.now()}`);
      } else {
        const caseId = await addCase({
          clientName: state.clientName,
          caseType: classifiedCaseType as CaseType,
          description: state.caseDesc,
        });
        setCreatedCaseId(caseId);
      }
    } catch (err: unknown) {
      setCaseError(err instanceof Error ? err.message : "사건 파일 생성 중 오류가 발생했습니다.");
    } finally {
      setIsCreatingCase(false);
    }
  };

  if (!state) {
    return (
      <AppLayout title="AI 분석" subtitle="에이전트 실행">
        <div className="text-center py-16">
          <p className="text-text-dim mb-4">사건 정보가 없습니다.</p>
          <button
            onClick={() => navigate("/record")}
            className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
          >
            새 상담 시작
          </button>
        </div>
      </AppLayout>
    );
  }

  const completedCount = Object.values(agents).filter((a) => a.status === "completed").length;
  const allCompleted = completedCount === 6 && !isRunning;

  return (
    <AppLayout title="AI 분석" subtitle={state.clientName}>
      {/* AI 분류 사건 유형 뱃지 */}
      <div className="mb-4 flex items-center gap-2">
        {isClassifying && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface text-text-dim border border-border animate-pulse">
            <Sparkles className="w-3 h-3" />
            사건 유형 분석 중...
          </span>
        )}
        {classifiedCaseType && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${CASE_TYPE_COLORS[classifiedCaseType] ?? CASE_TYPE_COLORS["기타"]}`}>
            <Sparkles className="w-3 h-3" />
            AI 분류: {classifiedCaseType}
          </span>
        )}
      </div>

      {/* 진행률 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-dim">분석 진행률</span>
          <span className="text-sm text-gold font-medium">{completedCount}/6</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / 6) * 100}%` }}
          />
        </div>
      </div>

      {/* 에이전트 상태 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {AGENTS.map((agent) => {
          const agentState = agents[agent.id];
          const isActive = activeTab === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => setActiveTab(agent.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? "bg-gold-dim border-gold/30"
                  : "bg-surface border-border hover:border-border-hover"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{agent.icon}</span>
                {agentState?.status === "running" && (
                  <Loader2 className="w-4 h-4 text-gold animate-spin" />
                )}
                {agentState?.status === "completed" && (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                )}
                {agentState?.status === "error" && (
                  <AlertCircle className="w-4 h-4 text-error" />
                )}
              </div>
              <p className="text-xs font-medium text-text-primary">{agent.name}</p>
            </button>
          );
        })}
      </div>

      {/* 결과 탭 */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-text-primary">
            {AGENTS.find((a) => a.id === activeTab)?.icon}{" "}
            {AGENTS.find((a) => a.id === activeTab)?.name} 결과
          </h3>
        </div>
        <div className="p-5">
          {agents[activeTab]?.status === "running" ? (
            <div className="flex items-center gap-3 py-8 justify-center text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin" />
              분석 중...
            </div>
          ) : agents[activeTab]?.status === "completed" ? (
            <div>
              {(activeTab === "precedent" || activeTab === "analysis") && (
                <div className="flex items-start gap-2 mb-3 bg-amber/5 border border-amber/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-dim">
                    AI가 생성한 판례·법조문은 실제와 다를 수 있습니다. [확인 필요] 표시 부분을 포함하여 반드시 검증하세요.
                  </p>
                </div>
              )}
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {agents[activeTab].result}
              </div>
            </div>
          ) : agents[activeTab]?.status === "error" ? (
            <div className="text-error text-sm py-4">
              오류: {agents[activeTab].error ?? "알 수 없는 오류"}
            </div>
          ) : (
            <div className="text-text-dim text-sm py-8 text-center">대기 중...</div>
          )}
        </div>
      </div>

      {/* 사건 파일 생성 */}
      {allCompleted && classifiedCaseType && (
        <div className="mt-6 bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-text-primary">사건 파일</h3>
            </div>
            {!createdCaseId && !isCreatingCase && (
              <button
                onClick={handleCreateCase}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
              >
                <FolderPlus className="w-4 h-4" />
                사건 파일 생성
              </button>
            )}
            {isCreatingCase && (
              <div className="flex items-center gap-2 text-text-dim text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                생성 중...
              </div>
            )}
          </div>
          {caseError && (
            <div className="mt-3 flex items-center gap-2 text-error text-sm">
              <AlertCircle className="w-4 h-4" />
              {caseError}
            </div>
          )}
          {createdCaseId && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="w-4 h-4" />
                사건 파일이 생성되었습니다.
              </div>
              <button
                onClick={() => navigate(`/cases/${createdCaseId}`)}
                className="flex items-center gap-1 text-gold text-sm hover:underline"
              >
                사건 파일 보기
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 다음 단계: 문서 유형 선택 */}
      {allCompleted && classifiedCaseType && (
        <div className="mt-6 bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-text-primary">생성할 문서 유형</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt}
                onClick={() => setSelectedDocType(dt)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all text-left ${
                  selectedDocType === dt
                    ? "bg-gold-dim border-gold/30 text-gold"
                    : "bg-navy-light border-border text-text-dim hover:border-border-hover hover:text-text-primary"
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button
              disabled={!selectedDocType}
              onClick={() =>
                navigate("/record/checkpoint", {
                  state: {
                    ...state,
                    caseId: createdCaseId,
                    caseType: classifiedCaseType ?? "기타",
                    docType: selectedDocType,
                    agentResults: Object.fromEntries(
                      Object.entries(agents).map(([k, v]) => [k, v.result])
                    ),
                  },
                })
              }
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              체크포인트 확인
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
