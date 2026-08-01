// SOLAPI SMS 발송 공통 유틸 (HMAC-SHA256 인증)
import type { Env } from "./types";

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";

/** SOLAPI HMAC-SHA256 인증 헤더에 필요한 signature를 계산합니다. */
async function computeSignature(date: string, salt: string, apiSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(date + salt),
  );
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 하이픈·공백을 떼고 숫자만 남긴다 — Solapi는 숫자만 받는다 */
const digitsOnly = (v: string) => String(v ?? "").replace(/[^0-9]/g, "");

/**
 * SMS 1건을 발송합니다. 실패 시 에러 메시지를 담아 throw합니다.
 *
 * 수신·발신번호는 여기서 숫자만 남긴다. 예전에는 "숫자만"이라고 주석으로만
 * 적어두고 강제하지 않아, consult.ts만 정제하고 notify/bug·signup은 환경변수를
 * 그대로 넘겼다. 번호가 010-1234-5678 형태로 저장돼 있으면 상담 알림은 가는데
 * 버그·가입 알림만 조용히 실패하는, 원인을 찾기 어려운 상태가 된다. (2026-08-01)
 *
 * @param to 수신번호 (하이픈이 있어도 된다)
 */
export async function sendSms(env: Env, to: string, text: string): Promise<void> {
  const toDigits = digitsOnly(to);
  if (!toDigits) throw new Error("SOLAPI 발송 실패: 수신번호가 비어 있습니다.");

  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const signature = await computeSignature(date, salt, env.SOLAPI_API_SECRET);

  const resp = await fetch(SOLAPI_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: {
        to: toDigits,
        from: digitsOnly(env.SOLAPI_SENDER_NUMBER),
        text,
      },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`SOLAPI 발송 실패 (HTTP ${resp.status}): ${detail}`);
  }
}
