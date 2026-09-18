// 한국 시간(브라우저 로컬) 기준 날짜 문자열 유틸 — toISOString()의 UTC 날짜 오류를 막는다
//
// ⚠️ 날짜를 YYYY-MM-DD로 만들 때 new Date().toISOString().slice(0, 10)을 쓰지 말 것.
// toISOString()은 UTC라 한국시간 0시~8시59분에는 전날 날짜가 나온다. 출근 직후
// 「납부완료」를 누르면 장부에 어제 날짜가 박힌다. 그걸 막으려고 만든 파일이다.

/** 오늘(또는 주어진 Date)을 로컬 기준 YYYY-MM-DD로 */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 한국 시간대로 고정한 날짜·시각 표시 (예: "2026. 9. 11. 오후 2:02") */
export function formatKst(d: Date, opts?: { dateOnly?: boolean }): string {
  if (d.getTime() === 0) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(opts?.dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

/** 한국 시간대 기준 시각만 (예: "오후 2:02") */
export function formatKstTime(d: Date): string {
  if (d.getTime() === 0) return "";
  return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}
