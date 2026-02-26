import type { Env } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return Response.json({
    status: "ok",
    service: "law-caddy-cf-functions",
    timestamp: new Date().toISOString(),
    rtzrConfigured: Boolean(
      context.env.RTZR_CLIENT_ID && context.env.RTZR_CLIENT_SECRET,
    ),
    claudeConfigured: Boolean(context.env.ANTHROPIC_API_KEY),
  });
};
