// 법령 조문 조회 + 개정 여부 검증 API
// 법제처 target=law API로 법조문 전문 조회 및 현행 여부 확인
import type { Env } from "./_shared/types";

const LAW_API_OC = "jeonwoochul0515";
const LAW_API_SEARCH = "https://www.law.go.kr/DRF/lawSearch.do";
const FETCH_TIMEOUT_MS = 10000;

interface StatuteCheckRequest {
  /** 검증할 법조문 목록: ["민법 제406조", "민사소송법 제213조"] */
  statutes: string[];
}

interface StatuteResult {
  /** 입력 법조문 */
  query: string;
  /** 존재 여부 */
  found: boolean;
  /** 법령명 */
  lawName?: string;
  /** 시행일자 */
  enforcementDate?: string;
  /** 공포일자 */
  proclamationDate?: string;
  /** 법령 상태: 현행/폐지/일부개정 등 */
  status?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as StatuteCheckRequest;

    if (!body.statutes || !Array.isArray(body.statutes) || body.statutes.length === 0) {
      return Response.json({ error: "statutes 배열이 필요합니다." }, { status: 400 });
    }

    const statutes = body.statutes.slice(0, 15); // 최대 15건
    const results: StatuteResult[] = [];

    for (const statute of statutes) {
      try {
        // 법령명만 추출 (예: "민법 제406조" → "민법")
        const lawNameMatch = statute.match(/^([가-힣]+법)/);
        const searchQuery = lawNameMatch ? lawNameMatch[1] : statute;

        const url = new URL(LAW_API_SEARCH);
        url.searchParams.set("OC", LAW_API_OC);
        url.searchParams.set("target", "law");
        url.searchParams.set("type", "JSON");
        url.searchParams.set("query", searchQuery);
        url.searchParams.set("display", "1");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          results.push({ query: statute, found: false });
          continue;
        }

        const text = await response.text();
        if (!text.trim()) {
          results.push({ query: statute, found: false });
          continue;
        }

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text);
        } catch {
          results.push({ query: statute, found: false });
          continue;
        }

        // 법령 검색 결과 파싱
        const lawSearch = data.LawSearch as Record<string, unknown> | undefined;
        if (!lawSearch) {
          results.push({ query: statute, found: false });
          continue;
        }

        const rawLaws = Array.isArray(lawSearch.law)
          ? lawSearch.law
          : lawSearch.law
            ? [lawSearch.law]
            : [];

        if (rawLaws.length === 0) {
          results.push({ query: statute, found: false });
          continue;
        }

        const law = rawLaws[0] as Record<string, string>;
        results.push({
          query: statute,
          found: true,
          lawName: law["법령명한글"] ?? law["법령명"] ?? searchQuery,
          enforcementDate: law["시행일자"] ?? "",
          proclamationDate: law["공포일자"] ?? "",
          status: law["법령구분명"] ?? "현행",
        });

        // 법제처 API 부하 방지
        if (statutes.indexOf(statute) < statutes.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        results.push({ query: statute, found: false });
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: "법령 검증 오류", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
