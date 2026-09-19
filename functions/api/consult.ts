// 랜딩 상담 신청 접수 — 가입(사업자 인증) 전 방문자의 이름·연락처를 잡는 유일한 리드 입구.
// 저장(KV) 먼저, 문자(Solapi)는 그다음 — 문자가 실패해도 리드는 남는다.
import type { Env } from "./_shared/types";
import { sendSms } from "./_shared/solapi";
import { isAllowedOrigin } from "./_shared/cors";
import { safeEqual } from "./_shared/auth";
import { getClientIp, kvIncrement, rateLimitResponse } from "./_shared/rate-limit";
import { kstDay } from "./_shared/kst";

// 응답 형식. 화면(LandingPage)은 `ok`와 `message`를 읽으므로 error와 같은 문구를 message에도 싣는다.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (message: string, code: string, status: number) =>
  json({ ok: false, error: message, message, code }, status);

// 스팸 방어 — 접수 1건마다 관리자 문자 요금이 나간다.
//   1) 출처 검사: cors.ts의 허용 목록(앵커된 정규식)과 같은 기준. Origin이 없으면 Referer의 origin으로,
//      둘 다 없으면 거부한다. 예전 정규식은 앞뒤가 안 묶여 `evil-law-caddy.com`·`아무거나.pages.dev`가 통과했고
//      헤더가 없으면(curl) 검사를 건너뛰었다. (2026-09-11)
//   2) 미들웨어 분당 10회(IP) + 이 파일의 10분 5회(IP, 인메모리) + KV 일일 카운터(IP 20회·전화번호 3회).
//      KV 카운터는 isolate가 바뀌어도 이어진다.
//   3) 허니팟 필드 website2 — 봇이 채우면 성공처럼 답하고 버린다.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 5;
const DAILY_IP_MAX = 20;
const DAILY_PHONE_MAX = 3;
const DAY_TTL_SEC = 24 * 60 * 60;
const rlHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW_MS)) rlHits.delete(k);
  }
  return arr.length > RL_MAX;
}

/** Origin 헤더, 없으면 Referer의 origin */
function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin) return origin;
  const referer = request.headers.get("Referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}



export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isAllowedOrigin(requestOrigin(request))) {
    return fail("허용되지 않은 출처의 요청입니다.", "FORBIDDEN_ORIGIN", 403);
  }

  const ip = getClientIp(request);
  if (rateLimited(ip)) {
    return rateLimitResponse("잠시 후 다시 시도해 주세요.", 600);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("요청 형식이 올바르지 않습니다.", "BAD_REQUEST", 400);
  }

  // 허니팟 — 봇이 채우는 숨은 필드
  if (typeof body.website2 === "string" && body.website2) return json({ ok: true });

  const name = String(body.name || "").replace(/[\r\n]/g, " ").trim().slice(0, 30);
  const phone = String(body.phone || "").replace(/[^0-9]/g, "");
  const message = String(body.message || "").trim().slice(0, 500);

  if (name.length < 2 || !/[가-힣a-zA-Z]/.test(name)) {
    return fail("성함을 확인해 주세요.", "INVALID_NAME", 400);
  }
  if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
    return fail("휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)", "INVALID_PHONE", 400);
  }

  // 일일 카운터(KV) — 같은 IP·같은 번호로 하루에 반복 접수하는 스팸을 isolate와 무관하게 끊는다
  const day = kstDay();
  const [ipCount, phoneCount] = await Promise.all([
    kvIncrement(env.CONSULTS, `rl:consult:ip:${ip}:${day}`, DAY_TTL_SEC),
    kvIncrement(env.CONSULTS, `rl:consult:phone:${phone}:${day}`, DAY_TTL_SEC),
  ]);
  if (ipCount > DAILY_IP_MAX || phoneCount > DAILY_PHONE_MAX) {
    return rateLimitResponse(
      "오늘은 더 이상 접수할 수 없습니다. 급하시면 1660-4452로 전화 주세요.",
      DAY_TTL_SEC,
      "DAILY_LIMIT",
    );
  }

  // 저장 먼저 (KV) — id는 시간역순 정렬이 쉽도록 타임스탬프 프리픽스
  const id = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  let saved = false;
  if (env.CONSULTS) {
    try {
      await env.CONSULTS.put(
        `consult:${id}`,
        JSON.stringify({ id, name, phone, message, at: new Date().toISOString() }),
      );
      saved = true;
    } catch {
      /* 저장 실패 — 문자라도 성공하면 접수로 취급 */
    }
  }

  // 문자 알림 — best-effort. 수신번호는 서버 설정(ADMIN_NOTIFY_PHONE)만 쓴다.
  let notified = false;
  try {
    const text =
      `[Law Caddy] 새 도입 상담 신청\n` +
      `이름 ${name}\n연락처 ${phone}` +
      (message ? `\n내용: ${message.slice(0, 300)}` : "");
    await sendSms(env, env.ADMIN_NOTIFY_PHONE, text);
    notified = true;
  } catch (err) {
    console.error("[consult] 관리자 문자 실패:", err instanceof Error ? err.message : String(err));
  }

  // 중앙 접수함(lead-inbox)에 사본 전송 — 전 사이트 공용 관리 화면에서 함께 본다
  try {
    if (env.LEAD_INBOX_TOKEN) {
      await fetch("https://lead-inbox.jeonwoochul0515.workers.dev/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-token": env.LEAD_INBOX_TOKEN },
        body: JSON.stringify({ site: "law-caddy", name, phone, detail: message }),
      });
    }
  } catch {
    /* 접수함 전송 실패는 무시 */
  }

  if (!saved && !notified) {
    return fail("접수 처리에 실패했습니다. 잠시 후 다시 시도하거나 1660-4452로 전화 주세요.", "RECEIPT_FAILED", 500);
  }
  return json({ ok: true, notified });
};

// 접수 목록 조회 (운영자용, 토큰 필요): GET /api/consult?token=...  또는 헤더 x-admin-token
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (!env.CONSULT_ADMIN_TOKEN || !token || !safeEqual(token, env.CONSULT_ADMIN_TOKEN)) {
    return fail("운영자 토큰이 필요합니다.", "UNAUTHORIZED", 401);
  }
  if (!env.CONSULTS) return json({ ok: true, consults: [] });
  const list = await env.CONSULTS.list({ prefix: "consult:", limit: 200 });
  const rows: unknown[] = [];
  for (const k of list.keys) {
    const v = await env.CONSULTS.get(k.name);
    if (v) rows.push(JSON.parse(v));
  }
  // 최신순 정렬 (id가 타임스탬프 프리픽스)
  rows.sort((a, b) => String((b as { id: string }).id).localeCompare(String((a as { id: string }).id)));
  return json({ ok: true, consults: rows });
};
