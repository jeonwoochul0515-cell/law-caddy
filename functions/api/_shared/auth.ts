// Firebase ID 토큰 검증 (Cloudflare Workers 환경)
// Firebase Admin SDK는 Node.js 전용이므로 Google JWK 공개키로 직접 검증

import type { Env } from "./types";

/** Google JWK 공개키 캐시 */
let cachedKeys: Record<string, CryptoKey> = {};
let cachedKeysExpiry = 0;

/** Firebase ID 토큰 페이로드 */
interface FirebaseTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  auth_time: number;
  user_id: string;
  email?: string;
}

/** JWK 형식 키 */
interface JwkKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

/**
 * Google 공개키를 JWK 형식으로 가져옵니다 (캐시 적용).
 */
async function getGooglePublicKeys(): Promise<Record<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeysExpiry > now && Object.keys(cachedKeys).length > 0) {
    return cachedKeys;
  }

  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );

  if (!response.ok) {
    throw new Error(`Google 공개키 조회 실패: HTTP ${response.status}`);
  }

  // Cache-Control 헤더에서 max-age 추출
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
  cachedKeysExpiry = now + maxAge * 1000;

  const jwks = (await response.json()) as { keys: JwkKey[] };
  const keys: Record<string, CryptoKey> = {};

  for (const jwk of jwks.keys) {
    keys[jwk.kid] = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }

  cachedKeys = keys;
  return keys;
}

/**
 * Base64URL 디코딩
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Firebase ID 토큰을 검증하고 페이로드를 반환합니다.
 */
export async function verifyFirebaseToken(
  token: string,
  env: Env,
): Promise<FirebaseTokenPayload> {
  const projectId = env.FIREBASE_PROJECT_ID || "law-caddy";

  // JWT 파트 분리
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("잘못된 토큰 형식");
  }

  // 헤더 파싱
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as {
    alg: string;
    kid: string;
  };

  if (header.alg !== "RS256") {
    throw new Error(`지원하지 않는 알고리즘: ${header.alg}`);
  }

  // 페이로드 파싱
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as FirebaseTokenPayload;

  // 기본 클레임 검증
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp <= now) {
    throw new Error("토큰 만료됨");
  }

  if (payload.iat > now + 60) {
    throw new Error("토큰이 아직 유효하지 않음");
  }

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("잘못된 issuer");
  }

  if (payload.aud !== projectId) {
    throw new Error("잘못된 audience");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("잘못된 subject");
  }

  // 서명 검증
  const keys = await getGooglePublicKeys();
  let publicKey = keys[header.kid];

  if (!publicKey) {
    // 키가 없으면 캐시 무효화 후 재시도
    cachedKeysExpiry = 0;
    const freshKeys = await getGooglePublicKeys();
    publicKey = freshKeys[header.kid];
    if (!publicKey) {
      throw new Error("서명 검증 키를 찾을 수 없음");
    }
  }

  // 서명 검증
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    data,
  );

  if (!valid) {
    throw new Error("토큰 서명 검증 실패");
  }

  return payload;
}

/**
 * 요청에서 Firebase ID 토큰을 추출하고 검증합니다.
 * Authorization: Bearer <token> 헤더에서 토큰을 가져옵니다.
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<{ uid: string; email?: string } | Response> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json(
      { error: "인증이 필요합니다. Authorization 헤더가 없습니다." },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyFirebaseToken(token, env);
    return { uid: payload.sub, email: payload.email };
  } catch (err) {
    return Response.json(
      { error: "인증 실패", detail: err instanceof Error ? err.message : String(err) },
      { status: 401 },
    );
  }
}
