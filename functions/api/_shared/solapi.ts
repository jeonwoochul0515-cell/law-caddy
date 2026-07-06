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

/**
 * SMS 1건을 발송합니다. 실패 시 에러 메시지를 담아 throw합니다.
 * @param to 수신번호 (숫자만, 예: 01012345678)
 */
export async function sendSms(env: Env, to: string, text: string): Promise<void> {
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
        to,
        from: env.SOLAPI_SENDER_NUMBER,
        text,
      },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`SOLAPI 발송 실패 (HTTP ${resp.status}): ${detail}`);
  }
}
