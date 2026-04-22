// iCal 구독 토큰 재발급(로테이션) 엔드포인트
//
// POST /api/user/ical-token/rotate
// Auth: Firebase JWT (미들웨어에서 검증)
//
// 기존 토큰을 무효화하고 새 토큰을 발급합니다.
// 기존 URL을 사용하던 캘린더 구독은 더 이상 접근 불가(404)가 됩니다.
//
// 응답: { token, subscribeUrl }

import type { Env } from "../../_shared/types";
import { firestorePatchDocument } from "../../_shared/firestore";

/**
 * 암호학적으로 안전한 랜덤 토큰 생성.
 * crypto.randomUUID() 2개를 연결하여 64자 hex 생성 (대시 제거).
 */
function generateIcalToken(): string {
  const uuid1 = crypto.randomUUID().replace(/-/g, "");
  const uuid2 = crypto.randomUUID().replace(/-/g, "");
  return `${uuid1}${uuid2}`;
}

function buildSubscribeUrl(request: Request, token: string): string {
  const url = new URL(request.url);
  return `${url.origin}/api/ical/${token}`;
}

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
    if (!context.env.FIREBASE_CLIENT_EMAIL || !context.env.FIREBASE_PRIVATE_KEY) {
      return Response.json(
        {
          error: "iCal 구독 기능이 설정되지 않았습니다.",
          detail: "Firebase 서비스 계정이 구성되지 않았습니다.",
        },
        { status: 503 },
      );
    }

    // 신규 토큰으로 교체 (기존 토큰은 덮어써짐 → 자동 무효화)
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
        error: "iCal 토큰 재발급 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
