import type { Env } from "./_shared/types";
import { getAccessToken, RTZR_API_BASE } from "./_shared/rtzr-auth";
import { RTZR_TRANSCRIBE_CONFIG } from "./_shared/rtzr-config";
import { requireUsageQuota } from "./_shared/plan";

/**
 * 음성 전사 요청.
 *
 * 두 가지 입력을 받는다:
 *  1) multipart/form-data — file 필드에 음성 파일 (예전 방식)
 *  2) application/json  — { fileUrl, fileName } (Storage에 이미 올린 파일을 서버가 받아 넘긴다)
 * 2)를 쓰면 브라우저가 같은 파일을 두 번 올리지 않아도 되고(r1-03-10),
 * 저장된 파일로 재전사할 수 있다(r1-03-13). Storage 다운로드 URL은 토큰이 포함돼
 * 서버가 그대로 받을 수 있다.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { RTZR_CLIENT_ID, RTZR_CLIENT_SECRET } = context.env;

    if (!RTZR_CLIENT_ID || !RTZR_CLIENT_SECRET) {
      return Response.json(
        { error: "음성 변환 서비스가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." },
        { status: 503 },
      );
    }

    // 요금제 확인 — STT도 건당 비용이 발생하므로 무료 플랜을 막는다
    const uid = (context.data as Record<string, unknown>).uid as string | undefined;
    const denied = await requireUsageQuota(context.env, uid);
    if (denied) return denied;

    let file: Blob | null = null;
    let fileName = "audio.wav";

    const contentType = context.request.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await context.request.json()) as { fileUrl?: string; fileName?: string };
      const fileUrl = body.fileUrl ?? "";
      // Firebase Storage 다운로드 URL만 받는다 — 서버를 임의 URL 프록시로 쓰지 못하게
      if (!/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(fileUrl)) {
        return Response.json(
          { error: "저장된 녹음 파일 주소가 올바르지 않습니다. 파일을 다시 올려 주세요." },
          { status: 400 },
        );
      }
      const fetched = await fetch(fileUrl);
      if (!fetched.ok) {
        return Response.json(
          { error: "저장된 녹음 파일을 불러오지 못했습니다. 파일이 지워졌을 수 있습니다." , detail: `storage HTTP ${fetched.status}` },
          { status: 502 },
        );
      }
      file = await fetched.blob();
      fileName = body.fileName?.trim() || "audio.wav";
    } else {
      // multipart/form-data 파싱 (multer 불필요)
      const incomingFormData = await context.request.formData();
      // workers-types의 FormData.get은 string만 선언하지만 런타임은 파일 항목에 File을 돌려준다
      const incoming = incomingFormData.get("file") as unknown as File | string | null;
      if (incoming && typeof incoming !== "string") {
        file = incoming;
        fileName = incoming.name || fileName;
      }
    }

    if (!file || file.size === 0) {
      return Response.json(
        { error: "음성 파일이 필요합니다." },
        { status: 400 },
      );
    }

    const token = await getAccessToken(RTZR_CLIENT_ID, RTZR_CLIENT_SECRET);

    // RTZR API로 전송할 FormData 구성
    const rtzrFormData = new FormData();
    rtzrFormData.append("file", file, fileName);
    rtzrFormData.append("config", JSON.stringify(RTZR_TRANSCRIBE_CONFIG));

    const response = await fetch(`${RTZR_API_BASE}/v1/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: rtzrFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        {
          error: response.status === 413
            ? "파일이 너무 커서 음성 변환 서버가 받지 않습니다. 파일을 나누어 올려 주세요."
            : "음성 변환 서버가 요청을 받지 않았습니다. 잠시 후 다시 시도해 주세요.",
          detail: errorText,
        },
        { status: response.status },
      );
    }

    const data = (await response.json()) as { id: string };
    return Response.json({ id: data.id });
  } catch (error) {
    return Response.json(
      {
        error: "음성 변환 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
