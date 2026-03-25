// CaseType, DocType의 정식 정의는 각각 case.ts, document.ts에 있음
// 하위 호환을 위해 re-export
export type { CaseType } from "./case";
export type { DocType } from "./document";

export type AgentId = "precedent" | "legal" | "stt" | "analysis" | "docgen" | "review";

/** 쟁점 분석 결과 (판례 검색 키워드 포함) */
export interface IssueWithKeywords {
  id: number;
  issue: string;
  description: string;
  keywords: string[];
  priority: "high" | "medium" | "low";
}

export interface AgentState {
  id: AgentId;
  status: "idle" | "running" | "completed" | "error";
  result: string;
  error?: string;
}
