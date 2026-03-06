// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, 적법성 검증, STT, 쟁점 분석, 문서 작성, 검토·감수

import { useState, useCallback } from "react";
import { callClaude } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt } from "../services/prompts";
import { pollTranscription, formatTranscript } from "../services/rtzr";
import type { AgentContext } from "../services/prompts";
import type { AgentId, AgentState, CaseType } from "../types/agent";
import { CASE_TYPES } from "../config/constants";

/** 에이전트 실행 컨텍스트 (STT 폴링용 transcribeId 포함) */
interface RunAgentsContext extends AgentContext {
  transcribeId?: string;
}

/** 에이전트 실행 단계 */
type AgentStep = "idle" | "running" | "completed" | "error";

/** useAgents 반환 타입 */
interface UseAgentsReturn {
  agents: Record<AgentId, AgentState>;
  isRunning: boolean;
  currentStep: AgentStep;
  classifiedCaseType: CaseType | null;
  isClassifying: boolean;
  runAllAgents: (context: RunAgentsContext) => Promise<Record<AgentId, AgentState>>;
  resetAgents: () => void;
}

/** 에이전트 ID 목록 */
const AGENT_IDS: AgentId[] = [
  "precedent",
  "legal",
  "stt",
  "analysis",
  "docgen",
  "review",
];

/** 초기 에이전트 상태 생성 */
function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    result: "",
  };
}

/** 전체 에이전트 초기 상태 */
function createInitialStates(): Record<AgentId, AgentState> {
  const states: Partial<Record<AgentId, AgentState>> = {};
  for (const id of AGENT_IDS) {
    states[id] = createInitialAgentState(id);
  }
  return states as Record<AgentId, AgentState>;
}

// ---------------------------------------------------------------------------
// 에이전트 실행 (Claude API 연동)
// ---------------------------------------------------------------------------

/**
 * 단일 에이전트 실행 (STT 에이전트 특수 처리 포함)
 */
async function runSingleAgent(
  agentId: AgentId,
  context: RunAgentsContext,
): Promise<string> {
  // STT 에이전트: transcribeId가 있으면 RTZR 폴링, 없으면 안내 메시지
  if (agentId === "stt") {
    if (!context.transcribeId) {
      return "음성 파일이 없어 음성 변환을 수행하지 않았습니다.";
    }

    const POLL_INTERVAL = 3000; // 3초
    const MAX_POLLS = 120; // 최대 6분

    for (let i = 0; i < MAX_POLLS; i++) {
      const result = await pollTranscription(context.transcribeId);

      if (result.status === "completed" && result.utterances) {
        return formatTranscript(result.utterances);
      }

      if (result.status === "failed") {
        return "음성 변환에 실패했습니다. 녹음 파일을 확인해 주세요.";
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    return "음성 변환 시간이 초과되었습니다. 녹음 파일을 확인해 주세요.";
  }

  // RAG 벡터 검색 결과 가져오기 (실패해도 기존 동작 유지)
  // rag.ts가 아직 없을 수 있으므로 동적 경로로 import하여 빌드 에러 방지
  let ragContext = "";
  try {
    const ragModulePath = "../services/rag";
    const ragModule = await import(/* @vite-ignore */ ragModulePath) as {
      searchForAgent: (agentId: string, caseDesc: string, caseType?: string) => Promise<string>;
    };
    ragContext = await ragModule.searchForAgent(agentId, context.caseDesc, context.caseType);
  } catch {
    // RAG 서비스 미구현 또는 검색 실패 시 무시
  }

  // precedent 에이전트: 법제처 실시간 판례 검색 (실패 시 graceful degradation)
  let latestPrecedents = "";
  if (agentId === "precedent") {
    try {
      const precedentModule = await import(
        /* @vite-ignore */ "../services/precedent-api"
      ) as {
        searchLatestPrecedents: (query: string, count?: number) => Promise<
          Array<{
            serialNumber: string;
            caseNumber: string;
            caseName: string;
            court: string;
            date: string;
            summary: string;
            keyPoints: string;
            refStatutes: string;
            refCases: string;
            content: string;
          }>
        >;
        formatPrecedentsForPrompt: (
          precedents: Array<{
            serialNumber: string;
            caseNumber: string;
            caseName: string;
            court: string;
            date: string;
            summary: string;
            keyPoints: string;
            refStatutes: string;
            refCases: string;
            content: string;
          }>,
        ) => string;
      };

      // 사건 유형 + 사건 개요를 검색어로 조합
      const searchQuery = context.caseType
        ? `${context.caseType} ${context.caseDesc}`
        : context.caseDesc;
      const precedents = await precedentModule.searchLatestPrecedents(searchQuery, 5);
      latestPrecedents = precedentModule.formatPrecedentsForPrompt(precedents);
    } catch {
      // 법제처 API 실패 시 기존 RAG 결과만 사용
    }
  }

  // 일반 에이전트: Claude API 호출
  // docgen 에이전트는 체크포인트 질문 생성 단계에서 docgen_questions 프롬프트 사용
  const promptId = agentId === "docgen" ? "docgen_questions" : agentId;
  const contextWithRAG: RunAgentsContext = {
    ...context,
    ...(ragContext ? { ragContext } : {}),
    ...(latestPrecedents ? { latestPrecedents } : {}),
  };
  const prompt = buildPrompt(promptId, contextWithRAG);

  const userMessage =
    agentId === "docgen"
      ? context.docType
        ? `"${context.docType}" 문서 작성 전 확인 사항을 JSON으로 제시해 주세요.`
        : "사건에 적합한 법률 문서 작성 전 확인 사항을 JSON으로 제시해 주세요."
      : `${context.clientName} 의뢰인의 사건에 대해 분석해 주세요.`;

  return callClaude(prompt, userMessage);
}

/**
 * 6개 AI 에이전트 병렬 실행 훅
 *
 * - 모든 에이전트를 Promise.allSettled로 병렬 실행
 * - 각 에이전트 진행 상태를 개별 추적
 * - STT 에이전트는 RTZR 폴링 -> 실패 시 Claude 폴백
 */
export default function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Record<AgentId, AgentState>>(
    createInitialStates,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<AgentStep>("idle");
  const [classifiedCaseType, setClassifiedCaseType] = useState<CaseType | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  /** 특정 에이전트 상태 업데이트 */
  const updateAgent = useCallback(
    (id: AgentId, update: Partial<AgentState>) => {
      setAgents((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...update },
      }));
    },
    [],
  );

  /** 모든 에이전트 초기화 */
  const resetAgents = useCallback(() => {
    setAgents(createInitialStates());
    setIsRunning(false);
    setCurrentStep("idle");
  }, []);

  /** 6개 에이전트 병렬 실행 */
  const runAllAgents = useCallback(
    async (
      context: RunAgentsContext,
    ): Promise<Record<AgentId, AgentState>> => {
      setIsRunning(true);
      setCurrentStep("running");

      // 모든 에이전트를 running 상태로 전환
      const runningStates = createInitialStates();
      for (const id of AGENT_IDS) {
        runningStates[id] = { id, status: "running", result: "" };
      }
      setAgents(runningStates);

      // 병렬 실행
      const promises = AGENT_IDS.map(async (agentId) => {
        try {
          const result = await runSingleAgent(agentId, context);
          const successState: AgentState = {
            id: agentId,
            status: "completed",
            result,
          };
          updateAgent(agentId, successState);
          return successState;
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "알 수 없는 오류";
          const errorState: AgentState = {
            id: agentId,
            status: "error",
            result: "",
            error: errorMessage,
          };
          updateAgent(agentId, errorState);
          return errorState;
        }
      });

      const results = await Promise.allSettled(promises);

      // 최종 상태 구성
      const finalStates = { ...runningStates };
      results.forEach((result, index) => {
        const agentId = AGENT_IDS[index];
        if (result.status === "fulfilled") {
          finalStates[agentId] = result.value;
        } else {
          finalStates[agentId] = {
            id: agentId,
            status: "error",
            result: "",
            error: String(result.reason),
          };
        }
      });

      setAgents(finalStates);
      setIsRunning(false);

      // 하나라도 에러가 있으면 error, 아니면 completed
      const hasError = Object.values(finalStates).some(
        (s) => s.status === "error",
      );
      setCurrentStep(hasError ? "error" : "completed");

      // 에이전트 완료 후 사건 유형 자동 분류
      const analysisResult = finalStates.analysis?.result;
      if (analysisResult && !context.caseType) {
        setIsClassifying(true);
        try {
          const prompt = buildCaseTypeClassificationPrompt(context.caseDesc, analysisResult);
          const result = await callClaude(prompt, "이 사건의 유형을 분류해 주세요.");
          const trimmed = result.trim();
          const matched = CASE_TYPES.find((t) => trimmed.includes(t));
          setClassifiedCaseType(matched ?? "기타");
        } catch {
          setClassifiedCaseType("기타");
        } finally {
          setIsClassifying(false);
        }
      }

      return finalStates;
    },
    [updateAgent],
  );

  return {
    agents,
    isRunning,
    currentStep,
    classifiedCaseType,
    isClassifying,
    runAllAgents,
    resetAgents,
  };
}
