// 영어·코드로 된 오류(Firebase auth/firestore/storage, 네트워크, HTTP)를 사람이 읽을 한국어 한 줄로 바꾸는 유틸
//
// 쓰는 법.
//   import { friendlyError } from "../utils/friendlyError";
//   catch (err) { setMsg(friendlyError(err, "저장하지 못했습니다.")); }
//
// 두 번째 인자는 "무슨 일을 하다 실패했는지"를 적는 기본 문장이다. 원인을 알아낼 수 있으면
// 그 뒤에 원인과 다음 행동을 덧붙이고, 못 알아내면 기본 문장만 돌려준다.
// 원문(영어 메시지)은 절대 화면에 내보내지 않는다 — 필요하면 `rawErrorText`로 따로 꺼내 복사용으로만 쓴다.

/** 오류 객체에서 Firebase 스타일 코드("auth/…", "permission-denied" 등)를 뽑는다 */
function extractCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code.toLowerCase() : "";
}

/** 오류 객체에서 원문 메시지를 뽑는다 (화면 노출용 아님) */
export function rawErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err ?? "");
}

/** 브라우저가 오프라인이거나 메시지가 연결 끊김을 가리키는지 */
function looksOffline(text: string): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /offline|network|failed to fetch|networkerror|load failed|err_internet|connection/i.test(text);
}

/** Firebase 코드 → 한국어. 코드 뒤에 붙는 "auth/" 같은 접두어는 떼고 비교한다 */
const CODE_MAP: Record<string, string> = {
  // Firestore / 공통
  "permission-denied": "이 자료를 볼 권한이 없습니다. 다시 로그인하거나 관리자에게 문의해 주세요.",
  unavailable: "서버에 잠시 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  "deadline-exceeded": "응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.",
  "resource-exhausted": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "not-found": "찾는 자료가 없습니다. 이미 삭제되었을 수 있습니다.",
  "already-exists": "같은 자료가 이미 있습니다.",
  unauthenticated: "로그인이 풀렸습니다. 다시 로그인해 주세요.",
  cancelled: "작업이 취소되었습니다.",
  "invalid-argument": "입력값에 문제가 있습니다. 내용을 확인하고 다시 시도해 주세요.",
  "failed-precondition": "지금 상태에서는 처리할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  aborted: "다른 작업과 겹쳐 처리하지 못했습니다. 다시 시도해 주세요.",
  internal: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  // Auth
  "network-request-failed": "인터넷 연결이 끊겼습니다. 연결 후 다시 시도해 주세요.",
  "popup-closed-by-user": "로그인 창이 닫혔습니다. 다시 시도해 주세요.",
  "popup-blocked": "브라우저가 로그인 창을 막았습니다. 팝업을 허용한 뒤 다시 시도해 주세요.",
  "cancelled-popup-request": "로그인 창이 겹쳐 열렸습니다. 하나만 남기고 다시 시도해 주세요.",
  "user-disabled": "이용이 중지된 계정입니다. 관리자에게 문의해 주세요.",
  "user-not-found": "등록되지 않은 계정입니다.",
  "wrong-password": "비밀번호가 맞지 않습니다.",
  "invalid-credential": "로그인 정보가 맞지 않습니다. 다시 로그인해 주세요.",
  "too-many-requests": "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  "requires-recent-login": "보안을 위해 다시 로그인한 뒤 진행해 주세요.",
  "account-exists-with-different-credential": "같은 이메일로 다른 방식의 계정이 있습니다.",
  "unauthorized-domain": "이 주소에서는 로그인할 수 없습니다. law-caddy.com에서 열어 주세요.",
  // Storage
  "object-not-found": "파일이 없습니다. 이미 삭제되었을 수 있습니다.",
  unauthorized: "이 파일에 접근할 권한이 없습니다.",
  canceled: "업로드가 취소되었습니다.",
  "quota-exceeded": "저장 공간 한도를 넘었습니다. 관리자에게 문의해 주세요.",
  "retry-limit-exceeded": "업로드가 계속 실패합니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  "invalid-checksum": "파일이 올라가는 중에 손상되었습니다. 다시 올려 주세요.",
};

/**
 * HTTP 상태 번호가 메시지에 섞여 있을 때의 안내.
 *
 * (2026-09-19) 예전에는 문장 어디에든 있는 세 자리 숫자를 전부 상태 코드로 읽었다.
 * "보증금 500만원 처리 실패"가 "서버에서 문제가 생겼습니다"로 둔갑했고,
 * "301호 법정"·"404호"도 같은 것을 당했다. 법률 업무는 금액·호수가 본문에 흔하다.
 * 이제 상태 코드를 가리키는 말(HTTP·status·응답·오류) 옆에 붙은 숫자만 인정한다.
 */
function fromHttpStatus(text: string): string | null {
  const CODES = String.raw`401|402|403|404|408|413|429|5\d\d`;
  const m =
    // "HTTP 500", "status: 404", "statusCode=429", "응답 503", "오류 코드 500"
    text.match(
      new RegExp(String.raw`(?:HTTP|status(?:Code)?|응답|오류\s*코드)\s*[:=]?\s*(${CODES})(?!\d)`, "i"),
    ) ??
    // "(500)", "[404]" 처럼 괄호로 둘러싸인 상태 코드
    text.match(new RegExp(String.raw`[([](${CODES})[)\]]`));
  if (!m) return null;
  switch (m[1]) {
    case "401":
      return "로그인이 풀렸습니다. 다시 로그인해 주세요.";
    case "402":
      return "현재 요금제 한도를 넘었습니다. 설정 > 요금제에서 확인해 주세요.";
    case "403":
      return "이 작업을 할 권한이 없습니다.";
    case "404":
      return "요청한 자료를 찾을 수 없습니다.";
    case "408":
      return "응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.";
    case "413":
      return "파일이 너무 큽니다. 더 작은 파일로 다시 시도해 주세요.";
    case "429":
      return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
  }
}

/** 이미 한국어로 된 서버·서비스 문구인지 (그대로 써도 되는지) */
function isKoreanSentence(text: string): boolean {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  // 한글이 충분히 있고, 영어가 한글의 절반을 넘지 않으면 사람이 쓴 한국어 문장으로 본다
  return hangul >= 4 && latin <= hangul / 2 && !/\b(error|exception|undefined|null|failed|http)\b/i.test(text);
}

/**
 * 오류를 한국어 안내 문장으로 바꾼다.
 * @param err     잡은 오류
 * @param fallback "무엇을 하다 실패했는지"를 적은 기본 문장. 예: "저장하지 못했습니다."
 */
export function friendlyError(err: unknown, fallback = "처리하지 못했습니다. 다시 시도해 주세요."): string {
  const text = rawErrorText(err);
  const code = extractCode(err);

  // 1) 오프라인이 가장 흔한 원인이라 먼저 본다
  if (looksOffline(text) || code.endsWith("network-request-failed") || code === "unavailable") {
    return `${fallback} 인터넷 연결이 끊긴 것 같습니다. 연결을 확인한 뒤 다시 시도해 주세요.`;
  }

  // 2) Firebase 코드 매핑 ("auth/xxx", "storage/xxx", "firestore/xxx" 접두어 제거)
  const bare = code.replace(/^(auth|storage|firestore|functions)\//, "");
  if (bare && CODE_MAP[bare]) return `${fallback} ${CODE_MAP[bare]}`;

  // 3) 메시지 본문에 Firebase 코드나 관용구가 박혀 있는 경우 ("Firebase: Error (auth/…)", "Missing or insufficient permissions.")
  const inText = text.match(/\((?:auth|storage|firestore)\/([a-z-]+)\)/i)?.[1]?.toLowerCase();
  if (inText && CODE_MAP[inText]) return `${fallback} ${CODE_MAP[inText]}`;
  if (/insufficient permissions|permission/i.test(text)) return `${fallback} ${CODE_MAP["permission-denied"]}`;
  if (/unsupported field value|invalid data/i.test(text)) return `${fallback} ${CODE_MAP["invalid-argument"]}`;

  // 4) 서비스 코드가 이미 한국어로 만들어 준 문장이면 그대로 내보람다.
  //
  // ⚠️ 순서가 중요하다. HTTP 번호 추측보다 먼저 본다. 사람이 써 둔 한국어 안내가
  // 있는데 그걸 버리고 추측 문구를 내보낼 이유가 없다.
  if (text && isKoreanSentence(text)) return text;

  // 5) HTTP 번호
  const http = fromHttpStatus(text);
  if (http) return `${fallback} ${http}`;

  const koreanHead = text.split(/:\s/)[0];
  if (koreanHead && koreanHead !== text && isKoreanSentence(koreanHead)) return `${koreanHead}. 다시 시도해 주세요.`;

  return fallback;
}
