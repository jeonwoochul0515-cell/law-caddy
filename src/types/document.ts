import type { Timestamp } from "firebase/firestore";

export type DocType =
  | "소장" | "답변서" | "준비서면" | "내용증명"
  | "가압류신청서" | "가처분신청서" | "지급명령신청서"
  | "이의신청서" | "조정신청서"
  | "고소장" | "고발장" | "항소장"
  | "합의서" | "상담 요약 리포트"
  | "탄원서" | "변호인의견서" | "항소이유서"
  | "이혼소장" | "상속포기심판청구서"
  | "임대차보증금반환청구소장" | "건물명도소장" | "임차권등기명령신청서"
  | "채권압류및추심명령신청서"
  | "부당해고구제신청서" | "체불임금진정서";

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
