// 관리자가 변호사 가입을 승인(검증)했을 때 해당 사용자에게 문자 알림을 보내는 엔드포인트
//
// POST /api/notify/approved
// Body: { uid }  — 승인된 사용자의 uid
// Auth: Firebase JWT (미들웨어에서 검증) + 호출자가 admin인지 서버에서 재확인
//
// 수신번호는 클라이언트 입력을 신뢰하지 않고 Firestore users/{uid}.phone에서
// 서버가 직접 조회한다(임의 번호로 문자를 보내는 릴레이 악용 방지).

import type { Env } from "../_shared/types";
import { firestoreGetDocument, readString } from "../_shared/firestore";
import { sendSms } from "../_shared/solapi";

interface ApprovedNotifyRequest {
  uid?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const callerUid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!callerUid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    // 호출자가 관리자인지 서버에서 확인
    const callerDoc = await firestoreGetDocument(context.env, `users/${callerUid}`);
    const callerRole = readString(callerDoc?.fields?.role);
    if (callerRole !== "admin") {
      return Response.json({ error: "관리자만 호출할 수 있습니다." }, { status: 403 });
    }

    const body = (await context.request.json().catch(() => ({}))) as ApprovedNotifyRequest;
    if (!body.uid) {
      return Response.json({ error: "uid가 필요합니다." }, { status: 400 });
    }

    // 승인된 사용자의 전화번호를 서버에서 직접 조회
    const targetDoc = await firestoreGetDocument(context.env, `users/${body.uid}`);
    if (!targetDoc) {
      return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const phone = readString(targetDoc.fields?.phone)?.replace(/[^0-9]/g, "");
    const name = readString(targetDoc.fields?.name) ?? "변호사";

    if (!phone) {
      // 전화번호 미등록 사용자는 문자를 보낼 수 없음 — 승인 자체는 이미 완료된 상태이므로 조용히 성공 처리
      return Response.json({ success: true, sent: false, reason: "전화번호 미등록" });
    }

    await sendSms(
      context.env,
      phone,
      `[Law-Caddy] ${name} 변호사님, 가입 승인이 완료되었습니다. 지금 로그인하시면 모든 기능을 사용하실 수 있습니다. law-caddy.com`,
    );

    return Response.json({ success: true, sent: true });
  } catch (error) {
    return Response.json(
      {
        error: "승인 알림 발송 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
