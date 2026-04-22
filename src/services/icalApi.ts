// iCal 구독 API 클라이언트
//
// /api/user/ical-token        — 토큰 조회/발급 (없으면 생성)
// /api/user/ical-token/rotate — 토큰 재발급 (기존 토큰 무효화)
//
// 공개 엔드포인트 /api/ical/{token}은 캘린더 앱이 직접 호출하므로
// 프론트에서는 subscribeUrl만 사용자에게 복사용으로 노출.

import { authHeaders } from "./api-auth";

export interface ICalTokenResponse {
  /** 64자 hex 토큰 */
  token: string;
  /** 캘린더 앱에서 붙여넣을 전체 URL (예: https://law-caddy.com/api/ical/xxx) */
  subscribeUrl: string;
}

interface ApiErrorBody {
  error?: string;
  detail?: string;
}

async function parseError(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as ApiErrorBody;
    if (body.error && body.detail) return `${body.error} — ${body.detail}`;
    if (body.error) return body.error;
  } catch {
    // JSON이 아니면 상태 텍스트로 폴백
  }
  return `HTTP ${resp.status}`;
}

/**
 * 현재 사용자의 iCal 구독 토큰을 조회/발급합니다.
 * 서버에 저장된 토큰이 있으면 그대로 반환, 없으면 새로 발급합니다.
 */
export async function getOrCreateIcalToken(): Promise<ICalTokenResponse> {
  const headers = await authHeaders({ "Content-Type": "application/json" });

  const resp = await fetch("/api/user/ical-token", {
    method: "POST",
    headers,
  });

  if (!resp.ok) {
    throw new Error(await parseError(resp));
  }

  return (await resp.json()) as ICalTokenResponse;
}

/**
 * 기존 토큰을 무효화하고 새 토큰을 발급합니다.
 * 주의: 기존 URL로 구독 중인 캘린더는 즉시 끊어집니다.
 */
export async function rotateIcalToken(): Promise<ICalTokenResponse> {
  const headers = await authHeaders({ "Content-Type": "application/json" });

  const resp = await fetch("/api/user/ical-token/rotate", {
    method: "POST",
    headers,
  });

  if (!resp.ok) {
    throw new Error(await parseError(resp));
  }

  return (await resp.json()) as ICalTokenResponse;
}
