// 플랜 만료 임박(7일 이내) 시 사용자에게 문자 알림을 보내는 엔드포인트
//
// POST /api/notify/expiry
// Auth: Firebase JWT (미들웨어에서 검증) — 본인 세션에서 호출
//
// 만료 조건·중복 발송 방지를 모두 서버에서 판정한다:
// - users/{uid}.planExpiresAt이 지금부터 7일 이내일 때만 발송
// - 같은 만료 주기에 이미 보냈으면(expiryNotifiedAt 기준) 재발송하지 않음
// 클라이언트(만료 배너)는 조건 확인 없이 fire-and-forget으로 호출해도 안전하다.

import type { Env } from "../_shared/types";
import {
  firestoreGetDocument,
  firestorePatchDocument,
  readString,
  type FirestoreValue,
} from "../_shared/firestore";
import { sendSms } from "../_shared/solapi";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  team: "Team",
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 만료 7일 전부터 발송

/** FirestoreValue에서 timestamp를 Date로 안전하게 추출합니다. */
function readTimestamp(value: FirestoreValue | undefined): Date | null {
  if (!value || !("timestampValue" in value)) return null;
  const d = new Date(value.timestampValue);
  return isNaN(d.getTime()) ? null : d;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const userDoc = await firestoreGetDocument(context.env, `users/${uid}`);
    if (!userDoc?.fields) {
      return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const expiresAt = readTimestamp(userDoc.fields.planExpiresAt);
    const now = Date.now();

    // 만료일 없음 / 이미 만료됨 / 아직 7일 이상 남음 → 발송 대상 아님
    if (
      !expiresAt ||
      expiresAt.getTime() <= now ||
      expiresAt.getTime() - now > WINDOW_MS
    ) {
      return Response.json({ success: true, sent: false, reason: "발송 조건 아님" });
    }

    // 같은 만료 주기에 이미 발송했으면 스킵
    const notifiedAt = readTimestamp(userDoc.fields.expiryNotifiedAt);
    if (notifiedAt && expiresAt.getTime() - notifiedAt.getTime() <= WINDOW_MS + 86_400_000) {
      return Response.json({ success: true, sent: false, reason: "이미 발송됨" });
    }

    const phone = readString(userDoc.fields.phone)?.replace(/[^0-9]/g, "");
    if (!phone) {
      return Response.json({ success: true, sent: false, reason: "전화번호 미등록" });
    }

    const name = readString(userDoc.fields.name) ?? "변호사";
    const plan = readString(userDoc.fields.plan) ?? "";
    const planLabel = PLAN_LABELS[plan] ?? plan;
    const dateLabel = `${expiresAt.getMonth() + 1}월 ${expiresAt.getDate()}일`;

    await sendSms(
      context.env,
      phone,
      // 미리 연장해도 남은 기간은 그대로 이어지므로(payment/confirm.ts) "지금 연장해도 손해 없음"을 함께 알린다
      `[Law-Caddy] ${name} 변호사님, ${planLabel} 요금제가 ${dateLabel}에 끝납니다. 끝나면 무료 요금제로 바뀝니다. 지금 연장해도 남은 기간은 그대로 이어집니다. 연장하기: law-caddy.com/settings?tab=plan`,
    );

    await firestorePatchDocument(context.env, `users/${uid}`, {
      expiryNotifiedAt: { timestampValue: new Date().toISOString() },
    });

    return Response.json({ success: true, sent: true });
  } catch (error) {
    return Response.json(
      {
        error: "만료 알림 처리 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
