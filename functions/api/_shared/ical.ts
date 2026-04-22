// iCal (RFC 5545) 생성 유틸리티
//
// RFC 5545 규격:
// - 모든 라인은 CRLF(\r\n)로 끝나야 함
// - 라인 길이 75 octets 초과 시 line folding (다음 줄 `\r\n ` 공백 시작)
// - DESCRIPTION·SUMMARY·LOCATION 등의 text field는 특수문자 escape 필요:
//     백슬래시(\)   → \\
//     세미콜론(;)    → \;
//     콤마(,)        → \,
//     개행(\n, \r\n) → \n (literal)

/** VEVENT 1건 생성에 필요한 데이터 */
export interface VEventInput {
  /** UID (전역 유일. UID:{caseId}-{eventId}@law-caddy.com) */
  uid: string;
  /** 이벤트 제목 (SUMMARY) */
  summary: string;
  /** 상세 설명 (DESCRIPTION) */
  description: string;
  /** 장소 (LOCATION, 선택) */
  location?: string;
  /** 날짜 YYYY-MM-DD */
  date: string;
  /** 시간 HH:MM (선택 — 있으면 시간 지정 이벤트, 없으면 종일 이벤트) */
  time?: string;
}

/**
 * RFC 5545 TEXT 속성 값 escape.
 * - 순서 중요: 백슬래시를 가장 먼저 처리해야 다른 치환이 이중 escape되지 않음.
 */
export function icalEscapeText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Date 객체를 iCal DTSTAMP 형식(YYYYMMDDTHHMMSSZ, UTC)으로 변환합니다.
 */
export function formatDateTimeUtc(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/**
 * YYYY-MM-DD 형식을 YYYYMMDD로 변환합니다.
 */
export function formatDateCompact(ymd: string): string {
  return ymd.replace(/-/g, "");
}

/**
 * YYYY-MM-DD에 n일을 더한 결과를 YYYYMMDD로 반환합니다 (UTC 기준).
 */
export function addDaysCompact(ymd: string, days: number): string {
  // "YYYY-MM-DD"를 UTC 자정으로 파싱 (타임존 이슈 회피)
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return formatDateCompact(ymd);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * KST(Asia/Seoul, UTC+9) 기준 "YYYY-MM-DD HH:MM"을 UTC 타임스탬프로 변환합니다.
 * 반환: "YYYYMMDDTHHMMSSZ" (UTC)
 *
 * iCal VTIMEZONE 블록 없이 로컬 시간을 표기하면 클라이언트마다 해석이
 * 달라지므로, 시간 지정 이벤트는 UTC(Z suffix)로 고정 변환합니다.
 */
export function formatKstAsUtc(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const [hh, mi] = hm.split(":").map((s) => parseInt(s, 10));
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mi)) {
    return "";
  }
  // KST → UTC: -9시간
  const kstMs = Date.UTC(y, m - 1, d, hh, mi, 0);
  const utcMs = kstMs - 9 * 60 * 60 * 1000;
  return formatDateTimeUtc(new Date(utcMs));
}

/**
 * RFC 5545 Line Folding.
 * 라인이 75 octets(대략 bytes)를 넘으면 다음 줄을 `\r\n ` (공백 시작)으로
 * 연결해야 합니다. 여기선 문자 단위로 근사합니다(ASCII/한글 혼재 시
 * 약간 보수적으로 60자마다 fold).
 */
function foldLine(line: string): string {
  // UTF-8 byte 기준으로 75 octets 제한 (한글 1글자 = 3 bytes)
  const maxBytes = 73; // 안전 마진
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length;
    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      pieces.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) pieces.push(current);

  return pieces.join("\r\n ");
}

/**
 * VEVENT 1건을 문자열로 생성합니다.
 * @param input VEVENT 입력 데이터
 * @param dtstamp 이벤트 생성 시각 (UTC, YYYYMMDDTHHMMSSZ) — 보통 전체 파일에서 동일 값 사용
 */
export function buildVEvent(input: VEventInput, dtstamp: string): string {
  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${input.uid}`);
  lines.push(`DTSTAMP:${dtstamp}`);

  if (input.time) {
    // 시간 지정 이벤트 (KST → UTC)
    const dtstart = formatKstAsUtc(input.date, input.time);
    if (dtstart) {
      lines.push(`DTSTART:${dtstart}`);
      // DTEND를 1시간 후로 설정 (기일 소요시간 불명확 — 1시간 placeholder)
      const [y, m, d] = input.date.split("-").map((s) => parseInt(s, 10));
      const [hh, mi] = input.time.split(":").map((s) => parseInt(s, 10));
      const endMs = Date.UTC(y, m - 1, d, hh, mi, 0) - 9 * 60 * 60 * 1000 + 60 * 60 * 1000;
      lines.push(`DTEND:${formatDateTimeUtc(new Date(endMs))}`);
    } else {
      // 시간 파싱 실패 → 종일 이벤트로 폴백
      lines.push(`DTSTART;VALUE=DATE:${formatDateCompact(input.date)}`);
      lines.push(`DTEND;VALUE=DATE:${addDaysCompact(input.date, 1)}`);
    }
  } else {
    // 종일 이벤트
    lines.push(`DTSTART;VALUE=DATE:${formatDateCompact(input.date)}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysCompact(input.date, 1)}`);
  }

  lines.push(`SUMMARY:${icalEscapeText(input.summary)}`);
  if (input.description) {
    lines.push(`DESCRIPTION:${icalEscapeText(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${icalEscapeText(input.location)}`);
  }
  lines.push("END:VEVENT");

  return lines.map(foldLine).join("\r\n");
}

/**
 * VCALENDAR 문서 전체를 생성합니다.
 */
export function buildVCalendar(events: VEventInput[]): string {
  const dtstamp = formatDateTimeUtc(new Date());

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LAW-CADDY//Court Schedule//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:법원 기일 - LAW-CADDY",
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  const body = events.map((e) => buildVEvent(e, dtstamp));

  const footer = ["END:VCALENDAR"];

  return [...header.map(foldLine), ...body, ...footer].join("\r\n") + "\r\n";
}

/**
 * CourtEvent.content 에서 시간(HH:MM 또는 HH시 MM분) 패턴을 추출합니다.
 * 반환: "HH:MM" 또는 undefined
 */
export function extractTimeFromContent(content: string): string | undefined {
  // 1) "HH:MM" 형식 (14:30)
  const colonMatch = content.match(/(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }
  }

  // 2) "HH시 MM분" 또는 "HH시" 형식
  const korMatch = content.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (korMatch) {
    const h = parseInt(korMatch[1], 10);
    const m = korMatch[2] ? parseInt(korMatch[2], 10) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }
  }

  return undefined;
}

/**
 * CourtEvent.type이 캘린더에 표시할 "기일" 이벤트인지 판단합니다.
 * 기준: "기일" | "변론" | "심리" | "선고" 중 하나라도 포함.
 */
export function isHearingType(type: string): boolean {
  const keywords = ["기일", "변론", "심리", "선고"];
  return keywords.some((k) => type.includes(k));
}
