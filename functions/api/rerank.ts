import { corsHeaders, handleOptions } from "./_shared/cors";

interface Env {
  VOYAGE_API_KEY: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return handleOptions(request);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cors = corsHeaders(request);

  if (!env.VOYAGE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "VOYAGE_API_KEY가 설정되지 않았습니다." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await request.text();

    const response = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body,
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
};
