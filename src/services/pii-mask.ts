// 전사·첨부 텍스트가 외부 AI로 나가기 전에 주민번호·계좌번호·카드번호를 가리는 정규식 마스킹 유틸
//
// 프롬프트의 "응답에 개인정보를 그대로 쓰지 말라"는 지시는 출력 규칙일 뿐이라
// 입력 자체는 그대로 전송되고 있었다(r2-05-16). 여기서 한 번 거른 뒤 보낸다.
// 법률 문서에 필요한 값(금액·날짜·사건번호)은 건드리지 않도록 패턴을 좁게 잡는다.

/** 주민등록번호·외국인등록번호: 6자리-7자리 (뒷자리 첫 숫자 1~8) */
const RRN = /(?<!\d)(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))[-‐–]?([1-8]\d{6})(?!\d)/g;

/** 계좌번호: 은행명·"계좌" 근처에 있는 10~14자리 숫자(하이픈 포함 허용) */
const ACCOUNT_CONTEXT = /(계좌|계좌번호|입금|송금|은행|농협|국민|신한|우리|하나|기업|카카오뱅크|토스뱅크|케이뱅크|새마을|수협|우체국)([^\d\n]{0,12})((?:\d[-\s]?){10,14}\d)/g;

/** 카드번호: 4-4-4-4 */
const CARD = /(?<!\d)(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})(?!\d)/g;

/** 여권번호: 영문 1~2자 + 숫자 7~8자 (문장 안의 사건번호와는 형식이 다르다) */
const PASSPORT = /(?<![A-Za-z\d])([A-Z]{1,2}\d{7,8})(?![A-Za-z\d])/g;

export interface MaskResult {
  text: string;
  /** 가려진 항목 수 (화면 안내용) */
  count: number;
}

/** 텍스트에서 민감정보를 찾아 가린다. 원문은 바꾸지 않고 새 문자열을 돌려준다. */
export function maskSensitiveText(input: string | undefined | null): MaskResult {
  if (!input) return { text: input ?? "", count: 0 };
  let count = 0;
  let text = input;

  text = text.replace(RRN, (_m, front: string) => {
    count += 1;
    return `${front}-*******`;
  });

  text = text.replace(CARD, (_m, a: string) => {
    count += 1;
    return `${a}-****-****-****`;
  });

  text = text.replace(ACCOUNT_CONTEXT, (_m, label: string, between: string, number: string) => {
    count += 1;
    const digits = number.replace(/\D/g, "");
    return `${label}${between}${digits.slice(0, 3)}${"*".repeat(Math.max(digits.length - 3, 4))}`;
  });

  text = text.replace(PASSPORT, (m: string) => {
    count += 1;
    return `${m.slice(0, 2)}${"*".repeat(m.length - 2)}`;
  });

  return { text, count };
}

/** 여러 텍스트를 한 번에 가리고 합계를 돌려준다. */
export function maskMany(...inputs: Array<string | undefined>): { texts: string[]; count: number } {
  let count = 0;
  const texts = inputs.map((t) => {
    const r = maskSensitiveText(t);
    count += r.count;
    return r.text;
  });
  return { texts, count };
}
