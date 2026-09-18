import type { Timestamp } from "firebase/firestore";

export interface Recording {
  id: string;
  caseId: string;
  ownerId: string;
  fileName: string;
  /** Storage 다운로드 URL. 메모만 저장한 레코드(kind: "note")는 빈 문자열 */
  fileUrl: string;
  fileSizeMB: number;
  durationSeconds: number;
  rtzrTranscribeId?: string;
  sttStatus: "pending" | "processing" | "completed" | "failed";
  transcript?: string;
  utterances?: Utterance[];
  speakers?: Record<number, string>;
  createdAt: Timestamp;
  /** 레코드 종류 — audio(녹음), file(첨부 서류), note(상담 메모 텍스트). 없으면 예전 데이터(오디오 또는 파일) */
  kind?: "audio" | "file" | "note";
  /** 음성 변환이 실패한 이유 (한국어, 화면 표시용) */
  sttError?: string;
  /** 음성 변환 요청을 보낸 시각(ms) — 얼마나 오래 기다렸는지 판단하는 데 쓴다 */
  sttRequestedAt?: number;
  /** 상담이 실제로 이루어진 시각 — 파일의 마지막 수정 시각 또는 녹음 시작 시각 */
  recordedAt?: Timestamp;
}

export interface Utterance {
  startAt: number;
  duration: number;
  spk: number;
  msg: string;
}
