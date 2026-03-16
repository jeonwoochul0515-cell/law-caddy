/**
 * 검색 풀: 다수 에이전트의 DB 검색을 중복 제거하여 효율화
 *
 * 문제: 5개 에이전트가 각각 동일한 테이블을 독립적으로 검색
 *   → statutes 5회, legal_commentary 5회, legal_judgments 4회 = ~20회 DB 호출
 *
 * 해결: 테이블별 1회만 검색하고 결과를 에이전트별로 필터링
 *   → 9개 테이블 각 1회 = 9회 DB 호출 + 1회 임베딩
 *
 * 사용법:
 *   const pool = new SearchPool(caseDesc, caseType);
 *   const results = await pool.getForAgent("precedent");
 *   const results2 = await pool.getForAgent("analysis"); // 중복 테이블은 재사용
 */

import {
  searchAll,
  AGENT_SEARCH_CONFIG,
  TABLE_CONTEXT_KEY_MAP,
  emptyRAGContext,
  isRagAvailable,
} from "./rag";
import type { RAGContext, SearchOptions } from "./rag";
import type { SourceTable } from "./reranker";

/**
 * SearchPool은 단일 runAllAgents 호출 내에서 RAG 검색을 중복 제거합니다.
 *
 * 모든 에이전트가 필요로 하는 테이블의 합집합(union)을 1회만 검색하고,
 * 각 에이전트에 해당 테이블 결과만 필터링하여 반환합니다.
 */
export class SearchPool {
  private query: string;
  private caseType: string | undefined;

  /** 검색 Promise 중복 방지 — 동일 Promise를 여러 에이전트가 공유 */
  private searchPromise: Promise<RAGContext> | null = null;

  constructor(query: string, caseType?: string) {
    this.query = query;
    this.caseType = caseType;
  }

  /**
   * 전체 테이블 1회 검색.
   * 모든 에이전트가 필요로 하는 테이블 합집합을 구하고,
   * 가장 큰 limit으로 searchAll을 1회 호출한다.
   * 이미 검색 중이면 동일 Promise를 반환한다 (중복 호출 방지).
   */
  private searchOnce(): Promise<RAGContext> {
    if (this.searchPromise) return this.searchPromise;

    // 모든 에이전트의 테이블 합집합 + 최대 limit 계산
    const allTables = new Set<SourceTable>();
    let maxLimit = 5;

    for (const config of Object.values(AGENT_SEARCH_CONFIG)) {
      for (const table of config.tables) {
        allTables.add(table);
      }
      maxLimit = Math.max(maxLimit, config.limit);
    }

    const options: SearchOptions = {
      tables: Array.from(allTables),
      limit: maxLimit,
      caseType: this.caseType,
    };

    this.searchPromise = searchAll(this.query, options);

    return this.searchPromise;
  }

  /**
   * 특정 에이전트용 RAG 컨텍스트를 공유 풀에서 추출.
   * AGENT_SEARCH_CONFIG에 정의된 테이블만 필터링하고,
   * 해당 에이전트의 limit만큼 결과를 잘라서 반환한다.
   *
   * @param agentId - 에이전트 ID (precedent, legal, analysis, docgen, review 등)
   * @returns 해당 에이전트에 필요한 테이블 결과만 포함한 RAGContext
   */
  async getForAgent(agentId: string): Promise<RAGContext> {
    // RAG가 비활성화된 경우 빈 결과 반환
    if (!isRagAvailable) return emptyRAGContext();

    const config = AGENT_SEARCH_CONFIG[agentId];
    if (!config) return emptyRAGContext();

    const all = await this.searchOnce();

    // 해당 에이전트의 테이블만 필터링하여 새 RAGContext 구성
    const filtered = emptyRAGContext();

    for (const table of config.tables) {
      const contextKey = TABLE_CONTEXT_KEY_MAP[table];
      if (!contextKey) continue;

      const sourceArray = all[contextKey];
      if (!sourceArray || sourceArray.length === 0) continue;

      // 에이전트의 limit만큼 잘라서 할당
      const sliced = sourceArray.slice(0, config.limit);

      // RAGContext의 각 필드 타입에 맞게 할당
      // (모든 필드가 배열 타입이므로 Record 캐스팅으로 동적 할당)
      (filtered as Record<keyof RAGContext, unknown[]>)[contextKey] = sliced;
    }

    return filtered;
  }
}
