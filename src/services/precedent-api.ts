// 법제처 판례·헌재결정례·법령해석례 검색 OpenAPI 프론트엔드 서비스
// Cloudflare Functions 프록시(/api/precedent-search)를 통해 법제처 API 호출

import { authHeaders } from "./api-auth";

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

/** 커스텀 도메인에서는 pages.dev로 우회 (Cloudflare Zone 프록시 외부 API 차단 문제) */
const API_BASE = typeof window !== "undefined" && window.location.hostname !== "law-caddy.pages.dev"
  ? "https://law-caddy.pages.dev"
  : "";
const PROXY_URL = `${API_BASE}/api/precedent-search`;

// ---------------------------------------------------------------------------
// 판례 (prec) 타입 및 함수
// ---------------------------------------------------------------------------

/** 판례 검색 결과 항목 */
export interface PrecedentCase {
  serialNumber: string;   // 판례일련번호
  caseNumber: string;     // 사건번호 (2023다12345)
  caseName: string;       // 사건명
  court: string;          // 법원명
  date: string;           // 선고일자 (포맷팅됨: 2023.12.15)
  summary: string;        // 판결요지
  keyPoints: string;      // 판시사항
  refStatutes: string;    // 참조조문
  refCases: string;       // 참조판례
  content: string;        // 판례내용 (전문)
}

/** 판례 검색 응답 */
interface PrecedentSearchResponse {
  totalCount: number;
  precedents: PrecedentCase[];
}

/** 판례 상세 조회 응답 */
interface PrecedentDetailResponse {
  precedent: PrecedentCase | null;
}

/**
 * 법제처 판례 검색 API를 통해 최신 판례를 검색합니다.
 *
 * @param query - 검색어 (사건 유형, 키워드 등)
 * @param count - 결과 수 (기본 5, 최대 20)
 * @returns 판례 검색 결과 배열
 */
export async function searchLatestPrecedents(
  query: string,
  count: number = 5,
): Promise<PrecedentCase[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, count, target: "prec" }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(`[판례검색] 법제처 API 검색 실패: HTTP ${response.status}`, errBody);
      return [];
    }

    const data = (await response.json()) as PrecedentSearchResponse;
    return data.precedents ?? [];
  } catch (error: unknown) {
    console.warn(
      "[판례검색] 법제처 API 호출 오류:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * 판례 일련번호로 판례 상세 정보를 조회합니다.
 *
 * @param serialNumber - 법제처 판례 일련번호
 * @returns 판례 상세 정보 또는 null
 */
export async function getPrecedentDetail(
  serialNumber: string,
): Promise<PrecedentCase | null> {
  if (!serialNumber.trim()) {
    return null;
  }

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: serialNumber }),
    });

    if (!response.ok) {
      console.warn(`[판례검색] 판례 상세 조회 실패: HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as PrecedentDetailResponse;
    return data.precedent ?? null;
  } catch (error: unknown) {
    console.warn(
      "[판례검색] 판례 상세 조회 오류:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * 판례 검색 결과를 Claude 프롬프트에 주입할 텍스트로 포맷팅합니다.
 *
 * @param precedents - 판례 검색 결과 배열
 * @returns 포맷팅된 텍스트 (결과 없으면 빈 문자열)
 */
export function formatPrecedentsForPrompt(
  precedents: PrecedentCase[],
): string {
  if (precedents.length === 0) {
    return "";
  }

  const lines = precedents.map((p, i) => {
    const parts: string[] = [
      `${i + 1}. 사건번호: ${p.caseNumber} | 사건명: ${p.caseName}`,
      `   법원: ${p.court} | 선고일: ${p.date}`,
    ];

    if (p.keyPoints) {
      parts.push(`   【판시사항】 ${truncate(p.keyPoints, 800)}`);
    }

    if (p.summary) {
      parts.push(`   【판결요지】 ${truncate(p.summary, 1500)}`);
    }

    if (p.content) {
      parts.push(`   【판례내용(발췌)】 ${truncate(p.content, 500)}`);
    }

    if (p.refStatutes) {
      parts.push(`   【참조조문】 ${truncate(p.refStatutes, 300)}`);
    }

    if (p.refCases) {
      parts.push(`   【참조판례】 ${truncate(p.refCases, 300)}`);
    }

    return parts.join("\n");
  });

  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// 헌재결정례 (detc) 타입 및 함수
// ---------------------------------------------------------------------------

/** 헌재결정례 검색 결과 항목 */
export interface ConstitutionalDecision {
  serialNumber: string;   // 헌재결정례일련번호
  caseNumber: string;     // 사건번호
  caseName: string;       // 사건명
  date: string;           // 종국일자 (포맷팅됨: 2023.12.15)
  summary: string;        // 결정요지
  keyPoints: string;      // 판시사항
  refStatutes: string;    // 참조조문
}

/** 헌재결정례 검색 응답 */
interface ConstitutionalDecisionSearchResponse {
  totalCount: number;
  decisions: ConstitutionalDecision[];
}

/** 헌재결정례 상세 조회 응답 */
interface ConstitutionalDecisionDetailResponse {
  decision: ConstitutionalDecision | null;
}

/**
 * 법제처 헌재결정례 검색 API를 통해 헌법재판소 결정례를 검색합니다.
 *
 * @param query - 검색어
 * @param count - 결과 수 (기본 3, 최대 20)
 * @returns 헌재결정례 검색 결과 배열
 */
export async function searchConstitutionalDecisions(
  query: string,
  count: number = 3,
): Promise<ConstitutionalDecision[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, count, target: "detc" }),
    });

    if (!response.ok) {
      console.warn(`[헌재결정례] 법제처 API 검색 실패: HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as ConstitutionalDecisionSearchResponse;
    return data.decisions ?? [];
  } catch (error: unknown) {
    console.warn(
      "[헌재결정례] 법제처 API 호출 오류:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * 헌재결정례 일련번호로 상세 정보를 조회합니다.
 *
 * @param serialNumber - 헌재결정례일련번호
 * @returns 헌재결정례 상세 정보 또는 null
 */
export async function getConstitutionalDetail(
  serialNumber: string,
): Promise<ConstitutionalDecision | null> {
  if (!serialNumber.trim()) {
    return null;
  }

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ detcId: serialNumber }),
    });

    if (!response.ok) {
      console.warn(`[헌재결정례] 상세 조회 실패: HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as ConstitutionalDecisionDetailResponse;
    return data.decision ?? null;
  } catch (error: unknown) {
    console.warn(
      "[헌재결정례] 상세 조회 오류:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * 헌재결정례 검색 결과를 Claude 프롬프트에 주입할 텍스트로 포맷팅합니다.
 *
 * @param decisions - 헌재결정례 검색 결과 배열
 * @returns 포맷팅된 텍스트 (결과 없으면 빈 문자열)
 */
export function formatConstitutionalForPrompt(
  decisions: ConstitutionalDecision[],
): string {
  if (decisions.length === 0) {
    return "";
  }

  const lines = decisions.map((d, i) => {
    const parts: string[] = [
      `${i + 1}. 사건번호: ${d.caseNumber} | 사건명: ${d.caseName}`,
      `   종국일자: ${d.date}`,
    ];

    if (d.keyPoints) {
      parts.push(`   판시사항: ${truncate(d.keyPoints, 300)}`);
    }

    if (d.summary) {
      parts.push(`   결정요지: ${truncate(d.summary, 400)}`);
    }

    if (d.refStatutes) {
      parts.push(`   참조조문: ${truncate(d.refStatutes, 200)}`);
    }

    return parts.join("\n");
  });

  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// 법령해석례 (expc) 타입 및 함수
// ---------------------------------------------------------------------------

/** 법령해석례 검색 결과 항목 */
export interface LegalInterpretation {
  caseNumber: string;   // 안건번호
  caseName: string;     // 안건명
  agency: string;       // 회신기관명
  date: string;         // 회신일자 (포맷팅됨: 2023.12.15)
  detailLink: string;   // 법령해석례상세링크
  summary: string;      // 결정요지
}

/** 법령해석례 검색 응답 */
interface LegalInterpretationSearchResponse {
  totalCount: number;
  interpretations: LegalInterpretation[];
}

/**
 * 법제처 법령해석례 검색 API를 통해 공식 법령 해석을 검색합니다.
 *
 * @param query - 검색어
 * @param count - 결과 수 (기본 3, 최대 20)
 * @returns 법령해석례 검색 결과 배열
 */
export async function searchLegalInterpretations(
  query: string,
  count: number = 3,
): Promise<LegalInterpretation[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, count, target: "expc" }),
    });

    if (!response.ok) {
      console.warn(`[법령해석례] 법제처 API 검색 실패: HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as LegalInterpretationSearchResponse;
    return data.interpretations ?? [];
  } catch (error: unknown) {
    console.warn(
      "[법령해석례] 법제처 API 호출 오류:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * 법령해석례 검색 결과를 Claude 프롬프트에 주입할 텍스트로 포맷팅합니다.
 *
 * @param interpretations - 법령해석례 검색 결과 배열
 * @returns 포맷팅된 텍스트 (결과 없으면 빈 문자열)
 */
export function formatInterpretationsForPrompt(
  interpretations: LegalInterpretation[],
): string {
  if (interpretations.length === 0) {
    return "";
  }

  const lines = interpretations.map((e, i) => {
    const parts: string[] = [
      `${i + 1}. 안건번호: ${e.caseNumber} | 안건명: ${e.caseName}`,
      `   회신기관: ${e.agency} | 회신일자: ${e.date}`,
    ];

    if (e.summary) {
      parts.push(`   결정요지: ${truncate(e.summary, 400)}`);
    }

    if (e.detailLink) {
      parts.push(`   상세링크: ${e.detailLink}`);
    }

    return parts.join("\n");
  });

  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// 현행법령 (law) 검색
// ---------------------------------------------------------------------------

/** 법령 검색 결과 항목 */
export interface StatuteResult {
  serialNumber: string;
  lawName: string;
  abbreviation: string;
  enforcementDate: string;
  detailLink: string;
  content: string;
}

interface StatuteSearchResponse {
  totalCount: number;
  statutes: StatuteResult[];
}

/**
 * 현행법령을 검색합니다.
 */
export async function searchStatutes(
  query: string,
  count: number = 5,
): Promise<StatuteResult[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, count, target: "law" }),
    });
    if (!response.ok) {
      console.warn(`[법령검색] 법제처 API 실패: HTTP ${response.status}`);
      return [];
    }
    const data = (await response.json()) as StatuteSearchResponse;
    return data.statutes ?? [];
  } catch (error: unknown) {
    console.warn("[법령검색] 법제처 API 오류:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 법령 검색 결과를 프롬프트용 텍스트로 포맷합니다.
 */
export function formatStatutesForPrompt(statutes: StatuteResult[]): string {
  if (statutes.length === 0) return "";
  return statutes.map((s, i) => {
    const parts = [
      `${i + 1}. 법령명: ${s.lawName}${s.abbreviation ? ` (${s.abbreviation})` : ""}`,
      `   시행일: ${s.enforcementDate}`,
    ];
    if (s.content) parts.push(`   내용: ${truncate(s.content, 800)}`);
    return parts.join("\n");
  }).join("\n\n");
}

// ---------------------------------------------------------------------------
// 법령용어 (lstrm) 검색
// ---------------------------------------------------------------------------

/** 법령용어 검색 결과 항목 */
export interface LegalTermResult {
  term: string;
  definition: string;
  lawName: string;
}

interface LegalTermSearchResponse {
  totalCount: number;
  terms: LegalTermResult[];
}

/**
 * 법령용어를 검색합니다.
 */
export async function searchLegalTerms(
  query: string,
  count: number = 5,
): Promise<LegalTermResult[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, count, target: "lstrm" }),
    });
    if (!response.ok) {
      console.warn(`[법령용어] 법제처 API 실패: HTTP ${response.status}`);
      return [];
    }
    const data = (await response.json()) as LegalTermSearchResponse;
    return data.terms ?? [];
  } catch (error: unknown) {
    console.warn("[법령용어] 법제처 API 오류:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 법령용어 검색 결과를 프롬프트용 텍스트로 포맷합니다.
 */
export function formatLegalTermsForPrompt(terms: LegalTermResult[]): string {
  if (terms.length === 0) return "";
  return terms.map((t, i) =>
    `${i + 1}. ${t.term}: ${truncate(t.definition, 300)} (${t.lawName})`
  ).join("\n");
}

// ---------------------------------------------------------------------------
// JO 파라미터 판례 검색 (법조문 기반)
// ---------------------------------------------------------------------------

/**
 * 특정 법률을 참조한 판례를 검색합니다 (JO 파라미터 활용).
 */
export async function searchByStatute(
  lawName: string,
  query: string,
  count: number = 10,
): Promise<PrecedentCase[]> {
  if (!lawName.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jo: lawName, query, count, target: "prec" }),
    });
    if (!response.ok) {
      console.warn(`[법조문판례] 법제처 API 실패: HTTP ${response.status}`);
      return [];
    }
    const data = (await response.json()) as PrecedentSearchResponse;
    return data.precedents ?? [];
  } catch (error: unknown) {
    console.warn("[법조문판례] 법제처 API 오류:", error instanceof Error ? error.message : error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 사건번호 검증 (nb 파라미터 활용)
// ---------------------------------------------------------------------------

export interface CaseVerification {
  verified: boolean;
  court?: string;
  caseName?: string;
  date?: string;
}

/**
 * 사건번호가 실제 존재하는지 법제처 API nb 파라미터로 검증합니다.
 */
export async function verifyCaseNumber(caseNumber: string): Promise<CaseVerification> {
  if (!caseNumber.trim()) return { verified: false };
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: caseNumber, count: 5, target: "prec" }),
    });
    if (!response.ok) return { verified: false };
    const data = (await response.json()) as PrecedentSearchResponse;
    const precs = data.precedents ?? [];
    // 반환 결과에서 사건번호 정확 매칭 확인 (부분 매칭 방지)
    const cleaned = caseNumber.replace(/\s/g, "");
    const match = precs.find((p) => p.caseNumber.replace(/\s/g, "") === cleaned);
    if (match) {
      return { verified: true, court: match.court, caseName: match.caseName, date: match.date };
    }
    return { verified: false };
  } catch {
    return { verified: false };
  }
}

/**
 * 참조판례 텍스트에서 사건번호를 추출합니다. (Citation Chaining용)
 */
export function extractCaseNumbers(refCasesText: string): string[] {
  const pattern = /(\d{2,4}[다도두부나마카타바사아자차파하거너머러]\d{1,8})/g;
  const matches = refCasesText.match(pattern) ?? [];
  return [...new Set(matches)];
}

// ---------------------------------------------------------------------------
// 지능형 법령검색 (aiSearch) — 조문 원문 포함
// ---------------------------------------------------------------------------

export interface SmartArticle {
  lawName: string;
  articleNumber: string;
  articleTitle: string;
  articleContent: string;
  enforcementDate: string;
}

interface SmartSearchResponse { totalCount: number; articles: SmartArticle[]; }

export async function searchSmartStatutes(query: string, count: number = 5): Promise<SmartArticle[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ query, count, target: "aiSearch" }) });
    if (!res.ok) { console.warn(`[지능형검색] 실패: HTTP ${res.status}`); return []; }
    return ((await res.json()) as SmartSearchResponse).articles ?? [];
  } catch (e) { console.warn("[지능형검색] 오류:", e instanceof Error ? e.message : e); return []; }
}

export function formatSmartArticlesForPrompt(articles: SmartArticle[]): string {
  if (!articles.length) return "";
  return articles.map((a, i) =>
    `${i + 1}. ${a.lawName} 제${parseInt(a.articleNumber, 10)}조 (${a.articleTitle})\n   ${truncate(a.articleContent, 500)}`
  ).join("\n\n");
}

// ---------------------------------------------------------------------------
// 연관법령 (aiRltLs) — 키워드로 관련 조문 자동 탐색
// ---------------------------------------------------------------------------

export interface RelatedLaw {
  lawName: string;
  articleNumber: string;
  articleTitle: string;
  enforcementDate: string;
}

interface RelatedLawResponse { totalCount: number; relatedLaws: RelatedLaw[]; }

export async function searchRelatedLaws(query: string, count: number = 10): Promise<RelatedLaw[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ query, count, target: "aiRltLs" }) });
    if (!res.ok) { console.warn(`[연관법령] 실패: HTTP ${res.status}`); return []; }
    return ((await res.json()) as RelatedLawResponse).relatedLaws ?? [];
  } catch (e) { console.warn("[연관법령] 오류:", e instanceof Error ? e.message : e); return []; }
}

export function formatRelatedLawsForPrompt(laws: RelatedLaw[]): string {
  if (!laws.length) return "";
  return laws.map((l, i) =>
    `${i + 1}. ${l.lawName} 제${parseInt(l.articleNumber, 10)}조 — ${l.articleTitle}`
  ).join("\n");
}

// ---------------------------------------------------------------------------
// 노동위원회 심판례 (nlrc) — 38,000건+
// ---------------------------------------------------------------------------

export interface LaborCase { caseNumber: string; title: string; date: string; serialNumber: string; }
interface LaborCaseResponse { totalCount: number; laborCases: LaborCase[]; }

export async function searchLaborCases(query: string, count: number = 5): Promise<LaborCase[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ query, count, target: "nlrc" }) });
    if (!res.ok) { console.warn(`[노동위원회] 실패: HTTP ${res.status}`); return []; }
    return ((await res.json()) as LaborCaseResponse).laborCases ?? [];
  } catch (e) { console.warn("[노동위원회] 오류:", e instanceof Error ? e.message : e); return []; }
}

export function formatLaborCasesForPrompt(cases: LaborCase[]): string {
  if (!cases.length) return "";
  return cases.map((c, i) =>
    `${i + 1}. ${c.title} (${c.caseNumber}, ${c.date})`
  ).join("\n");
}

// ---------------------------------------------------------------------------
// 공정위 심결 (ftc) — 2,700건+
// ---------------------------------------------------------------------------

export interface FtcCase { caseNumber: string; caseName: string; decisionDate: string; serialNumber: string; }
interface FtcCaseResponse { totalCount: number; ftcCases: FtcCase[]; }

export async function searchFtcCases(query: string, count: number = 5): Promise<FtcCase[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ query, count, target: "ftc" }) });
    if (!res.ok) { console.warn(`[공정위] 실패: HTTP ${res.status}`); return []; }
    return ((await res.json()) as FtcCaseResponse).ftcCases ?? [];
  } catch (e) { console.warn("[공정위] 오류:", e instanceof Error ? e.message : e); return []; }
}

export function formatFtcCasesForPrompt(cases: FtcCase[]): string {
  if (!cases.length) return "";
  return cases.map((c, i) =>
    `${i + 1}. ${c.caseName} (${c.caseNumber}, ${c.decisionDate})`
  ).join("\n");
}

// ---------------------------------------------------------------------------
// 법령용어-조문 연계 (lstrmRltJo)
// ---------------------------------------------------------------------------

export interface LinkedArticle { lawName: string; articleNumber: string; articleContent: string; termType: string; }
interface LinkedArticleResponse { totalCount: number; linkedArticles: LinkedArticle[]; }

export async function searchTermToStatute(query: string): Promise<LinkedArticle[]> {
  if (!query.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const res = await fetch(PROXY_URL, { method: "POST", headers, body: JSON.stringify({ query, count: 10, target: "lstrmRltJo" }) });
    if (!res.ok) { console.warn(`[용어-조문] 실패: HTTP ${res.status}`); return []; }
    return ((await res.json()) as LinkedArticleResponse).linkedArticles ?? [];
  } catch (e) { console.warn("[용어-조문] 오류:", e instanceof Error ? e.message : e); return []; }
}

export function formatLinkedArticlesForPrompt(articles: LinkedArticle[]): string {
  if (!articles.length) return "";
  return articles.map((a, i) =>
    `${i + 1}. ${a.lawName} 제${parseInt(a.articleNumber, 10) || a.articleNumber}조\n   ${truncate(a.articleContent, 400)}`
  ).join("\n\n");
}

// ---------------------------------------------------------------------------
// 내부 유틸리티
// ---------------------------------------------------------------------------

/**
 * 텍스트를 지정 길이로 자르고 말줄임표를 추가합니다.
 */
function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength) + "...";
}
