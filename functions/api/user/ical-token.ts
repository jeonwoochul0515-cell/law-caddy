// iCal 구독 토큰 조회/발급 엔드포인트
//
// POST /api/user/ical-token
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 현재 사용자의 icalToken을 조회하고, 없으면 새로 발급하여 Firestore에 저장합니다.
// 응답: { token, subscribeUrl }
//
// Note: 이 엔드포인트는 로그인 사용자 전용이므로 /api/ical/* PUBLIC_PATHS 예외에
//       걸리지 않도록 /api/user/ 하위로 배치되었습니다.

import type { Env } from "../_shared/types";
import {
  firestoreGetDocument,
  firestorePatchDocument,
  readString,
} from "../_shared/firestore";

/**
 * 암호학적으로 안전한 랜덤 토큰 생성.
 * crypto.randomUUID() 2개를 연결하여 64자 hex 생성 (대시 제거).
 */
function generateIcalToken(): string {
  const uuid1 = crypto.randomUUID().replace(/-/g, "");
  const uuid2 = crypto.randomUUID().replace(/-/g, "");
  return `${uuid1}${uuid2}`;
}

/** subscribeUrl 생성 — 요청 Origin 기반 */
function buildSubscribeUrl(request: Request, token: string): string {
  const url = new URL(request.url);
  return `${url.origin}/api/ical/${token}`;
}

/** 현재 UTC 시각을 Firestore timestampValue 형식(RFC 3339)으로 반환 */
function nowTimestampValue(): string {
  return new Date().toISOString();
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;

  if (!uid) {
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    // 서비스 계정 환경변수 확인
    if (!context.env.FIREBASE_CLIENT_EMAIL || !context.env.FIREBASE_PRIVATE_KEY) {
      return Response.json(
        {
          error: "iCal 구독 기능이 설정되지 않았습니다.",
          detail: "Firebase 서비스 계정이 구성되지 않았습니다.",
        },
        { status: 503 },
      );
    }

    // 1) 기존 사용자 문서 조회
    const userDoc = await firestoreGetDocument(context.env, `users/${uid}`);

    if (!userDoc) {
      return Response.json(
        { error: "사용자 문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const existingToken = readString(userDoc.fields?.icalToken);

    if (existingToken) {
      return Response.json({
        token: existingToken,
        subscribeUrl: buildSubscribeUrl(context.request, existingToken),
      });
    }

    // 2) 신규 토큰 발급 + Firestore 저장
    const newToken = generateIcalToken();
    await firestorePatchDocument(context.env, `users/${uid}`, {
      icalToken: { stringValue: newToken },
      icalTokenCreatedAt: { timestampValue: nowTimestampValue() },
    });

    return Response.json({
      token: newToken,
      subscribeUrl: buildSubscribeUrl(context.request, newToken),
    });
  } catch (error) {
    return Response.json(
      {
        error: "iCal 토큰 발급 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
