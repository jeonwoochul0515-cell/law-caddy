import * as Sentry from "@sentry/react";

/** 민감한 필드명 패턴 */
const SENSITIVE_KEYS = /client|의뢰인|name/i;

/** 객체에서 민감한 필드를 "[Redacted]"로 치환합니다. */
function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.test(key)) {
      result[key] = "[Redacted]";
    } else {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Sentry를 초기화합니다.
 * VITE_SENTRY_DSN 환경변수가 설정되어 있지 않으면 아무 작업도 하지 않습니다.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn || typeof dsn !== "string") {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.DEV ? "development" : "production",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // breadcrumbs에서 민감한 데이터 제거
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data && typeof breadcrumb.data === "object") {
            breadcrumb.data = scrubObject(
              breadcrumb.data as Record<string, unknown>,
            );
          }
          return breadcrumb;
        });
      }

      // extra에서 민감한 데이터 제거
      if (event.extra && typeof event.extra === "object") {
        event.extra = scrubObject(event.extra as Record<string, unknown>);
      }

      return event;
    },
  });
}
