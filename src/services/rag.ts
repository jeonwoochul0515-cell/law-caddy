// Supabase 하이브리드 검색 (시맨틱 + 키워드) + Voyage AI 임베딩 RAG 서비스
// 에이전트별 법률 데이터 검색 (판례, 법령, 서식, 법률 QA, 판결문, 기계독해, 법령용어, 법령지식)

import type { AgentId } from "../types/agent";
import { rerankWithDiversity } from "./reranker";
import type { SearchResult, RankedResult, SourceTable } from "./reranker";
import { authHeaders } from "./api-auth";

// ──────────────────────────────────────────────
// Supabase 접속 정보
// ──────────────────────────────────────────────
function getOptionalEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

const SUPABASE_URL = getOptionalEnv("VITE_SUPABASE_URL");
const SUPABASE_KEY = getOptionalEnv("VITE_SUPABASE_ANON_KEY");

/** Supabase 설정이 없으면 RAG 검색을 건너뛴다 */
export const isRagAvailable = Boolean(SUPABASE_URL && SUPABASE_KEY);

// ──────────────────────────────────────────────
// Voyage AI 설정
// ──────────────────────────────────────────────
const isDev = import.meta.env.DEV;
const VOYAGE_MODEL = "voyage-3";
const VOYAGE_DIRECT_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_PROXY_URL = "/api/voyage";

// ──────────────────────────────────────────────
// 결과 타입 정의
// ──────────────────────────────────────────────

/** 법률 서식 검색 결과 (하이브리드) */
export interface LegalFormResult {
  id: number;
  form_type: string;
  case_category: string;
  title: string;
  content: string;
  writing_guide: string;
  source: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 생활법률 검색 결과 (하이브리드) */
export interface EasyLawResult {
  id: number;
  topic: string;
  title: string;
  content: string;
  related_statutes: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 법령 조문 검색 결과 (하이브리드) */
export interface StatuteResult {
  id: number;
  statute_name: string;
  article_number: string;
  article_title: string;
  article_content: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** AI Hub 법률 QA 검색 결과 (하이브리드) */
export interface AihubQAResult {
  id: number;
  category: string;
  doc_type: string;
  task_type: string;
  question: string;
  answer: string;
  source_info: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 판결문 검색 결과 (하이브리드) — 실제 사건번호가 포함된 판결문 */
export interface LegalJudgmentResult {
  id: number;
  case_number: string;
  court: string;
  case_date: string;
  category: string;
  summary: string;
  full_text: string;
  key_issues: string;
  statutes_ref: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 기계독해 QA 검색 결과 (하이브리드) — 법률 문서에 대한 질문-답변 */
export interface LegalMRCResult {
  id: number;
  document_title: string;
  question: string;
  answer: string;
  context_passage: string;
  category: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 법령용어 사전 검색 결과 (하이브리드) — 용어 + 정의 + 관련용어 */
export interface LegalTermResult {
  id: number;
  term: string;
  definition: string;
  related_terms: string;
  source_statute: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 법령지식 검색 결과 (하이브리드) — 실생활 법률 (교통사고, 층간소음 등) */
export interface LegalKnowledgeResult {
  id: number;
  topic: string;
  title: string;
  content: string;
  related_statutes: string;
  category: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/** 통합 RAG 검색 결과 */
export interface RAGContext {
  legalForms: LegalFormResult[];
  easyLaw: EasyLawResult[];
  statutes: StatuteResult[];
  aihubQA: AihubQAResult[];
  legalJudgments: LegalJudgmentResult[];
  legalMRC: LegalMRCResult[];
  legalTerms: LegalTermResult[];
  legalKnowledge: LegalKnowledgeResult[];
}

/** 검색 대상 테이블 타입 */
type SearchTable = SourceTable;

/** 검색 옵션 */
export interface SearchOptions {
  tables?: SearchTable[];
  limit?: number;
  threshold?: number;
  /** 키워드 검색 가중치 (기본 0.3) */
  keywordWeight?: number;
  /** 시맨틱 검색 가중치 (기본 0.7) */
  semanticWeight?: number;
  /** 사건 유형 (re-ranking 카테고리 매칭에 사용) */
  caseType?: string;
  /** re-ranking 활성화 여부 (기본 true) */
  enableRerank?: boolean;
}

// Re-ranking 타입 re-export
export type { SearchResult, RankedResult, SourceTable };

// ──────────────────────────────────────────────
// Voyage AI 임베딩 응답 타입
// ──────────────────────────────────────────────
interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  model: string;
  usage: { total_tokens: number };
}

// ──────────────────────────────────────────────
// 에이전트별 검색 설정
// ──────────────────────────────────────────────

/** 에이전트별로 검색할 테이블과 결과 개수 매핑 */
export const AGENT_SEARCH_CONFIG: Record<
  string,
  { tables: SearchTable[]; limit: number }
> = {
  // 판례 검색: legal_judgments(핵심!) + aihub_legal_qa + statutes
  // 실제 사건번호가 있는 판결문 검색 가능 = 할루시네이션 해결
  precedent: {
    tables: ["legal_judgments", "aihub_legal_qa", "statutes"],
    limit: 5,
  },
  // 적법성 검증: statutes + easy_law + legal_knowledge
  legal: {
    tables: ["statutes", "easy_law", "legal_knowledge"],
    limit: 5,
  },
  // 쟁점 분석: legal_judgments + aihub_legal_qa + statutes + legal_mrc
  analysis: {
    tables: ["legal_judgments", "aihub_legal_qa", "statutes", "legal_mrc"],
    limit: 5,
  },
  // 문서 작성: legal_forms + statutes + legal_judgments + legal_terms
  docgen: {
    tables: ["legal_forms", "statutes", "legal_judgments", "legal_terms"],
    limit: 5,
  },
  // 검토: statutes + aihub_legal_qa + legal_judgments
  review: {
    tables: ["statutes", "aihub_legal_qa", "legal_judgments"],
    limit: 3,
  },
};

// ──────────────────────────────────────────────
// Voyage AI 임베딩 함수
// ──────────────────────────────────────────────

/**
 * Voyage AI를 사용하여 쿼리 텍스트를 벡터로 변환합니다.
 * - 개발환경: VITE_VOYAGE_API_KEY로 직접 호출
 * - 프로덕션: Cloudflare Functions 프록시(/api/voyage) 경유
 */
export async function embedQuery(text: string): Promise<number[]> {
  const voyageApiKey = import.meta.env.VITE_VOYAGE_API_KEY as string | undefined;

  const url = isDev && voyageApiKey ? VOYAGE_DIRECT_URL : VOYAGE_PROXY_URL;

  let headers: Record<string, string>;

  if (isDev && voyageApiKey) {
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${voyageApiKey}`,
    };
  } else {
    // 프로덕션: Cloudflare Functions 프록시 경유 → 미들웨어 인증 필요
    headers = await authHeaders({ "Content-Type": "application/json" });
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voyage 임베딩 실패 (HTTP ${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as VoyageEmbeddingResponse;

  if (!data.data?.[0]?.embedding) {
    throw new Error("Voyage API 응답에 임베딩 벡터가 포함되지 않았습니다.");
  }

  return data.data[0].embedding;
}

// ──────────────────────────────────────────────
// Supabase RPC 호출 헬퍼
// ──────────────────────────────────────────────

/**
 * Supabase RPC 함수를 REST API로 직접 호출합니다.
 */
async function callSupabaseRpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase RPC '${functionName}' 실패 (HTTP ${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as T[];
  return data;
}

// ──────────────────────────────────────────────
// 테이블별 벡터 검색 함수
// ──────────────────────────────────────────────

/**
 * 법률 서식 테이블에서 하이브리드 검색합니다.
 * 시맨틱 + 키워드 검색을 결합하여 정확도를 높입니다.
 */
export async function searchLegalForms(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<LegalFormResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<LegalFormResult>("hybrid_search_legal_forms", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 법률 서식 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 생활법률 테이블에서 하이브리드 검색합니다.
 */
export async function searchEasyLaw(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<EasyLawResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<EasyLawResult>("hybrid_search_easy_law", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 생활법률 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 법령 조문 테이블에서 하이브리드 검색합니다.
 */
export async function searchStatutes(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<StatuteResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<StatuteResult>("hybrid_search_statutes", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 법령 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * AI Hub 법률 QA 테이블에서 하이브리드 검색합니다.
 */
export async function searchAihubQA(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<AihubQAResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<AihubQAResult>("hybrid_search_aihub_qa", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 법률 QA 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 판결문 테이블에서 하이브리드 검색합니다.
 * 실제 사건번호가 포함된 판결문을 검색하여 할루시네이션을 방지합니다.
 */
export async function searchLegalJudgments(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<LegalJudgmentResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<LegalJudgmentResult>("hybrid_search_legal_judgments", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 판결문 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 기계독해 QA 테이블에서 하이브리드 검색합니다.
 * 법률 문서에 대한 질문-답변 쌍을 검색합니다.
 */
export async function searchLegalMRC(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<LegalMRCResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<LegalMRCResult>("hybrid_search_legal_mrc", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 기계독해 QA 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 법령용어 사전 테이블에서 하이브리드 검색합니다.
 * 정확한 법률 용어 정의와 관련 용어를 검색합니다.
 */
export async function searchLegalTerms(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<LegalTermResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<LegalTermResult>("hybrid_search_legal_terms", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 법령용어 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 법령지식 테이블에서 하이브리드 검색합니다.
 * 교통사고, 층간소음 등 실생활 법률 지식을 검색합니다.
 */
export async function searchLegalKnowledge(
  query: string,
  limit: number = 5,
  keywordWeight: number = 0.3,
  semanticWeight: number = 0.7,
): Promise<LegalKnowledgeResult[]> {
  try {
    const embedding = await embedQuery(query);
    const results = await callSupabaseRpc<LegalKnowledgeResult>("hybrid_search_legal_knowledge", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
      keyword_weight: keywordWeight,
      semantic_weight: semanticWeight,
    });
    return results;
  } catch (error: unknown) {
    console.warn("[RAG] 법령지식 하이브리드 검색 실패:", error instanceof Error ? error.message : error);
    return [];
  }
}

// ──────────────────────────────────────────────
// 통합 검색 함수
// ──────────────────────────────────────────────

/** 빈 RAGContext를 생성합니다 */
function emptyRAGContext(): RAGContext {
  return {
    legalForms: [],
    easyLaw: [],
    statutes: [],
    aihubQA: [],
    legalJudgments: [],
    legalMRC: [],
    legalTerms: [],
    legalKnowledge: [],
  };
}

/** 테이블 이름과 하이브리드 검색 RPC 함수명 매핑 */
const TABLE_RPC_MAP: Record<SearchTable, string> = {
  legal_forms: "hybrid_search_legal_forms",
  easy_law: "hybrid_search_easy_law",
  statutes: "hybrid_search_statutes",
  aihub_legal_qa: "hybrid_search_aihub_qa",
  legal_judgments: "hybrid_search_legal_judgments",
  legal_mrc: "hybrid_search_legal_mrc",
  legal_terms: "hybrid_search_legal_terms",
  legal_knowledge: "hybrid_search_legal_knowledge",
};

/** 테이블 이름과 RAGContext 필드명 매핑 */
const TABLE_CONTEXT_KEY_MAP: Record<SearchTable, keyof RAGContext> = {
  legal_forms: "legalForms",
  easy_law: "easyLaw",
  statutes: "statutes",
  aihub_legal_qa: "aihubQA",
  legal_judgments: "legalJudgments",
  legal_mrc: "legalMRC",
  legal_terms: "legalTerms",
  legal_knowledge: "legalKnowledge",
};

/** 테이블별 한국어 로그 라벨 */
const TABLE_LABEL_MAP: Record<SearchTable, string> = {
  legal_forms: "법률 서식",
  easy_law: "생활법률",
  statutes: "법령",
  aihub_legal_qa: "법률 QA",
  legal_judgments: "판결문",
  legal_mrc: "기계독해 QA",
  legal_terms: "법령용어",
  legal_knowledge: "법령지식",
};

/**
 * 지정된 테이블들에서 동시에 하이브리드 검색 (시맨틱 + 키워드)을 수행합니다.
 * 검색 실패 시 해당 테이블 결과만 빈 배열로 반환 (graceful degradation).
 */
export async function searchAll(
  query: string,
  options?: SearchOptions,
): Promise<RAGContext> {
  const tables = options?.tables ?? [
    "legal_forms",
    "easy_law",
    "statutes",
    "aihub_legal_qa",
  ];
  const limit = options?.limit ?? 5;
  const keywordWeight = options?.keywordWeight ?? 0.3;
  const semanticWeight = options?.semanticWeight ?? 0.7;

  // 임베딩을 한 번만 생성하여 재사용
  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (error: unknown) {
    console.warn("[RAG] 임베딩 생성 실패, 빈 결과 반환:", error instanceof Error ? error.message : error);
    return emptyRAGContext();
  }

  // 하이브리드 검색 공통 파라미터
  const hybridParams = {
    query_text: query,
    query_embedding: embedding,
    match_count: limit,
    keyword_weight: keywordWeight,
    semantic_weight: semanticWeight,
  };

  // 각 테이블 하이브리드 검색을 병렬로 실행
  const searchPromises: Record<string, Promise<unknown[]>> = {};

  for (const table of tables) {
    const rpcName = TABLE_RPC_MAP[table];
    const label = TABLE_LABEL_MAP[table];
    if (rpcName) {
      searchPromises[table] = callSupabaseRpc<unknown>(rpcName, hybridParams).catch(
        (error: unknown) => {
          console.warn(
            `[RAG] ${label} 하이브리드 검색 실패:`,
            error instanceof Error ? error.message : error,
          );
          return [];
        },
      );
    }
  }

  const keys = Object.keys(searchPromises);
  const values = await Promise.all(keys.map((k) => searchPromises[k]));

  const resultMap: Record<string, unknown[]> = {};
  keys.forEach((key, i) => {
    resultMap[key] = values[i];
  });

  const context = emptyRAGContext();
  for (const table of tables) {
    const contextKey = TABLE_CONTEXT_KEY_MAP[table];
    if (contextKey && resultMap[table]) {
      // 각 필드에 타입 캐스팅하여 할당
      (context as unknown as Record<string, unknown>)[contextKey] = resultMap[table];
    }
  }

  return context;
}

/**
 * 모든 테이블에서 하이브리드 검색 후 re-ranking을 적용합니다.
 * 소스 다양성을 보장하며 최종 topK 결과를 반환합니다.
 */
export async function searchAllWithRerank(
  query: string,
  options?: SearchOptions,
): Promise<RankedResult[]> {
  const context = await searchAll(query, options);
  const enableRerank = options?.enableRerank ?? true;

  // RAGContext를 SearchResult[] 형태로 변환
  const allResults: SearchResult[] = [
    ...context.legalForms.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title,
      score: r.combined_score,
      source: "legal_forms" as const,
      metadata: {
        form_type: r.form_type,
        case_category: r.case_category,
        source: r.source,
      },
    })),
    ...context.easyLaw.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title ?? r.topic,
      score: r.combined_score,
      source: "easy_law" as const,
      metadata: { topic: r.topic, related_statutes: r.related_statutes },
    })),
    ...context.statutes.map((r) => ({
      id: r.id,
      content: r.article_content,
      title: `${r.statute_name} ${r.article_number}`,
      score: r.combined_score,
      source: "statutes" as const,
      metadata: {
        statute_name: r.statute_name,
        article_number: r.article_number,
        article_title: r.article_title,
      },
    })),
    ...context.aihubQA.map((r) => ({
      id: r.id,
      content: r.answer,
      title: r.question,
      score: r.combined_score,
      source: "aihub_legal_qa" as const,
      metadata: {
        category: r.category,
        doc_type: r.doc_type,
        source_info: r.source_info,
      },
    })),
    ...context.legalJudgments.map((r) => ({
      id: r.id,
      content: r.summary || r.full_text,
      title: `${r.case_number} (${r.court})`,
      score: r.combined_score,
      source: "legal_judgments" as const,
      metadata: {
        case_number: r.case_number,
        court: r.court,
        case_date: r.case_date,
        category: r.category,
        key_issues: r.key_issues,
      },
    })),
    ...context.legalMRC.map((r) => ({
      id: r.id,
      content: r.answer,
      title: r.question,
      score: r.combined_score,
      source: "legal_mrc" as const,
      metadata: {
        document_title: r.document_title,
        category: r.category,
        context_passage: r.context_passage,
      },
    })),
    ...context.legalTerms.map((r) => ({
      id: r.id,
      content: r.definition,
      title: r.term,
      score: r.combined_score,
      source: "legal_terms" as const,
      metadata: {
        related_terms: r.related_terms,
        source_statute: r.source_statute,
      },
    })),
    ...context.legalKnowledge.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title ?? r.topic,
      score: r.combined_score,
      source: "legal_knowledge" as const,
      metadata: {
        topic: r.topic,
        category: r.category,
        related_statutes: r.related_statutes,
      },
    })),
  ];

  if (!enableRerank) {
    // re-ranking 비활성화 시 combined_score 기준 정렬
    return allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit ?? 10)
      .map((r) => ({
        ...r,
        originalScore: r.score,
        keywordOverlapScore: 0,
        lengthScore: 1,
        categoryScore: 0.5,
        finalScore: r.score,
      }));
  }

  return rerankWithDiversity(
    allResults,
    query,
    options?.limit ?? 10,
    options?.caseType,
  );
}

// ──────────────────────────────────────────────
// 에이전트별 RAG 검색
// ──────────────────────────────────────────────

/**
 * 특정 에이전트에 필요한 RAG 컨텍스트를 하이브리드 검색합니다.
 * 에이전트 설정에 없는 경우 빈 결과를 반환합니다.
 *
 * @param agentId - 에이전트 ID
 * @param query - 검색 쿼리
 * @param caseType - 사건 유형 (re-ranking 카테고리 매칭에 사용)
 */
export async function searchForAgent(
  agentId: AgentId,
  query: string,
  caseType?: string,
): Promise<RAGContext> {
  if (!isRagAvailable) return emptyRAGContext();

  const config = AGENT_SEARCH_CONFIG[agentId];
  if (!config) {
    return emptyRAGContext();
  }

  return searchAll(query, {
    tables: config.tables,
    limit: config.limit,
    caseType,
  });
}

// ──────────────────────────────────────────────
// RAG 컨텍스트 포맷터
// ──────────────────────────────────────────────

/**
 * 검색 결과를 Claude 프롬프트에 주입할 수 있는 텍스트로 변환합니다.
 * 결과가 없으면 빈 문자열을 반환합니다.
 */
export function formatRAGContext(results: RAGContext): string {
  const sections: string[] = [];

  // 판결문 (가장 중요 — 실제 사건번호 포함)
  if (results.legalJudgments.length > 0) {
    const judgmentLines = results.legalJudgments.map(
      (j, i) =>
        `${i + 1}. 사건번호: ${j.case_number} | 법원: ${j.court} | 선고일: ${j.case_date} | 분류: ${j.category}\n` +
        `   판시사항: ${j.summary}\n` +
        (j.key_issues ? `   핵심쟁점: ${j.key_issues}\n` : "") +
        (j.statutes_ref ? `   참조조문: ${j.statutes_ref}\n` : "") +
        `   [시맨틱: ${(j.semantic_score * 100).toFixed(1)}% | 키워드: ${(j.keyword_score * 100).toFixed(1)}% | 종합: ${(j.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 판결문 (실제 사건번호)\n${judgmentLines.join("\n\n")}`);
  }

  // 법령 조문
  if (results.statutes.length > 0) {
    const statuteLines = results.statutes.map(
      (s, i) =>
        `${i + 1}. ${s.statute_name} ${s.article_number} (${s.article_title})\n` +
        `   ${s.article_content}\n` +
        `   [시맨틱: ${(s.semantic_score * 100).toFixed(1)}% | 키워드: ${(s.keyword_score * 100).toFixed(1)}% | 종합: ${(s.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 법령 조문\n${statuteLines.join("\n\n")}`);
  }

  // 판례/법률 QA
  if (results.aihubQA.length > 0) {
    const qaLines = results.aihubQA.map(
      (qa, i) =>
        `${i + 1}. [${qa.category}/${qa.doc_type}] ${qa.question}\n` +
        `   답변: ${qa.answer}\n` +
        `   출처: ${qa.source_info}\n` +
        `   [시맨틱: ${(qa.semantic_score * 100).toFixed(1)}% | 키워드: ${(qa.keyword_score * 100).toFixed(1)}% | 종합: ${(qa.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 판례/법률 QA\n${qaLines.join("\n\n")}`);
  }

  // 기계독해 QA
  if (results.legalMRC.length > 0) {
    const mrcLines = results.legalMRC.map(
      (m, i) =>
        `${i + 1}. [${m.category}] ${m.question}\n` +
        `   답변: ${m.answer}\n` +
        `   문서: ${m.document_title}\n` +
        `   근거: ${m.context_passage}\n` +
        `   [시맨틱: ${(m.semantic_score * 100).toFixed(1)}% | 키워드: ${(m.keyword_score * 100).toFixed(1)}% | 종합: ${(m.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 법률 문서 해석 QA (기계독해)\n${mrcLines.join("\n\n")}`);
  }

  // 법령용어
  if (results.legalTerms.length > 0) {
    const termLines = results.legalTerms.map(
      (t, i) =>
        `${i + 1}. ${t.term}\n` +
        `   정의: ${t.definition}\n` +
        (t.related_terms ? `   관련용어: ${t.related_terms}\n` : "") +
        (t.source_statute ? `   출처: ${t.source_statute}\n` : "") +
        `   [시맨틱: ${(t.semantic_score * 100).toFixed(1)}% | 키워드: ${(t.keyword_score * 100).toFixed(1)}% | 종합: ${(t.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 법령용어\n${termLines.join("\n\n")}`);
  }

  // 법령지식 (실생활 법률)
  if (results.legalKnowledge.length > 0) {
    const knowledgeLines = results.legalKnowledge.map(
      (k, i) =>
        `${i + 1}. [${k.category}] ${k.title ?? k.topic}\n` +
        `   ${k.content}\n` +
        (k.related_statutes ? `   관련 법률: ${k.related_statutes}\n` : "") +
        `   [시맨틱: ${(k.semantic_score * 100).toFixed(1)}% | 키워드: ${(k.keyword_score * 100).toFixed(1)}% | 종합: ${(k.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 법령지식 (실생활 법률)\n${knowledgeLines.join("\n\n")}`);
  }

  // 생활법률
  if (results.easyLaw.length > 0) {
    const easyLawLines = results.easyLaw.map(
      (el, i) =>
        `${i + 1}. ${el.topic}\n` +
        `   ${el.content}\n` +
        `   관련 법률: ${el.related_statutes}\n` +
        `   [시맨틱: ${(el.semantic_score * 100).toFixed(1)}% | 키워드: ${(el.keyword_score * 100).toFixed(1)}% | 종합: ${(el.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 생활법률 정보\n${easyLawLines.join("\n\n")}`);
  }

  // 법률 서식
  if (results.legalForms.length > 0) {
    const formLines = results.legalForms.map(
      (f, i) =>
        `${i + 1}. ${f.title} (${f.form_type} / ${f.case_category})\n` +
        `   ${f.content}\n` +
        `   [시맨틱: ${(f.semantic_score * 100).toFixed(1)}% | 키워드: ${(f.keyword_score * 100).toFixed(1)}% | 종합: ${(f.combined_score * 100).toFixed(1)}%]`,
    );
    sections.push(`### 관련 법률 서식\n${formLines.join("\n\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return (
    "──── RAG 검색 결과 (참고 자료) ────\n\n" +
    sections.join("\n\n") +
    "\n\n──── RAG 검색 결과 끝 ────"
  );
}
