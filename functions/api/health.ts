import type { Env } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  const dataGoKrKey = context.env.DATA_GO_KR_API_KEY;

  const results: Record<string, unknown> = {
    status: "ok",
    service: "law-caddy-cf-functions",
    timestamp: new Date().toISOString(),
    rtzrConfigured: Boolean(
      context.env.RTZR_CLIENT_ID && context.env.RTZR_CLIENT_SECRET,
    ),
    claudeConfigured: Boolean(apiKey),
    dataGoKrConfigured: Boolean(dataGoKrKey),
    keyPrefix: apiKey ? apiKey.slice(0, 15) + "..." : "NOT SET",
  };

  const url = new URL(context.request.url);
  const test = url.searchParams.get("test");

  // Anthropic API 테스트 (?test=claude)
  if (test === "claude" && apiKey) {
    try {
      const testReq = new Request("https://api.anthropic.com/v1/messages", {
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
      const resp = await fetch(testReq);

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

  // data.go.kr 헌재 API 테스트 (?test=datagokr)
  if (test === "datagokr" && dataGoKrKey) {
    try {
      const apiUrl = new URL("https://apis.data.go.kr/9710000/BmsPrecService/getList");
      apiUrl.searchParams.set("serviceKey", dataGoKrKey);
      apiUrl.searchParams.set("searchText", "위헌");
      apiUrl.searchParams.set("numOfRows", "2");
      apiUrl.searchParams.set("resultType", "json");

      const resp = await fetch(apiUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const body = await resp.text();
        results.dataGoKrTest = `OK ${resp.status}`;
        results.dataGoKrResponse = body.slice(0, 500);
      } else {
        const body = await resp.text();
        results.dataGoKrTest = `ERROR ${resp.status}`;
        results.dataGoKrError = body.slice(0, 500);
      }
    } catch (err) {
      results.dataGoKrTest = "CONNECTION_ERROR";
      results.dataGoKrError = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json(results);
};
