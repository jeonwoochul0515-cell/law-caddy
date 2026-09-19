// 요청 주체(로그인 uid 우선, 없으면 IP)별 레이트 리밋 — 분당 슬라이딩 창 + 일일 상한(KST)
//
// Per-isolate 인메모리 카운터다. Cloudflare Workers는 isolate 단위로 상태가 유지되므로
// 완벽한 글로벌 제한은 아니지만, 기본적인 남용 방지에 충분하다.
//
// 왜 uid 우선인가 (2026-09-11): IP만 보면 같은 사무실(같은 공인 IP)의 변호사 여러 명이
// 한 사람 몫의 한도를 나눠 쓰게 되고, 반대로 한 사람이 IP를 바꿔 가며 한도를 우회할 수 있다.
// 로그인한 요청은 uid로, 로그인 전 공개 경로(상담 신청·사업자 검증·서명·포털)는 IP로 센다.

import { kstDay, secondsUntilKstMidnight } from "./kst";

/** 슬라이딩 창 길이 (1분) */
const WINDOW_MS = 60_000;

/** 경로 접두사별 분당 한도. 앞에서부터 처음 맞는 규칙 하나만 적용된다. */
const MINUTE_RULES: Array<{ prefix: string; limit: number }> = [
  { prefix: "/api/claude", limit: 60 },
  { prefix: "/api/transcribe", limit: 60 }, // /api/transcribe/{id} 폴링 포함
  { prefix: "/api/voyage", limit: 60 },
  { prefix: "/api/rerank", limit: 60 },
  { prefix: "/api/clova-ocr", limit: 30 },
  { prefix: "/api/notify", limit: 10 }, // notify/* 전체 (문자 1건 = 요금 1건)
  { prefix: "/api/payment", limit: 10 },
  { prefix: "/api/consult", limit: 10 }, // 공개 — IP 기준
  { prefix: "/api/verify-business", limit: 10 }, // 공개 — IP 기준
  { prefix: "/api/signing", limit: 30 }, // 공개 — IP 기준
  { prefix: "/api/portal", limit: 60 }, // 공개 — IP 기준
];

/**
 * 경로 접두사별 하루(KST) 한도. 로그인 uid 기준.
 * 임베딩·재정렬·OCR 프록시는 플랜 검사가 없어 로그인만 하면 우리 비용으로 무제한이었다.
 * 300회는 변호사 한 명이 하루 종일 써도 닿기 어려운 수치이고, 스크립트 남용은 여기서 끊긴다.
 * 관리자 문자(가입·버그 알림)는 건당 요금이 나가므로 훨씬 낮게 잡는다.
 */
const DAILY_RULES: Array<{ prefix: string; limit: number }> = [
  { prefix: "/api/voyage", limit: 300 },
  { prefix: "/api/rerank", limit: 300 },
  { prefix: "/api/clova-ocr", limit: 300 },
  { prefix: "/api/notify/bug", limit: 5 },
  { prefix: "/api/notify/signup", limit: 3 },
];

/** 분당 창 — 키: `${접두사}|${주체}`, 값: 요청 시각 배열 */
const minuteLog = new Map<string, number[]>();

/** 일일 카운터 — 키: `${접두사}|${주체}`, 값: { day: KST 날짜, count } */
const dailyLog = new Map<string, { day: string; count: number }>();

/** 오래된 엔트리 정리 주기 (5분) */
const CLEANUP_INTERVAL_MS = 300_000;
let lastCleanup = Date.now();

function matchRule<T extends { prefix: string }>(rules: T[], path: string): T | undefined {
  return rules.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
}

/** 클라이언트 IP (Cloudflare 헤더 우선) */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}


/**
 * 오래된 엔트리를 주기적으로 정리합니다. 메모리 누수를 방지합니다.
 */
function cleanupStaleEntries(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - WINDOW_MS;
  for (const [key, timestamps] of minuteLog) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) minuteLog.delete(key);
    else minuteLog.set(key, valid);
  }

  const today = kstDay(now);
  for (const [key, entry] of dailyLog) {
    if (entry.day !== today) dailyLog.delete(key);
  }
}

/**
 * 429 응답을 만듭니다. 본문은 `{ error: 한국어, code, retryAfter }`로 통일한다.
 * 예전 `{ error: "Too Many Requests", message: ... }`는 화면이 error만 읽어 영어가 그대로 떴다.
 */
export function rateLimitResponse(
  message: string,
  retryAfterSeconds: number,
  code = "RATE_LIMITED",
): Response {
  return Response.json(
    { error: message, code, retryAfter: retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/**
 * 요청에 대해 분당·일일 레이트 리밋을 확인합니다.
 * 제한 초과 시 429 Response를 반환하고, 통과 시 null을 반환합니다.
 *
 * @param uid 미들웨어가 검증한 로그인 uid. 있으면 uid로, 없으면 IP로 센다.
 */
export function checkRateLimit(request: Request, uid?: string): Response | null {
  const path = new URL(request.url).pathname;
  const minuteRule = matchRule(MINUTE_RULES, path);
  const dailyRule = matchRule(DAILY_RULES, path);
  if (!minuteRule && !dailyRule) return null;

  const subject = uid ? `u:${uid}` : `ip:${getClientIp(request)}`;
  const now = Date.now();

  // ── 분당 슬라이딩 창 ──
  if (minuteRule) {
    const key = `${minuteRule.prefix}|${subject}`;
    const cutoff = now - WINDOW_MS;
    const recent = (minuteLog.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= minuteRule.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
      return rateLimitResponse(
        `요청이 너무 많습니다. ${retryAfterSeconds}초 후 다시 시도해 주세요.`,
        retryAfterSeconds,
      );
    }

    recent.push(now);
    minuteLog.set(key, recent);
  }

  // ── 일일 상한 (KST) ──
  if (dailyRule) {
    const key = `${dailyRule.prefix}|${subject}`;
    const today = kstDay(now);
    const entry = dailyLog.get(key);
    const count = entry && entry.day === today ? entry.count : 0;

    if (count >= dailyRule.limit) {
      return rateLimitResponse(
        `오늘 사용 한도(${dailyRule.limit}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`,
        secondsUntilKstMidnight(now),
        "DAILY_LIMIT",
      );
    }

    dailyLog.set(key, { day: today, count: count + 1 });
  }

  cleanupStaleEntries(now);
  return null;
}

/**
 * KV 기반 카운터를 1 올리고 새 값을 돌려줍니다. isolate가 바뀌어도 이어지는 "느슨한" 상한용.
 * (KV는 최종 일관성이라 순간 폭주는 몇 건 더 통과할 수 있다 — 인메모리 창과 함께 쓴다.)
 * KV 오류는 0으로 취급해 통과시킨다 — 저장소 장애로 정상 접수까지 막지 않기 위해서다.
 *
 * @param ttlSeconds 카운터 수명(초). KV 최소값 60.
 */
export async function kvIncrement(
  kv: KVNamespace | undefined,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  if (!kv) return 0;
  try {
    const current = Number((await kv.get(key)) ?? "0") || 0;
    const next = current + 1;
    await kv.put(key, String(next), { expirationTtl: Math.max(60, ttlSeconds) });
    return next;
  } catch (err) {
    console.warn("[rate-limit] KV 카운터 실패 — 통과시킵니다:", err instanceof Error ? err.message : String(err));
    return 0;
  }
}
