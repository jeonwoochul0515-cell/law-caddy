import type { Timestamp } from "firebase/firestore";

export type MessageStage =
  | "post_consult"
  | "progress_update"
  | "doc_delivery"
  | "case_closure";

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
