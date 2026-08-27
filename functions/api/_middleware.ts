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
  "/api/signing", // 전자계약 서명 (의뢰인은 로그인하지 않는다 — 토큰으로 서버가 검증)
  "/api/consult", // 랜딩 상담 신청 — 가입 전 리드 수집 (자체 검증·허니팟, 어드민 조회는 토큰)
  "/api/portal", // 의뢰인 포털 (읽기 전용 — 토큰으로 서버가 검증)
];


/** 서비스 간 호출을 허용하는 경로. 법제처 중계 외에는 절대 늘리지 않는다. */
const INTERNAL_PATHS = ["/api/precedent-search"];

/** 길이가 같을 때 내용을 상수 시간으로 비교한다. 토큰을 한 글자씩 떠보는 공격을 막는다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorizedInternalCall(request: Request, path: string, env: Env): boolean {
  if (!INTERNAL_PATHS.includes(path)) return false;
  const expected = env.INTERNAL_API_TOKEN;
  const provided = request.headers.get("X-Internal-Token");
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

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

  // 서비스 간 호출: 법제처 자료 중계만 공유 토큰으로 연다.
  // 법제처는 호출 도메인을 사전 등록해야 응답하므로 다른 프로젝트가 직접 부를 수 없고,
  // 등록이 끝난 이 도메인이 유일한 창구다. 다른 API는 이 통로로 열지 않는다.
  const isInternalCall = isAuthorizedInternalCall(request, path, context.env);

  // 진단 옵션은 내부 호출에서만 열어준다 (핸들러에서 확인)
  (context.data as Record<string, unknown>).internalCall = isInternalCall;

  if (!isPublic && !isInternalCall) {
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
