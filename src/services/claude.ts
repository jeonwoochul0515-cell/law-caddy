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

/** Claude API 응답 타입 */
export interface ClaudeApiResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
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
const MAX_TOKENS = 16384;
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
 * 브라우저에서 직접 Anthropic API를 호출합니다.
 * - 로컬 개발: Vite 프록시 (/api/anthropic/...) 경유
 * - 프로덕션: anthropic-dangerous-direct-browser-access 헤더로 직접 호출
 */
async function callClaudeDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  sharedPrefix?: string,
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
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as ClaudeApiError;
      errorMessage = errorBody?.error?.message ?? errorMessage;
    } catch { /* non-JSON error body */ }
    throw new Error(`Claude API 호출 실패: ${errorMessage}`);
  }

  const data = (await response.json()) as ClaudeApiResponse;
  return extractText(data);
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
): Promise<string> {
  return withRetry(async () => {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE}/api/claude`, {
      method: "POST",
      headers,
      body: JSON.stringify({ systemPrompt, userMessage, sharedPrefix }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as ProxyErrorResponse & { status?: number; apiKeyPrefix?: string };
        errorMessage = errorBody?.detail ?? errorBody?.error ?? errorMessage;
        if (errorBody?.apiKeyPrefix) {
          errorMessage += ` [key: ${errorBody.apiKeyPrefix}]`;
        }
      } catch { /* non-JSON error body */ }
      throw new Error(`Claude API 호출 실패: ${errorMessage}`);
    }

    const data = (await response.json()) as ClaudeApiResponse;
    return extractText(data);
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
): Promise<string> {
  try {
    // API 키가 빌드에 포함되어 있으면 브라우저에서 직접 호출
    if (DIRECT_API_KEY) {
      return await callClaudeDirect(systemPrompt, userMessage, DIRECT_API_KEY, sharedPrefix);
    }

    // 폴백: Cloudflare Functions 프록시
    return await callClaudeProxy(systemPrompt, userMessage, sharedPrefix);
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
    // API 키가 빌드에 포함되어 있으면 브라우저에서 직접 호출
    if (DIRECT_API_KEY) {
      return await callClaudeChatDirect(systemPrompt, messages, DIRECT_API_KEY);
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
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as ClaudeApiError;
      errorMessage = errorBody?.error?.message ?? errorMessage;
    } catch { /* non-JSON error body */ }
    throw new Error(`Claude API 호출 실패: ${errorMessage}`);
  }

  const data = (await response.json()) as ClaudeApiResponse;
  return extractText(data);
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
      body: JSON.stringify({ systemPrompt, messages }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as ProxyErrorResponse;
        errorMessage = errorBody?.detail ?? errorBody?.error ?? errorMessage;
      } catch { /* non-JSON error body */ }
      throw new Error(`Claude API 호출 실패: ${errorMessage}`);
    }

    const data = (await response.json()) as ClaudeApiResponse;
    return extractText(data);
  });
}
