// Cloudflare Pages Functions 미들웨어
// 모든 /api/* 요청에 적용: CORS + Firebase Auth 검증 + 레이트 리밋 + 보안 헤더

import type { Env } from "./_shared/types";
import { authenticateRequest, safeEqual } from "./_shared/auth";
import { handleOptions, withSecurityHeaders } from "./_shared/cors";
import { checkRateLimit } from "./_shared/rate-limit";

/**
 * 인증이 필요 없는 경로. 늘리기 전에 "왜 로그인 없이 열어야 하는가"를 옆에 적는다.
 * 여기 없는 경로는 전부 Firebase 로그인 토큰이 있어야 한다.
 */
const PUBLIC_PATHS = [
  "/api/health", // 배포 후 헬스체크. ?test= 진단 호출은 핸들러에서 내부 토큰·관리자로 다시 막는다
  "/api/verify-business", // 회원가입 시 사업자등록증 검증 (미인증 상태)
  "/api/signing", // 전자계약 서명 (의뢰인은 로그인하지 않는다 — 토큰으로 서버가 검증)
  "/api/consult", // 랜딩 상담 신청 — 가입 전 리드 수집 (자체 검증·허니팟, 어드민 조회는 토큰)
  "/api/portal", // 의뢰인 포털 (읽기 전용 — 토큰으로 서버가 검증)
];

/** 서비스 간 호출을 허용하는 경로. 법제처 중계 외에는 절대 늘리지 않는다. */
const INTERNAL_PATHS = ["/api/precedent-search"];

/** 요청에 유효한 내부 토큰(X-Internal-Token)이 실려 있는지 */
function hasInternalToken(request: Request, env: Env): boolean {
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

  const url = new URL(request.url);
  const path = url.pathname;
  const data = context.data as Record<string, unknown>;

  // 공개 경로는 인증 건너뛰기
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  // 서비스 간 호출: 법제처 자료 중계만 공유 토큰으로 연다.
  // 법제처는 호출 도메인을 사전 등록해야 응답하므로 다른 프로젝트가 직접 부를 수 없고,
  // 등록이 끝난 이 도메인이 유일한 창구다. 다른 API는 이 통로로 열지 않는다.
  const internalToken = hasInternalToken(request, context.env);
  const isInternalCall = internalToken && INTERNAL_PATHS.includes(path);

  // 진단 옵션은 내부 호출에서만 열어준다 (핸들러에서 확인)
  data.internalCall = isInternalCall;
  // 내부 토큰 자체의 유무 — /api/health?test= 같은 공개 경로의 진단 분기가 본다
  data.internalToken = internalToken;

  let uid: string | undefined;

  if (!isPublic && !isInternalCall) {
    const authResult = await authenticateRequest(request, context.env);

    // Response가 반환되면 인증 실패
    if (authResult instanceof Response) {
      return withSecurityHeaders(authResult, request);
    }

    // 인증 성공 — uid를 다음 핸들러에 전달
    uid = authResult.uid;
    data.uid = authResult.uid;
    data.email = authResult.email;
  }

  // 레이트 리밋 — 로그인 uid 우선, 없으면(공개 경로) IP 기준. 경로별 분당·일일 한도는 rate-limit.ts.
  const rateLimitResponse = checkRateLimit(request, uid);
  if (rateLimitResponse) {
    return withSecurityHeaders(rateLimitResponse, request);
  }

  // 다음 핸들러 실행
  const response = await context.next();

  // 보안 헤더 추가
  return withSecurityHeaders(response, request);
};
