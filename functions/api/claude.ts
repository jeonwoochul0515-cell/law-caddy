import type { Env } from "./_shared/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const API_VERSION = "2023-06-01";

interface ClaudeRequest {
  systemPrompt: string;
  userMessage: string;
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

    if (!body.systemPrompt || !body.userMessage) {
      return Response.json(
        { error: "systemPrompt와 userMessage가 필요합니다." },
        { status: 400 },
      );
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: body.systemPrompt,
        messages: [{ role: "user", content: body.userMessage }],
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as {
        error?: { message?: string };
      };
      return Response.json(
        {
          error: "Claude API 호출 실패",
          detail:
            errorBody?.error?.message ?? `HTTP ${response.status}`,
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
