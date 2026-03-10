import type { Timestamp } from "firebase/firestore";

export type DocType =
  | "소장" | "답변서" | "준비서면" | "내용증명"
  | "가압류신청서" | "가처분신청서" | "지급명령신청서"
  | "이의신청서" | "조정신청서"
  | "고소장" | "고발장" | "항소장"
  | "합의서" | "상담 요약 리포트";

export interface LegalDocument {
  id: string;
  caseId: string;
  recordingId: string;
  ownerId: string;
  docType: DocType;
  agentResults: {
    precedent: string;
    legal: string;
    stt: string;
    analysis: string;
    docgen: string;
    review: string;
  };
  checkQuestions: CheckQuestion[];
  answeredChecks: Record<number, "yes" | "no" | "partial">;
  finalDocument: string;
  fileUrl?: string;
  clientMessage?: string;
  status: "processing" | "checkpoint" | "generating" | "completed";
  createdAt: Timestamp;
}

export interface CheckQuestion {
  id: number;
  question: string;
  why: string;
  category: "증거확보" | "사실관계" | "법리검토" | "전략수립" | "절차확인";
  priority?: "must" | "should" | "nice_to_have";
  hints?: string[];
}

export interface CheckpointAnswer {
  questionId: number;
  text: string;
  files: File[];
  audioBlob: Blob | null;
}
