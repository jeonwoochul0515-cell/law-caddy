// 한국시간(KST) 날짜 계산 — Cloudflare Workers는 UTC에서 돈다
//
// ⚠️ 서버에서 new Date().toISOString().slice(0, 10)을 날짜로 쓰지 말 것.
// 그건 UTC 날짜라 한국시간 0시~8시59분에는 전날이 나온다. 출근 직후 8시대에
// 조회하면 어제 마감된 기한이 「다가오는 일정」으로 의뢰인에게 보인다.
//
// 같은 함수가 rate-limit.ts·consult.ts에 각각 복사돼 있던 것을 여기로 모았다.

/** KST 오프셋 (ms) */
const KST_OFFSET_MS = 9 * 3600_000;

/** 오늘 날짜(KST) — "YYYY-MM-DD" */
export function kstDay(now: number = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 다음 KST 자정까지 남은 초 (1 이상) */
export function secondsUntilKstMidnight(now: number = Date.now()): number {
  const kst = now + KST_OFFSET_MS;
  const nextMidnight = Math.floor(kst / 86_400_000) * 86_400_000 + 86_400_000;
  return Math.max(1, Math.ceil((nextMidnight - kst) / 1000));
}
