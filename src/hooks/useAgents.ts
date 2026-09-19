// AI 에이전트 병렬 실행 훅
// 판례 검색(법제처+RAG), 적법성 검증, 쟁점 분석, 문서 작성
// 실행 목록은 config/constants.ts의 AGENTS가 단일 진실원본이다.

import { useState, useCallback, useRef } from "react";
import { callClaude, callClaudeWithCachedPrefix } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt, buildAgentCachePrefix } from "../services/prompts";
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
import { CASE_TYPES, AGENTS } from "../config/constants";
import { SearchPool } from "../services/search-pool";
import { formatRAGContext } from "../services/rag";
import { maskAgentContext } from "../services/pii-mask";
import { AGENTS_CACHE_STORAGE_KEY, canRestoreAgentCache } from "../services/agentCache";

/** Claude로 사건 설명에서 법제처 검색 키워드를 추출합니다 */
/**
 * 같은 사건에 대한 중복 호출 방지 캐시.
 *
 * 판서·율무·혜안 세 에이전트가 병렬로 각자 이 함수를 부르는데 인자가 완전히 같아서,
 * 실측 결과 동일한 Claude 호출이 3번 나가고 있었다(회당 ~470토큰). Promise를 공유해
 * 첫 호출 하나로 합친다. 항목 1개만 유지 — 사건이 바뀌면 자연히 교체된다.
 */
let keywordMemo: { key: string; promise: Promise<string[]> } | null = null;

function extractSearchKeywordsWithAI(caseDesc: string, caseType?: string): Promise<string[]> {
  // 두 값을 그냥 이어 붙이면 경계가 모호해 다른 사건이 같은 키를 가질 수 있다.
  // 이전에는 구분자로 NUL 문자를 소스에 직접 박아 파일이 바이너리로 취급됐다.
  const key = JSON.stringify([caseType ?? "", caseDesc]);
  if (keywordMemo?.key === key) return keywordMemo.promise;
  const promise = extractSearchKeywordsUncached(caseDesc, caseType);
  keywordMemo = { key, promise };
  return promise;
}

async function extractSearchKeywordsUncached(caseDesc: string, caseType?: string): Promise<string[]> {
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
      undefined,
      "low", // 검색어 2~3개 추출 — 실패해도 규칙 기반 폴백이 있다
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
export interface RunAgentsContext extends AgentContext {
  /** 한판서가 검증한 판례 참조 목록 */
  caseRefs?: CaseRef[];
  /**
   * 결과 캐시 키 — services/agentCache.ts의 buildAgentCacheKey로 만든다.
   *
   * ⚠️ 필수다. 이걸 빼먹어 캐시가 구조적으로 복원되지 않고, 분석 화면에
   * 들어올 때마다 AI 넷이 다시 돌아 요금이 재청구되고 있었다.
   * 복원할 때와 반드시 같은 값이어야 한다.
   */
  cacheKey: string;
}

/** 법제처 판례 검색이 실제로 어떻게 끝났는지 (r1-04-14 — "없는 건지 실패한 건지") */
export interface PrecedentSearchInfo {
  /** 확보한 판례 건수 (헌재결정례 포함) */
  count: number;
  /** 검색 호출 중 하나라도 실패했는지 */
  failed: boolean;
  /** 검색에 쓴 키워드 */
  keywords: string[];
}

/** 법제처 실존 검증을 거친 판례 참조 */
export interface VerifiedCaseRef extends CaseRef {
  verified: boolean;
  serialNumber?: string;
}

/** 캐시 키를 만든다 — 같은 사건·같은 자료일 때만 이전 결과를 다시 쓴다 */
export function buildAnalysisCacheKey(input: {
  clientName: string;
  caseId?: string;
  typedNotes?: string;
  files?: Array<{ name: string; size: number }>;
}): string {
  const files = (input.files ?? []).map((f) => `${f.name}:${f.size}`).sort().join("|");
  const notes = input.typedNotes ?? "";
  return [input.caseId ?? "new", input.clientName, files, notes.length, notes.slice(0, 80)].join("::");
}

/** 에이전트 실행 단계 */
type AgentStep = "idle" | "running" | "completed" | "error";

/** 캐시 데이터 구조 (키 생성·복원 판정은 services/agentCache.ts) */
interface AgentsCacheData {
  agents: Record<AgentId, AgentState>;
  classifiedCaseType: CaseType | null;
  clientName: string;
  /**
   * 사건·입력 자료까지 반영한 키.
   *
   * ⚠️ 필수다. 이걸 optional로 두었더니 저장 쪽이 조용히 빼먹어
   * 캐시가 한 번도 복원되지 않았다. 이제 빼먼 컴파일이 멈춘다.
   * (읽는 쪽은 예전 캐시를 만날 수 있으므로 canRestoreAgentCache가 런타임에도 검사한다)
   */
  cacheKey: string;
  caseRefs?: VerifiedCaseRef[];
  searchInfo?: PrecedentSearchInfo | null;
  timestamp: number;
}

/** useAgents 반환 타입 */
interface UseAgentsReturn {
  agents: Record<AgentId, AgentState>;
  isRunning: boolean;
  currentStep: AgentStep;
  classifiedCaseType: CaseType | null;
  isClassifying: boolean;
  /** 법제처 실존 검증을 거친 판례 목록 (한판서 결과에서 추출) */
  caseRefs: VerifiedCaseRef[];
  /** 법제처 검색 상태 (건수·실패 여부) */
  searchInfo: PrecedentSearchInfo | null;
  /** 이번 실행에서 AI로 나가기 전 가린 개인정보 건수 (화면 안내용) */
  maskedPiiCount: number;
  runAllAgents: (context: RunAgentsContext) => Promise<Record<AgentId, AgentState>>;
  /** 실패한 에이전트 하나만 다시 돌린다 (r1-04-01) */
  retryAgent: (agentId: AgentId) => Promise<void>;
  resetAgents: () => void;
  restoreFromCache: (cacheKey: string) => boolean;
  /** 저장돼 있던 결과(사건 문서의 agentResults)를 화면에 그대로 올린다 — 재실행 없이 */
  loadResults: (results: Record<string, string>, caseType: CaseType | null) => void;
}

/** 검증 결과를 한판서 결과 뒤에 붙여, 문서 작성 단계가 미확인 번호를 인용하지 않게 한다 */
function appendVerificationBlock(precedentResult: string, refs: VerifiedCaseRef[]): string {
  if (!precedentResult || refs.length === 0) return precedentResult;
  const lines = refs.map((r) =>
    r.verified
      ? `- ${r.caseNumber}: 법제처 확인됨 (${r.court}${r.date ? ` ${r.date}` : ""})`
      : `- ${r.caseNumber}: [법제처 미확인] — 문서에 인용 금지, 법리로만 서술`,
  );
  return `${precedentResult}

[법제처 실존 검증 결과]
${lines.join("\n")}`;
}

/**
 * 실행할 에이전트 ID 목록.
 *
 * AGENTS(config/constants.ts)에서 파생한다. 예전에는 두 목록을 따로 관리했는데,
 * AgentsPage는 AGENTS를 순회하고 여기서는 AGENT_IDS를 순회하는 구조라
 * 둘이 어긋나면 실행되지 않는 카드가 영원히 로딩 상태로 남는다.
 */
const AGENT_IDS: AgentId[] = AGENTS.map((a) => a.id);

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
 * 단일 에이전트 실행 (에이전트별 외부 검색 주입 포함)
 */
async function runSingleAgent(
  agentId: AgentId,
  context: RunAgentsContext,
  onSearchInfo?: (info: PrecedentSearchInfo) => void,
): Promise<string> {
  // ─── 법제처 API 검색 (한판서·윤율무·서혜안만, 실패해도 Claude만으로 동작) ───
  const enrichedContext = { ...context };
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ─── RAG 검색 (SearchPool 활용, 실패해도 Claude만으로 동작) ───
  // 한판서(precedent)는 법제처 API 검색에 더해 RAG 결과도 받는다.
  // (2026-07-26) 오사서(rag_precedent)를 없애면서 그 역할을 한판서가 흡수했다.
  if (["precedent", "legal", "analysis", "docgen"].includes(agentId)) {
    try {
      const pool = new SearchPool(context.caseDesc, context.caseType);
      const ragResult = await pool.getForAgent(agentId);
      const ragText = formatRAGContext(ragResult);
      if (ragText) {
        enrichedContext.ragContext = ragText;
        console.log(`[${agentId}] RAG 검색 결과 주입 완료`);
      }
    } catch (err) {
      console.warn(`[${agentId}] RAG 검색 실패, Claude만으로 진행:`, err);
    }
  }

  if (agentId === "precedent") {
    // 한판서: 판례 + 헌재결정례 검색
    const keywords = await extractSearchKeywordsWithAI(context.caseDesc, context.caseType);
    console.log(`[한판서] 법제처 검색 키워드: ${keywords.join(", ")}`);
    let allPrecedents: PrecedentCase[] = [];
    const allDetc: ConstitutionalDecision[] = [];
    const seen = new Set<string>();
    let searchFailed = false;

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
        searchFailed = true;
        console.warn(`[한판서] "${kw}" 검색 실패:`, err);
      }
    }
    // searchLatestPrecedents는 실패를 빈 배열로 삼키므로, 키워드가 있는데 0건이면 실패 가능성으로 표시한다
    onSearchInfo?.({ count: allPrecedents.length + allDetc.length, failed: searchFailed, keywords });

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
  // 공통 자료(개요·대화록·첨부)는 캐시 프리픽스에 실려 있으므로 프롬프트에서 뺀다.
  // 프리픽스는 runAllAgents가 팬아웃 직전 예열해 둔 것과 바이트 단위로 같아야 한다 —
  // 여기서 enrichedContext를 넘겨도 buildAgentCachePrefix는 공통 필드만 읽으므로 동일하다.
  const prompt = buildPrompt(promptId, enrichedContext, { omitCommonContext: true });

  const userMessage =
    agentId === "docgen"
      ? context.docType
        ? `"${context.docType}" 문서 작성 전 확인 사항을 JSON으로 제시해 주세요.`
        : "사건에 적합한 법률 문서 작성 전 확인 사항을 JSON으로 제시해 주세요."
      : `${context.clientName} 의뢰인의 사건에 대해 분석해 주세요.`;

  return callClaudeWithCachedPrefix(buildAgentCachePrefix(enrichedContext), prompt, userMessage);
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
  const [caseRefs, setCaseRefs] = useState<VerifiedCaseRef[]>([]);
  const [searchInfo, setSearchInfo] = useState<PrecedentSearchInfo | null>(null);
  /**
   * 검색 상태의 최신 값 — 캐시에 실을 때 쓴다.
   * 상태(state)는 비동기라 runAllAgents 안에서 바로 읽으면 이전 값이 나온다.
   */
  const searchInfoRef = useRef<PrecedentSearchInfo | null>(null);
  const trackSearchInfo = useCallback((info: PrecedentSearchInfo | null) => {
    searchInfoRef.current = info;
    setSearchInfo(info);
  }, []);
  const [maskedPiiCount, setMaskedPiiCount] = useState(0);
  /** 마지막 실행 컨텍스트 — 개별 재시도에 쓴다 */
  const lastContextRef = useRef<RunAgentsContext | null>(null);
  const lastCacheKeyRef = useRef<string>("");

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

  /** sessionStorage에서 이전 에이전트 결과 복원 — 같은 사건·같은 자료일 때만 */
  const restoreFromCache = useCallback((cacheKey: string): boolean => {
    try {
      const cached = sessionStorage.getItem(AGENTS_CACHE_STORAGE_KEY);
      if (!cached) return false;
      const data = JSON.parse(cached) as AgentsCacheData;
      if (!canRestoreAgentCache(data, cacheKey)) return false;
      setAgents(data.agents);
      setClassifiedCaseType(data.classifiedCaseType);
      setCaseRefs(data.caseRefs ?? []);
      trackSearchInfo(data.searchInfo ?? null);
      setCurrentStep("completed");
      setIsRunning(false);
      lastCacheKeyRef.current = cacheKey;
      return true;
    } catch {
      return false;
    }
  }, [trackSearchInfo]);

  /** 저장된 결과를 재실행 없이 화면에 올린다 (사건 문서에서 다시 열 때) */
  const loadResults = useCallback((results: Record<string, string>, caseType: CaseType | null) => {
    const states = createInitialStates();
    for (const id of AGENT_IDS) {
      const text = results[id] ?? "";
      states[id] = text
        ? { id, status: "completed", result: text }
        : { id, status: "error", result: "", error: "저장된 결과가 없습니다. 다시 시도를 누르면 이 항목만 새로 분석합니다." };
    }
    setAgents(states);
    setClassifiedCaseType(caseType);
    setCurrentStep("completed");
    setIsRunning(false);
  }, []);

  /** 판례 결과에서 CaseRef를 뽑아 법제처에 실존 여부를 물어본다 */
  const verifyPrecedentRefs = useCallback(async (precedentResult: string): Promise<VerifiedCaseRef[]> => {
    const refs: VerifiedCaseRef[] = [];
    try {
      const caseRefStr = extractTopLevelJsonObject(precedentResult, "caseRefs");
      if (caseRefStr) {
        const parsed = JSON.parse(caseRefStr) as { caseRefs: CaseRef[] };
        for (const r of parsed.caseRefs ?? []) {
          if (r?.caseNumber) refs.push({ ...r, verified: false });
        }
        console.log("[에이전트] CaseRef 파싱 완료:", refs.length, "건");
      }
    } catch (err) {
      console.warn("[에이전트] CaseRef 파싱 실패:", err);
    }
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const ref of refs.slice(0, 8)) {
      try {
        const result = await verifyCaseNumber(ref.caseNumber);
        ref.verified = result.verified;
        ref.source = result.verified ? "law.go.kr-verified" : "unverified";
        ref.serialNumber = result.serialNumber;
        if (result.verified && result.court) ref.court = result.court;
        console.log(`[검증] ${ref.caseNumber}: ${result.verified ? "실존 확인" : "법제처 DB 미확인"}`);
        await delay(300);
      } catch { /* 검증 실패해도 진행 — 미확인으로 남는다 */ }
    }
    return refs;
  }, []);

  /**
   * 에이전트 전원(AGENTS 기준) 병렬 실행 (외부 API 의존 없음)
   *
   * 한판서·윤율무·서혜안·조필묵이 동시에 각자의 전문 분야를 분석.
   * Claude 학습 데이터 기반으로 작업하며, 외부 검색 API 호출 없이 빠르게 완료.
   */
  const runAllAgents = useCallback(
    async (
      rawContext: RunAgentsContext,
    ): Promise<Record<AgentId, AgentState>> => {
      setIsRunning(true);
      setCurrentStep("running");

      // ─── 개인정보 가리기 ───
      // 상담 전사문과 첨부 텍스트에는 주민번호·연락처·계좌가 그대로 들어 있다.
      // 변호사법 제26조가 걸린 자료이므로 외부 AI로 나가기 전에 여기서 한 번 거른다.
      // 프롬프트에 "개인정보를 쓰지 말라"고 적은 것은 출력 규칙일 뿐 입력을 막지 못한다.
      // 모든 에이전트 실행이 이 함수를 지나므로 여기 한 곳이면 빠짐이 없다.
      const { context, total: maskedCount } = maskAgentContext(rawContext);
      setMaskedPiiCount(maskedCount);
      if (maskedCount > 0) {
        console.log(`[에이전트] 개인정보 ${maskedCount}건을 가리고 보냅니다.`);
      }

      // 모든 에이전트를 running 상태로 전환
      const runningStates = createInitialStates();
      for (const id of AGENT_IDS) {
        runningStates[id] = { id, status: "running", result: "" };
      }
      setAgents(runningStates);

      // ─── 캐시 예열 ───
      // 캐시 항목은 첫 응답이 시작된 뒤에야 읽을 수 있다. 예열 없이 4개를 동시에
      // 쏘면 서로가 만드는 캐시를 아무도 못 읽고 전원이 쓰기 요금(1.25배)만 낸다.
      // 팬아웃 전에 같은 프리픽스로 초소형 호출을 한 번 완료시켜 캐시를 만들어 두면,
      // 뒤따르는 4개가 전부 읽기 요금(0.1배)으로 프리픽스를 재사용한다.
      // 실패해도 본 실행은 그대로 진행한다(캐시 할인만 포기).
      // ⚠️ effort를 지정하지 않는다 — 에이전트 본 호출과 동일해야 한다.
      // 실측(2026-07-27)에서 예열만 effort=low로 보냈더니 캐시 버킷이 갈려
      // 기본값(high)인 에이전트들이 예열 항목을 읽지 못했다. speed처럼 effort도
      // 캐시를 가르는 요청 파라미터로 취급해야 한다.
      try {
        const t0 = Date.now();
        await callClaude(
          "당신은 준비 확인 봇입니다. 다른 말 없이 정확히 \"OK\"만 출력하세요.",
          "OK만 출력하세요.",
          buildAgentCachePrefix(context),
        );
        console.log(`[에이전트] 캐시 예열 완료 (${Date.now() - t0}ms)`);
      } catch (err) {
        console.warn("[에이전트] 캐시 예열 실패 — 할인 없이 진행:", err);
      }

      // ─── 에이전트 전원 병렬 실행 ───
      console.log(`[에이전트] ${AGENT_IDS.length}명 전원 병렬 실행:`, AGENT_IDS.join(", "));

      lastContextRef.current = context;
      lastCacheKeyRef.current = context.cacheKey ?? "";
      setCaseRefs([]);
      trackSearchInfo(null);

      const runAgent = async (agentId: AgentId, ctx: RunAgentsContext): Promise<AgentState> => {
        try {
          const result = await runSingleAgent(agentId, ctx, trackSearchInfo);
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

      // ─── 한판서 결과의 사건번호를 법제처에 실존 확인하고, 결과 텍스트 뒤에 검증 블록을 붙인다 ───
      // (예전에는 콘솔에만 찍히고 화면·저장 어디에도 남지 않았다 — r1-04-02)
      const verifiedRefs = await verifyPrecedentRefs(finalStates.precedent?.result ?? "");
      if (finalStates.precedent?.status === "completed") {
        finalStates.precedent = {
          ...finalStates.precedent,
          result: appendVerificationBlock(finalStates.precedent.result, verifiedRefs),
        };
      }
      setCaseRefs(verifiedRefs);

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
          // 단어 하나를 고르는 분류 — 최고 사고력을 쓸 이유가 없다
          const result = await callClaude(
            prompt,
            "이 사건의 유형을 분류해 주세요.",
            undefined,
            "low",
          );
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
          cacheKey: context.cacheKey,
          caseRefs: verifiedRefs,
          // 복원 쌍이 읽는 값이다. 이걸 빼면 되살렸을 때 "법제처 검색이 실패한 건지
          // 판례가 없는 건지"를 다시 구분할 수 없게 된다(r1-04-14).
          searchInfo: searchInfoRef.current,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(AGENTS_CACHE_STORAGE_KEY, JSON.stringify(cacheData));
      } catch { /* quota */ }

      return finalStates;
    },
    [updateAgent, verifyPrecedentRefs, trackSearchInfo],
  );

  /** 실패한 에이전트 하나만 다시 돌린다. 성공한 결과는 그대로 둔다. */
  const retryAgent = useCallback(
    async (agentId: AgentId): Promise<void> => {
      const context = lastContextRef.current;
      if (!context) return;
      updateAgent(agentId, { status: "running", result: "", error: undefined });
      setIsRunning(true);
      try {
        let result = await runSingleAgent(agentId, context, trackSearchInfo);
        if (agentId === "precedent") {
          const refs = await verifyPrecedentRefs(result);
          result = appendVerificationBlock(result, refs);
          setCaseRefs(refs);
        }
        updateAgent(agentId, { status: "completed", result, error: undefined });
        // 캐시도 갱신 — 뒤로가기·새로고침 때 재시도 결과가 살아 있게
        setAgents((prev) => {
          try {
            const cached = sessionStorage.getItem(AGENTS_CACHE_STORAGE_KEY);
            if (cached) {
              const data = JSON.parse(cached) as AgentsCacheData;
              if (data.cacheKey === lastCacheKeyRef.current) {
                data.agents = { ...prev, [agentId]: { id: agentId, status: "completed", result } };
                sessionStorage.setItem(AGENTS_CACHE_STORAGE_KEY, JSON.stringify(data));
              }
            }
          } catch { /* quota */ }
          return prev;
        });
      } catch (err: unknown) {
        updateAgent(agentId, {
          status: "error",
          result: "",
          error: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      } finally {
        setIsRunning(false);
      }
    },
    [updateAgent, verifyPrecedentRefs, trackSearchInfo],
  );

  return {
    agents,
    isRunning,
    currentStep,
    classifiedCaseType,
    isClassifying,
    caseRefs,
    searchInfo,
    maskedPiiCount,
    runAllAgents,
    retryAgent,
    resetAgents,
    restoreFromCache,
    loadResults,
  };
}
