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

/** dev 환경에서는 Vite 프록시 사용 (CORS 우회) */
const isDev = import.meta.env.DEV;
const ANTHROPIC_API_URL = isDev
  ? "/api/anthropic/v1/messages"
  : "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 16384;
const API_VERSION = "2023-06-01";
const TEMPERATURE = 0.2;

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
 * 직접 Anthropic API를 호출합니다 (로컬 개발 폴백).
 */
async function callClaudeDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
  };
  // 직접 호출 시에만 CORS 헤더 추가 (프록시 경유 시 불필요)
  if (!isDev) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
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
 */
async function callClaudeProxy(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  return withRetry(async () => {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch("/api/claude", {
      method: "POST",
      headers,
      body: JSON.stringify({ systemPrompt, userMessage }),
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

/**
 * Anthropic Claude API를 호출하여 응답을 받습니다.
 * - VITE_ANTHROPIC_API_KEY가 있으면: 직접 호출 (로컬 개발)
 * - 없으면: /api/claude 프록시 사용 (Cloudflare Pages 프로덕션)
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  try {
    // 로컬 개발 환경에서만 직접 호출, 프로덕션은 항상 프록시 사용
    if (isDev) {
      const directApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (directApiKey && typeof directApiKey === "string") {
        return await callClaudeDirect(systemPrompt, userMessage, directApiKey);
      }
    }

    return await callClaudeProxy(systemPrompt, userMessage);
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

/**
 * 멀티턴 대화를 지원하는 Claude API 호출
 */
export async function callClaudeChat(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  try {
    // 로컬 개발 환경에서만 직접 호출, 프로덕션은 항상 프록시 사용
    if (isDev) {
      const directApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (directApiKey && typeof directApiKey === "string") {
        return await callClaudeChatDirect(systemPrompt, messages, directApiKey);
      }
    }

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
  };
  if (!isDev) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
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
    const response = await fetch("/api/claude", {
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
