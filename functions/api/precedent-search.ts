// 법제처 판례 검색 OpenAPI 프록시
// POST /api/precedent-search
// body: { query: string, count?: number }
// 법제처 API를 서버사이드에서 호출하여 CORS + SSL 문제 해결

import type { Env } from "./_shared/types";

/** 법제처 API 계정 (공개 OC) */
const LAW_API_OC = "jeonwoochul0515";

/** 법제처 API 기본 URL (HTTP — SSL 인증서 문제 우회) */
const LAW_API_BASE = "http://www.law.go.kr/DRF/lawService.do";

/** 요청 body 타입 */
interface PrecedentSearchRequest {
  query: string;
  count?: number;
  /** 판례 일련번호로 상세 조회 (query 대신 사용) */
  id?: string;
}

/** 법제처 API 판례 항목 */
interface LawApiPrecedent {
  판례일련번호: string;
  사건명: string;
  사건번호: string;
  선고일자: string;
  법원명: string;
  판례내용: string;
  판시사항: string;
  판결요지: string;
  참조조문: string;
  참조판례: string;
}

/** 법제처 판례 검색 API 응답 */
interface LawApiSearchResponse {
  PrecSearch: {
    totalCnt: string;
    prec: LawApiPrecedent[] | LawApiPrecedent;
  };
}

/** 법제처 판례 상세 조회 API 응답 */
interface LawApiDetailResponse {
  PrecService: LawApiPrecedent;
}

/** 프론트엔드로 반환할 판례 타입 */
interface PrecedentResult {
  serialNumber: string;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  summary: string;
  keyPoints: string;
  refStatutes: string;
  refCases: string;
  content: string;
}

/**
 * 법제처 API에서 받은 판례를 프론트엔드 형식으로 변환합니다.
 */
function mapPrecedent(raw: LawApiPrecedent): PrecedentResult {
  return {
    serialNumber: raw.판례일련번호 ?? "",
    caseNumber: raw.사건번호 ?? "",
    caseName: raw.사건명 ?? "",
    court: raw.법원명 ?? "",
    date: formatDate(raw.선고일자 ?? ""),
    summary: raw.판결요지 ?? "",
    keyPoints: raw.판시사항 ?? "",
    refStatutes: raw.참조조문 ?? "",
    refCases: raw.참조판례 ?? "",
    content: raw.판례내용 ?? "",
  };
}

/**
 * 법제처 날짜 형식 (20231215)을 읽기 쉬운 형식 (2023.12.15)으로 변환합니다.
 */
function formatDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as PrecedentSearchRequest;

    // 판례 상세 조회 (id 파라미터 사용)
    if (body.id) {
      const url = new URL(LAW_API_BASE);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "prec");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("ID", body.id);

      const response = await fetch(url.toString());

      if (!response.ok) {
        return Response.json(
          {
            error: "법제처 API 호출 실패",
            detail: `HTTP ${response.status} ${response.statusText}`,
          },
          { status: 502 },
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        return Response.json({ precedent: null });
      }

      const data = JSON.parse(text) as LawApiDetailResponse;

      if (!data.PrecService) {
        return Response.json({ precedent: null });
      }

      return Response.json({
        precedent: mapPrecedent(data.PrecService),
      });
    }

    // 판례 검색 (query 파라미터 사용)
    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { error: "검색어(query)가 필요합니다." },
        { status: 400 },
      );
    }

    const count = Math.min(Math.max(body.count ?? 5, 1), 20);

    const url = new URL(LAW_API_BASE);
    url.searchParams.set("OC", LAW_API_OC);
    url.searchParams.set("target", "prec");
    url.searchParams.set("type", "JSON");
    url.searchParams.set("query", body.query);
    url.searchParams.set("display", String(count));
    url.searchParams.set("sort", "ddes"); // 최신순

    const response = await fetch(url.toString());

    if (!response.ok) {
      return Response.json(
        {
          error: "법제처 API 호출 실패",
          detail: `HTTP ${response.status} ${response.statusText}`,
        },
        { status: 502 },
      );
    }

    const text = await response.text();
    if (!text.trim()) {
      return Response.json({ totalCount: 0, precedents: [] });
    }

    const data = JSON.parse(text) as LawApiSearchResponse;

    if (!data.PrecSearch) {
      return Response.json({ totalCount: 0, precedents: [] });
    }

    const totalCount = parseInt(data.PrecSearch.totalCnt ?? "0", 10);

    // prec이 단일 객체일 수도 있고 배열일 수도 있음
    const rawPrecs = Array.isArray(data.PrecSearch.prec)
      ? data.PrecSearch.prec
      : data.PrecSearch.prec
        ? [data.PrecSearch.prec]
        : [];

    const precedents = rawPrecs.map(mapPrecedent);

    return Response.json({ totalCount, precedents });
  } catch (error) {
    return Response.json(
      {
        error: "판례 검색 프록시 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
