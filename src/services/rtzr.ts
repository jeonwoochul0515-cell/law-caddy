// 리턴제로 RTZR STT API 서비스
// Cloudflare Functions 프록시 (/api/transcribe)를 통한 음성 전사
//
// (2026-09-11) 재진입·재전사·긴 파일을 감당하도록 손봤다:
//  - 파일을 Storage에 올린 뒤에는 URL만 서버에 넘겨 다시 올리지 않는다(transcribeByUrl)
//  - 폴링 한도는 6분 고정이 아니라 파일 길이에 비례(최대 30분)하고, 일시 오류·429는 견딘다
//  - 오류는 상태 코드·영어 대신 화면에 그대로 보여줄 한국어 문장으로 만든다(ApiError)

import * as Sentry from "@sentry/react";
import type { Utterance } from "../types/recording";
import { authHeaders } from "./api-auth";
import { ApiError, describeHttpError } from "./retry";
import { friendlyError } from "../utils/friendlyError";

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

/** 기본 화자 라벨 — 첫 화자를 변호사로 가정한다. 화면에서 바꿀 수 있다. */
export const DEFAULT_SPEAKERS: Record<number, string> = {
  0: "변호사",
  1: "의뢰인",
  2: "참석자3",
  3: "참석자4",
};

/** Cloudflare Functions API 경로를 반환합니다. */
function getApiUrl(path: string): string {
  return `/api/${path}`;
}

/** STT 서버가 내려주는 오류 본문 모양 */
interface SttErrorBody {
  error?: string;
  message?: string;
  detail?: string;
}

/** 실패 응답을 한국어 ApiError로 바꿈다. 원문은 콘솔에만 남긴다. */
async function toSttError(response: Response, label: string): Promise<ApiError> {
  let raw = "";
  let body: SttErrorBody | null = null;
  try {
    raw = await response.text();
    body = JSON.parse(raw) as SttErrorBody;
  } catch { /* non-JSON */ }
  // 서버 detail은 리턴제로 원문(영어)일 때가 많아 message/error만 화면에 쓴다
  const message = describeHttpError(
    response.status,
    body ? { error: body.error, message: body.message } : null,
    "음성 변환",
  );
  console.warn(`[STT/${label}] HTTP ${response.status}:`, raw.slice(0, 300));
  return new ApiError(response.status, message, raw.slice(0, 500));
}

/** 네트워크 단절 등 fetch 자체 실패를 한국어 오류로 바꾼다 */
function toNetworkError(error: unknown, fallback: string): Error {
  Sentry.captureException(error);
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new Error("음성 변환 서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (error instanceof Error) return error;
  return new Error(fallback);
}

/**
 * 음성 파일을 전사 요청합니다 (파일을 직접 전송).
 */
export async function transcribeFile(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const headers = await authHeaders();
    const response = await fetch(getApiUrl("transcribe"), {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) throw await toSttError(response, "transcribe");

    const data = (await response.json()) as TranscribeResponse;
    if (!data.id) {
      throw new Error("음성 변환 요청은 접수됐지만 확인 번호를 받지 못했습니다. 다시 시도해 주세요.");
    }
    return data.id;
  } catch (error: unknown) {
    throw toNetworkError(error, "음성 변환 요청 중 알 수 없는 오류가 났습니다.");
  }
}

/**
 * 이미 Storage에 올린 파일을 URL로 전사 요청합니다.
 * 같은 파일을 두 번 올리지 않아도 되고(r1-03-10), 저장된 파일로 재전사할 수 있다(r1-03-13).
 */
export async function transcribeByUrl(fileUrl: string, fileName: string): Promise<string> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(getApiUrl("transcribe"), {
      method: "POST",
      headers,
      body: JSON.stringify({ fileUrl, fileName }),
    });

    if (!response.ok) throw await toSttError(response, "transcribe-url");

    const data = (await response.json()) as TranscribeResponse;
    if (!data.id) {
      throw new Error("음성 변환 요청은 접수됐지만 확인 번호를 받지 못했습니다. 다시 시도해 주세요.");
    }
    return data.id;
  } catch (error: unknown) {
    throw toNetworkError(error, "음성 변환 요청 중 알 수 없는 오류가 났습니다.");
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
 * 전사 상태를 한 번 조회합니다.
 */
export async function pollTranscription(
  transcribeId: string,
): Promise<TranscriptionResult> {
  try {
    const headers = await authHeaders();
    const response = await fetch(
      getApiUrl(`transcribe/${encodeURIComponent(transcribeId)}`),
      { method: "GET", headers },
    );

    if (!response.ok) throw await toSttError(response, "poll");

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
    throw toNetworkError(error, "음성 변환 결과 확인 중 알 수 없는 오류가 났습니다.");
  }
}

/**
 * 파일 길이에 비례한 최대 대기 시간(ms).
 * 리턴제로는 대체로 실시간의 몇 분의 1 안에 끝나지만, 90분 파일이 6분 한도에 걸려
 * "실패"로 찍히던 일이 있었다(r1-03-06). 최소 10분, 최대 30분.
 */
export function computeMaxWaitMs(durationSeconds?: number): number {
  const minutes = durationSeconds && durationSeconds > 0
    ? (durationSeconds / 60) * 0.5 + 5
    : 10;
  return Math.round(Math.min(Math.max(minutes, 10), 30) * 60 * 1000);
}

/** 대화록 마지막 발화의 끝 시각으로 녹음 길이(초)를 구한다 */
export function durationFromUtterances(utterances: Utterance[]): number {
  let end = 0;
  for (const u of utterances) {
    end = Math.max(end, u.startAt + u.duration);
  }
  return Math.round(end / 1000);
}

/**
 * 브라우저에서 오디오 파일의 길이(초)를 읽는다. 못 읽으면 0.
 * (업로드 전 "몇 분짜리 파일인지" 안내와 폴링 한도 계산에 쓴다)
 */
export function getAudioDurationSeconds(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof URL === "undefined" || !("createObjectURL" in URL)) {
      resolve(0);
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const done = (value: number) => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
      };
      audio.onloadedmetadata = () => done(audio.duration);
      audio.onerror = () => done(0);
      // 일부 webm은 duration이 Infinity로 오므로 끝까지 탐색시켜 실제 길이를 얻는다
      audio.ondurationchange = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) done(audio.duration);
      };
      setTimeout(() => done(0), 8000);
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
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
  const speakerLabels = speakers ?? DEFAULT_SPEAKERS;

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

/** 대화록에 등장하는 화자 번호 목록 (오름차순) */
export function listSpeakers(utterances: Utterance[]): number[] {
  return [...new Set(utterances.map((u) => u.spk))].sort((a, b) => a - b);
}

/** 폴링 진행 상황 콜백에 넘기는 값 */
export interface PollProgress {
  /** 경과 시간(초) */
  elapsedSeconds: number;
  /** 최대 대기 시간(초) */
  maxSeconds: number;
}

export interface WaitOptions {
  /** 파일 길이(초) — 최대 대기 시간 계산용 */
  durationSeconds?: number;
  /** 이미 기다린 시간(ms) — 화면 재진입 시 이어서 셀 때 */
  alreadyWaitedMs?: number;
  onProgress?: (p: PollProgress) => void;
  /** 중단 신호 (화면을 떠날 때) */
  signal?: AbortSignal;
}

/** 폴링 최종 결과 */
export type WaitOutcome =
  | { status: "completed"; utterances: Utterance[] }
  | { status: "failed"; message: string }
  | { status: "timeout" }
  | { status: "aborted" };

/**
 * 전사가 끝날 때까지 기다린다.
 * - 일시 오류(네트워크·5xx)는 5회까지 견디고, 429는 서버가 알려준 초만큼 쉬었다 간다
 * - 402(한도)·401·403은 즉시 실패로 돌려준다 (기다려도 달라지지 않는다)
 * - 시간 초과는 실패가 아니라 "timeout"으로 돌려준다 — 저장된 ID로 나중에 다시 확인할 수 있다
 */
export async function waitForTranscription(
  transcribeId: string,
  opts: WaitOptions = {},
): Promise<WaitOutcome> {
  const POLL_INTERVAL = 4000;
  const MAX_TRANSIENT_ERRORS = 5;
  const maxWaitMs = computeMaxWaitMs(opts.durationSeconds);
  const startedAt = Date.now() - (opts.alreadyWaitedMs ?? 0);
  let transientErrors = 0;

  while (Date.now() - startedAt < maxWaitMs) {
    if (opts.signal?.aborted) return { status: "aborted" };
    let sleepMs = POLL_INTERVAL;
    try {
      const result = await pollTranscription(transcribeId);
      transientErrors = 0;
      if (result.status === "completed" && result.utterances) {
        return { status: "completed", utterances: result.utterances };
      }
      if (result.status === "failed") {
        return { status: "failed", message: "음성 변환 서버가 이 파일을 처리하지 못했습니다. 파일이 손상됐거나 음성이 없는 파일일 수 있습니다." };
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 402 || err.status === 401 || err.status === 403) {
          return { status: "failed", message: err.message };
        }
        if (err.status === 429) {
          // "N초 후 다시 시도하세요"에서 N을 읽어 그만큼 쉰다
          const m = err.message.match(/(\d+)\s*초/);
          sleepMs = Math.max(POLL_INTERVAL, (m ? parseInt(m[1], 10) : 15) * 1000);
          transientErrors = Math.max(transientErrors - 1, 0);
        }
      }
      transientErrors++;
      console.warn(`[STT] 폴링 오류 (${transientErrors}/${MAX_TRANSIENT_ERRORS}):`, err instanceof Error ? err.message : err);
      if (transientErrors >= MAX_TRANSIENT_ERRORS) {
        return { status: "failed", message: "음성 변환 결과를 확인하는 동안 연결이 계속 끊겼습니다. 인터넷 연결을 확인한 뒤 '다시 확인'을 눌러 주세요." };
      }
    }
    opts.onProgress?.({
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      maxSeconds: Math.round(maxWaitMs / 1000),
    });
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  return { status: "timeout" };
}

/**
 * 음성 파일을 전사하고 완료될 때까지 폴링하여 대화록을 반환합니다.
 * 실패·시간 초과는 null. 이유가 필요하면 waitForTranscription을 직접 쓰세요.
 */
export async function transcribeAndWait(
  file: File,
  onProgress?: (status: string) => void,
): Promise<string | null> {
  try {
    onProgress?.("음성 파일 전사 요청 중...");
    const transcribeId = await transcribeFile(file);
    onProgress?.("음성 변환 중...");
    const durationSeconds = await getAudioDurationSeconds(file);
    const outcome = await waitForTranscription(transcribeId, { durationSeconds });
    if (outcome.status === "completed") {
      onProgress?.("음성 변환 완료");
      return formatTranscript(outcome.utterances);
    }
    onProgress?.(outcome.status === "timeout" ? "음성 변환 시간 초과" : "음성 변환 실패");
    return null;
  } catch (err) {
    console.warn("[STT] transcribeAndWait 실패:", err instanceof Error ? err.message : err);
    onProgress?.(friendlyError(err, "음성 변환 요청 실패"));
    return null;
  }
}
