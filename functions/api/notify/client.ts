// 의뢰인에게 문자(SMS/LMS)를 발송하는 엔드포인트 — 서명 링크·케어 메시지 전달용
//
// POST /api/notify/client
// Body: { to: string(휴대폰번호), text: string }
// Auth: Firebase JWT (미들웨어에서 검증) + 유료 플랜 필수 (발송 비용 발생)

import type { Env } from "../_shared/types";
import { sendSms } from "../_shared/solapi";
import { requirePaidPlan } from "../_shared/plan";

/** 한국 휴대폰 번호 (숫자만, 010/011/016/017/018/019) */
const PHONE_RE = /^01[016789]\d{7,8}$/;

/** LMS 한도(2,000바이트·한글 약 1,000자)를 넘지 않도록 여유를 둔 상한 */
const MAX_TEXT_LENGTH = 900;

// per-isolate 남용 방지: uid당 시간당 발송 상한
const HOURLY_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;
const sendLog = new Map<string, number[]>();

function checkSendLimit(uid: string): boolean {
  const now = Date.now();
  const timestamps = (sendLog.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= HOURLY_LIMIT) return false;
  timestamps.push(now);
  sendLog.set(uid, timestamps);
  return true;
}

interface NotifyClientRequest {
  to?: string;
  text?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const denied = await requirePaidPlan(context.env, uid);
  if (denied) return denied;

  let body: NotifyClientRequest;
  try {
    body = (await context.request.json()) as NotifyClientRequest;
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const to = (body.to ?? "").replace(/\D/g, "");
  const text = (body.text ?? "").trim();

  if (!PHONE_RE.test(to)) {
    return Response.json({ error: "올바른 휴대폰 번호가 아닙니다." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "발송할 내용이 없습니다." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `문자 내용이 너무 깁니다. (최대 ${MAX_TEXT_LENGTH}자, 현재 ${text.length}자)` },
      { status: 400 },
    );
  }
  if (!checkSendLimit(uid)) {
    return Response.json(
      { error: "발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    await sendSms(context.env, to, text);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[notify/client] 발송 실패:", err);
    return Response.json({ error: "문자 발송에 실패했습니다." }, { status: 502 });
  }
};
