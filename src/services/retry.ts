// API 호출 재시도 유틸리티 (지수 백오프) + 화면용 오류 타입

/**
 * 서버 응답 오류.
 *
 * message는 화면에 그대로 보여줄 한국어 문장이고, status는 재시도 판단용이다.
 * 예전에는 "Claude API 호출 실패: HTTP 429 Too Many Requests"처럼 영어·상태 코드가
 * 그대로 화면에 찍혔다(r1-04-15). 원문은 detail에 남겨 콘솔에서만 본다.
 */
export class ApiError extends Error {
  status: number;
  /** 서버 원문 (콘솔용) */
  detail?: string;
  /** 요금제 한도(402)처럼 고장이 아닌 안내인지 */
  isQuota: boolean;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.isQuota = status === 402;
  }
}

/**
 * 상태 코드와 서버 응답 본문으로 화면에 보여줄 한국어 문구를 만든다.
 * 서버가 준 한글 message/error를 먼저 쓰고, 없으면 상태 코드별 기본 문구를 쓴다.
 */
export function describeHttpError(
  status: number,
  body: { error?: string; message?: string; detail?: string } | null,
  service: string,
): string {
  const serverMsg = [body?.message, body?.error, body?.detail].find(
    (m) => typeof m === "string" && m.trim() && /[가-힣]/.test(m),
  );
  if (serverMsg) return serverMsg;

  switch (status) {
    case 400: return `${service} 요청 내용이 올바르지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.`;
    case 401: return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    case 402: return "무료 플랜의 이번 달 한도를 모두 사용했습니다. 설정 > 요금제에서 확인해 주세요.";
    case 403: return `${service}를 사용할 권한이 없습니다. 관리자에게 문의해 주세요.`;
    case 404: return `${service}를 찾을 수 없습니다. 화면을 새로고침해 주세요.`;
    case 413: return "파일이 너무 큽니다. 더 작은 파일로 나누어 올려 주세요.";
    case 429: return "요청이 잠시 몰렸습니다. 1분 뒤 다시 시도해 주세요.";
    case 500: case 502: case 503: case 504:
      return `${service} 서버가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.`;
    case 529: return "AI 서버가 혼잡합니다. 잠시 후 자동으로 다시 시도합니다.";
    default: return `${service} 처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.`;
  }
}

export interface RetryOptions {
  maxRetries?: number; // default 3
  baseDelay?: number; // default 1000ms
  maxDelay?: number; // default 10000ms
}

/** 재시도 불가능한 클라이언트 에러 상태 코드 */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404]);

/** HTTP 상태 코드를 포함하는 에러인지 확인 */
function extractStatusCode(error: unknown): number | null {
  if (error instanceof Response) {
    return error.status;
  }
  if (error instanceof ApiError) {
    return error.status;
  }
  if (error instanceof Error) {
    // "HTTP 429", "HTTP 500" 등의 메시지에서 상태 코드 추출
    const match = error.message.match(/HTTP\s+(\d{3})/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/** 재시도 가능한 에러인지 판별 */
function isRetryable(error: unknown): boolean {
  // 네트워크 에러 (fetch 실패 등)
  if (error instanceof TypeError) {
    return true;
  }

  const status = extractStatusCode(error);
  if (status !== null) {
    // 클라이언트 에러는 재시도하지 않음
    if (NON_RETRYABLE_STATUS.has(status)) {
      return false;
    }
    // 429 (Rate Limit) 및 5xx 서버 에러는 재시도
    if (status === 429 || status >= 500) {
      return true;
    }
  }

  return false;
}

/**
 * 지수 백오프를 사용하여 비동기 함수를 재시도합니다.
 *
 * - 지수 백오프: delay = min(baseDelay * 2^attempt, maxDelay)
 * - 네트워크 에러(TypeError) 및 429/500/502/503 상태에서만 재시도
 * - 400/401/403/404 클라이언트 에러는 즉시 실패
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 10000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // 마지막 시도이거나 재시도 불가능한 에러이면 즉시 throw
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      // 지수 백오프 대기
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 이론적으로 도달 불가능하지만 TypeScript 타입 안전을 위해
  throw lastError;
}
