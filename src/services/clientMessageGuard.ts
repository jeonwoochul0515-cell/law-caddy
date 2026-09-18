// 의뢰인에게 나가는 문자 본문 검사기 — AI 언급·지어낸 숫자·승패/금액/기한 단정 표현을 찾아 경고한다
//
// 근거. 전역 규칙 §21(확정 판단 금지)·§23(AI 이용 사실을 먼저 알리지 않는다).
// 문자열 검사라 완벽하지 않다. 걸리면 변호사가 본문을 고치도록 화면에서 막고, 안 걸려도 최종 확인은 변호사 몫.

export type MessageWarningKind = "ai_mention" | "definitive" | "fabricated_number";

export interface MessageWarning {
  kind: MessageWarningKind;
  /** 걸린 표현 */
  matched: string;
  /** 화면에 보여 줄 설명 */
  reason: string;
}

/** AI·에이전트 언급 — 의뢰인에게 먼저 알리면 변협 광고규정 위반 소지 */
const AI_PATTERNS: RegExp[] = [
  /\bAI\b/i,
  /인공\s*지능/,
  /에이전트/,
  /챗봇/,
  /자동\s*(생성|분석|작성)/,
];

/** 승패·결과·금액·기한을 못 박는 표현 */
const DEFINITIVE_PATTERNS: RegExp[] = [
  /이깁니다|이길\s*수\s*있습니다|승소(합니다|하십니다|할\s*것)/,
  /(반드시|틀림없이|확실히|분명히)\s*(받|이기|승소|인정|무죄|기각)/,
  /확실합니다|확실히\s*됩니다|보장(합니다|드립니다)/,
  /무효입니다|유효합니다|불법입니다|위법입니다|해당합니다\./,
  /받으실\s*수\s*있습니다|받게\s*됩니다|나옵니다|나올\s*것입니다/,
  /\d[\d,]*\s*(만\s*)?원(을|이)\s*(받|지급받|돌려받)/,
  /\d+\s*(일|월|년)\s*(까지|안에|이내에?)\s*(하셔야|해야|하지\s*않으면|반드시)/,
];

/** 근거 없이 들어갈 만한 작업량 숫자 — "판례 12건 분석" 류 */
const FABRICATED_NUMBER_PATTERNS: RegExp[] = [
  /판례\s*\d+\s*건/,
  /법조문\s*\d+\s*개/,
  /법령\s*\d+\s*(개|건)/,
  /체크포인트\s*\d+\s*개/,
  /쟁점\s*\d+\s*(개|가지)\s*(분석|검토|확인)/,
];

/** 본문을 검사해 경고 목록을 돌려준다. 비어 있으면 통과 */
export function checkClientMessage(content: string): MessageWarning[] {
  const warnings: MessageWarning[] = [];
  const text = content ?? "";

  for (const re of AI_PATTERNS) {
    const m = text.match(re);
    if (m) {
      warnings.push({
        kind: "ai_mention",
        matched: m[0],
        reason: "AI·자동 처리 언급은 의뢰인 문자에 넣지 않습니다 (변호사 광고 규정). 해당 문장을 지우거나 바꿔 주세요.",
      });
    }
  }
  for (const re of DEFINITIVE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      warnings.push({
        kind: "definitive",
        matched: m[0],
        reason: "승패·금액·기한을 단정하는 표현입니다. \"~할 수 있습니다\", \"~로 볼 여지가 있습니다\"처럼 바꿔 주세요.",
      });
    }
  }
  for (const re of FABRICATED_NUMBER_PATTERNS) {
    const m = text.match(re);
    if (m) {
      warnings.push({
        kind: "fabricated_number",
        matched: m[0],
        reason: "실제로 센 숫자가 아닐 수 있습니다. 확인되지 않은 건수는 지워 주세요.",
      });
    }
  }
  return warnings;
}

/** 경고 중 발송을 막아야 하는 것(AI 언급)이 있는지 */
export function hasBlockingWarning(warnings: MessageWarning[]): boolean {
  return warnings.some((w) => w.kind === "ai_mention");
}

/** 문자 본문 상한 (서버 functions/api/notify/client.ts의 MAX_TEXT_LENGTH와 같은 값) */
export const SMS_MAX_LENGTH = 900;

export interface SignatureInput {
  firmName?: string;
  lawyerName?: string;
  /** 사무실 전화 또는 변호사 휴대폰 (하이픈 있어도 됨) */
  phone?: string;
}

/** 문자 끝에 붙일 서명 한 줄. 발신번호가 플랫폼 공용이라 본문에 연락처를 넣어 답장·전화가 변호사에게 가게 한다 */
export function buildSignature(input: SignatureInput): string {
  const firm = (input.firmName ?? "").trim();
  const name = (input.lawyerName ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const who = [firm, name ? `${name} 변호사` : ""].filter(Boolean).join(" ");
  if (!who && !phone) return "";
  return phone ? `${who ? `${who} · ` : ""}${phone}` : who;
}

/** 본문에 서명(연락처)이 이미 들어 있지 않으면 끝에 붙인다 */
export function appendSignature(content: string, input: SignatureInput): string {
  const sig = buildSignature(input);
  if (!sig) return content;
  const phoneDigits = (input.phone ?? "").replace(/\D/g, "");
  const bodyDigits = content.replace(/\D/g, "");
  if (phoneDigits && bodyDigits.includes(phoneDigits)) return content;
  if (content.includes(sig)) return content;
  return `${content.trimEnd()}\n\n${sig}`;
}
