// 개인정보 마스킹 — 전사문·사건기록이 외부 AI로 나가기 전에 한 번 거른다
//
// 변호사법 제26조 비밀유지의무가 걸린 자료다. 프롬프트에 "응답에 개인정보를
// 그대로 쓰지 말라"고 적어 두었지만 그건 출력 규칙일 뿐, 입력은 원문 그대로
// 나가고 있었다(r2-05-16).
//
// (2026-09-19) 같은 일을 하는 파일이 둘이었다. services/pii-mask.ts는 주민번호·
// 카드·여권·은행명 문맥 계좌를, utils/piiMask.ts는 전화·이메일·하이픈 계좌를
// 맡았고 서로 상대가 잡는 것을 놓쳤다. 하나로 합쳤다.
//
// 합치면서 고친 것. utils/piiMask.ts의 계좌 정규식 `\d{2,6}-\d{2,6}-\d{2,8}`이
// 자릿수 하한이 없어 **날짜를 계좌번호로 오인했다**. "계약일 2026-09-19"가
// "계약일 2026-**-**"로 뭉개져 AI에 갔다. 법률 문서에서 기일·계약일이 사라지면
// 분석이 통째로 틀어진다. 숫자 합계 10자리 이상만 계좌로 본다.
//
// 설계 원칙. 법률 문서에 필요한 값(금액·날짜·사건번호·조문)은 건드리지 않는다.
// 놓치는 것보다 멀쩡한 원문을 훼손하는 쪽이 더 위험하다.

/** 주민등록번호·외국인등록번호: 6자리 + 7자리 (하이픈 있어도 없어도) */
const RRN = /(?<!\d)(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))[-‐–]?([1-8]\d{6})(?!\d)/g;

/** 휴대전화: 010/011/016~019 + 3~4자리 + 4자리 */
const MOBILE = /(?<!\d)(01[016789])[-‐–.\s]?(\d{3,4})[-‐–.\s]?(\d{4})(?!\d)/g;

/** 일반전화: 지역번호(02, 0XX) + 3~4자리 + 4자리 */
const LANDLINE = /(?<!\d)(0(?:2|[3-6][1-5]))[-‐–.\s]?(\d{3,4})[-‐–.\s]?(\d{4})(?!\d)/g;

/** 이메일 */
const EMAIL = /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;

/** 카드번호: 4-4-4-4 */
const CARD = /(?<!\d)(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})(?!\d)/g;

/** 계좌번호 ①: 은행명·"계좌" 근처의 10~14자리 숫자 */
const ACCOUNT_CONTEXT =
  /(계좌|계좌번호|입금|송금|은행|농협|국민|신한|우리|하나|기업|카카오뱅크|토스뱅크|케이뱅크|새마을|수협|우체국)([^\d\n]{0,12})((?:\d[-\s]?){10,14}\d)/g;

/** 계좌번호 ②: 하이픈으로 나뉜 숫자 묶음. 숫자 합계가 10자리 이상일 때만 계좌로 본다(날짜 배제) */
const ACCOUNT_HYPHEN = /(?<![\d-])\d{2,6}[-‐–]\d{2,6}[-‐–]\d{2,8}(?:[-‐–]\d{1,6})?(?![\d-])/g;

/** 계좌로 인정하는 최소 숫자 자릿수. 8자리인 ISO 날짜(2026-09-19)를 걸러낸다. */
const ACCOUNT_MIN_DIGITS = 10;

/** 여권번호: 영문 1~2자 + 숫자 7~8자 */
const PASSPORT = /(?<![A-Za-z\d])([A-Z]{1,2}\d{7,8})(?![A-Za-z\d])/g;

/** 마스킹 항목 이름 — counts의 키 */
export type PiiKind =
  | "주민등록번호"
  | "휴대전화"
  | "일반전화"
  | "이메일"
  | "계좌번호"
  | "카드번호"
  | "여권번호";

export interface MaskResult {
  /** 가린 뒤의 텍스트 */
  masked: string;
  /** 항목별 건수 */
  counts: Record<PiiKind, number>;
  /** 총 건수 */
  total: number;
}

function emptyCounts(): Record<PiiKind, number> {
  return {
    주민등록번호: 0,
    휴대전화: 0,
    일반전화: 0,
    이메일: 0,
    계좌번호: 0,
    카드번호: 0,
    여권번호: 0,
  };
}

/**
 * 텍스트에서 개인정보를 가린다. 원문은 바꾸지 않고 새 문자열을 돌려준다.
 *
 * 적용 순서가 중요하다. 자릿수가 길고 형식이 뚜렷한 것부터 처리해야
 * 뒤 패턴이 이미 가려진 자리를 다시 건드리지 않는다.
 */
export function maskPII(input: string | undefined | null): MaskResult {
  const counts = emptyCounts();
  if (!input) return { masked: input ?? "", counts, total: 0 };

  let masked = input;

  masked = masked.replace(RRN, (_m, front: string) => {
    counts.주민등록번호 += 1;
    return `${front}-*******`;
  });

  masked = masked.replace(CARD, (_m, a: string) => {
    counts.카드번호 += 1;
    return `${a}-****-****-****`;
  });

  masked = masked.replace(MOBILE, (_m, prefix: string, _mid: string, last: string) => {
    counts.휴대전화 += 1;
    return `${prefix}-****-${last}`;
  });

  masked = masked.replace(LANDLINE, (_m, area: string, _mid: string, last: string) => {
    counts.일반전화 += 1;
    return `${area}-****-${last}`;
  });

  masked = masked.replace(EMAIL, (m: string) => {
    counts.이메일 += 1;
    const at = m.indexOf("@");
    const local = m.slice(0, at);
    return `${local.slice(0, Math.min(2, local.length))}***${m.slice(at)}`;
  });

  masked = masked.replace(ACCOUNT_CONTEXT, (_m, label: string, between: string, number: string) => {
    counts.계좌번호 += 1;
    const digits = number.replace(/\D/g, "");
    return `${label}${between}${digits.slice(0, 3)}${"*".repeat(Math.max(digits.length - 3, 4))}`;
  });

  masked = masked.replace(ACCOUNT_HYPHEN, (m: string) => {
    if (m.includes("*")) return m; // 이미 가려진 자리
    if (m.replace(/\D/g, "").length < ACCOUNT_MIN_DIGITS) return m; // 날짜·짧은 번호
    counts.계좌번호 += 1;
    const parts = m.split(/[-‐–]/);
    return parts.map((p, i) => (i === 0 ? p : "*".repeat(p.length))).join("-");
  });

  masked = masked.replace(PASSPORT, (m: string) => {
    counts.여권번호 += 1;
    return `${m.slice(0, 2)}${"*".repeat(m.length - 2)}`;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { masked, counts, total };
}

/**
 * AI로 나가는 컴텍스트에서 사용자 자료 필드만 가린다.
 *
 * 의뢰인 이름(clientName)·변호사 프로필은 건드리지 않는다. 서면에 실제로
 * 들어가는 값이라 가리면 문서가 망가진다. 가리는 것은 상담자가 말했거나
 * 문서에 적혀 들어온 제3자·식별 정보다.
 */
export function maskAgentContext<
  T extends {
    caseDesc?: string;
    transcript?: string;
    previousTranscripts?: string;
    fileContents?: string;
  },
>(ctx: T): { context: T; total: number } {
  let total = 0;
  const next = { ...ctx };
  for (const field of ["caseDesc", "transcript", "previousTranscripts", "fileContents"] as const) {
    const value = ctx[field];
    if (typeof value !== "string" || !value) continue;
    const r = maskPII(value);
    total += r.total;
    (next as Record<string, unknown>)[field] = r.masked;
  }
  return { context: next, total };
}

/** 여러 텍스트를 한 번에 가리고 합계를 돌려준다. */
export function maskMany(...inputs: Array<string | undefined>): {
  texts: string[];
  total: number;
} {
  let total = 0;
  const texts = inputs.map((t) => {
    const r = maskPII(t);
    total += r.total;
    return r.masked;
  });
  return { texts, total };
}
