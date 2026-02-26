export type AgentId = "precedent" | "legal" | "stt" | "analysis" | "docgen" | "review";

export type CaseType = "민사" | "형사" | "가사" | "행정" | "노동" | "부동산" | "채권·채무" | "손해배상" | "기타";

export type DocType =
  | "내용증명" | "소장" | "답변서" | "준비서면" | "의견서"
  | "합의서" | "고소장" | "지급명령신청서" | "상담 요약 리포트";

export interface AgentState {
  id: AgentId;
  status: "idle" | "running" | "completed" | "error";
  result: string;
  error?: string;
}
