// 법제처 판례·헌재결정례·법령해석례 검색 OpenAPI 프록시
// POST /api/precedent-search
// body: { query: string, count?: number, target?: "prec" | "detc" | "expc" }
// 법제처 API를 서버사이드에서 호출하여 CORS + SSL 문제 해결

import type { Env } from "./_shared/types";

/** 법제처 API 계정 (공개 OC) */
const LAW_API_OC = "jeonwoochul0515";

/** 법제처 API 요청 타임아웃 (ms) */
const FETCH_TIMEOUT_MS = 15000;

/** 재시도 횟수 */
const MAX_RETRIES = 2;

/**
 * 타임아웃 + 재시도가 적용된 fetch 래퍼
 */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok || attempt === retries) return response;
      // 서버 에러(5xx)만 재시도
      if (response.status < 500) return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (attempt === retries) {
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        throw new Error(
          isAbort
            ? `법제처 API 응답 시간 초과 (${FETCH_TIMEOUT_MS}ms)`
            : `법제처 API 연결 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // 재시도 전 짧은 대기
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  // unreachable
  throw new Error("법제처 API 호출 실패");
}

/** 법제처 API — 검색용 URL (lawSearch.do) */
const LAW_API_SEARCH = "https://www.law.go.kr/DRF/lawSearch.do";

/** 법제처 API — 상세 조회용 URL (lawService.do) */
const LAW_API_DETAIL = "https://www.law.go.kr/DRF/lawService.do";

/** 검색 대상 타입 */
type SearchTarget = "prec" | "detc" | "expc";

/** 요청 body 타입 */
interface PrecedentSearchRequest {
  query: string;
  count?: number;
  /** 검색 대상: prec(판례), detc(헌재결정례), expc(법령해석례). 기본값 prec */
  target?: SearchTarget;
  /** 판례 일련번호로 상세 조회 (query 대신 사용, prec 전용) */
  id?: string;
  /** 헌재결정례 일련번호로 상세 조회 (query 대신 사용, detc 전용) */
  detcId?: string;
}

// ---------------------------------------------------------------------------
// 판례 (prec) 타입
// ---------------------------------------------------------------------------

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
interface LawApiPrecSearchResponse {
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

// ---------------------------------------------------------------------------
// 헌재결정례 (detc) 타입
// ---------------------------------------------------------------------------

/** 법제처 API 헌재결정례 항목 */
interface LawApiDetc {
  헌재결정례일련번호: string;
  사건번호: string;
  사건명: string;
  종국일자: string;
  결정요지?: string;
  판시사항?: string;
  참조조문?: string;
}

/** 법제처 헌재결정례 검색 API 응답 */
interface LawApiDetcSearchResponse {
  DetcSearch: {
    totalCnt: string;
    Detc: LawApiDetc[] | LawApiDetc;
  };
}

/** 법제처 헌재결정례 상세 조회 API 응답 */
interface LawApiDetcDetailResponse {
  DetcService: LawApiDetc;
}

/** 프론트엔드로 반환할 헌재결정례 타입 */
interface ConstitutionalDecisionResult {
  serialNumber: string;
  caseNumber: string;
  caseName: string;
  date: string;
  summary: string;
  keyPoints: string;
  refStatutes: string;
}

// ---------------------------------------------------------------------------
// 법령해석례 (expc) 타입
// ---------------------------------------------------------------------------

/** 법제처 API 법령해석례 항목 */
interface LawApiExpc {
  안건번호: string;
  안건명: string;
  회신기관명: string;
  회신일자?: string;
  법령해석례상세링크?: string;
  결정요지?: string;
}

/** 법제처 법령해석례 검색 API 응답 */
interface LawApiExpcSearchResponse {
  Expc: {
    totalCnt: string;
    expc: LawApiExpc[] | LawApiExpc;
  };
}

/** 프론트엔드로 반환할 법령해석례 타입 */
interface LegalInterpretationResult {
  caseNumber: string;
  caseName: string;
  agency: string;
  date: string;
  detailLink: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// 매핑 함수
// ---------------------------------------------------------------------------

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
 * 법제처 API에서 받은 헌재결정례를 프론트엔드 형식으로 변환합니다.
 */
function mapConstitutionalDecision(raw: LawApiDetc): ConstitutionalDecisionResult {
  return {
    serialNumber: raw.헌재결정례일련번호 ?? "",
    caseNumber: raw.사건번호 ?? "",
    caseName: raw.사건명 ?? "",
    date: formatDate(raw.종국일자 ?? ""),
    summary: raw.결정요지 ?? "",
    keyPoints: raw.판시사항 ?? "",
    refStatutes: raw.참조조문 ?? "",
  };
}

/**
 * 법제처 API에서 받은 법령해석례를 프론트엔드 형식으로 변환합니다.
 */
function mapLegalInterpretation(raw: LawApiExpc): LegalInterpretationResult {
  return {
    caseNumber: raw.안건번호 ?? "",
    caseName: raw.안건명 ?? "",
    agency: raw.회신기관명 ?? "",
    date: formatDate(raw.회신일자 ?? ""),
    detailLink: raw.법령해석례상세링크 ?? "",
    summary: raw.결정요지 ?? "",
  };
}

/**
 * 법제처 날짜 형식 (20231215)을 읽기 쉬운 형식 (2023.12.15)으로 변환합니다.
 */
function formatDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as PrecedentSearchRequest;
    const target: SearchTarget = body.target ?? "prec";

    // -----------------------------------------------------------------------
    // 헌재결정례 상세 조회 (detcId 파라미터 사용)
    // -----------------------------------------------------------------------
    if (body.detcId) {
      const url = new URL(LAW_API_DETAIL);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "detc");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("ID", body.detcId);

      const response = await fetchWithRetry(url.toString());

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
        return Response.json({ decision: null });
      }

      let data: LawApiDetcDetailResponse;
      try {
        data = JSON.parse(text) as LawApiDetcDetailResponse;
      } catch {
        return Response.json(
          { error: "법제처 헌재결정례 상세 응답 파싱 실패", detail: text.slice(0, 200) },
          { status: 502 },
        );
      }

      // 법제처 API 에러 응답 감지 (헌재 상세 조회)
      const detcDetailError = (data as Record<string, unknown>).result;
      if (detcDetailError && typeof detcDetailError === "string") {
        return Response.json(
          {
            error: "법제처 API 인증 실패",
            detail: `${detcDetailError} — ${(data as Record<string, unknown>).msg ?? ""}`,
          },
          { status: 502 },
        );
      }

      if (!data.DetcService) {
        return Response.json({ decision: null });
      }

      return Response.json({
        decision: mapConstitutionalDecision(data.DetcService),
      });
    }

    // -----------------------------------------------------------------------
    // 판례 상세 조회 (id 파라미터 사용) — lawService.do
    // -----------------------------------------------------------------------
    if (body.id) {
      const url = new URL(LAW_API_DETAIL);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "prec");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("ID", body.id);

      const response = await fetchWithRetry(url.toString());

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

      let data: LawApiDetailResponse;
      try {
        data = JSON.parse(text) as LawApiDetailResponse;
      } catch {
        return Response.json(
          { error: "법제처 판례 상세 응답 파싱 실패", detail: text.slice(0, 200) },
          { status: 502 },
        );
      }

      // 법제처 API 에러 응답 감지 (상세 조회)
      const detailApiError = (data as Record<string, unknown>).result;
      if (detailApiError && typeof detailApiError === "string") {
        return Response.json(
          {
            error: "법제처 API 인증 실패",
            detail: `${detailApiError} — ${(data as Record<string, unknown>).msg ?? ""}`,
          },
          { status: 502 },
        );
      }

      if (!data.PrecService) {
        return Response.json({ precedent: null });
      }

      return Response.json({
        precedent: mapPrecedent(data.PrecService),
      });
    }

    // -----------------------------------------------------------------------
    // 검색 공통 검증
    // -----------------------------------------------------------------------
    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { error: "검색어(query)가 필요합니다." },
        { status: 400 },
      );
    }

    const count = Math.min(Math.max(body.count ?? 5, 1), 20);

    // -----------------------------------------------------------------------
    // 헌재결정례 검색 (target=detc)
    // -----------------------------------------------------------------------
    if (target === "detc") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "detc");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));
      url.searchParams.set("sort", "ddes"); // 최신순

      const response = await fetchWithRetry(url.toString());

      if (!response.ok) {
        return Response.json(
          {
            error: "법제처 헌재결정례 API 호출 실패",
            detail: `HTTP ${response.status} ${response.statusText}`,
          },
          { status: 502 },
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        return Response.json({ totalCount: 0, decisions: [] });
      }

      let data: LawApiDetcSearchResponse;
      try {
        data = JSON.parse(text) as LawApiDetcSearchResponse;
      } catch {
        return Response.json(
          { error: "법제처 헌재결정례 검색 응답 파싱 실패", detail: text.slice(0, 200) },
          { status: 502 },
        );
      }

      // 법제처 API 에러 응답 감지
      const detcApiError = (data as Record<string, unknown>).result;
      if (detcApiError && typeof detcApiError === "string") {
        return Response.json(
          {
            error: "법제처 API 인증 실패",
            detail: `${detcApiError} — ${(data as Record<string, unknown>).msg ?? ""}`,
          },
          { status: 502 },
        );
      }

      if (!data.DetcSearch) {
        return Response.json({ totalCount: 0, decisions: [] });
      }

      const totalCount = parseInt(data.DetcSearch.totalCnt ?? "0", 10);

      const rawDetcs = Array.isArray(data.DetcSearch.Detc)
        ? data.DetcSearch.Detc
        : data.DetcSearch.Detc
          ? [data.DetcSearch.Detc]
          : [];

      const decisions = rawDetcs.map(mapConstitutionalDecision);

      return Response.json({ totalCount, decisions });
    }

    // -----------------------------------------------------------------------
    // 법령해석례 검색 (target=expc)
    // -----------------------------------------------------------------------
    if (target === "expc") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "expc");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));
      url.searchParams.set("sort", "ddes"); // 최신순

      const response = await fetchWithRetry(url.toString());

      if (!response.ok) {
        return Response.json(
          {
            error: "법제처 법령해석례 API 호출 실패",
            detail: `HTTP ${response.status} ${response.statusText}`,
          },
          { status: 502 },
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        return Response.json({ totalCount: 0, interpretations: [] });
      }

      let data: LawApiExpcSearchResponse;
      try {
        data = JSON.parse(text) as LawApiExpcSearchResponse;
      } catch {
        return Response.json(
          { error: "법제처 법령해석례 응답 파싱 실패", detail: text.slice(0, 200) },
          { status: 502 },
        );
      }

      // 법제처 API 에러 응답 감지
      const expcApiError = (data as Record<string, unknown>).result;
      if (expcApiError && typeof expcApiError === "string") {
        return Response.json(
          {
            error: "법제처 API 인증 실패",
            detail: `${expcApiError} — ${(data as Record<string, unknown>).msg ?? ""}`,
          },
          { status: 502 },
        );
      }

      if (!data.Expc) {
        return Response.json({ totalCount: 0, interpretations: [] });
      }

      const totalCount = parseInt(data.Expc.totalCnt ?? "0", 10);

      const rawExpcs = Array.isArray(data.Expc.expc)
        ? data.Expc.expc
        : data.Expc.expc
          ? [data.Expc.expc]
          : [];

      const interpretations = rawExpcs.map(mapLegalInterpretation);

      return Response.json({ totalCount, interpretations });
    }

    // -----------------------------------------------------------------------
    // 판례 검색 (target=prec, 기본값)
    // -----------------------------------------------------------------------
    const url = new URL(LAW_API_SEARCH);
    url.searchParams.set("OC", LAW_API_OC);
    url.searchParams.set("target", "prec");
    url.searchParams.set("type", "JSON");
    url.searchParams.set("query", body.query);
    url.searchParams.set("display", String(count));
    url.searchParams.set("sort", "ddes"); // 최신순

    const response = await fetchWithRetry(url.toString());

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

    let data: LawApiPrecSearchResponse;
    try {
      data = JSON.parse(text) as LawApiPrecSearchResponse;
    } catch {
      return Response.json(
        { error: "법제처 판례 검색 응답 파싱 실패", detail: text.slice(0, 200) },
        { status: 502 },
      );
    }

    // 법제처 API 에러 응답 감지 (HTTP 200이지만 body에 에러)
    // 예: {"result":"사용자 정보 검증에 실패하였습니다.","msg":"IP주소 및 도메인주소를 등록해 주세요."}
    const apiError = (data as Record<string, unknown>).result;
    if (apiError && typeof apiError === "string") {
      return Response.json(
        {
          error: "법제처 API 인증 실패",
          detail: `${apiError} — ${(data as Record<string, unknown>).msg ?? ""}`,
        },
        { status: 502 },
      );
    }

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
