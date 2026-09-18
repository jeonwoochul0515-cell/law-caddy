// 배포 후 헬스체크 — 설정 유무만 공개로 알려주고, 실제 외부 호출(?test=)은 내부 토큰·관리자만
//
// GET /api/health                → 서비스 상태·키 설정 여부 (공개, 비용 없음)
// GET /api/health?test=claude    → Anthropic 실호출 (유료) — X-Internal-Token 또는 관리자 로그인 필요
// GET /api/health?test=datagokr  → 공공데이터포털 실호출 — 위와 같음
//
// 예전에는 ?test=claude가 공개였다. 누구나 우리 키로 Anthropic을 부를 수 있었고,
// 응답에 키 앞 15자(keyPrefix)까지 실렸다. (2026-09-11)

import type { Env } from "./_shared/types";
import { authenticateRequest } from "./_shared/auth";
import { firestoreGetDocument, readString } from "./_shared/firestore";

/** Firebase 로그인 토큰이 있고 users/{uid}.role이 admin인지 */
async function isAdminCaller(request: Request, env: Env): Promise<boolean> {
  const auth = await authenticateRequest(request, env);
  if (auth instanceof Response) return false;
  try {
    const doc = await firestoreGetDocument(env, `users/${auth.uid}`);
    return readString(doc?.fields?.role) === "admin";
  } catch (err) {
    console.warn("[health] 관리자 확인 실패:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  const dataGoKrKey = context.env.DATA_GO_KR_API_KEY;

  const results: Record<string, unknown> = {
    status: "ok",
    service: "law-caddy-cf-functions",
    timestamp: new Date().toISOString(),
    rtzrConfigured: Boolean(
      context.env.RTZR_CLIENT_ID && context.env.RTZR_CLIENT_SECRET,
    ),
    claudeConfigured: Boolean(apiKey),
    dataGoKrConfigured: Boolean(dataGoKrKey),
    firebaseServiceAccountConfigured: Boolean(
      context.env.FIREBASE_CLIENT_EMAIL && context.env.FIREBASE_PRIVATE_KEY,
    ),
  };

  const url = new URL(context.request.url);
  const test = url.searchParams.get("test");

  if (!test) {
    return Response.json(results);
  }

  // 진단 분기 — 실제 외부 호출이 나가므로 내부 토큰 또는 관리자만
  const internalToken = (context.data as Record<string, unknown>).internalToken === true;
  if (!internalToken && !(await isAdminCaller(context.request, context.env))) {
    return Response.json(
      { error: "진단 호출은 내부 토큰 또는 관리자만 쓸 수 있습니다.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // Anthropic API 테스트 (?test=claude)
  if (test === "claude" && apiKey) {
    try {
      const testReq = new Request("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 5,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      const resp = await fetch(testReq);

      if (resp.ok) {
        results.anthropicTest = "OK";
      } else {
        const body = await resp.text();
        results.anthropicTest = `ERROR ${resp.status}`;
        results.anthropicError = body.slice(0, 500);
      }
    } catch (err) {
      results.anthropicTest = "CONNECTION_ERROR";
      results.anthropicError = err instanceof Error ? err.message : String(err);
    }
  }

  // data.go.kr 헌재 API 테스트 (?test=datagokr)
  if (test === "datagokr" && dataGoKrKey) {
    try {
      const apiUrl = new URL("https://apis.data.go.kr/9710000/BmsPrecService/getList");
      apiUrl.searchParams.set("serviceKey", dataGoKrKey);
      apiUrl.searchParams.set("searchText", "위헌");
      apiUrl.searchParams.set("numOfRows", "2");
      apiUrl.searchParams.set("resultType", "json");

      const resp = await fetch(apiUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const body = await resp.text();
        results.dataGoKrTest = `OK ${resp.status}`;
        results.dataGoKrResponse = body.slice(0, 500);
      } else {
        const body = await resp.text();
        results.dataGoKrTest = `ERROR ${resp.status}`;
        results.dataGoKrError = body.slice(0, 500);
      }
    } catch (err) {
      results.dataGoKrTest = "CONNECTION_ERROR";
      results.dataGoKrError = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json(results);
};
