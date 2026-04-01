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
import type { AgentId, AgentState, CaseType, IssueWithKeywords } from "../types/agent";
import { CASE_TYPES } from "../config/constants";

/** 법률 키워드 사전 — AI 실패 시 텍스트에서 매칭하여 폴백 키워드 생성 */
const LEGAL_KEYWORD_PATTERNS: Array<[string, string[]]> = [
  ["손해배상", ["손해배상", "불법행위"]],
  ["부당공동행위", ["부당공동행위", "공정거래"]],
  ["부당해고", ["부당해고", "해고무효"]],
  ["이혼", ["이혼", "재산분할"]],
  ["임대차", ["임대차", "보증금반환"]],
  ["사기", ["사기", "기망행위"]],
  ["횡령", ["횡령", "배임"]],
  ["명예훼손", ["명예훼손", "손해배상"]],
  ["채무불이행", ["채무불이행", "계약해제"]],
  ["근로계약", ["근로계약", "임금청구"]],
  ["상속", ["상속", "유류분"]],
  ["가압류", ["가압류", "보전처분"]],
  ["특허", ["특허침해", "지식재산"]],
  ["교통사고", ["교통사고", "과실비율"]],
  ["의료", ["의료과실", "의료소송"]],
];

/**
 * AI 실패 시 텍스트에서 법률 키워드를 매칭하여 폴백 쟁점을 생성합니다.
 */
function extractFallbackKeywords(text: string, caseType?: string): IssueWithKeywords[] {
  const matched: IssueWithKeywords[] = [];
  let id = 1;

  for (const [keyword, searchTerms] of LEGAL_KEYWORD_PATTERNS) {
    if (text.includes(keyword)) {
      matched.push({
        id: id++,
        issue: keyword,
        description: "텍스트 키워드 기반 검색",
        keywords: searchTerms,
        priority: id <= 2 ? "high" : "medium",
      });
      if (matched.length >= 3) break;
    }
  }

  // 매칭 없으면 사건 유형이라도 사용
  if (matched.length === 0 && caseType) {
    matched.push({ id: 1, issue: caseType, description: "사건 유형 기반 검색", keywords: [caseType], priority: "high" });
  }

  // 그래도 없으면 사건유형 또는 기본 키워드 사용
  // (텍스트에서 임의 명사 추출은 "김서규의", "소송대리인" 같은 쓰레기 키워드가 나오므로 제거)
  if (matched.length === 0) {
    matched.push({ id: 1, issue: "민사분쟁", description: "기본 검색", keywords: ["손해배상", "채무불이행"], priority: "high" });
  }

  console.log("[쟁점 분석] 폴백 키워드:", matched.map((m) => `${m.issue} → ${m.keywords.join(", ")}`));
  return matched;
}

/** 에이전트 실행 컨텍스트 (STT 폴링용 transcribeId 포함) */
interface RunAgentsContext extends AgentContext {
  transcribeId?: string;
  /** AI 추출 검색 키워드 (runAllAgents에서 1회 추출 → 에이전트 간 공유) */
  searchKeywords?: string[];
  /** 쟁점 분석 결과 (runAllAgents에서 1회 분석 → 에이전트 간 공유) */
  identifiedIssues?: IssueWithKeywords[];
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
    // 쟁점별 판례 검색 (쟁점은 runAllAgents에서 1회 분석하여 공유)
    // 법제처 API는 동시 요청에 취약 → 순차 처리 + 요청 간 딜레이
    const issues = context.identifiedIssues ?? [];
    console.log("[precedent] 쟁점", issues.length, "건으로 판례 검색");

    const issueSections: string[] = [];
    const allDetc: Awaited<ReturnType<typeof searchConstitutionalDecisions>> = [];
    const seen = new Set<string>();
    let totalPrecedents = 0;

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 쟁점별 순차 검색 (법제처 API 과부하 방지)
    for (const issue of issues) {
      const issuePrecedents: Awaited<ReturnType<typeof searchLatestPrecedents>> = [];

      // 키워드도 순차 처리 (동시 요청 최소화)
      for (const kw of issue.keywords) {
        try {
          const precs = await searchLatestPrecedents(kw, 15);
          for (const p of precs) {
            if (!seen.has(p.caseNumber)) { seen.add(p.caseNumber); issuePrecedents.push(p); }
          }
          await delay(300); // 법제처 서버 부하 방지
          const detcs = await searchConstitutionalDecisions(kw, 2);
          for (const d of detcs) {
            if (!seen.has(d.caseNumber)) { seen.add(d.caseNumber); allDetc.push(d); }
          }
          await delay(300);
        } catch (err) {
          console.warn(`[precedent] "${kw}" 검색 실패:`, err);
        }
      }

      // 쟁점당 상위 3건 상세 조회 (순차)
      const topForIssue = issuePrecedents.slice(0, 3);
      for (let j = 0; j < topForIssue.length; j++) {
        if (!topForIssue[j].serialNumber) continue;
        try {
          const detail = await getPrecedentDetail(topForIssue[j].serialNumber);
          if (detail) topForIssue[j] = { ...topForIssue[j], ...detail };
          await delay(300);
        } catch {
          console.warn(`[precedent] 상세 조회 실패: ${topForIssue[j].caseNumber}`);
        }
      }

      totalPrecedents += issuePrecedents.length;
      console.log(`[precedent] 쟁점 ${issue.id} "${issue.issue}" → ${issuePrecedents.length}건 (상세 ${topForIssue.length}건)`);

      if (topForIssue.length > 0) {
        const header = `## 쟁점 ${issue.id}: ${issue.issue} [${issue.priority.toUpperCase()}]\n${issue.description}`;
        const body = formatPrecedentsForPrompt(topForIssue);
        issueSections.push(`${header}\n\n${body}`);
      }
    }

    latestPrecedents = issueSections.join("\n\n---\n\n");
    constitutionalDecisions = formatConstitutionalForPrompt(allDetc.slice(0, 5));

    console.log(`[precedent] 총 ${totalPrecedents}건 (쟁점 ${issues.length}개), 헌재 ${allDetc.length}건`);
    if (totalPrecedents === 0) {
      console.warn("[precedent] 법제처 판례 검색 결과 0건 — AI 학습 데이터 기반으로 판례 검색합니다.");
    }
  }

  if (agentId === "legal") {
    // 공유 키워드에서 첫 번째 사용
    const legalKw = context.searchKeywords?.[0] || "법령해석";
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

  /**
   * 2단계 파이프라인 에이전트 실행
   *
   * [Stage 1] stt + analysis + legal + docgen + review (5개 병렬)
   *    ↓ analysis 완료 후
   * [Stage 2] precedent (analysis 결과의 정제된 쟁점으로 타겟 검색)
   */
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

      // SearchPool 생성: Stage 1 에이전트들만 RAG 검색 공유 (precedent 제외)
      const searchPool = new SearchPool(context.caseDesc, context.caseType as string | undefined);

      // Stage 1 컨텍스트 (analyzeIssuesWithAI 호출 없이 혜안에 통합)
      const contextForStage1 = { ...context };

      // ─── Stage 1: precedent 제외 4개 에이전트 병렬 실행 (감수는 Stage 3으로 이동) ───
      const STAGE1_AGENTS: AgentId[] = ["stt", "analysis", "legal", "docgen"];
      console.log("[Stage 1] 4개 에이전트 병렬 실행:", STAGE1_AGENTS.join(", "));

      const runAgent = async (agentId: AgentId, ctx: RunAgentsContext): Promise<AgentState> => {
        try {
          const result = await runSingleAgent(agentId, ctx, searchPool);
          const state: AgentState = { id: agentId, status: "completed", result };
          updateAgent(agentId, state);
          return state;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
          const state: AgentState = { id: agentId, status: "error", result: "", error: errorMessage };
          updateAgent(agentId, state);
          return state;
        }
      };

      const stage1Results = await Promise.allSettled(
        STAGE1_AGENTS.map((id) => runAgent(id, contextForStage1)),
      );

      // ─── Stage 1 완료 후: 혜안(analysis) 결과에서 쟁점 + 검색 키워드 파싱 ───
      const analysisState = stage1Results.find(
        (r, i) => STAGE1_AGENTS[i] === "analysis" && r.status === "fulfilled" && r.value.status === "completed",
      );
      const analysisResult = analysisState?.status === "fulfilled" ? analysisState.value.result : "";

      let identifiedIssues: IssueWithKeywords[] = [];
      let searchKeywords: string[] = [];

      if (analysisResult) {
        // 혜안 결과에서 JSON 배열 파싱 (쟁점 + 키워드)
        const issuesMatch = analysisResult.match(/\[[\s\S]*?\]/);
        if (issuesMatch) {
          try {
            // eslint-disable-next-line no-control-regex
            const ctrlRegex = /[\x00-\x1F\x7F]/g;
            const cleaned = issuesMatch[0]
              .replace(ctrlRegex, " ")
              .replace(/,\s*([}\]])/g, "$1")
              .replace(/'/g, '"')
              .trim();
            const parsed = JSON.parse(cleaned) as IssueWithKeywords[];
            const valid = parsed.filter((i) => i.issue && i.keywords?.length > 0);
            if (valid.length > 0) {
              identifiedIssues = valid;
              searchKeywords = identifiedIssues.flatMap((i) => i.keywords);
              console.log("[Stage 1] 혜안 결과에서 쟁점 파싱 성공:", identifiedIssues.map((i) => `${i.issue} → ${i.keywords.join(", ")}`));
            }
          } catch (err) {
            console.warn("[Stage 1] 혜안 결과 JSON 파싱 실패, 폴백 사용:", err);
          }
        }
      }

      // 파싱 실패 시 폴백 키워드 사용
      if (identifiedIssues.length === 0) {
        identifiedIssues = extractFallbackKeywords(context.caseDesc, context.caseType);
        searchKeywords = identifiedIssues.flatMap((i) => i.keywords);
        console.log("[Stage 1] 폴백 키워드 사용:", searchKeywords);
      }

      // ─── Stage 2: 혜안 결과의 쟁점으로 precedent 실행 ───
      const precedentContext: RunAgentsContext = {
        ...context,
        searchKeywords,
        identifiedIssues,
      };

      console.log("[Stage 2] precedent 에이전트 실행 (키워드:", searchKeywords.join(", "), ")");
      const precedentState = await runAgent("precedent", precedentContext);

      // ─── 최종 상태 구성 ───
      const finalStates = { ...runningStates };

      // Stage 1 결과 반영
      stage1Results.forEach((result, index) => {
        const agentId = STAGE1_AGENTS[index];
        if (result.status === "fulfilled") {
          finalStates[agentId] = result.value;
        } else {
          finalStates[agentId] = {
            id: agentId, status: "error", result: "", error: String(result.reason),
          };
        }
      });

      // Stage 2 결과 반영
      finalStates.precedent = precedentState;

      // ─── Stage 3: 감수 실행 (모든 에이전트 결과를 받아 3중 검증) ───
      console.log("[Stage 3] 감수 에이전트 실행");
      const reviewContext: RunAgentsContext = {
        ...contextForStage1,
        searchKeywords,
        identifiedIssues,
      };
      finalStates.review = await runAgent("review", reviewContext);

      setAgents(finalStates);
      setIsRunning(false);

      // 하나라도 에러가 있으면 error, 아니면 completed
      const hasError = Object.values(finalStates).some(
        (s) => s.status === "error",
      );
      setCurrentStep(hasError ? "error" : "completed");

      // 에이전트 완료 후 사건 유형 자동 분류
      const classificationInput = finalStates.analysis?.result;
      let caseType: CaseType | null = null;
      if (classificationInput && !context.caseType) {
        setIsClassifying(true);
        try {
          const prompt = buildCaseTypeClassificationPrompt(context.caseDesc, classificationInput);
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
