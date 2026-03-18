// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, 적법성 검증, STT, 쟁점 분석, 문서 작성, 검토·감수

import { useState, useCallback } from "react";
import { callClaude } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt } from "../services/prompts";
import { pollTranscription, formatTranscript } from "../services/rtzr";
import { formatRAGContext } from "../services/rag";
import { SearchPool } from "../services/search-pool";
import {
  searchLatestPrecedents,
  formatPrecedentsForPrompt,
  searchConstitutionalDecisions,
  formatConstitutionalForPrompt,
  searchLegalInterpretations,
  formatInterpretationsForPrompt,
} from "../services/precedent-api";
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
  searchPool: SearchPool,
): Promise<string> {
  // STT 에이전트: transcribeId가 있으면 RTZR 폴링, 없으면 안내 메시지
  if (agentId === "stt") {
    if (!context.transcribeId) {
      return "음성 파일이 없어 음성 변환을 수행하지 않았습니다.";
    }

    const POLL_INTERVAL = 3000; // 3초
    const MAX_POLLS = 120; // 최대 6분
    const MAX_TRANSIENT_ERRORS = 5; // 일시적 오류 허용 횟수
    let transientErrors = 0;

    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const result = await pollTranscription(context.transcribeId);
        transientErrors = 0; // 성공 시 카운터 리셋

        if (result.status === "completed" && result.utterances) {
          return formatTranscript(result.utterances);
        }

        if (result.status === "failed") {
          return "음성 변환에 실패했습니다. 녹음 파일을 확인해 주세요.";
        }
      } catch (err) {
        transientErrors++;
        console.warn(`[STT] 폴링 오류 (${transientErrors}/${MAX_TRANSIENT_ERRORS}):`, err instanceof Error ? err.message : err);
        if (transientErrors >= MAX_TRANSIENT_ERRORS) {
          return "음성 변환 중 네트워크 오류가 반복되었습니다. 잠시 후 다시 시도해 주세요.";
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    return "음성 변환 시간이 초과되었습니다. 녹음 파일을 확인해 주세요.";
  }

  // RAG 벡터 검색 결과 가져오기 (SearchPool로 중복 제거, 실패해도 기존 동작 유지)
  let ragContext = "";
  try {
    const ragResults = await searchPool.getForAgent(agentId);
    ragContext = formatRAGContext(ragResults);
  } catch (err) {
    console.warn(`[${agentId}] RAG 검색 실패:`, err instanceof Error ? err.message : err);
  }

  // precedent 에이전트: 법제처 실시간 판례·헌재결정례 검색 (실패 시 graceful degradation)
  // legal 에이전트: 법령해석례 검색 추가 (실패 시 graceful degradation)
  let latestPrecedents = "";
  let constitutionalDecisions = "";
  let legalInterpretations = "";

  if (agentId === "precedent") {
    const searchQuery = context.caseType
      ? `${context.caseType} ${context.caseDesc}`
      : context.caseDesc;

    // 판례 + 헌재결정례를 병렬로 검색
    const [precedentResults, detcResults] = await Promise.allSettled([
      searchLatestPrecedents(searchQuery, 5),
      searchConstitutionalDecisions(searchQuery, 3),
    ]);

    if (precedentResults.status === "fulfilled") {
      const precedents = precedentResults.value;
      latestPrecedents = formatPrecedentsForPrompt(precedents);
      if (precedents.length === 0) {
        console.warn("[precedent] 법제처 판례 검색 결과 0건 — AI 학습 데이터 기반으로 판례 검색합니다.");
      }
    } else {
      console.warn("[precedent] 법제처 판례 API 실패:", precedentResults.reason);
    }

    if (detcResults.status === "fulfilled") {
      constitutionalDecisions = formatConstitutionalForPrompt(detcResults.value);
      if (detcResults.value.length === 0) {
        console.warn("[precedent] 헌재결정례 검색 결과 0건");
      }
    } else {
      console.warn("[precedent] 헌재결정례 API 실패:", detcResults.reason);
    }
  }

  if (agentId === "legal") {
    // 적법성 검증 시 공식 법령해석례 보강
    const searchQuery = context.caseType
      ? `${context.caseType} ${context.caseDesc}`
      : context.caseDesc;
    try {
      const interpretations = await searchLegalInterpretations(searchQuery, 3);
      legalInterpretations = formatInterpretationsForPrompt(interpretations);
      if (interpretations.length === 0) {
        console.warn("[legal] 법령해석례 검색 결과 0건");
      }
    } catch (err) {
      console.warn("[legal] 법령해석례 API 실패:", err instanceof Error ? err.message : err);
    }
  }

  // 일반 에이전트: Claude API 호출
  // docgen 에이전트는 체크포인트 질문 생성 단계에서 docgen_questions 프롬프트 사용
  const promptId = agentId === "docgen" ? "docgen_questions" : agentId;
  const contextWithRAG: RunAgentsContext = {
    ...context,
    ...(ragContext ? { ragContext } : {}),
    ...(latestPrecedents ? { latestPrecedents } : {}),
    ...(constitutionalDecisions ? { constitutionalDecisions } : {}),
    ...(legalInterpretations ? { legalInterpretations } : {}),
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

      // SearchPool 생성: 1회 검색 → 에이전트 간 공유 (쿼리 중복 제거)
      const searchPool = new SearchPool(context.caseDesc, context.caseType as string | undefined);

      // 병렬 실행
      const promises = AGENT_IDS.map(async (agentId) => {
        try {
          const result = await runSingleAgent(agentId, context, searchPool);
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
