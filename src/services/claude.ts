// Anthropic Claude API 서비스
// 프로덕션: Cloudflare Functions 프록시 (/api/claude)
// 로컬 개발: VITE_ANTHROPIC_API_KEY로 직접 호출

import * as Sentry from "@sentry/react";
import { authHeaders } from "./api-auth";
import { withRetry } from "./retry";

/** 멀티턴 채팅 메시지 타입 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Claude API 응답 content 블록 타입 */
export interface ContentBlock {
  type: "text";
  text: string;
}

/**
 * 생각 깊이. 지정하지 않으면 모델 기본값(high)으로 동작한다.
 *
 * 생각 토큰은 **출력으로 과금되고 max_tokens 안에 포함**되므로, 사실상 비용을 가장
 * 크게 좌우하는 값이다. 분류·요약·문자 작성처럼 법률 판단이 아닌 호출은 낮춰도 된다.
 * 판례·쟁점·문서 생성은 기본값(high)을 유지할 것.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Claude API 응답 타입 */
export interface ClaudeApiResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "refusal";
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** 캐시에 새로 기록된 토큰 (쓰기 요금 = 기본 입력가의 1.25배) */
    cache_creation_input_tokens?: number;
    /** 캐시에서 읽어온 토큰 (읽기 요금 = 기본 입력가의 0.1배) */
    cache_read_input_tokens?: number;
  };
}

/** 세션 누적 토큰 사용량 */
export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Claude API 에러 응답 타입 */
interface ClaudeApiError {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

/** 프록시 에러 응답 */
interface ProxyErrorResponse {
  error: string;
  detail?: string;
}

/** 직접 호출 가능 여부 (빌드 시 VITE_ANTHROPIC_API_KEY가 있으면 직접 호출) */
const isDev = import.meta.env.DEV;
const DIRECT_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEV_PROXY_URL = "/api/anthropic/v1/messages";
const MODEL = "claude-sonnet-5";
/**
 * 출력 상한.
 *
 * max_tokens는 생각(thinking) 토큰과 본문을 **함께** 덮는다. Sonnet 5는 thinking을
 * 지정하지 않으면 effort=high로 생각이 켜지므로, 16384로는 긴 서면에서 본문이 잘렸다.
 * 스트리밍으로 전환하면서 연결 끊김 걱정이 사라져 상한을 올렸다.
 */
const MAX_TOKENS = 32000;
const API_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "context-1m-2025-08-07";

/**
 * Claude API 응답에서 텍스트를 추출합니다.
 */
export function extractText(data: ClaudeApiResponse): string {
  if (!data.content || data.content.length === 0) {
    throw new Error("Claude API에서 빈 응답을 반환했습니다.");
  }

  const textContent = data.content
    .filter((block): block is ContentBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  if (!textContent) {
    throw new Error("Claude API 응답에 텍스트가 포함되지 않았습니다.");
  }

  // 토큰 제한으로 잘린 경우 경고 추가
  if (data.stop_reason === "max_tokens") {
    console.warn(`[Claude API] 응답이 max_tokens(${MAX_TOKENS})에 도달하여 잘렸습니다. output_tokens: ${data.usage?.output_tokens}`);
    return textContent + "\n\n⚠️ [문서가 토큰 제한으로 잘렸습니다. 채팅에서 \"이어서 작성해 주세요\"라고 요청하세요.]";
  }

  return textContent;
}

/**
 * 세션 누적 사용량. 브라우저 콘솔에서 `window.__lawCaddyUsage`로 확인할 수 있다.
 *
 * 확인 요령:
 *  - cacheRead가 계속 0이면 프롬프트 캐시가 전혀 안 걸리고 있다는 뜻이다.
 *    (6개 에이전트를 동시에 쏘면 서로가 만드는 캐시를 못 읽어 전원이 쓰기 요금만 낸다)
 *  - cacheWrite만 쌓이고 cacheRead가 안 늘면 같은 증상이다.
 *  - 전체 프롬프트 크기 = input + cacheWrite + cacheRead. input만 보면 과소평가된다.
 */
const usageTotals: UsageTotals = {
  calls: 0,
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
};

/** 응답의 토큰 사용량을 누적하고 콘솔에 한 줄로 남긴다. */
function logUsage(label: string, data: ClaudeApiResponse): void {
  const u = data.usage;
  if (!u) return;

  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;

  usageTotals.calls += 1;
  usageTotals.input += u.input_tokens ?? 0;
  usageTotals.output += u.output_tokens ?? 0;
  usageTotals.cacheWrite += write;
  usageTotals.cacheRead += read;

  console.log(
    `[사용량/${label}] 입력 ${u.input_tokens} · 출력 ${u.output_tokens} · ` +
      `캐시쓰기 ${write} · 캐시읽기 ${read} · stop=${data.stop_reason} ` +
      `| 누적 ${usageTotals.calls}회 → 입력 ${usageTotals.input} · 출력 ${usageTotals.output} · ` +
      `캐시쓰기 ${usageTotals.cacheWrite} · 캐시읽기 ${usageTotals.cacheRead}`,
  );

  if (typeof window !== "undefined") {
    (window as unknown as { __lawCaddyUsage?: UsageTotals }).__lawCaddyUsage = usageTotals;
  }
}

// ─────────────────────────────────────────────
// SSE 스트리밍
// ─────────────────────────────────────────────

/** 스트리밍 이벤트에서 뽑아낼 것들 */
export interface StreamResult {
  text: string;
  stopReason: string;
  usage: ClaudeApiResponse["usage"];
}

/**
 * Anthropic SSE 스트림을 끝까지 읽어 텍스트를 누적합니다.
 *
 * 스트리밍을 쓰는 이유는 화면에 글자를 흘리기 위해서가 아니라,
 * **연결을 살려두기 위해서**입니다. 비스트리밍으로 max_tokens를 크게 잡으면
 * 모델이 생각하는 동안 아무 바이트도 오지 않아 연결이 끊깁니다.
 *
 * onDelta를 넘기면 진행 중인 텍스트를 받아볼 수 있습니다(선택).
 */
export async function readClaudeStream(
  response: Response,
  onDelta?: (chunk: string) => void,
): Promise<StreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Claude API 응답 스트림을 열 수 없습니다.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stopReason = "end_turn";
  const usage: ClaudeApiResponse["usage"] = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  const handleEvent = (payload: string): void => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return; // 부분 수신/주석 라인은 무시
    }

    switch (event.type) {
      case "message_start": {
        const msg = event.message as { usage?: Record<string, number> } | undefined;
        const u = msg?.usage;
        if (u) {
          usage.input_tokens = u.input_tokens ?? 0;
          usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
          usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
        }
        break;
      }
      case "content_block_delta": {
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          text += delta.text;
          onDelta?.(delta.text);
        }
        break;
      }
      case "message_delta": {
        const delta = event.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason;
        const u = event.usage as Record<string, number> | undefined;
        if (u?.output_tokens) usage.output_tokens = u.output_tokens;
        break;
      }
      case "error": {
        const err = event.error as { message?: string } | undefined;
        throw new Error(`Claude API 스트림 오류: ${err?.message ?? "알 수 없음"}`);
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 이벤트는 빈 줄로 구분된다
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload) handleEvent(payload);
      }
    }
  }

  return { text, stopReason, usage };
}

/** 스트림 결과를 기존 응답 형태로 맞춰 사용량 기록 + 잘림 경고까지 처리합니다. */
function handleStreamResult(label: string, result: StreamResult): string {
  logUsage(label, {
    id: "",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: result.text }],
    model: MODEL,
    stop_reason: result.stopReason as ClaudeApiResponse["stop_reason"],
    usage: result.usage,
  });

  // 안전 분류기가 요청을 거절한 경우. 오류가 아니라 정상 응답(HTTP 200)으로 오고
  // content가 비어 있거나 일부만 온다. stop_reason을 먼저 보지 않으면 "빈 응답"으로
  // 오인해 원인을 못 찾는다. (형사·보안 주제에서 드물게 발생)
  if (result.stopReason === "refusal") {
    throw new Error(
      "요청이 안전 정책에 의해 거절되었습니다. 사건 내용의 표현을 조정해 다시 시도해 주세요.",
    );
  }

  if (!result.text) {
    throw new Error("Claude API에서 빈 응답을 반환했습니다.");
  }

  if (result.stopReason === "max_tokens") {
    console.warn(
      `[Claude API] 응답이 max_tokens(${MAX_TOKENS})에 도달하여 잘렸습니다. output_tokens: ${result.usage.output_tokens}`,
    );
    return (
      result.text +
      "\n\n⚠️ [문서가 토큰 제한으로 잘렸습니다. 채팅에서 \"이어서 작성해 주세요\"라고 요청하세요.]"
    );
  }

  return result.text;
}

/**
 * 브라우저에서 직접 Anthropic API를 호출합니다.
 * - 로컬 개발: Vite 프록시 (/api/anthropic/...) 경유
 * - 프로덕션: anthropic-dangerous-direct-browser-access 헤더로 직접 호출
 */
async function callClaudeDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  sharedPrefix?: string,
  effort?: Effort,
): Promise<string> {
  const url = isDev ? DEV_PROXY_URL : ANTHROPIC_API_URL;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "anthropic-beta": ANTHROPIC_BETA,
  };
  // 프로덕션에서 브라우저 직접 호출 시 CORS 허용 헤더 필요
  if (!isDev) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  // Phase 2 Prompt Caching:
  //  - sharedPrefix 있으면: [공통 prefix(캐시), 에이전트별 persona(캐시 안 함)] 두 블록
  //  - sharedPrefix 없으면: 단일 system 블록 (Phase 1 폴백)
  const systemBlocks = sharedPrefix
    ? [
        {
          type: "text",
          text: sharedPrefix,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemPrompt,
        },
      ]
    : [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ];
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
      stream: true,
      ...(effort ? { output_config: { effort } } : {}),
    }),
  });

  if (!response.ok) {
    // 상태 코드를 반드시 메시지에 남긴다 — withRetry가 이걸로 재시도 여부를 판단한다.
    // (예전엔 본문 파싱에 성공하면 "HTTP 529"가 지워져서 과부하가 재시도되지 않았다)
    let detail = response.statusText;
    try {
      const errorBody = (await response.json()) as ClaudeApiError;
      detail = errorBody?.error?.message ?? detail;
    } catch { /* non-JSON error body */ }
    throw new Error(`Claude API 호출 실패: HTTP ${response.status} ${detail}`);
  }

  return handleStreamResult("direct", await readClaudeStream(response));
}

/**
 * Cloudflare Functions 프록시를 통해 호출합니다 (프로덕션).
 * 커스텀 도메인(law-caddy.com)에서는 pages.dev로 직접 호출하여
 * Cloudflare Zone 프록시의 아웃바운드 IP 차이로 인한 403을 우회합니다.
 */
const API_BASE = typeof window !== "undefined" && window.location.hostname !== "law-caddy.pages.dev"
  ? "https://law-caddy.pages.dev"
  : "";

async function callClaudeProxy(
  systemPrompt: string,
  userMessage: string,
  sharedPrefix?: string,
  effort?: Effort,
): Promise<string> {
  return withRetry(async () => {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE}/api/claude`, {
      method: "POST",
      headers,
      body: JSON.stringify({ systemPrompt, userMessage, sharedPrefix, stream: true, effort }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = (await response.json()) as ProxyErrorResponse & { status?: number; apiKeyPrefix?: string };
        detail = errorBody?.detail ?? errorBody?.error ?? "";
        if (errorBody?.apiKeyPrefix) {
          detail += ` [key: ${errorBody.apiKeyPrefix}]`;
        }
      } catch { /* non-JSON error body */ }
      throw new Error(`Claude API 호출 실패: HTTP ${response.status} ${detail}`.trim());
    }

    return handleStreamResult("proxy", await readClaudeStream(response));
  });
}

/**
 * Phase 2: 공통 prefix를 별도 캐시 블록으로 보내는 호출 함수.
 *
 * 6개 에이전트가 sharedPrefix를 공유하면, 첫 호출에서 캐시가 만들어진 후
 * 같은 5분 윈도우의 나머지 호출들은 prefix 부분에서 ~90% 할인.
 * persona 부분은 에이전트마다 달라서 캐시 안 되지만 어차피 짧음.
 *
 * 작동 원리:
 *   system: [
 *     { type: "text", text: sharedPrefix, cache_control: ephemeral },  ← 캐시
 *     { type: "text", text: persona }                                  ← 캐시 안 함
 *   ]
 */
export async function callClaudeWithCachedPrefix(
  sharedPrefix: string,
  persona: string,
  userMessage: string,
): Promise<string> {
  // 합쳐서 단일 systemPrompt로 보내되, 백엔드/Direct에서 두 블록으로 분리
  // (호환성을 위해 기존 systemPrompt 인터페이스를 깨지 않음)
  return callClaude(persona, userMessage, sharedPrefix);
}

/**
 * Anthropic Claude API를 호출하여 응답을 받습니다.
 * - VITE_ANTHROPIC_API_KEY가 있으면: 브라우저에서 직접 호출 (CORS 허용)
 * - 없으면: /api/claude Cloudflare 프록시 사용 (폴백)
 *
 * @param sharedPrefix Phase 2 prompt caching용 공통 prefix (선택). 있으면 별도 캐시 블록으로 분리됨.
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  sharedPrefix?: string,
  effort?: Effort,
): Promise<string> {
  try {
    // API 키가 빌드에 포함되어 있으면 브라우저에서 직접 호출
    // (프록시 경로와 마찬가지로 재시도를 건다 — 529 과부하 같은 일시적 오류를 사용자가 보지 않도록)
    if (DIRECT_API_KEY) {
      return await withRetry(() =>
        callClaudeDirect(systemPrompt, userMessage, DIRECT_API_KEY, sharedPrefix, effort),
      );
    }

    // 폴백: Cloudflare Functions 프록시
    return await callClaudeProxy(systemPrompt, userMessage, sharedPrefix, effort);
  } catch (error: unknown) {
    Sentry.captureException(error);
    const errMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    // 전역 API 에러 알림
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("api-error", { detail: errMsg }));
    }
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "Claude API에 연결할 수 없습니다. 네트워크 연결을 확인하세요.",
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Claude API 호출 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 멀티턴 대화를 지원하는 Claude API 호출
 */
export async function callClaudeChat(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  try {
    // API 키가 빌드에 포함되어 있으면 브라우저에서 직접 호출 (재시도 포함)
    if (DIRECT_API_KEY) {
      return await withRetry(() =>
        callClaudeChatDirect(systemPrompt, messages, DIRECT_API_KEY),
      );
    }

    // 폴백: Cloudflare Functions 프록시
    return await callClaudeChatProxy(systemPrompt, messages);
  } catch (error: unknown) {
    Sentry.captureException(error);
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "Claude API에 연결할 수 없습니다. 네트워크 연결을 확인하세요.",
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Claude API 호출 중 알 수 없는 오류가 발생했습니다.");
  }
}

async function callClaudeChatDirect(
  systemPrompt: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<string> {
  const url = isDev ? DEV_PROXY_URL : ANTHROPIC_API_URL;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "anthropic-beta": ANTHROPIC_BETA,
  };
  if (!isDev) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Prompt Caching: 멀티턴 채팅에서 system prompt + 누적 메시지 캐시
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    // 상태 코드를 반드시 메시지에 남긴다 — withRetry가 이걸로 재시도 여부를 판단한다.
    // (예전엔 본문 파싱에 성공하면 "HTTP 529"가 지워져서 과부하가 재시도되지 않았다)
    let detail = response.statusText;
    try {
      const errorBody = (await response.json()) as ClaudeApiError;
      detail = errorBody?.error?.message ?? detail;
    } catch { /* non-JSON error body */ }
    throw new Error(`Claude API 호출 실패: HTTP ${response.status} ${detail}`);
  }

  return handleStreamResult("direct", await readClaudeStream(response));
}

async function callClaudeChatProxy(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  return withRetry(async () => {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE}/api/claude`, {
      method: "POST",
      headers,
      body: JSON.stringify({ systemPrompt, messages, stream: true }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = (await response.json()) as ProxyErrorResponse;
        detail = errorBody?.detail ?? errorBody?.error ?? "";
      } catch { /* non-JSON error body */ }
      throw new Error(`Claude API 호출 실패: HTTP ${response.status} ${detail}`.trim());
    }

    return handleStreamResult("proxy", await readClaudeStream(response));
  });
}
