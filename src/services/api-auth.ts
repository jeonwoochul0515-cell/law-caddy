// API 요청에 Firebase Auth 토큰을 첨부하는 유틸리티

import { getAuth } from "firebase/auth";

/**
 * 현재 로그인한 사용자의 Firebase ID 토큰을 가져옵니다.
 * 토큰이 만료되었으면 자동으로 갱신합니다.
 */
export async function getAuthToken(): Promise<string | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;

  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Authorization 헤더를 포함한 headers 객체를 반환합니다.
 */
export async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { ...extra };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}
