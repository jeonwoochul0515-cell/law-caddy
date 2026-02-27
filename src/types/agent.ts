// CaseType, DocType의 정식 정의는 각각 case.ts, document.ts에 있음
// 하위 호환을 위해 re-export
export type { CaseType } from "./case";
export type { DocType } from "./document";

export type AgentId = "precedent" | "legal" | "stt" | "analysis" | "docgen" | "review";

export interface AgentState {
  id: AgentId;
  status: "idle" | "running" | "completed" | "error";
  result: string;
  error?: string;
}
