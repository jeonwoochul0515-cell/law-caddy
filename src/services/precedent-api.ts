// 법제처 판례 검색 OpenAPI 프론트엔드 서비스
// Cloudflare Functions 프록시(/api/precedent-search)를 통해 법제처 API 호출

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

/** 프록시 에러 응답 */
interface ProxyErrorResponse {
  error: string;
  detail?: string;
}

/** dev 환경에서는 Vite 프록시 사용 */
const isDev = import.meta.env.DEV;
const PROXY_URL = isDev ? "/api/precedent-search" : "/api/precedent-search";

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
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, count }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as ProxyErrorResponse;
      console.warn(
        "[판례검색] 법제처 API 검색 실패:",
        errorBody.detail ?? errorBody.error ?? `HTTP ${response.status}`,
      );
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
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: serialNumber }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as ProxyErrorResponse;
      console.warn(
        "[판례검색] 판례 상세 조회 실패:",
        errorBody.detail ?? errorBody.error ?? `HTTP ${response.status}`,
      );
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
      parts.push(`   판시사항: ${truncate(p.keyPoints, 500)}`);
    }

    if (p.summary) {
      parts.push(`   판결요지: ${truncate(p.summary, 500)}`);
    }

    if (p.refStatutes) {
      parts.push(`   참조조문: ${truncate(p.refStatutes, 300)}`);
    }

    if (p.refCases) {
      parts.push(`   참조판례: ${truncate(p.refCases, 300)}`);
    }

    return parts.join("\n");
  });

  return lines.join("\n\n");
}

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
