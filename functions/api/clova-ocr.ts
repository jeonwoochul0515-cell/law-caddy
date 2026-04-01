// CLOVA OCR 프록시 — 시크릿 키 보호 + CORS 우회
import type { Env } from "./_shared/types";

interface ClovaOcrProxyRequest {
  /** base64 인코딩된 이미지 데이터 */
  imageData: string;
  /** 파일 포맷: jpg, png, pdf, tiff */
  format: string;
  /** 파일명 (옵션) */
  name?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const invokeUrl = context.env.CLOVA_OCR_INVOKE_URL;
    const secret = context.env.CLOVA_OCR_SECRET;

    if (!invokeUrl || !secret) {
      return Response.json(
        { error: "CLOVA OCR 설정이 되어있지 않습니다." },
        { status: 503 },
      );
    }

    const body = (await context.request.json()) as ClovaOcrProxyRequest;

    if (!body.imageData || !body.format) {
      return Response.json(
        { error: "imageData와 format이 필요합니다." },
        { status: 400 },
      );
    }

    const requestBody = {
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      lang: "ko",
      images: [
        {
          format: body.format,
          name: body.name ?? "document",
          data: body.imageData,
        },
      ],
    };

    const response = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OCR-SECRET": secret,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return Response.json(
        { error: "CLOVA OCR API 호출 실패", detail: errText.slice(0, 500), status: response.status },
        { status: response.status },
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: "CLOVA OCR 프록시 오류", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
