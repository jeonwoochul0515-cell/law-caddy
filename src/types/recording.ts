import type { Timestamp } from "firebase/firestore";

export interface Recording {
  id: string;
  caseId: string;
  ownerId: string;
  fileName: string;
  fileUrl: string;
  fileSizeMB: number;
  durationSeconds: number;
  rtzrTranscribeId?: string;
  sttStatus: "pending" | "processing" | "completed" | "failed";
  transcript?: string;
  utterances?: Utterance[];
  speakers?: Record<number, string>;
  createdAt: Timestamp;
}

export interface Utterance {
  startAt: number;
  duration: number;
  spk: number;
  msg: string;
}
