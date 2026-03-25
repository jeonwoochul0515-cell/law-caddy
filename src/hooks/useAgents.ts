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
  getPrecedentDetail,
  formatPrecedentsForPrompt,
  searchConstitutionalDecisions,
  formatConstitutionalForPrompt,
  searchLegalInterpretations,
  formatInterpretationsForPrompt,
} from "../services/precedent-api";
import type { AgentContext } from "../services/prompts";
import type { AgentId, AgentState, CaseType } from "../types/agent";
import { CASE_TYPES } from "../config/constants";

/**
 * AI로 사건 텍스트에서 판례 검색 키워드를 추출합니다.
 * Claude Haiku로 빠르게 핵심 쟁점 + 검색어를 생성합니다.
 */
async function extractSearchKeywordsWithAI(
  caseDesc: string,
  caseType?: string,
  fileContents?: string,
): Promise<string[]> {
  const allText = [caseDesc, fileContents].filter(Boolean).join("\n\n");
  if (!allText.trim()) return caseType ? [caseType] : [];

  // 텍스트를 충분히 제공 (쟁점 파악을 위해)
  const truncated = allText.slice(0, 6000);

  try {
    const result = await callClaude(
      `당신은 한국 법률 판례 검색 전문가입니다.
주어진 사건 내용(판결문, 준비서면, 상담 내용 등)을 분석하여:
1. 핵심 쟁점을 모두 파악하고
2. 각 쟁점에 대해 법제처(law.go.kr) 판례 검색에 최적화된 검색어를 추출하세요.

규칙:
- 반드시 JSON 배열로만 응답 (다른 텍스트 없이)
- 쟁점별로 1~2개씩, 총 8~15개의 검색어 추출
- 각 검색어는 1~3단어 (법제처 API는 짧은 키워드가 검색률이 높음)
- 법률 용어 사용 (예: "손해배상", "국가배상", "위자료", "보안처분")
- 동일 쟁점을 다른 각도로 검색할 수 있도록 유사 키워드도 포함
  예: "부당해고" + "해고무효" / "위자료" + "정신적 손해"
- 너무 포괄적인 용어(예: "민사", "형사", "판결") 단독 사용 금지

예시: 국가배상 사건의 경우
["국가배상", "손해배상 국가", "위자료", "보안처분 불법", "가족 손해배상청구권", "석방 후 감시", "형사보상금 공제", "위자료 산정기준", "불법행위 공무원"]`,
      `${caseType ? `[사건 유형: ${caseType}]\n` : ""}${truncated}`,
    );

    const jsonMatch = result.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const keywords = JSON.parse(jsonMatch[0]) as string[];
      const filtered = keywords.filter((k) => typeof k === "string" && k.length >= 2).slice(0, 15);
      console.log("[AI 키워드 추출] 결과:", filtered);
      return filtered;
    }
  } catch (err) {
    console.warn("[AI 키워드 추출] 실패, 폴백:", err);
  }

  // AI 실패 시 기본 폴백
  return caseType ? [caseType] : ["손해배상"];
}

/** 에이전트 실행 컨텍스트 (STT 폴링용 transcribeId 포함) */
interface RunAgentsContext extends AgentContext {
  transcribeId?: string;
}

/** 에이전트 실행 단계 */
type AgentStep = "idle" | "running" | "completed" | "error";

/** sessionStorage 캐시 키 */
const AGENTS_CACHE_KEY = "law-caddy-agents-results";

/** 캐시 데이터 구조 */
interface AgentsCacheData {
  agents: Record<AgentId, AgentState>;
  classifiedCaseType: CaseType | null;
  clientName: string;
  timestamp: number;
}

/** useAgents 반환 타입 */
interface UseAgentsReturn {
  agents: Record<AgentId, AgentState>;
  isRunning: boolean;
  currentStep: AgentStep;
  classifiedCaseType: CaseType | null;
  isClassifying: boolean;
  runAllAgents: (context: RunAgentsContext) => Promise<Record<AgentId, AgentState>>;
  resetAgents: () => void;
  restoreFromCache: (clientName: string) => boolean;
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
    // 1단계: AI로 쟁점 파악 + 쟁점별 검색어 생성
    const keywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType, context.fileContents);
    console.log("[precedent] AI 추출 검색 키워드:", keywords);

    // 2단계: 키워드별 개별 검색 (법제처 API는 단일 키워드가 정확도 높음)
    const allPrecedents: Awaited<ReturnType<typeof searchLatestPrecedents>> = [];
    const allDetc: Awaited<ReturnType<typeof searchConstitutionalDecisions>> = [];
    const seen = new Set<string>();

    // 키워드를 4개씩 배치로 병렬 검색 (API 부하 분산)
    for (let i = 0; i < keywords.length; i += 4) {
      const batch = keywords.slice(i, i + 4);
      await Promise.allSettled(batch.map(async (kw) => {
        try {
          const [precs, detcs] = await Promise.allSettled([
            searchLatestPrecedents(kw, 5),
            searchConstitutionalDecisions(kw, 3),
          ]);
          if (precs.status === "fulfilled") {
            for (const p of precs.value) {
              if (!seen.has(p.caseNumber)) {
                seen.add(p.caseNumber);
                allPrecedents.push(p);
              }
            }
          }
          if (detcs.status === "fulfilled") {
            for (const d of detcs.value) {
              if (!seen.has(d.caseNumber)) {
                seen.add(d.caseNumber);
                allDetc.push(d);
              }
            }
          }
        } catch (err) {
          console.warn(`[precedent] "${kw}" 검색 실패:`, err);
        }
      }));
    }

    // 3단계: 상위 20건의 상세 내용 조회 (판시사항, 판결요지, 판례내용)
    const topPrecedents = allPrecedents.slice(0, 20);
    if (topPrecedents.length > 0) {
      console.log(`[precedent] ${topPrecedents.length}건 상세 조회 중...`);
      // 5건씩 병렬 조회 (API 부하 분산)
      for (let i = 0; i < topPrecedents.length; i += 5) {
        const batch = topPrecedents.slice(i, i + 5);
        const detailResults = await Promise.allSettled(
          batch.map((p) =>
            p.serialNumber ? getPrecedentDetail(p.serialNumber) : Promise.resolve(null)
          ),
        );
        for (let j = 0; j < detailResults.length; j++) {
          const r = detailResults[j];
          if (r.status === "fulfilled" && r.value) {
            topPrecedents[i + j] = { ...topPrecedents[i + j], ...r.value };
          }
        }
      }
    }

    latestPrecedents = formatPrecedentsForPrompt(topPrecedents);
    constitutionalDecisions = formatConstitutionalForPrompt(allDetc.slice(0, 5));

    console.log(`[precedent] 판례 ${allPrecedents.length}건 (상세 ${topPrecedents.length}건), 헌재 ${allDetc.length}건`);
    if (allPrecedents.length === 0) {
      console.warn("[precedent] 법제처 판례 검색 결과 0건 — AI 학습 데이터 기반으로 판례 검색합니다.");
    }
  }

  if (agentId === "legal") {
    // 적법성 검증 시 공식 법령해석례 보강
    const legalKeywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType, context.fileContents);
    const legalKw = legalKeywords[0] || "법령해석";
    try {
      const interpretations = await searchLegalInterpretations(legalKw, 3);
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
    setClassifiedCaseType(null);
  }, []);

  /** sessionStorage에서 이전 에이전트 결과 복원 */
  const restoreFromCache = useCallback((clientName: string): boolean => {
    try {
      const cached = sessionStorage.getItem(AGENTS_CACHE_KEY);
      if (!cached) return false;
      const data = JSON.parse(cached) as AgentsCacheData;
      // 같은 의뢰인의 결과인지 확인 (30분 이내)
      if (data.clientName !== clientName) return false;
      if (Date.now() - data.timestamp > 30 * 60 * 1000) return false;
      // 모든 에이전트가 완료 상태인지 확인
      const allDone = Object.values(data.agents).every(
        (a) => a.status === "completed" || a.status === "error",
      );
      if (!allDone) return false;
      setAgents(data.agents);
      setClassifiedCaseType(data.classifiedCaseType);
      setCurrentStep("completed");
      setIsRunning(false);
      return true;
    } catch {
      return false;
    }
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
      let caseType: CaseType | null = null;
      if (analysisResult && !context.caseType) {
        setIsClassifying(true);
        try {
          const prompt = buildCaseTypeClassificationPrompt(context.caseDesc, analysisResult);
          const result = await callClaude(prompt, "이 사건의 유형을 분류해 주세요.");
          const trimmed = result.trim();
          const matched = CASE_TYPES.find((t) => trimmed.includes(t));
          caseType = matched ?? "기타";
          setClassifiedCaseType(caseType);
        } catch {
          caseType = "기타";
          setClassifiedCaseType(caseType);
        } finally {
          setIsClassifying(false);
        }
      }

      // 결과를 sessionStorage에 캐시 (다음 방문 시 복원용)
      try {
        const cacheData: AgentsCacheData = {
          agents: finalStates,
          classifiedCaseType: caseType ?? (context.caseType as CaseType) ?? null,
          clientName: context.clientName,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(AGENTS_CACHE_KEY, JSON.stringify(cacheData));
      } catch { /* quota */ }

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
    restoreFromCache,
  };
}
