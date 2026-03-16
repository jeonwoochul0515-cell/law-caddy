import type { Env } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;

  const results: Record<string, unknown> = {
    status: "ok",
    service: "law-caddy-cf-functions",
    timestamp: new Date().toISOString(),
    rtzrConfigured: Boolean(
      context.env.RTZR_CLIENT_ID && context.env.RTZR_CLIENT_SECRET,
    ),
    claudeConfigured: Boolean(apiKey),
    keyPrefix: apiKey ? apiKey.slice(0, 15) + "..." : "NOT SET",
  };

  // Anthropic API 직접 테스트 (?test=claude 파라미터)
  const url = new URL(context.request.url);
  if (url.searchParams.get("test") === "claude" && apiKey) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 5,
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      if (resp.ok) {
        results.anthropicTest = "OK";
      } else {
        const body = await resp.text();
        results.anthropicTest = `ERROR ${resp.status}`;
        results.anthropicError = body.slice(0, 500);
      }
    } catch (err) {
      results.anthropicTest = "CONNECTION_ERROR";
      results.anthropicError = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json(results);
};
