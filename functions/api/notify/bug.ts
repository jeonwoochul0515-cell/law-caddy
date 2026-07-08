// 신규 버그 리포트 접수 시 관리자에게 SOLAPI 문자 알림을 보내는 엔드포인트
//
// POST /api/notify/bug
// Body: { page, reporterName, snippet }
// Auth: Firebase JWT (미들웨어에서 검증) — 로그인 사용자가 버그 제보 시 호출
//
// fire-and-forget: 문자 발송 실패가 버그 리포트 저장 자체를 막지 않도록
// 프론트엔드에서 await 없이 호출한다.

import type { Env } from "../_shared/types";
import { sendSms } from "../_shared/solapi";

interface BugNotifyRequest {
  page?: string;
  reporterName?: string;
  snippet?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await context.request.json().catch(() => ({}))) as BugNotifyRequest;

    const who = body.reporterName ? `${body.reporterName}` : "익명";
    const where = body.page ? ` (${body.page})` : "";
    const snippet = (body.snippet ?? "").slice(0, 60);

    await sendSms(
      context.env,
      context.env.ADMIN_NOTIFY_PHONE,
      `[Law-Caddy] 버그 리포트 접수 — ${who}${where}\n"${snippet}${snippet.length >= 60 ? "..." : ""}"\n관리자 페이지에서 확인하세요.`,
    );

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error: "버그 알림 처리 오류",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
