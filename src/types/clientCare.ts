import type { Timestamp } from "firebase/firestore";

export type MessageStage =
  | "post_consult"
  | "progress_update"
  | "doc_delivery"
  | "case_closure";

/** 문자 발송 기록 한 건 — 메시지 문서에 누적되어 "언제 어느 번호로 보냈는지"가 남는다 */
export interface ClientCareSendLog {
  /** 발송 시각 (ISO 8601) */
  at: string;
  /** 수신 번호 (숫자만) */
  to: string;
}

export interface ClientCareMessage {
  id: string;
  caseId: string;
  ownerId: string;
  stage: MessageStage;
  content: string;
  metadata?: {
    documentId?: string;
    workBreakdown?: WorkBreakdownItem[];
  };
  /** 변호사가 화면에서 본문을 고친 시각 (ISO 8601) */
  editedAt?: string;
  /** 문자 발송 이력 (오래된 순) */
  sentLog?: ClientCareSendLog[];
  createdAt: Timestamp;
}

export interface WorkBreakdownItem {
  label: string;
  count: number;
}

export interface ClientCarePromptContext {
  firmName: string;
  lawyerName: string;
  clientName: string;
  caseType: string;
  caseDesc: string;
  transcript?: string;
  timelineSummary?: string;
  documentsSummary?: string;
  agentResultsSummary?: string;
  workBreakdown?: WorkBreakdownItem[];
}
