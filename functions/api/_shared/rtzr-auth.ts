// RTZR JWT 토큰 관리 (모듈 레벨 캐시)

const RTZR_API_BASE = "https://openapi.vito.ai";
const REFRESH_MARGIN_SECONDS = 300; // 5분 전 갱신

let cachedToken: string | null = null;
let tokenExpireAt = 0;

/**
 * RTZR JWT 액세스 토큰을 가져옵니다.
 * 만료 5분 전 자동 갱신, isolate 내 캐시 유지
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && tokenExpireAt - now > REFRESH_MARGIN_SECONDS) {
    return cachedToken;
  }

  const response = await fetch(`${RTZR_API_BASE}/v1/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RTZR 인증 실패 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expire_at: number;
  };
  cachedToken = data.access_token;
  tokenExpireAt = data.expire_at;

  return cachedToken;
}

export { RTZR_API_BASE };
