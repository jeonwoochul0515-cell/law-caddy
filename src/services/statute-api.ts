// 법령 조문 조회 서비스
// /api/statute-check 프록시를 통해 법제처 법령 API로 조문 검증

import { authHeaders } from "./api-auth";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "law-caddy.pages.dev"
    ? "https://law-caddy.pages.dev"
    : "";

/** 법령 검증 결과 */
export interface StatuteCheckResult {
  query: string;
  found: boolean;
  lawName?: string;
  enforcementDate?: string;
  proclamationDate?: string;
  status?: string;
}

/** 법조문 추출 정규식 */
const STATUTE_REGEX = /(?:민법|형법|상법|민사소송법|형사소송법|헌법|행정소송법|민사집행법|채무자\s*회생\s*및\s*파산에\s*관한\s*법률|공정거래법|독점규제\s*및\s*공정거래에\s*관한\s*법률|근로기준법|주택임대차보호법|상가건물\s*임대차보호법|소송촉진\s*등에\s*관한\s*특례법|저작권법|특허법|[가-힣]+법)\s*제\d+조(?:의\d+)?(?:\s*제\d+항)?/g;

/**
 * 텍스트에서 법조문 참조를 추출합니다.
 */
export function extractStatuteReferences(text: string): string[] {
  const matches = text.match(STATUTE_REGEX) ?? [];
  return [...new Set(matches)];
}

/**
 * 법조문 목록의 현행 여부를 법제처 API로 검증합니다.
 */
export async function checkStatutes(statutes: string[]): Promise<StatuteCheckResult[]> {
  if (statutes.length === 0) return [];

  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE}/api/statute-check`, {
      method: "POST",
      headers,
      body: JSON.stringify({ statutes }),
    });

    if (!response.ok) {
      console.warn(`[법령 검증] HTTP ${response.status}`);
      return statutes.map((s) => ({ query: s, found: false }));
    }

    const data = (await response.json()) as { results: StatuteCheckResult[] };
    return data.results ?? [];
  } catch (error) {
    console.warn("[법령 검증] 오류:", error instanceof Error ? error.message : error);
    return statutes.map((s) => ({ query: s, found: false }));
  }
}

/**
 * 법령 검증 결과를 필묵/감수에 전달할 텍스트로 변환합니다.
 */
export function formatStatuteCheckForPrompt(results: StatuteCheckResult[]): string {
  if (results.length === 0) return "";

  const lines = [
    "[법령 현행 여부 검증 결과]",
    "아래는 법제처 API로 확인한 인용 법령의 현행 여부입니다.",
    "",
  ];

  for (const r of results) {
    if (r.found) {
      const enforcement = r.enforcementDate
        ? ` (시행: ${formatDate(r.enforcementDate)})`
        : "";
      lines.push(`✅ ${r.query} — ${r.status ?? "현행"}${enforcement}`);
    } else {
      lines.push(`⚠️ ${r.query} — 법제처 DB에서 확인 불가 (법령명 또는 조문번호 확인 필요)`);
    }
  }

  return lines.join("\n");
}

/** YYYYMMDD → YYYY.MM.DD 변환 */
function formatDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}
