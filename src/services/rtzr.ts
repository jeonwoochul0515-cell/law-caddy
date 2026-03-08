// 리턴제로 RTZR STT API 서비스
// Cloudflare Functions 프록시 (/api/transcribe)를 통한 음성 전사

import * as Sentry from "@sentry/react";
import type { Utterance } from "../types/recording";

/** RTZR 전사 상태 */
export type TranscriptionStatus = "transcribing" | "completed" | "failed";

/** 전사 결과 폴링 응답 */
export interface TranscriptionResult {
  status: TranscriptionStatus;
  utterances?: Utterance[];
}

/** STT 전사 요청 응답 */
interface TranscribeResponse {
  id: string;
}

/** STT 폴링 응답 */
interface PollResponse {
  status: TranscriptionStatus;
  results?: {
    utterances: RtzrUtterance[];
  };
}

/** RTZR API 원본 utterance 형식 (snake_case) */
interface RtzrUtterance {
  start_at: number;
  duration: number;
  spk: number;
  msg: string;
}

/** Cloudflare Functions API 경로를 반환합니다. */
function getApiUrl(path: string): string {
  return `/api/${path}`;
}

/**
 * 음성 파일을 전사 요청합니다.
 */
export async function transcribeFile(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(getApiUrl("transcribe"), {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `STT 전사 요청 실패 (HTTP ${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as TranscribeResponse;

    if (!data.id) {
      throw new Error("STT 전사 요청 응답에 ID가 포함되지 않았습니다.");
    }

    return data.id;
  } catch (error: unknown) {
    Sentry.captureException(error);
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "STT 서비스에 연결할 수 없습니다. 네트워크 연결을 확인하세요.",
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("STT 전사 요청 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * RTZR 원본 utterance를 내부 Utterance 형식으로 변환합니다.
 */
function convertUtterance(raw: RtzrUtterance): Utterance {
  return {
    startAt: raw.start_at,
    duration: raw.duration,
    spk: raw.spk,
    msg: raw.msg,
  };
}

/**
 * 전사 상태를 폴링합니다.
 */
export async function pollTranscription(
  transcribeId: string,
): Promise<TranscriptionResult> {
  try {
    const response = await fetch(
      getApiUrl(`transcribe/${encodeURIComponent(transcribeId)}`),
      { method: "GET" },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `STT 폴링 실패 (HTTP ${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as PollResponse;

    if (data.status === "completed" && data.results?.utterances) {
      return {
        status: "completed",
        utterances: data.results.utterances.map(convertUtterance),
      };
    }

    if (data.status === "failed") {
      return { status: "failed" };
    }

    return { status: "transcribing" };
  } catch (error: unknown) {
    Sentry.captureException(error);
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "STT 서비스에 연결할 수 없습니다. 네트워크 연결을 확인하세요.",
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("STT 폴링 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 밀리초를 "MM:SS" 형식으로 변환합니다.
 */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Utterance 배열을 읽기 쉬운 대화록 텍스트로 포맷팅합니다.
 */
export function formatTranscript(
  utterances: Utterance[],
  speakers?: Record<number, string>,
): string {
  const defaultSpeakers: Record<number, string> = {
    0: "변호사",
    1: "의뢰인",
    2: "참석자3",
    3: "참석자4",
  };

  const speakerLabels = speakers ?? defaultSpeakers;

  if (utterances.length === 0) {
    return "[대화록 없음]";
  }

  const lines = utterances.map((utterance) => {
    const timestamp = formatTimestamp(utterance.startAt);
    const speaker =
      speakerLabels[utterance.spk] ?? `화자${utterance.spk + 1}`;
    return `[${timestamp}] ${speaker}: ${utterance.msg}`;
  });

  return lines.join("\n");
}
