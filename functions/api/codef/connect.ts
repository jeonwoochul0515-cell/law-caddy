// CODEF Connected ID 등록 (계정 연결)
//
// POST /api/codef/connect
// Body: { type, organization, loginType, id, password }
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 사용자의 금융기관 로그인 정보를 CODEF에 등록하고
// connectedId를 발급받아 반환합니다.

import type { Env } from "../_shared/types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_URL = "https://development.codef.io"; // sandbox

interface ConnectRequest {
  type: "bank" | "card" | "hometax";
  organization: string; // 기관코드
  loginType: "0" | "1"; // 0: 인증서, 1: ID/PW
  id: string;
  password: string;
  connectedId?: string; // 기존 connectedId에 계정 추가 시
}

/** 기관 유형별 CODEF API 경로 */
const ACCOUNT_PATH: Record<string, string> = {
  bank: "/v1/account/create",
  card: "/v1/account/create",
  hometax: "/v1/account/create",
};

/** 기관 유형별 CODEF 계정 추가 API 경로 */
const ACCOUNT_ADD_PATH = "/v1/account/add";

/** CODEF OAuth2 액세스 토큰 발급 */
async function getCodefAccessToken(env: Env): Promise<string> {
  const resp = await fetch(CODEF_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        btoa(`${env.CODEF_CLIENT_ID}:${env.CODEF_CLIENT_SECRET}`),
    },
    body: "grant_type=client_credentials&scope=read",
  });

  if (!resp.ok) {
    throw new Error(`CODEF 토큰 발급 실패: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

/**
 * CODEF RSA 공개키로 비밀번호를 암호화합니다.
 * CODEF는 RSA PKCS1 v1.5 패딩을 요구합니다.
 * node-forge 라이브러리 사용 (Web Crypto API는 PKCS1 encrypt 미지원).
 */
async function encryptWithRSA(
  plainText: string,
  publicKeyBase64: string,
): Promise<string> {
  const forge = await import("node-forge");

  const pemBody = publicKeyBase64
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");

  const pem = `-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----`;
  const publicKey = forge.pki.publicKeyFromPem(pem);
  const encrypted = publicKey.encrypt(plainText, "RSAES-PKCS1-V1_5");
  return forge.util.encode64(encrypted);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string;

  if (!uid) {
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const body = (await context.request.json()) as ConnectRequest;

    // 필수 파라미터 검증
    if (!body.type || !body.organization || !body.id || !body.password) {
      return Response.json(
        {
          error: "필수 파라미터가 누락되었습니다.",
          detail: "type, organization, id, password가 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (!["bank", "card", "hometax"].includes(body.type)) {
      return Response.json(
        {
          error: "지원하지 않는 기관 유형입니다.",
          detail: "type은 bank, card, hometax 중 하나여야 합니다.",
        },
        { status: 400 },
      );
    }

    // CODEF 환경변수 확인
    if (
      !context.env.CODEF_CLIENT_ID ||
      !context.env.CODEF_CLIENT_SECRET ||
      !context.env.CODEF_PUBLIC_KEY
    ) {
      return Response.json(
        { error: "CODEF API 설정이 완료되지 않았습니다." },
        { status: 503 },
      );
    }

    // 1) 비밀번호 RSA 암호화
    const encryptedPassword = await encryptWithRSA(
      body.password,
      context.env.CODEF_PUBLIC_KEY,
    );

    // 2) CODEF 액세스 토큰 발급
    const accessToken = await getCodefAccessToken(context.env);

    // 3) Connected ID 생성 또는 추가
    const isAddingToExisting = !!body.connectedId;
    const apiPath = isAddingToExisting
      ? ACCOUNT_ADD_PATH
      : ACCOUNT_PATH[body.type];

    const accountInfo = {
      countryCode: "KR",
      businessType: body.type === "hometax" ? "NT" : "BK",
      clientType: "P", // 개인
      organization: body.organization,
      loginType: body.loginType || "1",
      id: body.id,
      password: encryptedPassword,
    };

    const requestBody: Record<string, unknown> = {
      accountList: [accountInfo],
    };

    if (isAddingToExisting) {
      requestBody.connectedId = body.connectedId;
    }

    const codefResp = await fetch(`${CODEF_API_URL}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: encodeURIComponent(JSON.stringify(requestBody)),
    });

    if (!codefResp.ok) {
      return Response.json(
        {
          error: "CODEF 계정 등록 실패",
          detail: `HTTP ${codefResp.status}`,
        },
        { status: codefResp.status },
      );
    }

    // CODEF 응답 파싱 (URL-encoded JSON 가능)
    const rawText = await codefResp.text();
    let codefData: {
      result: { code: string; message: string; extraMessage: string };
      data: { connectedId?: string };
    };
    try {
      codefData = JSON.parse(decodeURIComponent(rawText));
    } catch {
      codefData = JSON.parse(rawText);
    }

    // CODEF 결과 코드 확인
    if (codefData.result.code !== "CF-00000") {
      // 알려진 에러 코드별 한국어 메시지
      const errorMessages: Record<string, string> = {
        "CF-01004": "잘못된 로그인 정보입니다. ID/비밀번호를 확인해주세요.",
        "CF-01005": "해당 기관이 점검 중입니다. 잠시 후 다시 시도해주세요.",
        "CF-09999": "CODEF 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        "CF-01003": "해당 기관을 지원하지 않습니다.",
      };

      const userMessage =
        errorMessages[codefData.result.code] ??
        `계정 등록 실패: ${codefData.result.message}`;

      return Response.json(
        {
          error: userMessage,
          code: codefData.result.code,
          detail: codefData.result.extraMessage || codefData.result.message,
        },
        { status: 400 },
      );
    }

    const connectedId = codefData.data?.connectedId ?? body.connectedId;

    if (!connectedId) {
      return Response.json(
        {
          error: "Connected ID를 받지 못했습니다.",
          detail: "CODEF 응답에 connectedId가 없습니다.",
        },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      connectedId,
      organization: body.organization,
      type: body.type,
    });
  } catch (error) {
    return Response.json(
      {
        error: "계정 연결 처리 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
