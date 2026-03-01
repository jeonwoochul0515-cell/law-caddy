// Anthropic Claude API 서비스
// Cloudflare Functions 프록시 또는 직접 호출 (로컬 개발 폴백)

/** 멀티턴 채팅 메시지 타입 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Claude API 응답 content 블록 타입 */
interface ContentBlock {
  type: "text";
  text: string;
}

/** Claude API 응답 타입 */
interface ClaudeApiResponse {
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
const MAX_TOKENS = 4096;
const API_VERSION = "2023-06-01";
const TEMPERATURE = 0.2;

/**
 * Claude API 응답에서 텍스트를 추출합니다.
 */
function extractText(data: ClaudeApiResponse): string {
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
    const errorBody = (await response.json()) as ClaudeApiError;
    const errorMessage =
      errorBody?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
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
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userMessage }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ProxyErrorResponse;
    throw new Error(
      `Claude API 호출 실패: ${errorBody?.detail ?? errorBody?.error ?? `HTTP ${response.status}`}`,
    );
  }

  const data = (await response.json()) as ClaudeApiResponse;
  return extractText(data);
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
    const directApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    if (directApiKey && typeof directApiKey === "string") {
      return await callClaudeDirect(systemPrompt, userMessage, directApiKey);
    }

    return await callClaudeProxy(systemPrompt, userMessage);
  } catch (error: unknown) {
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
    const directApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    if (directApiKey && typeof directApiKey === "string") {
      return await callClaudeChatDirect(systemPrompt, messages, directApiKey);
    }

    return await callClaudeChatProxy(systemPrompt, messages);
  } catch (error: unknown) {
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
    const errorBody = (await response.json()) as ClaudeApiError;
    const errorMessage =
      errorBody?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`Claude API 호출 실패: ${errorMessage}`);
  }

  const data = (await response.json()) as ClaudeApiResponse;
  return extractText(data);
}

async function callClaudeChatProxy(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, messages }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ProxyErrorResponse;
    throw new Error(
      `Claude API 호출 실패: ${errorBody?.detail ?? errorBody?.error ?? `HTTP ${response.status}`}`,
    );
  }

  const data = (await response.json()) as ClaudeApiResponse;
  return extractText(data);
}
