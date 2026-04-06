// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, 적법성 검증, STT, 쟁점 분석, 문서 작성, 검토·감수

import { useState, useCallback } from "react";
import { callClaude } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt } from "../services/prompts";
import { pollTranscription, formatTranscript } from "../services/rtzr";
import {
  searchLatestPrecedents,
  getPrecedentDetail,
  formatPrecedentsForPrompt,
  searchConstitutionalDecisions,
  formatConstitutionalForPrompt,
  searchLegalInterpretations,
  formatInterpretationsForPrompt,
  searchStatutes,
  formatStatutesForPrompt,
  searchLegalTerms,
  formatLegalTermsForPrompt,
} from "../services/precedent-api";
import type { PrecedentCase, ConstitutionalDecision } from "../services/precedent-api";
import type { AgentContext } from "../services/prompts";
import type { AgentId, AgentState, CaseType } from "../types/agent";
import type { CaseRef } from "../types/document";
import { CASE_TYPES } from "../config/constants";

/** 사건 정보에서 법제처 API 검색 키워드를 추출합니다 (규칙 기반, Claude 호출 없음) */
function extractSearchKeywords(caseDesc: string, caseType?: string): string[] {
  const keywords: string[] = [];
  const KW_MAP: Array<[string, string[]]> = [
    ["손해배상", ["손해배상"]], ["부당해고", ["부당해고"]], ["해고", ["부당해고"]],
    ["이혼", ["이혼 재산분할"]], ["임대차", ["임대차보증금 반환"]], ["전세", ["전세금 반환"]],
    ["사기", ["사기", "편취"]], ["횡령", ["횡령"]], ["배임", ["배임"]],
    ["명예훼손", ["명예훼손"]], ["채무", ["채무불이행"]], ["계약", ["계약해제"]],
    ["상속", ["상속"]], ["가압류", ["가압류"]], ["교통사고", ["교통사고"]],
    ["의료", ["의료과실"]], ["특허", ["특허침해"]], ["부동산", ["부동산 매매"]],
    ["임금", ["체불임금"]], ["퇴직", ["퇴직금"]], ["폭행", ["폭행"]],
    ["성범죄", ["성범죄"]], ["마약", ["마약"]], ["음주운전", ["음주운전"]],
  ];

  for (const [pattern, kws] of KW_MAP) {
    if (caseDesc.includes(pattern)) {
      keywords.push(...kws);
      if (keywords.length >= 3) break;
    }
  }

  // 사건 유형 기반 폴백
  if (keywords.length === 0 && caseType) {
    const TYPE_MAP: Record<string, string[]> = {
      "민사": ["손해배상"], "형사": ["형사"], "가사": ["이혼"],
      "행정": ["행정처분"], "노동": ["부당해고"], "부동산": ["부동산"],
      "채권·채무": ["채무불이행"], "손해배상": ["손해배상"],
    };
    keywords.push(...(TYPE_MAP[caseType] ?? ["손해배상"]));
  }

  if (keywords.length === 0) keywords.push("손해배상");
  return keywords.slice(0, 3);
}

/** 텍스트에서 특정 키를 포함하는 최상위 JSON 객체를 추출 (중첩 bracket 지원) */
function extractTopLevelJsonObject(text: string, key: string): string | null {
  const keyPattern = `"${key}"`;
  const keyIdx = text.indexOf(keyPattern);
  if (keyIdx === -1) return null;
  // keyIdx 이전의 가장 가까운 { 찾기
  let start = -1;
  for (let i = keyIdx - 1; i >= 0; i--) {
    if (text[i] === "{") { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}


/** 에이전트 실행 컨텍스트 (STT 폴링용 transcribeId 포함) */
interface RunAgentsContext extends AgentContext {
  transcribeId?: string;
  /** 한판서가 검증한 판례 참조 목록 */
  caseRefs?: CaseRef[];
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

  // ─── 법제처 API 검색 (한판서·윤율무·서혜안만, 실패해도 Claude만으로 동작) ───
  const enrichedContext = { ...context };
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  if (agentId === "precedent") {
    // 한판서: 판례 + 헌재결정례 검색
    const keywords = extractSearchKeywords(context.caseDesc, context.caseType);
    console.log(`[한판서] 법제처 검색 키워드: ${keywords.join(", ")}`);
    let allPrecedents: PrecedentCase[] = [];
    const allDetc: ConstitutionalDecision[] = [];
    const seen = new Set<string>();

    for (const kw of keywords) {
      try {
        const precs = await searchLatestPrecedents(kw, 5);
        for (const p of precs) {
          if (!seen.has(p.caseNumber)) { seen.add(p.caseNumber); allPrecedents.push(p); }
        }
        await delay(300);
        const detcs = await searchConstitutionalDecisions(kw, 2);
        for (const d of detcs) {
          if (!seen.has(d.caseNumber)) { seen.add(d.caseNumber); allDetc.push(d); }
        }
        await delay(300);
      } catch (err) {
        console.warn(`[한판서] "${kw}" 검색 실패:`, err);
      }
    }

    // 상위 5건 상세 조회
    const top = allPrecedents.slice(0, 5);
    for (let j = 0; j < top.length; j++) {
      if (!top[j].serialNumber) continue;
      try {
        const detail = await getPrecedentDetail(top[j].serialNumber);
        if (detail) top[j] = { ...top[j], ...detail };
        await delay(300);
      } catch { /* continue */ }
    }
    allPrecedents = top;

    if (allPrecedents.length > 0) {
      enrichedContext.latestPrecedents = formatPrecedentsForPrompt(allPrecedents);
      console.log(`[한판서] 법제처 판례 ${allPrecedents.length}건 확보`);
    }
    if (allDetc.length > 0) {
      enrichedContext.constitutionalDecisions = formatConstitutionalForPrompt(allDetc.slice(0, 3));
      console.log(`[한판서] 헌재결정례 ${allDetc.length}건 확보`);
    }
  }

  if (agentId === "legal") {
    // 윤율무: 법령해석례 + 현행법령 검색
    const keywords = extractSearchKeywords(context.caseDesc, context.caseType);
    try {
      const interps = await searchLegalInterpretations(keywords[0] ?? "법령해석", 3);
      if (interps.length > 0) {
        enrichedContext.legalInterpretations = formatInterpretationsForPrompt(interps);
        console.log(`[윤율무] 법령해석례 ${interps.length}건 확보`);
      }
      await delay(300);
      const statutes = await searchStatutes(keywords[0] ?? "법령", 3);
      if (statutes.length > 0) {
        enrichedContext.statuteResults = formatStatutesForPrompt(statutes);
        console.log(`[윤율무] 현행법령 ${statutes.length}건 확보`);
      }
    } catch (err) {
      console.warn("[윤율무] 법제처 검색 실패:", err);
    }
  }

  if (agentId === "analysis") {
    // 서혜안: 현행법령 + 법령용어 검색
    const keywords = extractSearchKeywords(context.caseDesc, context.caseType);
    try {
      const statutes = await searchStatutes(keywords[0] ?? "법령", 3);
      if (statutes.length > 0) {
        enrichedContext.statuteResults = formatStatutesForPrompt(statutes);
        console.log(`[서혜안] 현행법령 ${statutes.length}건 확보`);
      }
      await delay(300);
      const terms = await searchLegalTerms(keywords[0] ?? "법률용어", 3);
      if (terms.length > 0) {
        enrichedContext.legalTermResults = formatLegalTermsForPrompt(terms);
        console.log(`[서혜안] 법령용어 ${terms.length}건 확보`);
      }
    } catch (err) {
      console.warn("[서혜안] 법제처 검색 실패:", err);
    }
  }

  // Claude API 호출
  const promptId = agentId === "docgen" ? "docgen_questions" : agentId;
  const prompt = buildPrompt(promptId, enrichedContext);

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
   * 6명 에이전트 전원 병렬 실행 (외부 API 의존 없음)
   *
   * 한판서·서혜안·윤율무·정소리·조필묵·최감수가 동시에 각자의 전문 분야를 분석.
   * Claude 학습 데이터 기반으로 작업하며, 외부 검색 API 호출 없이 빠르게 완료.
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

      // ─── 6명 에이전트 전원 병렬 실행 ───
      console.log("[에이전트] 6명 전원 병렬 실행:", AGENT_IDS.join(", "));

      const runAgent = async (agentId: AgentId, ctx: RunAgentsContext): Promise<AgentState> => {
        try {
          const result = await runSingleAgent(agentId, ctx);
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

      const allResults = await Promise.allSettled(
        AGENT_IDS.map((id) => runAgent(id, context)),
      );

      // ─── 결과 반영 ───
      const finalStates = { ...runningStates };
      allResults.forEach((result, index) => {
        const agentId = AGENT_IDS[index];
        if (result.status === "fulfilled") {
          finalStates[agentId] = result.value;
        } else {
          finalStates[agentId] = {
            id: agentId, status: "error", result: "", error: String(result.reason),
          };
        }
      });

      // ─── 한판서 결과에서 CaseRef JSON 파싱 ───
      const caseRefs: CaseRef[] = [];
      try {
        const precedentResult = finalStates.precedent?.result ?? "";
        const caseRefStr = extractTopLevelJsonObject(precedentResult, "caseRefs");
        if (caseRefStr) {
          const parsed = JSON.parse(caseRefStr) as { caseRefs: CaseRef[] };
          if (parsed.caseRefs?.length) {
            caseRefs.push(...parsed.caseRefs);
            console.log("[에이전트] CaseRef 파싱 완료:", caseRefs.length, "건");
          }
        }
      } catch (err) {
        console.warn("[에이전트] CaseRef 파싱 실패:", err);
      }

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
