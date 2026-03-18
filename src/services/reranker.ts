// Re-ranking 서비스: 하이브리드 검색 결과를 추가 정제하여 최종 순위 결정
// Voyage Rerank API (rerank-2) + 커스텀 fallback (키워드 오버랩, 길이 보너스, 카테고리 매칭)

import { authHeaders } from "./api-auth";

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────

/** 검색 소스 테이블 타입 */
export type SourceTable =
  | "legal_forms"
  | "easy_law"
  | "statutes"
  | "aihub_legal_qa"
  | "legal_judgments"
  | "legal_mrc"
  | "legal_terms"
  | "legal_knowledge"
  | "legal_commentary"
  | "cases";

/** 하이브리드 검색에서 반환된 개별 결과 */
export interface SearchResult {
  id: number | string;
  content: string;
  title: string;
  score: number;
  source: SourceTable;
  metadata?: Record<string, string | null>;
}

/** Re-ranking 후 추가된 점수 필드 */
export interface RankedResult extends SearchResult {
  originalScore: number;
  keywordOverlapScore: number;
  lengthScore: number;
  categoryScore: number;
  temporalScore: number;
  finalScore: number;
}

/** Re-ranking 가중치 설정 */
export interface RerankWeights {
  /** 원본 검색 점수 가중치 (기본 0.50) */
  original: number;
  /** 키워드 오버랩 가중치 (기본 0.25) */
  keywordOverlap: number;
  /** 카테고리 매칭 가중치 (기본 0.15) */
  category: number;
  /** 시간적 관련성 가중치 (기본 0.10, 0이면 계산 생략) */
  temporal?: number;
}

/** 사건 유형별 관련 키워드 매핑 */
const CASE_TYPE_KEYWORDS: Record<string, string[]> = {
  민사: ["민사", "소장", "답변서", "원고", "피고", "민법", "손해배상", "채권", "채무", "불법행위"],
  형사: ["형사", "고소", "고발", "피의자", "피해자", "공소", "형법", "벌금", "징역", "기소"],
  가사: ["가사", "이혼", "양육", "위자료", "재산분할", "친권", "양육비", "가정법원"],
  행정: ["행정", "행정소송", "취소소송", "처분", "행정청", "행정법", "항고소송"],
  노동: ["노동", "근로", "해고", "퇴직금", "부당해고", "근로기준법", "산업재해", "임금"],
  부동산: ["부동산", "임대차", "전세", "보증금", "등기", "매매", "소유권", "임차인"],
  "채권·채무": ["채권", "채무", "대여금", "차용", "이자", "변제", "소멸시효", "지급명령"],
  손해배상: ["손해배상", "불법행위", "과실", "위자료", "일실수입", "치료비", "배상"],
};

/** 한국 법원 계층 점수 — 상급심일수록 높은 선례 가치 */
const COURT_HIERARCHY_SCORE: Record<string, number> = {
  "대법원": 1.0,
  "헌법재판소": 1.0,
  "고등법원": 0.8,
  "특허법원": 0.8,
  "지방법원": 0.6,
  "가정법원": 0.6,
  "행정법원": 0.7,
  "회생법원": 0.6,
};

// ──────────────────────────────────────────────
// 유틸리티 함수
// ──────────────────────────────────────────────

/**
 * 포맷팅된 결과 텍스트에서 법원명, 날짜, 사건번호를 추출합니다.
 * "[대법원]", "2024.03.15", "2024다12345" 등의 패턴을 파싱합니다.
 */
export function extractMetadata(text: string): { court?: string; date?: string; caseNumber?: string } {
  const result: { court?: string; date?: string; caseNumber?: string } = {};

  // 법원명 추출: "[대법원]" 또는 "법원: 대법원" 패턴
  const courtBracketMatch = text.match(/\[([가-힣]+법원|헌법재판소|대법원|고등법원|특허법원|지방법원|가정법원|행정법원|회생법원)\]/);
  const courtLabelMatch = text.match(/법원[:：]\s*([가-힣]+법원|헌법재판소)/);
  if (courtBracketMatch) {
    result.court = courtBracketMatch[1];
  } else if (courtLabelMatch) {
    result.court = courtLabelMatch[1];
  }

  // 날짜 추출: "2024.03.15", "2024-03-15", "2024년 3월 15일" 패턴
  const dotDateMatch = text.match(/\b((?:19|20)\d{2})[.\u002D](0?[1-9]|1[0-2])[.\u002D](0?[1-9]|[12]\d|3[01])\b/);
  const korDateMatch = text.match(/\b((?:19|20)\d{2})년\s*(0?[1-9]|1[0-2])월\s*(0?[1-9]|[12]\d|3[01])일\b/);
  if (dotDateMatch) {
    // 정규화: YYYY-MM-DD 형식으로 통일
    result.date = `${dotDateMatch[1]}-${dotDateMatch[2].padStart(2, "0")}-${dotDateMatch[3].padStart(2, "0")}`;
  } else if (korDateMatch) {
    result.date = `${korDateMatch[1]}-${korDateMatch[2].padStart(2, "0")}-${korDateMatch[3].padStart(2, "0")}`;
  }

  // 사건번호 추출: "2024다12345", "2023가합56789", "2022헌바123" 등 한국 사건번호 패턴
  const caseNumberMatch = text.match(/\b((?:19|20)\d{2})[가-힣]{1,4}\d+\b/);
  if (caseNumberMatch) {
    result.caseNumber = caseNumberMatch[0];
  }

  return result;
}

/**
 * 법원명에서 계층 점수를 조회합니다.
 * 매핑에 없는 법원(예: 특수법원)은 기본값 0.6을 반환합니다.
 */
function getCourtHierarchyScore(court: string): number {
  // 정확 일치 우선
  if (court in COURT_HIERARCHY_SCORE) {
    return COURT_HIERARCHY_SCORE[court];
  }

  // 부분 일치 (예: "서울고등법원" → "고등법원")
  for (const [key, score] of Object.entries(COURT_HIERARCHY_SCORE)) {
    if (court.includes(key)) {
      return score;
    }
  }

  return 0.6; // 알 수 없는 법원은 지방법원 수준으로 처리
}

/**
 * 한국어 텍스트를 공백 및 조사 기준으로 토큰화합니다.
 * 형태소 분석기 없이 간이 토큰화를 수행합니다.
 */
function tokenize(text: string): string[] {
  // 특수문자 제거, 공백 기준 분리, 2글자 이상만
  return text
    .replace(/[^\w\s가-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());
}

/**
 * 두 토큰 배열 간의 오버랩 비율을 계산합니다.
 * 쿼리 토큰 중 결과에 포함된 비율 (0~1)
 */
function computeKeywordOverlap(queryTokens: string[], contentTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;

  let matchCount = 0;
  for (const qt of queryTokens) {
    // 정확 일치 또는 부분 일치 (한국어 조사 포함 처리)
    if (contentTokens.has(qt)) {
      matchCount += 1;
    } else {
      // 부분 일치: 쿼리 토큰이 결과 토큰의 시작 부분에 포함되는 경우
      let partialMatch = false;
      contentTokens.forEach((ct) => {
        if (!partialMatch && (ct.includes(qt) || qt.includes(ct))) {
          partialMatch = true;
        }
      });
      if (partialMatch) {
        matchCount += 0.5;
      }
    }
  }

  return Math.min(matchCount / queryTokens.length, 1.0);
}

/**
 * 텍스트 길이 기반 점수를 계산합니다.
 * 너무 짧으면 (50자 미만) 페널티, 적당한 길이 (200~2000자) 보너스
 */
function computeLengthScore(content: string): number {
  const len = content.length;

  if (len < 30) return 0.3;
  if (len < 100) return 0.6;
  if (len < 200) return 0.8;
  if (len <= 2000) return 1.0;
  if (len <= 5000) return 0.9;
  return 0.8; // 매우 긴 텍스트는 약간 낮춤
}

/**
 * 사건 유형과 결과의 카테고리 매칭 점수를 계산합니다.
 */
function computeCategoryScore(
  result: SearchResult,
  caseType: string | undefined,
): number {
  if (!caseType) return 0.5; // 사건 유형 미지정 시 중립

  const keywords = CASE_TYPE_KEYWORDS[caseType];
  if (!keywords) return 0.5;

  // 결과의 전체 텍스트에서 카테고리 키워드 출현 확인
  const fullText = [
    result.title,
    result.content,
    result.metadata?.["category"] ?? "",
    result.metadata?.["case_category"] ?? "",
    result.metadata?.["form_type"] ?? "",
    result.metadata?.["doc_type"] ?? "",
    result.metadata?.["case_type"] ?? "",
    result.metadata?.["court"] ?? "",
    result.metadata?.["topic"] ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let matchCount = 0;
  for (const kw of keywords) {
    if (fullText.includes(kw)) {
      matchCount += 1;
    }
  }

  // 매칭된 키워드 수에 따라 0~1 스케일
  const ratio = matchCount / Math.min(keywords.length, 5);
  return Math.min(ratio, 1.0);
}

/**
 * 시간적 관련성 보너스 점수 계산 (cases 및 법원 결과용 이산 구간 방식)
 * - 최근 3년 이내: +0.15
 * - 3~5년: +0.10
 * - 5~10년: +0.05
 * - 10년 초과: 보너스 없음 (0)
 * - 대법원 전원합의체, 헌법재판소 결정: 연도 무관 항상 +0.15
 */
function computeTemporalScore(metadata?: Record<string, string | null>): number {
  if (!metadata) return 0; // 날짜 없으면 보너스 없음

  // 전원합의체 판결 or 헌법재판소 결정 → 최고 보너스 고정
  const court = metadata["court"] || "";
  const caseName = metadata["case_name"] || "";
  const docId = metadata["doc_id"] || "";

  if (
    court.includes("전원합의체") ||
    caseName.includes("전원합의체") ||
    docId.includes("전원합의체") ||
    court.includes("헌법재판소") ||
    court.includes("헌재")
  ) {
    return 0.15;
  }

  // 날짜 추출 — case_date 우선, 없으면 announce_date
  const dateStr = metadata["case_date"] || metadata["announce_date"] || "";
  if (!dateStr) return 0;

  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year) || year < 1948) return 0;

  const yearsOld = new Date().getFullYear() - year;

  if (yearsOld <= 3) return 0.15;
  if (yearsOld <= 5) return 0.10;
  if (yearsOld <= 10) return 0.05;
  return 0;
}

// ──────────────────────────────────────────────
// 메인 Re-ranking 함수
// ──────────────────────────────────────────────

/**
 * 하이브리드 검색 결과를 re-ranking하여 최종 순위를 결정합니다.
 *
 * Re-ranking 전략:
 * 1. 쿼리 키워드 오버랩 점수 (결과에 쿼리 키워드가 몇 개 포함되는지)
 * 2. 텍스트 길이 보너스 (너무 짧은 결과 페널티, 적당한 길이 우선)
 * 3. 카테고리 매칭 보너스 (사건 유형과 관련된 결과 우선)
 * 4. 시간적 관련성 점수 (최신 판례 우선, 전원합의체·헌법재판소 감쇠 면제)
 * 5. 최종 점수 = original_score * 0.50 + keyword_overlap * 0.25 + category_bonus * 0.15 + temporal * 0.10
 *
 * @param results - 하이브리드 검색 결과 배열
 * @param query - 원본 검색 쿼리 텍스트
 * @param topK - 반환할 최대 결과 수 (기본값: 전체)
 * @param caseType - 사건 유형 (카테고리 매칭에 사용)
 * @param weights - 점수 가중치 설정
 * @returns Re-ranking된 결과 배열
 */
export function rerank(
  results: SearchResult[],
  query: string,
  topK?: number,
  caseType?: string,
  weights?: Partial<RerankWeights>,
): RankedResult[] {
  if (results.length === 0) return [];

  const w: RerankWeights = {
    original: weights?.original ?? 0.50,
    keywordOverlap: weights?.keywordOverlap ?? 0.25,
    category: weights?.category ?? 0.15,
    temporal: weights?.temporal ?? 0.10,
  };

  // 쿼리 토큰화
  const queryTokens = tokenize(query);

  // 원본 점수 정규화 (0~1 범위)
  const maxScore = Math.max(...results.map((r) => r.score), 0.001);

  const ranked: RankedResult[] = results.map((result) => {
    // 결과 텍스트 토큰화
    const contentTokens = new Set(tokenize(result.title + " " + result.content));

    // 각 점수 계산
    const normalizedOriginal = result.score / maxScore;
    const keywordOverlapScore = computeKeywordOverlap(queryTokens, contentTokens);
    const lengthScore = computeLengthScore(result.content);
    const categoryScore = computeCategoryScore(result, caseType);
    const temporalScore = w.temporal ? computeTemporalScore(result.metadata) : 0;

    // 길이 점수는 키워드 오버랩에 곱하여 반영 (독립 가중치 없음)
    const adjustedKeywordScore = keywordOverlapScore * lengthScore;

    // 법원 계층 점수: cases 및 legal_judgments 소스에만 적용
    // 원본 정규화 점수에 승수로 반영 (최대 ±20% 범위 내 조정)
    let courtMultiplier = 1.0;
    if (result.source === "cases" || result.source === "legal_judgments") {
      // metadata에서 법원명 추출; 없으면 텍스트에서 파싱
      const courtFromMeta = result.metadata?.["court"] ?? "";
      const courtName = courtFromMeta || extractMetadata(result.title + " " + result.content).court || "";
      if (courtName) {
        const hierarchyScore = getCourtHierarchyScore(courtName);
        // 0.6(기준)~1.0 범위를 0.9~1.1 승수로 선형 변환하여 과도한 억제/증폭 방지
        courtMultiplier = 0.9 + (hierarchyScore - 0.6) * 0.5;
      }
    }

    // 최종 점수 계산 (법원 계층 승수는 원본 점수 항에만 적용)
    const finalScore =
      normalizedOriginal * courtMultiplier * w.original +
      adjustedKeywordScore * w.keywordOverlap +
      categoryScore * w.category +
      temporalScore * (w.temporal ?? 0);

    return {
      ...result,
      originalScore: normalizedOriginal,
      keywordOverlapScore: adjustedKeywordScore,
      lengthScore,
      categoryScore,
      temporalScore,
      finalScore,
    };
  });

  // 최종 점수 기준 내림차순 정렬
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  // topK 적용
  if (topK !== undefined && topK > 0) {
    return ranked.slice(0, topK);
  }

  return ranked;
}

// ──────────────────────────────────────────────
// 소스별 다양성 보장 Re-ranking
// ──────────────────────────────────────────────

/**
 * 다양한 소스에서 결과를 골고루 포함하도록 re-ranking합니다.
 * 동일 소스 결과가 과도하게 집중되는 것을 방지합니다.
 *
 * 다양성 보장 규칙:
 * - 소스별 최대 3건 (maxPerSource 인자로 조정 가능)
 * - cases 소스와 legal_judgments 소스에서 각 1건 이상 포함 (해당 결과가 있는 경우)
 *   → 실제 판결문(cases)과 분석된 판결문(legal_judgments)을 균형 있게 혼합
 *
 * @param results - 하이브리드 검색 결과 배열
 * @param query - 원본 검색 쿼리
 * @param topK - 반환할 최대 결과 수
 * @param caseType - 사건 유형
 * @param maxPerSource - 소스별 최대 포함 수 (기본 3)
 * @returns 소스 다양성이 보장된 re-ranking 결과
 */
export function rerankWithDiversity(
  results: SearchResult[],
  query: string,
  topK: number = 10,
  caseType?: string,
  maxPerSource: number = 3,
): RankedResult[] {
  // 먼저 일반 re-ranking 수행
  const ranked = rerank(results, query, undefined, caseType);

  // 필수 소스별 최고 점수 결과를 먼저 확보 (cases, legal_judgments 각 1건)
  const MUST_INCLUDE_SOURCES: ReadonlyArray<SourceTable> = ["cases", "legal_judgments"];
  const mustInclude: RankedResult[] = [];
  const mustIncludeSourcesSeen = new Set<string>();

  for (const result of ranked) {
    if (
      MUST_INCLUDE_SOURCES.includes(result.source) &&
      !mustIncludeSourcesSeen.has(result.source)
    ) {
      mustInclude.push(result);
      mustIncludeSourcesSeen.add(result.source);
      if (mustIncludeSourcesSeen.size === MUST_INCLUDE_SOURCES.length) break;
    }
  }

  const selected: RankedResult[] = [...mustInclude];
  const sourceCount: Record<string, number> = {};
  const selectedIds = new Set(selected.map((r) => `${r.source}:${r.id}`));

  // 필수 포함 결과의 소스 카운트 초기화
  for (const r of selected) {
    sourceCount[r.source] = (sourceCount[r.source] ?? 0) + 1;
  }

  // 나머지 슬롯을 소스별 상한을 지키며 채움
  for (const result of ranked) {
    if (selected.length >= topK) break;

    const key = `${result.source}:${result.id}`;
    if (selectedIds.has(key)) continue;

    const count = sourceCount[result.source] ?? 0;
    if (count < maxPerSource) {
      selected.push(result);
      selectedIds.add(key);
      sourceCount[result.source] = count + 1;
    }
  }

  // topK를 못 채웠으면 소스 상한 무시하고 남은 결과에서 보충
  if (selected.length < topK) {
    for (const result of ranked) {
      if (selected.length >= topK) break;

      const key = `${result.source}:${result.id}`;
      if (!selectedIds.has(key)) {
        selected.push(result);
        selectedIds.add(key);
      }
    }
  }

  // finalScore 기준으로 재정렬하여 필수 포함 결과가 점수 순서를 깨지 않도록 함
  selected.sort((a, b) => b.finalScore - a.finalScore);

  return selected.slice(0, topK);
}

// ──────────────────────────────────────────────
// Voyage Rerank API
// ──────────────────────────────────────────────

const isDev = import.meta.env.DEV;
const VOYAGE_RERANK_DIRECT_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_RERANK_PROXY_URL = "/api/rerank";
const VOYAGE_RERANK_MODEL = "rerank-2";

/** Voyage Rerank API 응답 타입 */
interface VoyageRerankResponse {
  data: Array<{
    index: number;
    relevance_score: number;
  }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Voyage Rerank API를 사용하여 검색 결과를 re-ranking합니다.
 * 실패 시 커스텀 rerankWithDiversity로 폴백합니다.
 *
 * - 개발환경: VITE_VOYAGE_API_KEY로 직접 호출
 * - 프로덕션: Cloudflare Functions 프록시(/api/rerank) 경유
 *
 * @param query - 검색 쿼리
 * @param results - 하이브리드 검색 결과 배열
 * @param topK - 반환할 최대 결과 수 (기본 10)
 * @param caseType - 사건 유형 (폴백 시 카테고리 매칭에 사용)
 * @returns Re-ranking된 결과 배열
 */
export async function voyageRerank(
  query: string,
  results: SearchResult[],
  topK: number = 10,
  caseType?: string,
): Promise<RankedResult[]> {
  if (results.length === 0) return [];

  try {
    // 각 결과를 문서 문자열로 변환 (최대 4000자)
    const documents = results.map(
      (r) => `${r.title}\n${r.content}`.slice(0, 4000),
    );

    // dev/prod에 따라 URL과 헤더 결정
    const voyageApiKey = import.meta.env.VITE_VOYAGE_API_KEY as string | undefined;
    const url = isDev && voyageApiKey ? VOYAGE_RERANK_DIRECT_URL : VOYAGE_RERANK_PROXY_URL;

    let headers: Record<string, string>;
    if (isDev && voyageApiKey) {
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${voyageApiKey}`,
      };
    } else {
      headers = await authHeaders({ "Content-Type": "application/json" });
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: VOYAGE_RERANK_MODEL,
        query,
        documents,
        top_k: topK,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[Rerank] Voyage Rerank API 실패 (HTTP ${response.status}): ${errorText}`,
      );
      return rerankWithDiversity(results, query, topK, caseType);
    }

    const data = (await response.json()) as VoyageRerankResponse;

    if (!data.data || !Array.isArray(data.data)) {
      console.warn("[Rerank] Voyage Rerank API 응답 형식이 잘못됨");
      return rerankWithDiversity(results, query, topK, caseType);
    }

    // Voyage 결과를 RankedResult로 매핑
    const ranked: RankedResult[] = data.data.map((item) => {
      const original = results[item.index];
      return {
        ...original,
        originalScore: original.score,
        keywordOverlapScore: 0,
        lengthScore: 1,
        categoryScore: 0,
        temporalScore: 0,
        finalScore: item.relevance_score,
      };
    });

    // relevance_score 기준 내림차순 정렬 (Voyage가 이미 정렬하지만 보장)
    ranked.sort((a, b) => b.finalScore - a.finalScore);

    return ranked;
  } catch (error: unknown) {
    console.warn(
      "[Rerank] Voyage Rerank API 호출 중 오류, 커스텀 리랭커로 폴백:",
      error instanceof Error ? error.message : error,
    );
    return rerankWithDiversity(results, query, topK, caseType);
  }
}
