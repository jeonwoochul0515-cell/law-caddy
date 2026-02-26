import type { Env } from "../_shared/types";
import { getAccessToken, RTZR_API_BASE } from "../_shared/rtzr-auth";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const transcribeId = context.params.id as string;
    const { RTZR_CLIENT_ID, RTZR_CLIENT_SECRET } = context.env;

    if (!RTZR_CLIENT_ID || !RTZR_CLIENT_SECRET) {
      return Response.json(
        { error: "RTZR 인증 정보가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const token = await getAccessToken(RTZR_CLIENT_ID, RTZR_CLIENT_SECRET);

    const response = await fetch(
      `${RTZR_API_BASE}/v1/transcribe/${transcribeId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: "전사 결과 조회 실패", detail: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error: "전사 결과 조회 중 오류가 발생했습니다.",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
