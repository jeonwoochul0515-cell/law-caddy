// 사건기록 텍스트의 개인정보 마스킹 유틸 (변호사법 §26 비밀유지 가드레일)
//
// 마스킹 대상: 주민등록번호, 휴대전화, 일반전화, 이메일, 계좌번호 추정 패턴.
// 상세주소는 정규식 오탐으로 법률 문장이 훼손될 위험이 커서 대상에서 제외한다
// (문서 원문 인용 정확성이 분석 품질에 직결되므로 보수적으로 접근).

export interface MaskResult {
  masked: string;
  /** 패턴별 마스킹 건수 */
  counts: Record<string, number>;
  /** 총 마스킹 건수 */
  total: number;
}

/** 주민등록번호: 6자리-7자리 (뒷자리 첫 숫자 1~8) */
const RRN = /\b(\d{6})[-‐–]([1-8])\d{6}\b/g;

/** 휴대전화: 010/011/016~019 + 3~4자리 + 4자리 */
const MOBILE = /\b(01[016789])[-‐–.\s]?(\d{3,4})[-‐–.\s]?(\d{4})\b/g;

/** 일반전화: 지역번호(02, 0XX) + 3~4자리 + 4자리 */
const LANDLINE = /\b(0(?:2|[3-6][1-5]))[-‐–.\s]?(\d{3,4})[-‐–.\s]?(\d{4})\b/g;

/** 이메일 */
const EMAIL = /\b[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g;

/** 계좌번호 추정: 하이픈 2개 이상으로 구분된 총 10자리 이상 숫자 (사건번호 형식과 충돌 없음) */
const ACCOUNT = /\b\d{2,6}[-‐–]\d{2,6}[-‐–]\d{2,8}(?:[-‐–]\d{1,6})?\b/g;

/**
 * 텍스트에서 개인정보 패턴을 마스킹합니다.
 * 원문 구조(길이 감각·문맥)를 최대한 유지하도록 부분 마스킹을 사용합니다.
 */
export function maskPII(text: string): MaskResult {
  const counts: Record<string, number> = {
    주민등록번호: 0,
    휴대전화: 0,
    일반전화: 0,
    이메일: 0,
    계좌번호: 0,
  };

  let masked = text.replace(RRN, (_m, front: string, genderDigit: string) => {
    counts["주민등록번호"] += 1;
    return `${front}-${genderDigit}******`;
  });

  masked = masked.replace(MOBILE, (_m, prefix: string, _mid: string, last: string) => {
    counts["휴대전화"] += 1;
    return `${prefix}-****-${last}`;
  });

  masked = masked.replace(LANDLINE, (_m, area: string, _mid: string, last: string) => {
    counts["일반전화"] += 1;
    return `${area}-****-${last}`;
  });

  masked = masked.replace(EMAIL, (m: string) => {
    counts["이메일"] += 1;
    const at = m.indexOf("@");
    const local = m.slice(0, at);
    const domain = m.slice(at);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***${domain}`;
  });

  // 계좌번호는 주민번호·전화 마스킹 이후 적용 (겹침 방지)
  masked = masked.replace(ACCOUNT, (m: string) => {
    // 이미 마스킹된 문자열(별표 포함)은 건너뜀
    if (m.includes("*")) return m;
    counts["계좌번호"] += 1;
    const parts = m.split(/[-‐–]/);
    return parts.map((p, i) => (i === 0 ? p : "*".repeat(p.length))).join("-");
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { masked, counts, total };
}
