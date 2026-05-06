import type { Env } from "./_shared/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 16384;
const API_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "context-1m-2025-08-07";
const TEMPERATURE = 0.2;

/** 텍스트 또는 Vision(이미지+텍스트) content를 지원하는 메시지 타입 */
interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

interface ClaudeRequest {
  systemPrompt: string;
  userMessage?: string;
  messages?: ChatMessage[];
  /** Phase 2 Prompt Caching: 6개 에이전트가 공유하는 큰 공통 prefix (선택). */
  sharedPrefix?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const apiKey = context.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Anthropic API 키가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const body = (await context.request.json()) as ClaudeRequest;

    if (!body.systemPrompt || (!body.userMessage && !body.messages)) {
      return Response.json(
        { error: "systemPrompt와 userMessage 또는 messages가 필요합니다." },
        { status: 400 },
      );
    }

    const messages: ChatMessage[] = body.messages ?? [
      { role: "user", content: body.userMessage! },
    ];

    // Phase 2 Prompt Caching:
    //  - sharedPrefix 있으면: [공통 prefix(캐시), persona(캐시 안 함)] 두 블록 → 에이전트 간 prefix 공유로 ~90% 할인
    //  - sharedPrefix 없으면: 단일 system 블록 (Phase 1 폴백, 기존 동작)
    const systemBlocks = body.sharedPrefix
      ? [
          {
            type: "text",
            text: body.sharedPrefix,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: body.systemPrompt,
          },
        ]
      : [
          {
            type: "text",
            text: body.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ];

    // 원본 요청의 컨텍스트를 완전히 격리한 새 Request 생성
    const anthropicRequest = new Request(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemBlocks,
        messages,
      }),
    });

    const response = await fetch(anthropicRequest);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = JSON.parse(errorText) as {
          error?: { type?: string; message?: string };
        };
        errorMessage = errorBody?.error?.message ?? errorMessage;
      } catch { /* non-JSON */ }
      return Response.json(
        {
          error: "Claude API 호출 실패",
          detail: errorMessage,
          status: response.status,
          apiKeyPrefix: apiKey.slice(0, 12) + "...",
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error: "Claude API 프록시 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
