// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, RAG 판례, 적법성 검증, 쟁점 분석, 문서 작성, 검토·감수

import { useState, useCallback } from "react";
import { callClaude } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt } from "../services/prompts";
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
  // 검증 & 체인 추적
  verifyCaseNumber,
  extractCaseNumbers,
  // 지능형 API
  searchSmartStatutes,
  formatSmartArticlesForPrompt,
  searchRelatedLaws,
  formatRelatedLawsForPrompt,
  searchLaborCases,
  formatLaborCasesForPrompt,
  searchFtcCases,
  formatFtcCasesForPrompt,
  searchTermToStatute,
  formatLinkedArticlesForPrompt,
} from "../services/precedent-api";
import type { PrecedentCase, ConstitutionalDecision } from "../services/precedent-api";
import type { AgentContext } from "../services/prompts";
import type { AgentId, AgentState, CaseType } from "../types/agent";
import type { CaseRef } from "../types/document";
import { CASE_TYPES } from "../config/constants";

/** Claude로 사건 설명에서 법제처 검색 키워드를 추출합니다 */
async function extractSearchKeywordsWithAI(caseDesc: string, caseType?: string): Promise<string[]> {
  try {
    const result = await callClaude(
      "당신은 한국 법률 검색 키워드 추출 전문가입니다. 사건 설명을 읽고 법제처 판례 검색에 최적화된 키워드를 추출하세요.",
      `사건 유형: ${caseType ?? "미지정"}
사건 설명: ${caseDesc}

위 사건에 대해 법제처 판례 검색에 사용할 핵심 키워드를 2~3개 추출하세요.
규칙:
- 법률 용어로 변환 (예: "집주인이 보증금 안 줌" → "임대차보증금 반환")
- 구체적인 법적 쟁점 키워드 (예: "부당해고", "채무불이행", "불법행위 손해배상")
- 일반적인 단어 금지 (예: "문제", "분쟁", "피해")

반드시 아래 JSON 배열 형식으로만 응답하세요:
["키워드1", "키워드2", "키워드3"]`,
    );

    const match = result.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[키워드추출] Claude AI: ${parsed.join(", ")}`);
        return parsed.slice(0, 3);
      }
    }
  } catch (err) {
    console.warn("[키워드추출] Claude 호출 실패, 규칙 기반 폴백:", err);
  }
  // Claude 실패 시 규칙 기반 폴백
  return extractSearchKeywordsFallback(caseDesc, caseType);
}

/** 규칙 기반 키워드 추출 (폴백용) */
function extractSearchKeywordsFallback(caseDesc: string, caseType?: string): string[] {
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
    ["보증금", ["임대차보증금"]], ["누수", ["하자보수"]], ["하자", ["하자담보책임"]],
    ["공사", ["건설 하자"]], ["매매", ["매매계약 해제"]], ["보험", ["보험금 청구"]],
    ["대여금", ["대여금 반환"]], ["약정금", ["약정금"]], ["위자료", ["위자료"]],
    ["양육", ["양육비"]], ["친권", ["친권"]], ["유류분", ["유류분"]],
    ["근저당", ["근저당권"]], ["전세권", ["전세권"]], ["소유권", ["소유권이전"]],
    ["저작권", ["저작권 침해"]], ["상표", ["상표권 침해"]], ["영업비밀", ["영업비밀"]],
    ["개인정보", ["개인정보 침해"]], ["산재", ["산업재해"]], ["과로", ["과로사"]],
  ];

  for (const [pattern, kws] of KW_MAP) {
    if (caseDesc.includes(pattern)) {
      keywords.push(...kws);
      if (keywords.length >= 3) break;
    }
  }

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


/** 에이전트 실행 컨텍스트 */
interface RunAgentsContext extends AgentContext {
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
  "rag_precedent",
  "legal",
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
 * 단일 에이전트 실행 (rag_precedent 에이전트 특수 처리 포함)
 */
async function runSingleAgent(
  agentId: AgentId,
  context: RunAgentsContext,
): Promise<string> {
  // ─── 법제처 API 검색 (한판서·윤율무·서혜안만, 실패해도 Claude만으로 동작) ───
  const enrichedContext = { ...context };
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  if (agentId === "rag_precedent") {
    // 오사서: Supabase RAG 기반 시맨틱 판례 검색
    // ragContext가 이미 주입되어 있으면 그대로 사용, 없으면 스킵
    if (!enrichedContext.ragContext) {
      console.log("[오사서] RAG 컨텍스트 없음, Claude 학습 데이터만으로 분석");
    } else {
      console.log("[오사서] RAG 판례 데이터 활용하여 시맨틱 분석");
    }
  }

  if (agentId === "precedent") {
    // 한판서: 판례 + 헌재결정례 검색
    const keywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType);
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

    // 참조판례 체인 추적 (상위 2건의 참조판례에서 리딩케이스 발굴)
    for (const prec of top.slice(0, 2)) {
      if (!prec.refCases) continue;
      const refNumbers = extractCaseNumbers(prec.refCases);
      for (const refNum of refNumbers.slice(0, 2)) {
        if (seen.has(refNum)) continue;
        try {
          const refResults = await searchLatestPrecedents(refNum, 3);
          const match = refResults.find((r) => r.caseNumber.replace(/\s/g, "").includes(refNum));
          if (match && !seen.has(match.caseNumber)) {
            seen.add(match.caseNumber);
            allPrecedents.push(match);
            console.log(`[한판서] 참조판례 체인: ${refNum} → ${match.caseNumber} 발견`);
          }
          await delay(300);
        } catch { /* continue */ }
      }
    }

    if (allPrecedents.length > 0) {
      enrichedContext.latestPrecedents = formatPrecedentsForPrompt(allPrecedents);
      console.log(`[한판서] 법제처 판례 ${allPrecedents.length}건 확보 (체인 포함)`);
    }
    if (allDetc.length > 0) {
      enrichedContext.constitutionalDecisions = formatConstitutionalForPrompt(allDetc.slice(0, 3));
      console.log(`[한판서] 헌재결정례 ${allDetc.length}건 확보`);
    }

    // 사건 유형별 특수 검색 (노동위원회 / 공정위)
    try {
      if (context.caseType === "노동" || context.caseDesc.includes("해고") || context.caseDesc.includes("임금")) {
        const laborCases = await searchLaborCases(keywords[0] ?? "부당해고", 5);
        if (laborCases.length > 0) {
          const laborText = formatLaborCasesForPrompt(laborCases);
          enrichedContext.latestPrecedents = (enrichedContext.latestPrecedents ?? "") + `\n\n[노동위원회 심판례]\n${laborText}`;
          console.log(`[한판서] 노동위원회 심판례 ${laborCases.length}건 확보`);
        }
      }
      if (context.caseDesc.includes("공정거래") || context.caseDesc.includes("부당공동") || context.caseDesc.includes("불공정")) {
        const ftcCases = await searchFtcCases(keywords[0] ?? "부당공동행위", 5);
        if (ftcCases.length > 0) {
          const ftcText = formatFtcCasesForPrompt(ftcCases);
          enrichedContext.latestPrecedents = (enrichedContext.latestPrecedents ?? "") + `\n\n[공정위 심결]\n${ftcText}`;
          console.log(`[한판서] 공정위 심결 ${ftcCases.length}건 확보`);
        }
      }
    } catch { /* 특수 검색 실패해도 진행 */ }
  }

  if (agentId === "legal") {
    // 윤율무: 법령해석례 + 현행법령 + 지능형 법령검색(조문 원문)
    const keywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType);
    try {
      const interps = await searchLegalInterpretations(keywords[0] ?? "법령해석", 3);
      if (interps.length > 0) {
        enrichedContext.legalInterpretations = formatInterpretationsForPrompt(interps);
        console.log(`[윤율무] 법령해석례 ${interps.length}건 확보`);
      }
      await delay(300);
      // 지능형 법령검색으로 관련 조문 원문 확보
      const smartArticles = await searchSmartStatutes(keywords[0] ?? "법령", 3);
      if (smartArticles.length > 0) {
        enrichedContext.statuteResults = `[관련 법조문 원문]\n${formatSmartArticlesForPrompt(smartArticles)}`;
        console.log(`[윤율무] 지능형 법령검색 ${smartArticles.length}건 확보 (조문 원문 포함)`);
      }
    } catch (err) {
      console.warn("[윤율무] 법제처 검색 실패:", err);
    }
  }

  if (agentId === "analysis") {
    // 서혜안: 연관법령(aiRltLs) + 지능형 법령검색(aiSearch) + 법령용어-조문 연계(lstrmRltJo)
    const keywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType);
    try {
      // 1. 연관법령 — 핵심 관련 조문 자동 탐색
      const relatedLaws = await searchRelatedLaws(keywords[0] ?? "손해배상", 5);
      if (relatedLaws.length > 0) {
        enrichedContext.statuteResults = `[연관법령 (AI 자동 탐색)]\n${formatRelatedLawsForPrompt(relatedLaws)}`;
        console.log(`[서혜안] 연관법령 ${relatedLaws.length}건 확보`);
      }
      await delay(300);

      // 2. 지능형 법령검색 — 조문 원문 포함
      const smartArticles = await searchSmartStatutes(keywords[0] ?? "손해배상", 5);
      if (smartArticles.length > 0) {
        enrichedContext.statuteResults = (enrichedContext.statuteResults ?? "") + `\n\n[관련 법조문 원문]\n${formatSmartArticlesForPrompt(smartArticles)}`;
        console.log(`[서혜안] 지능형 법령검색 ${smartArticles.length}건 확보 (조문 원문 포함)`);
      }
      await delay(300);

      // 3. 법령용어-조문 연계 — 핵심 법률용어로 관련 조문 조회
      const linkedArticles = await searchTermToStatute(keywords[0] ?? "손해배상");
      if (linkedArticles.length > 0) {
        enrichedContext.legalTermResults = `[법령용어-조문 연계]\n${formatLinkedArticlesForPrompt(linkedArticles)}`;
        console.log(`[서혜안] 법령용어-조문 ${linkedArticles.length}건 확보`);
      }
    } catch (err) {
      console.warn("[서혜안] 법제처 검색 실패:", err);
    }

    // 기존 폴백: 지능형 API 실패 시 기본 법령 검색
    if (!enrichedContext.statuteResults) {
      try {
        const statutes = await searchStatutes(keywords[0] ?? "법령", 3);
        if (statutes.length > 0) {
          enrichedContext.statuteResults = formatStatutesForPrompt(statutes);
        }
      } catch { /* continue */ }
    }
    if (!enrichedContext.legalTermResults) {
      try {
        const terms = await searchLegalTerms(keywords[0] ?? "법률용어", 3);
        if (terms.length > 0) {
          enrichedContext.legalTermResults = formatLegalTermsForPrompt(terms);
          console.log(`[서혜안] 법령용어 ${terms.length}건 확보`);
        }
      } catch (err) {
        console.warn("[서혜안] 법제처 검색 실패:", err);
      }
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
   * 한판서·오사서·윤율무·서혜안·조필묵·최감수가 동시에 각자의 전문 분야를 분석.
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

      // ─── CaseRef 사건번호 실존 검증 (법제처 nb 파라미터) ───
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (const ref of caseRefs.slice(0, 5)) {
        try {
          const result = await verifyCaseNumber(ref.caseNumber);
          if (result.verified) {
            ref.source = "law.go.kr-verified";
            console.log(`[검증] ${ref.caseNumber}: ✅ 실존 확인 (${result.court})`);
          } else {
            ref.source = "unverified";
            console.warn(`[검증] ${ref.caseNumber}: ⚠️ 법제처 DB 미확인`);
          }
          await delay(300);
        } catch { /* 검증 실패해도 진행 */ }
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
