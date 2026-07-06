// 신규 가입자 발생 시 관리자에게 SOLAPI로 문자 알림을 보내는 엔드포인트
//
// POST /api/notify/signup
// Body: { name, firmName }
// Auth: Firebase JWT (미들웨어에서 검증) — 프로필 등록을 마친 본인 세션에서 호출
//
// 문자 발송 실패가 회원가입 자체를 막으면 안 되므로, 프론트엔드에서는
// 이 호출을 fire-and-forget으로 처리한다(실패해도 가입 플로우는 계속 진행).

import type { Env } from "../_shared/types";
import { sendSms } from "../_shared/solapi";

interface SignupNotifyRequest {
  name?: string;
  firmName?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await context.request.json().catch(() => ({}))) as SignupNotifyRequest;

    const nameLabel = body.name ? `${body.name} 변호사` : "신규 사용자";
    const firmLabel = body.firmName ? ` (${body.firmName})` : "";

    await sendSms(
      context.env,
      context.env.ADMIN_NOTIFY_PHONE,
      `[Law-Caddy] 신규 가입: ${nameLabel}${firmLabel}님이 가입했습니다.`,
    );

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error: "SMS 발송 처리 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
