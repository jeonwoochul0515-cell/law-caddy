import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAgents from "../hooks/useAgents";
import { AGENTS } from "../config/constants";
import type { AgentId, CaseType, DocType } from "../types/agent";

export default function AgentsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    files: File[];
    clientName: string;
    caseType: CaseType;
    caseDesc: string;
    docType: DocType;
    ownerId: string;
    firmName: string;
    lawyerName: string;
  } | null;

  const { agents, isRunning, runAllAgents } = useAgents();
  const [activeTab, setActiveTab] = useState<AgentId>("precedent");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!state || started) return;
    setStarted(true);
    runAllAgents({
      clientName: state.clientName,
      caseType: state.caseType,
      caseDesc: state.caseDesc,
      docType: state.docType,
      transcript: "",
    });
  }, [state, started, runAllAgents]);

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
    <AppLayout title="AI 분석" subtitle={`${state.clientName} - ${state.caseType}`}>
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
            <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
              {agents[activeTab].result}
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

      {/* 다음 단계 */}
      {allCompleted && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() =>
              navigate("/record/checkpoint", {
                state: {
                  ...state,
                  agentResults: Object.fromEntries(
                    Object.entries(agents).map(([k, v]) => [k, v.result])
                  ),
                },
              })
            }
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            체크포인트 확인
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </AppLayout>
  );
}
