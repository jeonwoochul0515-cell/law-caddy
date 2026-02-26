import type { Timestamp } from "firebase/firestore";

export type DocType =
  | "내용증명" | "소장" | "답변서" | "준비서면" | "의견서"
  | "합의서" | "고소장" | "지급명령신청서" | "상담 요약 리포트";

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
  hints?: string[];
}

export interface CheckpointAnswer {
  questionId: number;
  text: string;
  files: File[];
  audioBlob: Blob | null;
}
