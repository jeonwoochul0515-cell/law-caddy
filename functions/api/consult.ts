// 랜딩 상담 신청 접수 — 가입(사업자 인증) 전 방문자의 이름·연락처를 잡는 유일한 리드 입구.
// 저장(KV) 먼저, 문자(Solapi)는 그다음 — 문자가 실패해도 리드는 남는다.
import type { Env } from "./_shared/types";
import { sendSms } from "./_shared/solapi";

interface ConsultEnv extends Env {
  CONSULTS?: KVNamespace;
  CONSULT_ADMIN_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const onRequestPost: PagesFunction<ConsultEnv> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  // 허니팟 — 봇이 채우는 숨은 필드
  if (typeof body.website2 === "string" && body.website2) return json({ ok: true });

  const name = String(body.name || "").replace(/[\r\n]/g, " ").trim().slice(0, 30);
  const phone = String(body.phone || "").replace(/[^0-9]/g, "");
  const message = String(body.message || "").trim().slice(0, 500);

  if (name.length < 2 || !/[가-힣a-zA-Z]/.test(name)) {
    return json({ ok: false, error: "invalid_name", message: "성함을 확인해 주세요." }, 400);
  }
  if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
    return json(
      { ok: false, error: "invalid_phone", message: "휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)" },
      400,
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

  // 문자 알림 — best-effort
  let notified = false;
  try {
    const text =
      `[Law Caddy] 새 도입 상담 신청\n` +
      `이름 ${name}\n연락처 ${phone}` +
      (message ? `\n내용: ${message.slice(0, 300)}` : "");
    await sendSms(env, env.ADMIN_NOTIFY_PHONE.replace(/[^0-9]/g, ""), text);
    notified = true;
  } catch {
    /* 발송 실패 — 저장돼 있으면 접수는 유효 */
  }

  // 중앙 접수함(lead-inbox)에 사본 전송 — 전 사이트 공용 관리 화면에서 함께 본다
  try {
    const token = (env as unknown as { LEAD_INBOX_TOKEN?: string }).LEAD_INBOX_TOKEN;
    if (token) {
      await fetch("https://lead-inbox.jeonwoochul0515.workers.dev/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-token": token },
        body: JSON.stringify({ site: "law-caddy", name, phone, detail: message }),
      });
    }
  } catch {
    /* 접수함 전송 실패는 무시 */
  }

  if (!saved && !notified) {
    return json({ ok: false, error: "receipt_failed" }, 500);
  }
  return json({ ok: true, notified });
};

// 접수 목록 조회 (운영자용, 토큰 필요): GET /api/consult?token=...
export const onRequestGet: PagesFunction<ConsultEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (!env.CONSULT_ADMIN_TOKEN || token !== env.CONSULT_ADMIN_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
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
