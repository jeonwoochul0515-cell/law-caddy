// CaseType, DocType의 정식 정의는 각각 case.ts, document.ts에 있음
// 하위 호환을 위해 re-export
export type { CaseType } from "./case";
export type { DocType } from "./document";

export type AgentId = "precedent" | "legal" | "stt" | "analysis" | "docgen" | "review";

/** 쟁점 분석 결과 (판례 검색 키워드 + 법조문 매핑 포함) */
export interface IssueWithKeywords {
  id: number;
  issue: string;
  description: string;
  keywords: string[];
  priority: "high" | "medium" | "low";
  // Phase 1 확장 (optional — 서혜안이 출력하지 않아도 기존 동작 유지)
  statutes?: { law: string; article: string; content: string }[];
  joSearch?: { law: string; query: string }[];
}

export interface AgentState {
  id: AgentId;
  status: "idle" | "running" | "completed" | "error";
  result: string;
  error?: string;
}
