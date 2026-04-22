// Firestore REST API 클라이언트 (Cloudflare Workers 환경)
//
// Firebase Admin SDK는 Node.js 전용이므로, Firestore REST API와
// 서비스 계정 JWT를 직접 생성하여 호출합니다.
//
// 사용 용도:
// - 토큰 기반 공개 엔드포인트(/api/ical/*)에서 Firestore 읽기/쓰기
// - 미들웨어에서 검증된 사용자 요청이 아닌 경우(캘린더 클라이언트 등)
//
// 필요 환경변수:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY  (PEM 형식, \n 이스케이프된 한 줄)

import type { Env } from "./types";

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

/** 서비스 계정 액세스 토큰 캐시 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Firestore value 원시 표현 (REST API 스펙) */
export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

/** Firestore 문서 (REST API 응답) */
export interface FirestoreDocument {
  name: string; // projects/{projectId}/databases/(default)/documents/...
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

/** runQuery 응답 항목 */
interface RunQueryResult {
  document?: FirestoreDocument;
  readTime?: string;
}

/**
 * Base64URL 인코딩 (패딩 제거).
 */
function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * PEM 형식 개인키를 CryptoKey로 import합니다.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");

  const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * 서비스 계정 JWT를 생성하고 Google OAuth2 access_token을 발급받습니다.
 */
async function getFirestoreAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // 캐시된 토큰이 아직 유효하면 재사용 (만료 60초 전에 갱신)
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "Firebase 서비스 계정 환경변수가 설정되지 않았습니다. (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)",
    );
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: FIRESTORE_SCOPE,
    aud: OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const unsigned = `${headerB64}.${claimB64}`;

  const privateKey = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  const assertion = `${unsigned}.${signatureB64}`;

  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google OAuth2 토큰 발급 실패: HTTP ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return data.access_token;
}

/**
 * Firestore 문서 경로를 REST API URL로 변환합니다.
 */
function documentPath(projectId: string, path: string): string {
  return `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${path}`;
}

/**
 * 특정 문서를 조회합니다. 존재하지 않으면 null을 반환합니다.
 */
export async function firestoreGetDocument(
  env: Env,
  path: string,
): Promise<FirestoreDocument | null> {
  const accessToken = await getFirestoreAccessToken(env);

  const resp = await fetch(documentPath(env.FIREBASE_PROJECT_ID, path), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.status === 404) return null;

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore 문서 조회 실패: HTTP ${resp.status} ${text}`);
  }

  return (await resp.json()) as FirestoreDocument;
}

/**
 * 특정 문서를 부분 업데이트(patch)합니다. 필드 마스크로 지정한 필드만 병합됩니다.
 */
export async function firestorePatchDocument(
  env: Env,
  path: string,
  fields: Record<string, FirestoreValue>,
): Promise<void> {
  const accessToken = await getFirestoreAccessToken(env);

  const updateMask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");

  const url = `${documentPath(env.FIREBASE_PROJECT_ID, path)}?${updateMask}`;

  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore 문서 업데이트 실패: HTTP ${resp.status} ${text}`);
  }
}

/** runQuery 요청 바디 (단순 필드 등호 검색에 한정) */
interface RunQueryRequest {
  structuredQuery: {
    from: { collectionId: string }[];
    where?: {
      fieldFilter: {
        field: { fieldPath: string };
        op: "EQUAL";
        value: FirestoreValue;
      };
    };
    limit?: number;
  };
}

/**
 * 컬렉션에서 특정 필드 값이 일치하는 문서를 검색합니다.
 * (단일 equality 필터만 지원 — 복잡한 쿼리는 별도 구현 필요)
 */
export async function firestoreQueryByField(
  env: Env,
  collection: string,
  field: string,
  value: FirestoreValue,
  limit = 1,
): Promise<FirestoreDocument[]> {
  const accessToken = await getFirestoreAccessToken(env);

  const url = `${FIRESTORE_BASE}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

  const requestBody: RunQueryRequest = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value,
        },
      },
      limit,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore 쿼리 실패: HTTP ${resp.status} ${text}`);
  }

  const results = (await resp.json()) as RunQueryResult[];
  return results
    .map((r) => r.document)
    .filter((d): d is FirestoreDocument => !!d);
}

/**
 * 컬렉션에서 특정 필드 값이 일치하는 문서들을 runQuery로 조회합니다.
 * 여러 equality 필터를 AND로 결합합니다.
 */
export async function firestoreQueryByFields(
  env: Env,
  collection: string,
  filters: { field: string; value: FirestoreValue }[],
  limit = 100,
): Promise<FirestoreDocument[]> {
  const accessToken = await getFirestoreAccessToken(env);

  const url = `${FIRESTORE_BASE}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

  // 단일 필터면 fieldFilter, 복수 필터면 compositeFilter AND
  const fieldFilters = filters.map((f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: "EQUAL" as const,
      value: f.value,
    },
  }));

  const where =
    fieldFilters.length === 1
      ? fieldFilters[0]
      : { compositeFilter: { op: "AND" as const, filters: fieldFilters } };

  const requestBody = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where,
      limit,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore 쿼리 실패: HTTP ${resp.status} ${text}`);
  }

  const results = (await resp.json()) as RunQueryResult[];
  return results
    .map((r) => r.document)
    .filter((d): d is FirestoreDocument => !!d);
}

/** Firestore 문서 경로에서 문서 ID만 추출합니다. */
export function firestoreDocumentId(doc: FirestoreDocument): string {
  const parts = doc.name.split("/");
  return parts[parts.length - 1];
}

/** FirestoreValue에서 string을 안전하게 추출합니다. */
export function readString(value: FirestoreValue | undefined): string | undefined {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  return undefined;
}

/** FirestoreValue에서 array of map(fields)을 안전하게 추출합니다. */
export function readArray(
  value: FirestoreValue | undefined,
): FirestoreValue[] {
  if (!value || !("arrayValue" in value)) return [];
  return value.arrayValue.values ?? [];
}

/** FirestoreValue가 mapValue이면 그 fields를 반환합니다. */
export function readMap(
  value: FirestoreValue | undefined,
): Record<string, FirestoreValue> {
  if (!value || !("mapValue" in value)) return {};
  return value.mapValue.fields ?? {};
}
