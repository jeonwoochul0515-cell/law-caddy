// CLOVA OCR 클라이언트
// /api/clova-ocr 프록시를 통해 네이버 CLOVA General OCR 호출

import { authHeaders } from "./api-auth";
import { withRetry } from "./retry";

/** API BASE URL (커스텀 도메인 우회) */
const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "law-caddy.pages.dev"
    ? "https://law-caddy.pages.dev"
    : "";

/** CLOVA OCR 응답의 필드 */
export interface ClovaOcrField {
  inferText: string;
  inferConfidence: number;
  lineBreak: boolean;
  type: string;
  boundingPoly?: {
    vertices: Array<{ x: number; y: number }>;
  };
}

/** CLOVA OCR 이미지 결과 */
export interface ClovaOcrImageResult {
  uid: string;
  name: string;
  inferResult: string;
  message: string;
  fields: ClovaOcrField[];
}

/** CLOVA OCR 전체 응답 */
export interface ClovaOcrResponse {
  version: string;
  requestId: string;
  timestamp: number;
  images: ClovaOcrImageResult[];
}

/**
 * CLOVA OCR API를 호출합니다.
 * @param base64 - base64 인코딩된 이미지 데이터
 * @param format - 파일 포맷 (jpg, png, pdf, tiff)
 * @param name - 파일명 (옵션)
 */
export async function callClovaOcr(
  base64: string,
  format: string,
  name?: string,
): Promise<ClovaOcrResponse> {
  const response = await withRetry(async () => {
    const hdrs = await authHeaders({ "Content-Type": "application/json" });
    return fetch(`${API_BASE}/api/clova-ocr`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        imageData: base64,
        format,
        name,
      }),
    });
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`CLOVA OCR HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  return (await response.json()) as ClovaOcrResponse;
}

/**
 * CLOVA OCR 응답에서 텍스트를 추출합니다.
 * fields의 inferText를 이어붙이고, lineBreak에 따라 줄바꿈 처리합니다.
 */
export function extractClovaText(response: ClovaOcrResponse): string {
  const lines: string[] = [];

  for (const image of response.images) {
    if (image.inferResult !== "SUCCESS") {
      console.warn(`[CLOVA OCR] 이미지 인식 실패: ${image.name} — ${image.message}`);
      continue;
    }

    let currentLine = "";
    for (const field of image.fields) {
      currentLine += field.inferText + " ";
      if (field.lineBreak) {
        lines.push(currentLine.trim());
        currentLine = "";
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
  }

  return lines.join("\n");
}
