// Cloudflare Pages Functions 미들웨어
// 모든 /api/* 요청에 적용: CORS + Firebase Auth 검증 + 보안 헤더

import type { Env } from "./_shared/types";
import { authenticateRequest } from "./_shared/auth";
import { handleOptions, withSecurityHeaders } from "./_shared/cors";
import { checkRateLimit } from "./_shared/rate-limit";

/** 인증이 필요 없는 경로 */
const PUBLIC_PATHS = [
  "/api/health",
  "/api/verify-business", // 회원가입 시 사업자등록증 검증 (미인증 상태)
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  // 레이트 리밋 확인 (/api/claude, /api/transcribe — 60req/min per IP)
  const rateLimitResponse = checkRateLimit(request);
  if (rateLimitResponse) {
    return withSecurityHeaders(rateLimitResponse, request);
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 공개 경로는 인증 건너뛰기
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!isPublic) {
    const authResult = await authenticateRequest(request, context.env);

    // Response가 반환되면 인증 실패
    if (authResult instanceof Response) {
      return withSecurityHeaders(authResult, request);
    }

    // 인증 성공 — uid를 다음 핸들러에 전달
    // context.data에 저장하여 하위 핸들러에서 접근 가능
    (context.data as Record<string, unknown>).uid = authResult.uid;
    (context.data as Record<string, unknown>).email = authResult.email;
  }

  // 다음 핸들러 실행
  const response = await context.next();

  // 보안 헤더 추가
  return withSecurityHeaders(response, request);
};
