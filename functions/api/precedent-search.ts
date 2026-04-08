// 법제처 판례·헌재결정례·법령해석례 검색 OpenAPI 프록시
// POST /api/precedent-search
// body: { query: string, count?: number, target?: "prec" | "detc" | "expc" }
// 법제처 API를 서버사이드에서 호출하여 CORS + SSL 문제 해결

import type { Env } from "./_shared/types";

/** 법제처 API 계정 (공개 OC) */
const LAW_API_OC = "jeonwoochul0515";

/** 법제처 API 요청 타임아웃 (ms) */
const FETCH_TIMEOUT_MS = 25000;

/** 재시도 횟수 */
const MAX_RETRIES = 3;

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

/** 법제처 API — 검색용 URL (lawSearch.do, 고정IP 프록시 경유) */
const LAW_API_SEARCH = "http://api.law-caddy.com/DRF/lawSearch.do";

/** 법제처 API — 상세 조회용 URL (lawService.do, 고정IP 프록시 경유) */
const LAW_API_DETAIL = "http://api.law-caddy.com/DRF/lawService.do";

/** 검색 대상 타입 */
type SearchTarget = "prec" | "detc" | "expc" | "law" | "lstrm" | "aiSearch" | "aiRltLs" | "nlrc" | "ftc" | "lstrmRltJo";

/** 요청 body 타입 */
interface PrecedentSearchRequest {
  query: string;
  count?: number;
  /** 검색 대상: prec(판례), detc(헌재결정례), expc(법령해석례), law(현행법령), lstrm(법령용어). 기본값 prec */
  target?: SearchTarget;
  /** 판례 일련번호로 상세 조회 (query 대신 사용, prec 전용) */
  id?: string;
  /** 헌재결정례 일련번호로 상세 조회 (query 대신 사용, detc 전용) */
  detcId?: string;
  /** 법률명 필터 (JO 파라미터, 판례 검색 시 참조조문 기반 필터링) */
  jo?: string;
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
// 현행법령 (law) 타입
// ---------------------------------------------------------------------------

/** 법제처 API 법령 항목 */
interface LawApiLaw {
  법령일련번호: string;
  법령명한글: string;
  법령약칭명?: string;
  시행일자?: string;
  법령상세링크?: string;
  조문내용?: string;
}

/** 법제처 법령 검색 API 응답 */
interface LawApiLawSearchResponse {
  LawSearch: {
    totalCnt: string;
    law: LawApiLaw[] | LawApiLaw;
  };
}

/** 프론트엔드로 반환할 법령 타입 */
interface StatuteResult {
  serialNumber: string;
  lawName: string;
  abbreviation: string;
  enforcementDate: string;
  detailLink: string;
  content: string;
}

// ---------------------------------------------------------------------------
// 법령용어 (lstrm) 타입
// ---------------------------------------------------------------------------

/** 법제처 API 법령용어 항목 */
interface LawApiTerm {
  용어명?: string;
  정의?: string;
  법령명?: string;
}

/** 법제처 법령용어 검색 API 응답 */
interface LawApiTermSearchResponse {
  LstrmSearch: {
    totalCnt: string;
    lstrm: LawApiTerm[] | LawApiTerm;
  };
}

/** 프론트엔드로 반환할 법령용어 타입 */
interface LegalTermResult {
  term: string;
  definition: string;
  lawName: string;
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
 * 법제처 API에서 받은 법령을 프론트엔드 형식으로 변환합니다.
 */
function mapStatute(raw: LawApiLaw): StatuteResult {
  return {
    serialNumber: raw.법령일련번호 ?? "",
    lawName: raw.법령명한글 ?? "",
    abbreviation: raw.법령약칭명 ?? "",
    enforcementDate: formatDate(raw.시행일자 ?? ""),
    detailLink: raw.법령상세링크 ?? "",
    content: raw.조문내용 ?? "",
  };
}

/**
 * 법제처 API에서 받은 법령용어를 프론트엔드 형식으로 변환합니다.
 */
function mapLegalTerm(raw: LawApiTerm): LegalTermResult {
  return {
    term: raw.용어명 ?? "",
    definition: raw.정의 ?? "",
    lawName: raw.법령명 ?? "",
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
    // 현행법령 검색 (target=law)
    // -----------------------------------------------------------------------
    if (target === "law") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "law");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) {
        return Response.json({ error: "법제처 법령 API 호출 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      }
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, statutes: [] });

      let data: LawApiLawSearchResponse;
      try { data = JSON.parse(text) as LawApiLawSearchResponse; }
      catch { return Response.json({ error: "법제처 법령 응답 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = (data as Record<string, unknown>).result;
      if (apiError && typeof apiError === "string") {
        return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError} — ${(data as Record<string, unknown>).msg ?? ""}` }, { status: 502 });
      }
      if (!data.LawSearch) return Response.json({ totalCount: 0, statutes: [] });

      const totalCount = parseInt(data.LawSearch.totalCnt ?? "0", 10);
      const rawLaws = Array.isArray(data.LawSearch.law) ? data.LawSearch.law : data.LawSearch.law ? [data.LawSearch.law] : [];
      const statutes = rawLaws.map(mapStatute);
      return Response.json({ totalCount, statutes });
    }

    // -----------------------------------------------------------------------
    // 법령용어 검색 (target=lstrm)
    // -----------------------------------------------------------------------
    if (target === "lstrm") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "lstrm");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) {
        return Response.json({ error: "법제처 법령용어 API 호출 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      }
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, terms: [] });

      let data: LawApiTermSearchResponse;
      try { data = JSON.parse(text) as LawApiTermSearchResponse; }
      catch { return Response.json({ error: "법제처 법령용어 응답 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = (data as Record<string, unknown>).result;
      if (apiError && typeof apiError === "string") {
        return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError} — ${(data as Record<string, unknown>).msg ?? ""}` }, { status: 502 });
      }
      if (!data.LstrmSearch) return Response.json({ totalCount: 0, terms: [] });

      const totalCount = parseInt(data.LstrmSearch.totalCnt ?? "0", 10);
      const rawTerms = Array.isArray(data.LstrmSearch.lstrm) ? data.LstrmSearch.lstrm : data.LstrmSearch.lstrm ? [data.LstrmSearch.lstrm] : [];
      const terms = rawTerms.map(mapLegalTerm);
      return Response.json({ totalCount, terms });
    }

    // -----------------------------------------------------------------------
    // 지능형 법령검색 (target=aiSearch) — 조문 원문 포함
    // -----------------------------------------------------------------------
    if (target === "aiSearch") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "aiSearch");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("search", "0"); // 법령조문
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) return Response.json({ error: "법제처 지능형검색 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, articles: [] });

      let data: Record<string, unknown>;
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { return Response.json({ error: "지능형검색 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = data.result;
      if (apiError && typeof apiError === "string") return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError}` }, { status: 502 });

      const aiData = data.aiSearch as Record<string, unknown> | undefined;
      if (!aiData) return Response.json({ totalCount: 0, articles: [] });

      const totalCount = parseInt(String(aiData.검색결과개수 ?? "0"), 10);
      const rawArticles = Array.isArray(aiData.법령조문) ? aiData.법령조문 : aiData.법령조문 ? [aiData.법령조문] : [];
      const articles = (rawArticles as Array<Record<string, string>>).map((a) => ({
        lawName: a.법령명 ?? "",
        articleNumber: a.조문번호 ?? "",
        articleTitle: a.조문제목 ?? "",
        articleContent: a.조문내용 ?? "",
        enforcementDate: formatDate(a.시행일자?.slice(0, 8) ?? ""),
      }));
      return Response.json({ totalCount, articles });
    }

    // -----------------------------------------------------------------------
    // 연관법령 검색 (target=aiRltLs) — 키워드로 관련 법조문 자동 탐색
    // -----------------------------------------------------------------------
    if (target === "aiRltLs") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "aiRltLs");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("search", "0");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) return Response.json({ error: "법제처 연관법령 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, relatedLaws: [] });

      let data: Record<string, unknown>;
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { return Response.json({ error: "연관법령 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = data.result;
      if (apiError && typeof apiError === "string") return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError}` }, { status: 502 });

      const aiData = data.aiRltLsSearch as Record<string, unknown> | undefined;
      if (!aiData) return Response.json({ totalCount: 0, relatedLaws: [] });

      const totalCount = parseInt(String(aiData.검색결과개수 ?? "0"), 10);
      const rawLaws = Array.isArray(aiData.법령조문) ? aiData.법령조문 : aiData.법령조문 ? [aiData.법령조문] : [];
      const relatedLaws = (rawLaws as Array<Record<string, string>>).map((a) => ({
        lawName: a.법령명 ?? "",
        articleNumber: a.조문번호 ?? "",
        articleTitle: a.조문제목 ?? "",
        enforcementDate: formatDate(a.시행일자?.slice(0, 8) ?? ""),
      }));
      return Response.json({ totalCount, relatedLaws });
    }

    // -----------------------------------------------------------------------
    // 노동위원회 심판례 (target=nlrc)
    // -----------------------------------------------------------------------
    if (target === "nlrc") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "nlrc");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) return Response.json({ error: "노동위원회 API 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, laborCases: [] });

      let data: Record<string, unknown>;
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { return Response.json({ error: "노동위원회 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = data.result;
      if (apiError && typeof apiError === "string") return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError}` }, { status: 502 });

      // 응답 키가 불확실 — 범용 파싱
      const searchData = (data.nlrcSearch ?? data.NlrcSearch ?? data.nlrc) as Record<string, unknown> | undefined;
      if (!searchData) return Response.json({ totalCount: 0, laborCases: [] });

      const totalCount = parseInt(String(searchData.totalCnt ?? searchData.검색결과개수 ?? "0"), 10);
      const rawCases = (() => {
        const items = searchData.nlrc ?? searchData.Nlrc ?? searchData.list;
        return Array.isArray(items) ? items : items ? [items] : [];
      })();
      const laborCases = (rawCases as Array<Record<string, string>>).map((c) => ({
        caseNumber: c.사건번호 ?? c.제목 ?? "",
        title: c.제목 ?? c.사건명 ?? "",
        date: formatDate(c.등록일 ?? c.결정일 ?? ""),
        serialNumber: c.결정문일련번호 ?? "",
      }));
      return Response.json({ totalCount, laborCases });
    }

    // -----------------------------------------------------------------------
    // 공정위 심결 (target=ftc)
    // -----------------------------------------------------------------------
    if (target === "ftc") {
      const url = new URL(LAW_API_SEARCH);
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "ftc");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);
      url.searchParams.set("display", String(count));

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) return Response.json({ error: "공정위 API 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, ftcCases: [] });

      let data: Record<string, unknown>;
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { return Response.json({ error: "공정위 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = data.result;
      if (apiError && typeof apiError === "string") return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError}` }, { status: 502 });

      const searchData = (data.ftcSearch ?? data.FtcSearch ?? data.ftc) as Record<string, unknown> | undefined;
      if (!searchData) return Response.json({ totalCount: 0, ftcCases: [] });

      const totalCount = parseInt(String(searchData.totalCnt ?? searchData.검색결과개수 ?? "0"), 10);
      const rawCases = (() => {
        const items = searchData.ftc ?? searchData.Ftc ?? searchData.list;
        return Array.isArray(items) ? items : items ? [items] : [];
      })();
      const ftcCases = (rawCases as Array<Record<string, string>>).map((c) => ({
        caseNumber: c.사건번호 ?? "",
        caseName: c.사건명 ?? "",
        decisionDate: formatDate(c.결정일자 ?? ""),
        serialNumber: c.결정문일련번호 ?? c.의결서일련번호 ?? "",
      }));
      return Response.json({ totalCount, ftcCases });
    }

    // -----------------------------------------------------------------------
    // 법령용어-조문 연계 (target=lstrmRltJo) — lawService.do 사용
    // -----------------------------------------------------------------------
    if (target === "lstrmRltJo") {
      const url = new URL(LAW_API_DETAIL); // lawService.do
      url.searchParams.set("OC", LAW_API_OC);
      url.searchParams.set("target", "lstrmRltJo");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("query", body.query);

      const response = await fetchWithRetry(url.toString());
      if (!response.ok) return Response.json({ error: "법령용어-조문 API 실패", detail: `HTTP ${response.status}` }, { status: 502 });
      const text = await response.text();
      if (!text.trim()) return Response.json({ totalCount: 0, linkedArticles: [] });

      let data: Record<string, unknown>;
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { return Response.json({ error: "법령용어-조문 파싱 실패", detail: text.slice(0, 200) }, { status: 502 }); }

      const apiError = data.result;
      if (apiError && typeof apiError === "string") return Response.json({ error: "법제처 API 인증 실패", detail: `${apiError}` }, { status: 502 });

      const svcData = data.lstrmRltJoService as Record<string, unknown> | undefined;
      if (!svcData) return Response.json({ totalCount: 0, linkedArticles: [] });

      const totalCount = parseInt(String(svcData.검색결과개수 ?? "0"), 10);
      const termData = svcData.법령용어 as Record<string, unknown> | undefined;
      const rawLinks = (() => {
        const items = termData?.연계법령;
        return Array.isArray(items) ? items : items ? [items] : [];
      })();
      const linkedArticles = (rawLinks as Array<Record<string, string>>).map((a) => ({
        lawName: a.법령명 ?? "",
        articleNumber: a.조번호 ?? "",
        articleContent: a.조문내용 ?? "",
        termType: a.용어구분 ?? "",
      }));
      return Response.json({ totalCount, linkedArticles });
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
    if (body.jo) url.searchParams.set("JO", body.jo); // 법률명 필터 (참조조문 기반)

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
