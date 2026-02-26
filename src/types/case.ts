import type { Timestamp } from "firebase/firestore";

export type CaseType = "민사" | "형사" | "가사" | "행정" | "노동" | "부동산" | "채권·채무" | "손해배상" | "기타";

export interface Case {
  id: string;
  ownerId: string;
  clientName: string;
  caseType: CaseType;
  description: string;
  status: "진행중" | "완료" | "보류";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  type: "consult" | "doc" | "filing" | "response" | "note";
  date: Timestamp;
  label: string;
  detail: string;
}
