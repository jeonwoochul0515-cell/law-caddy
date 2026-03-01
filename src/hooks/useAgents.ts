// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, 적법성 검증, STT, 쟁점 분석, 문서 작성, 검토·감수
// 데모 모드: Claude API 없이 목(mock) 결과를 1~2초 지연 후 반환

import { useState, useCallback } from "react";
import { isDemoMode, getDemoAgentResults } from "../config/demo";
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

/**
 * 데모 모드에서 에이전트 실행을 시뮬레이션합니다.
 * 사건 컨텍스트에 맞는 카테고리별 목(mock) 결과를 1~2초 지연 후 반환합니다.
 */
function runDemoAgent(
  agentId: AgentId,
  context: RunAgentsContext,
): Promise<string> {
  const delayMs = 1000 + Math.random() * 1000; // 1~2초
  return new Promise((resolve) => {
    setTimeout(() => {
      const results = getDemoAgentResults(context);
      resolve(results[agentId] || "");
    }, delayMs);
  });
}

// ---------------------------------------------------------------------------
// 실제 에이전트 실행 (Firebase/Claude 연동)
// ---------------------------------------------------------------------------

/**
 * 단일 에이전트 실행 (STT 에이전트 특수 처리 포함)
 */
async function runSingleAgent(
  agentId: AgentId,
  context: RunAgentsContext,
): Promise<string> {
  // 데모 모드: 사건 컨텍스트에 맞는 목 데이터로 시뮬레이션
  if (isDemoMode) {
    return runDemoAgent(agentId, context);
  }

  // STT 에이전트: transcribeId가 있으면 RTZR 폴링, 없으면 Claude 폴백
  if (agentId === "stt" && context.transcribeId) {
    const POLL_INTERVAL = 3000; // 3초
    const MAX_POLLS = 120; // 최대 6분

    for (let i = 0; i < MAX_POLLS; i++) {
      const result = await pollTranscription(context.transcribeId);

      if (result.status === "completed" && result.utterances) {
        return formatTranscript(result.utterances);
      }

      if (result.status === "failed") {
        // RTZR 실패 시 Claude 폴백
        break;
      }

      // 다음 폴링 대기
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    // RTZR 실패 또는 시간 초과 -> Claude 폴백
    const prompt = buildPrompt("stt", context);
    return callClaude(prompt, "상담 대화록을 생성해 주세요.");
  }

  // 일반 에이전트: Claude API 호출
  // docgen 에이전트는 체크포인트 질문 생성 단계에서 docgen_questions 프롬프트 사용
  const promptId = agentId === "docgen" ? "docgen_questions" : agentId;
  const prompt = buildPrompt(promptId, context);

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
 * - 데모 모드에서는 1~2초 지연 후 목(mock) 결과 반환
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
          if (isDemoMode) {
            // 데모 모드: 사건 개요에서 키워드로 유형 추정
            await new Promise((resolve) => setTimeout(resolve, 800));
            const desc = context.caseDesc;
            if (desc.includes("부동산") || desc.includes("매매") || desc.includes("등기")) {
              setClassifiedCaseType("부동산");
            } else if (desc.includes("이혼") || desc.includes("양육") || desc.includes("위자료")) {
              setClassifiedCaseType("가사");
            } else if (desc.includes("해고") || desc.includes("퇴직") || desc.includes("근로")) {
              setClassifiedCaseType("노동");
            } else if (desc.includes("채권") || desc.includes("채무") || desc.includes("대여금")) {
              setClassifiedCaseType("채권·채무");
            } else if (desc.includes("손해") || desc.includes("배상")) {
              setClassifiedCaseType("손해배상");
            } else if (desc.includes("고소") || desc.includes("피해") || desc.includes("형사")) {
              setClassifiedCaseType("형사");
            } else {
              setClassifiedCaseType("민사");
            }
          } else {
            const prompt = buildCaseTypeClassificationPrompt(context.caseDesc, analysisResult);
            const result = await callClaude(prompt, "이 사건의 유형을 분류해 주세요.");
            const trimmed = result.trim();
            const matched = CASE_TYPES.find((t) => trimmed.includes(t));
            setClassifiedCaseType(matched ?? "기타");
          }
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
