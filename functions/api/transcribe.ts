import type { Env } from "./_shared/types";
import { getAccessToken, RTZR_API_BASE } from "./_shared/rtzr-auth";
import { RTZR_TRANSCRIBE_CONFIG } from "./_shared/rtzr-config";
import { requireUsageQuota } from "./_shared/plan";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { RTZR_CLIENT_ID, RTZR_CLIENT_SECRET } = context.env;

    if (!RTZR_CLIENT_ID || !RTZR_CLIENT_SECRET) {
      return Response.json(
        { error: "RTZR 인증 정보가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    // 요금제 확인 — STT도 건당 비용이 발생하므로 무료 플랜을 막는다
    const uid = (context.data as Record<string, unknown>).uid as string | undefined;
    const denied = await requireUsageQuota(context.env, uid);
    if (denied) return denied;

    // multipart/form-data 파싱 (multer 불필요)
    const incomingFormData = await context.request.formData();
    const file = incomingFormData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json(
        { error: "음성 파일이 필요합니다." },
        { status: 400 },
      );
    }

    const token = await getAccessToken(RTZR_CLIENT_ID, RTZR_CLIENT_SECRET);

    // RTZR API로 전송할 FormData 구성
    const rtzrFormData = new FormData();
    rtzrFormData.append("file", file, file.name || "audio.wav");
    rtzrFormData.append("config", JSON.stringify(RTZR_TRANSCRIBE_CONFIG));

    const response = await fetch(`${RTZR_API_BASE}/v1/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: rtzrFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: "RTZR 전사 요청 실패", detail: errorText },
        { status: response.status },
      );
    }

    const data = (await response.json()) as { id: string };
    return Response.json({ id: data.id });
  } catch (error) {
    return Response.json(
      {
        error: "전사 요청 처리 중 오류가 발생했습니다.",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
