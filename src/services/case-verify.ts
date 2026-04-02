// 사건번호 실존 검증 서비스
// /api/case-verify 프록시를 통해 법제처 API로 사건번호 존재 여부 확인

import { authHeaders } from "./api-auth";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "law-caddy.pages.dev"
    ? "https://law-caddy.pages.dev"
    : "";

/** 사건번호 검증 결과 */
export interface CaseVerifyResult {
  caseNumber: string;
  verified: boolean;
  court?: string;
  caseName?: string;
  date?: string;
}

/** 사건번호 정규식 (2023다12345, 2022가합67890 등) */
const CASE_NUMBER_REGEX = /\d{4}[가-힣]{1,4}\d{3,7}/g;

/**
 * 문서에서 사건번호를 추출합니다.
 */
export function extractCaseNumbers(document: string): string[] {
  const matches = document.match(CASE_NUMBER_REGEX) ?? [];
  return [...new Set(matches)];
}

/**
 * 사건번호 배열의 실존 여부를 법제처 API로 검증합니다.
 */
export async function verifyCaseNumbers(caseNumbers: string[]): Promise<CaseVerifyResult[]> {
  if (caseNumbers.length === 0) return [];

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE}/api/case-verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ caseNumbers }),
    });

    if (!response.ok) {
      console.warn(`[사건번호 검증] HTTP ${response.status}`);
      return caseNumbers.map((cn) => ({ caseNumber: cn, verified: false }));
    }

    const data = (await response.json()) as { results: CaseVerifyResult[] };
    return data.results ?? [];
  } catch (error) {
    console.warn("[사건번호 검증] 오류:", error instanceof Error ? error.message : error);
    return caseNumbers.map((cn) => ({ caseNumber: cn, verified: false }));
  }
}
