import type { Env } from "../_shared/types";
import { getAccessToken, RTZR_API_BASE } from "../_shared/rtzr-auth";
import { firestoreQueryByFields, readString } from "../_shared/firestore";

/**
 * 전사 결과 조회.
 *
 * 소유권 검사(r2-03-11): 이 전사 ID를 기록한 녹음 문서가 있으면 그 소유자만 조회할 수 있다.
 * 문서가 없으면(전사 요청 직후 아직 저장 전인 짧은 순간) 통과시킨다 — ID는 추측할 수 없는 값이다.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const transcribeId = context.params.id as string;
    const { RTZR_CLIENT_ID, RTZR_CLIENT_SECRET } = context.env;

    if (!RTZR_CLIENT_ID || !RTZR_CLIENT_SECRET) {
      return Response.json(
        { error: "음성 변환 서비스가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." },
        { status: 503 },
      );
    }

    const uid = (context.data as Record<string, unknown>).uid as string | undefined;
    if (uid) {
      try {
        const docs = await firestoreQueryByFields(
          context.env,
          "recordings",
          [{ field: "rtzrTranscribeId", value: { stringValue: transcribeId } }],
          5,
        );
        const foreign = docs.some((d) => {
          const owner = readString(d.fields?.ownerId);
          return owner && owner !== uid;
        });
        if (foreign) {
          return Response.json(
            { error: "이 녹음의 변환 결과를 볼 권한이 없습니다." },
            { status: 403 },
          );
        }
      } catch (err) {
        // 조회 실패로 서비스가 멈추지 않게 — 로그만 남긴다
        console.warn("[transcribe/:id] 소유권 조회 실패:", err instanceof Error ? err.message : err);
      }
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
        { error: "음성 변환 결과를 아직 받지 못했습니다. 잠시 후 다시 확인해 주세요.", detail: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error: "음성 변환 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
