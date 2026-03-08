// API 호출 재시도 유틸리티 (지수 백오프)

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
