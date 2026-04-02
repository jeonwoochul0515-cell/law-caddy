// 사건번호 실존 검증 API — 법제처 판례 검색으로 사건번호 존재 여부 확인
import type { Env } from "./_shared/types";

const LAW_API_OC = "jeonwoochul0515";
const LAW_API_SEARCH = "https://www.law.go.kr/DRF/lawSearch.do";
const FETCH_TIMEOUT_MS = 10000;

interface VerifyRequest {
  caseNumbers: string[];
}

interface VerifyResult {
  caseNumber: string;
  verified: boolean;
  court?: string;
  caseName?: string;
  date?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as VerifyRequest;

    if (!body.caseNumbers || !Array.isArray(body.caseNumbers) || body.caseNumbers.length === 0) {
      return Response.json({ error: "caseNumbers 배열이 필요합니다." }, { status: 400 });
    }

    // 최대 20건 제한 (법제처 API 부하 방지)
    const caseNumbers = body.caseNumbers.slice(0, 20);
    const results: VerifyResult[] = [];

    // 순차 검증 (법제처 API 부하 방지, 300ms 간격)
    for (const cn of caseNumbers) {
      try {
        const url = new URL(LAW_API_SEARCH);
        url.searchParams.set("OC", LAW_API_OC);
        url.searchParams.set("target", "prec");
        url.searchParams.set("type", "JSON");
        url.searchParams.set("query", cn);
        url.searchParams.set("display", "3");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          results.push({ caseNumber: cn, verified: false });
          continue;
        }

        const text = await response.text();
        if (!text.trim()) {
          results.push({ caseNumber: cn, verified: false });
          continue;
        }

        let data: { PrecSearch?: { prec?: unknown } };
        try {
          data = JSON.parse(text);
        } catch {
          results.push({ caseNumber: cn, verified: false });
          continue;
        }

        // 검색 결과에서 정확한 사건번호 매칭
        const precs = Array.isArray(data.PrecSearch?.prec)
          ? data.PrecSearch.prec
          : data.PrecSearch?.prec
            ? [data.PrecSearch.prec]
            : [];

        const normalized = cn.replace(/\s/g, "");
        const match = precs.find((p: Record<string, string>) => {
          const precNum = (p.사건번호 ?? "").replace(/\s/g, "");
          return precNum.includes(normalized) || normalized.includes(precNum);
        }) as Record<string, string> | undefined;

        if (match) {
          results.push({
            caseNumber: cn,
            verified: true,
            court: match.법원명 ?? "",
            caseName: match.사건명 ?? "",
            date: match.선고일자 ?? "",
          });
        } else {
          results.push({ caseNumber: cn, verified: false });
        }

        // 법제처 API 부하 방지
        if (caseNumbers.indexOf(cn) < caseNumbers.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        results.push({ caseNumber: cn, verified: false });
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: "사건번호 검증 오류", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
