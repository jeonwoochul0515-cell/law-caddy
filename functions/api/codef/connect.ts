// CODEF Connected ID 등록 (계정 연결)
//
// POST /api/codef/connect
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 두 가지 인증 모드:
//   1) 간편인증 (loginType=5)
//      - 1차: userName/birthDate/phoneNo + loginTypeLevel + is2Way=true
//        → CODEF가 외부 앱(카카오톡 등)으로 인증 푸시 발송 + twoWayInfo 응답
//      - 2차: 사용자 외부 앱 동의 후 twoWayInfo + simpleAuth=1 포함하여 재호출
//        → connectedId 발급
//   2) 인증서 (loginType=0) — 현재 미완성, 추후 구현
//
// 응답:
//   - 1차 (간편인증 추가 인증 필요): { pending2Way: true, twoWayInfo, message }
//   - 2차 / 즉시 성공: { connectedId, organization, type }
//   - 실패: { error, detail, code }

import type { Env } from "../_shared/types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_URL = "https://api.codef.io"; // production (2026-04-22 전환)

/** CODEF 추가 인증 필요 응답 코드 (간편인증 1차) */
const CODEF_TWOWAY_CODE = "CF-03002";

interface TwoWayInfo {
  jti?: string;
  twoWayTimestamp?: string | number;
  jobIndex?: string | number;
  threeWayTimestamp?: string | number;
  connectedId?: string;
}

interface ConnectRequest {
  type: "bank" | "card" | "hometax";
  organization: string;       // 기관코드
  loginType: "0" | "5";       // "0"=인증서, "5"=간편인증
  loginTypeLevel?: string;    // 간편인증 인증사 (1=카카오, 2=페이코, ...)
  userName?: string;          // 간편인증 본인 정보
  birthDate?: string;         // YYYYMMDD
  phoneNo?: string;           // 01012345678 ('-' 제거)
  id?: string;                // 인증서 모드용
  password?: string;          // 인증서 모드용
  twoWayInfo?: TwoWayInfo;    // 2차 호출 시 1차 응답값
  connectedId?: string;       // 기존 connectedId에 계정 추가 시
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
 * CODEF RSA 공개키로 평문을 암호화 (PKCS1 v1.5 + Base64).
 * 인증서 모드의 비밀번호 보호용.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 인증서(loginType=0) 모드 구현 시 사용 예정
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

/** CODEF 응답 파싱 (URL-encoded JSON 또는 일반 JSON)
 *  decodeURIComponent는 '+' (공백)을 변환하지 않으므로 사전에 공백으로 치환. */
function parseCodefResponse(rawText: string): {
  result: { code: string; message: string; extraMessage?: string };
  data?: Record<string, unknown>;
} {
  try {
    return JSON.parse(decodeURIComponent(rawText.replace(/\+/g, " ")));
  } catch {
    try {
      return JSON.parse(rawText.replace(/\+/g, " "));
    } catch {
      return JSON.parse(rawText);
    }
  }
}

/** CODEF 1차 응답에서 twoWayInfo 추출 */
function extractTwoWayInfo(
  data: Record<string, unknown> | undefined,
): TwoWayInfo {
  if (!data) return {};
  return {
    jti: data.jti as string | undefined,
    twoWayTimestamp: data.twoWayTimestamp as string | number | undefined,
    jobIndex: data.jobIndex as string | number | undefined,
    threeWayTimestamp: data.threeWayTimestamp as string | number | undefined,
    connectedId: data.connectedId as string | undefined,
  };
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

    // ── 공통 파라미터 검증 ──
    if (!body.type || !body.organization || !body.loginType) {
      return Response.json(
        {
          error: "필수 파라미터가 누락되었습니다.",
          detail: "type, organization, loginType이 필요합니다.",
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

    // ── 인증 방식별 검증 ──
    const isSimpleAuth = body.loginType === "5";
    const isCertAuth = body.loginType === "0";
    const isSecondCall = !!body.twoWayInfo;

    if (isCertAuth) {
      return Response.json(
        {
          error: "공동/금융인증서 로그인은 다음 업데이트에 추가됩니다.",
          detail: "현재는 간편인증만 지원됩니다.",
        },
        { status: 501 },
      );
    }

    if (!isSimpleAuth) {
      return Response.json(
        {
          error: "지원하지 않는 인증 방식입니다.",
          detail: "loginType은 '5'(간편인증)만 지원됩니다.",
        },
        { status: 400 },
      );
    }

    // 간편인증 1차 호출 시 본인 정보 필수
    if (!isSecondCall) {
      if (!body.userName || !body.birthDate || !body.phoneNo || !body.loginTypeLevel) {
        return Response.json(
          {
            error: "본인 정보가 누락되었습니다.",
            detail: "이름, 생년월일, 전화번호, 간편인증 종류가 모두 필요합니다.",
          },
          { status: 400 },
        );
      }
    }

    // ── CODEF 환경변수 확인 ──
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

    // ── 액세스 토큰 발급 ──
    const accessToken = await getCodefAccessToken(context.env);

    // ── 요청 바디 구성 ──
    const isAddingToExisting = !!body.connectedId && !isSecondCall;
    const apiPath = isAddingToExisting
      ? ACCOUNT_ADD_PATH
      : ACCOUNT_PATH[body.type];

    // CODEF 간편인증 표준 파라미터 (불필요 필드 제거).
    // 빈 password를 RSA 암호화해서 보내면 CODEF가 거부할 수 있어 password 필드 자체를 제외함.
    const accountInfo: Record<string, unknown> = {
      countryCode: "KR",
      businessType: body.type === "hometax" ? "NT" : "BK",
      clientType: "P",
      organization: body.organization,
      loginType: body.loginType,         // "5" = 간편인증
      loginTypeLevel: body.loginTypeLevel, // 1=카카오, 7=토스, ...
      userName: body.userName,
      identity: body.birthDate,           // YYYYMMDD
      phoneNo: body.phoneNo,
      telecom: "",                        // PASS 등 일부 인증사 필요. 빈 값으로 전송하면 CODEF가 자동 처리
      is2Way: true,
    };

    // 2차 호출이면 twoWayInfo + simpleAuth 추가
    if (isSecondCall && body.twoWayInfo) {
      accountInfo.simpleAuth = "1";
      accountInfo.twoWayInfo = body.twoWayInfo;
    }

    const requestBody: Record<string, unknown> = {
      accountList: [accountInfo],
    };

    if (isAddingToExisting) {
      requestBody.connectedId = body.connectedId;
    } else if (isSecondCall && body.twoWayInfo?.connectedId) {
      // 2차 호출 시 1차 응답 connectedId가 있으면 그걸로 add 호출
      requestBody.connectedId = body.twoWayInfo.connectedId;
    }

    // ── CODEF 호출 ──
    const codefResp = await fetch(`${CODEF_API_URL}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: encodeURIComponent(JSON.stringify(requestBody)),
    });

    if (!codefResp.ok) {
      return Response.json(
        {
          error: "CODEF API 호출 실패",
          detail: `HTTP ${codefResp.status}`,
        },
        { status: codefResp.status },
      );
    }

    const rawText = await codefResp.text();
    const codefData = parseCodefResponse(rawText);

    // ── 1차 응답: 추가 인증 필요 (CF-03002) ──
    if (codefData.result.code === CODEF_TWOWAY_CODE && !isSecondCall) {
      const twoWayInfo = extractTwoWayInfo(codefData.data);
      return Response.json({
        pending2Way: true,
        twoWayInfo,
        message: "외부 앱에서 인증을 완료해 주세요. 완료 후 [확인] 버튼을 누르세요.",
      });
    }

    // ── 성공: connectedId 발급 ──
    if (codefData.result.code === "CF-00000") {
      const connectedId =
        (codefData.data?.connectedId as string | undefined) ??
        body.twoWayInfo?.connectedId ??
        body.connectedId;

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
    }

    // ── 그 외 에러 ──
    const errorMessages: Record<string, string> = {
      "CF-01004": "잘못된 본인 정보입니다. 이름·생년월일·전화번호를 확인해 주세요.",
      "CF-01005": "해당 기관이 점검 중입니다. 잠시 후 다시 시도해 주세요.",
      "CF-09999": "CODEF 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      "CF-01003": "해당 기관을 지원하지 않습니다.",
      "CF-12863": "사용자가 인증을 취소했습니다.",
      "CF-12871": "인증 시간이 만료되었습니다. 다시 시도해 주세요.",
    };

    const userMessage =
      errorMessages[codefData.result.code] ??
      `계정 등록 실패 (${codefData.result.code}): ${codefData.result.message}`;

    return Response.json(
      {
        error: userMessage,
        code: codefData.result.code,
        detail: [
          codefData.result.code,
          codefData.result.message,
          codefData.result.extraMessage,
        ]
          .filter(Boolean)
          .join(" / "),
      },
      { status: 400 },
    );
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
