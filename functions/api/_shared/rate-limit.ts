// Per-isolate 인메모리 레이트 리미터 (슬라이딩 윈도우)
// Cloudflare Workers는 isolate 단위로 상태가 유지되므로
// 완벽한 글로벌 제한은 아니지만, 기본적인 남용 방지에 충분합니다.

/** 레이트 리밋 설정 */
const MAX_REQUESTS = 60;
const WINDOW_MS = 60_000; // 1분

/** IP별 요청 타임스탬프 배열 */
const requestLog = new Map<string, number[]>();

/** 오래된 엔트리 정리 주기 (5분) */
const CLEANUP_INTERVAL_MS = 300_000;
let lastCleanup = Date.now();

/**
 * 오래된 IP 엔트리를 주기적으로 정리합니다.
 * 메모리 누수를 방지합니다.
 */
function cleanupStaleEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - WINDOW_MS;
  for (const [ip, timestamps] of requestLog) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, valid);
    }
  }
}

/** 레이트 리밋 적용 대상 경로 */
const RATE_LIMITED_PATHS = ["/api/claude", "/api/transcribe"];

/**
 * 요청에 대해 레이트 리밋을 확인합니다.
 * 제한 초과 시 429 Response를 반환하고, 통과 시 null을 반환합니다.
 */
export function checkRateLimit(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname;

  // 레이트 리밋 대상 경로가 아니면 통과
  const isRateLimited = RATE_LIMITED_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!isRateLimited) return null;

  // 클라이언트 IP 추출 (Cloudflare 헤더 우선)
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // 슬라이딩 윈도우: 현재 윈도우 내 요청만 유지
  const timestamps = requestLog.get(ip) ?? [];
  const recentTimestamps = timestamps.filter((t) => t > cutoff);

  if (recentTimestamps.length >= MAX_REQUESTS) {
    // 다음 요청 가능 시점 계산
    const oldestInWindow = recentTimestamps[0];
    const retryAfterSeconds = Math.ceil(
      (oldestInWindow + WINDOW_MS - now) / 1000,
    );

    return new Response(
      JSON.stringify({
        error: "Too Many Requests",
        message: `요청 한도 초과: ${MAX_REQUESTS}회/분. ${retryAfterSeconds}초 후 다시 시도하세요.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil((oldestInWindow + WINDOW_MS) / 1000),
          ),
        },
      },
    );
  }

  // 요청 기록 추가
  recentTimestamps.push(now);
  requestLog.set(ip, recentTimestamps);

  // 주기적 정리
  cleanupStaleEntries();

  return null;
}
