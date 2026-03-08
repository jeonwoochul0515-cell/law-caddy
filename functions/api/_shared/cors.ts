// CORS + CSP 보안 헤더 유틸리티

/** 허용된 오리진 목록 */
const ALLOWED_ORIGINS = [
  "https://law-caddy.com",
  "https://www.law-caddy.com",
  "https://law-caddy.pages.dev",
];

/** 개발 환경 오리진 패턴 */
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * 요청의 Origin이 허용된 오리진인지 확인합니다.
 */
function isAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;

  // 프로덕션 오리진
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // Cloudflare Pages 프리뷰 배포 (*.law-caddy.pages.dev)
  if (/^https:\/\/[a-z0-9-]+\.law-caddy\.pages\.dev$/.test(origin)) return origin;

  // 개발 환경 (localhost)
  if (DEV_ORIGIN_PATTERN.test(origin)) return origin;

  return null;
}

/**
 * CORS 헤더를 추가합니다.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = isAllowedOrigin(origin);

  const headers: Record<string, string> = {
    "Vary": "Origin",
  };

  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

/**
 * 보안 헤더를 추가합니다 (CSP, X-Frame-Options 등).
 */
export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
      "font-src 'self'",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://api.anthropic.com https://openapi.vito.ai https://*.sentry.io",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  };
}

/**
 * CORS preflight (OPTIONS) 요청을 처리합니다.
 */
export function handleOptions(request: Request): Response {
  const headers = corsHeaders(request);
  return new Response(null, { status: 204, headers });
}

/**
 * Response에 CORS + 보안 헤더를 추가합니다.
 */
export function withSecurityHeaders(response: Response, request: Request): Response {
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders(request))) {
    newHeaders.set(key, value);
  }

  // API 응답에는 CSP 대신 기본 보안 헤더만 적용
  newHeaders.set("X-Content-Type-Options", "nosniff");
  newHeaders.set("X-Frame-Options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
