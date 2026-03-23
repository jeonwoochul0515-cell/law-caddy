// 이미지 OCR 서비스
// Claude Vision API를 사용하여 이미지에서 텍스트를 추출하고 문서 유형을 분류

import * as Sentry from "@sentry/react";
import { authHeaders } from "./api-auth";
import { withRetry } from "./retry";

const isDev = import.meta.env.DEV;
const DIRECT_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const DEV_PROXY_URL = "/api/anthropic/v1/messages";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-20250514";

/** 이미지 확장자 판별 */
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

export function isImageFile(file: File): boolean {
  if (file.type?.startsWith("image/") && !file.type.includes("svg")) return true;
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return IMAGE_EXTS.has(ext);
}

/** OCR 결과 */
export interface OcrResult {
  fileName: string;
  documentType: string;
  extractedText: string;
}

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;
/** 전체 합산 최대 문자 수 */
const MAX_TOTAL_CHARS = 30_000;

const OCR_SYSTEM_PROMPT = `당신은 한국 법률 문서 판독 전문가입니다.
이미지에서 텍스트를 추출하고, 이 문서가 어떤 종류인지 분류하세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "documentType": "문서 유형 (예: 계약서, 내용증명, 소장, 답변서, 판결문, 등기부등본, 영수증, 진단서, 차용증, 각서, 합의서, 고소장, 신분증, 사진/증거자료, 통화내역, 문자메시지, 기타)",
  "extractedText": "이미지에서 읽은 전체 텍스트 내용. 줄바꿈과 구조를 최대한 유지하세요. 읽을 수 없는 부분은 [판독불가]로 표시."
}

주의사항:
- 법률 관련 용어와 고유명사를 정확히 판독하세요.
- 날짜, 금액, 이름 등 핵심 정보를 빠뜨리지 마세요.
- 도장/서명 부분은 [도장] 또는 [서명]으로 표시하세요.
- 표가 있으면 | 구분자로 구조를 유지하세요.
- 사진이나 증거 자료(현장 사진, 상해 사진 등)인 경우 보이는 내용을 상세히 묘사하세요.`;

const OCR_USER_MESSAGE = "이 이미지의 문서 유형을 분류하고, 텍스트를 모두 추출해 주세요.";

/** File → base64 문자열 변환 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Vision messages 구성 */
function buildVisionMessages(base64: string, mediaType: string) {
  return [
    {
      role: "user" as const,
      content: [
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data: base64 },
        },
        {
          type: "text" as const,
          text: OCR_USER_MESSAGE,
        },
      ],
    },
  ];
}

/**
 * 단일 이미지 파일에서 OCR로 텍스트를 추출하고 문서 유형을 분류합니다.
 */
export async function extractImageText(file: File): Promise<OcrResult> {
  const base64 = await fileToBase64(file);
  const mediaType = file.type || "image/jpeg";
  const messages = buildVisionMessages(base64, mediaType);

  let response: Response;

  if (DIRECT_API_KEY) {
    // 로컬 개발 또는 프론트엔드 직접 호출
    const url = isDev ? DEV_PROXY_URL : ANTHROPIC_API_URL;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": DIRECT_API_KEY,
      "anthropic-version": API_VERSION,
    };
    if (!isDev) {
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: OCR_SYSTEM_PROMPT,
        messages,
      }),
    });
  } else {
    // 프로덕션: 기존 /api/claude 프록시 사용 (Vision messages 전달)
    response = await withRetry(async () => {
      const headers = await authHeaders({ "Content-Type": "application/json" });
      return fetch("/api/claude", {
        method: "POST",
        headers,
        body: JSON.stringify({
          systemPrompt: OCR_SYSTEM_PROMPT,
          messages,
        }),
      });
    });
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: { message?: string }; detail?: string };
      errorMessage = errorBody?.error?.message ?? errorBody?.detail ?? errorMessage;
    } catch { /* non-JSON */ }
    throw new Error(`이미지 OCR 실패 (${file.name}): ${errorMessage}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      fileName: file.name,
      documentType: "기타",
      extractedText: text || "(텍스트를 추출할 수 없습니다)",
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      documentType: string;
      extractedText: string;
    };
    return {
      fileName: file.name,
      documentType: parsed.documentType || "기타",
      extractedText: parsed.extractedText || "(텍스트 없음)",
    };
  } catch {
    return {
      fileName: file.name,
      documentType: "기타",
      extractedText: text,
    };
  }
}

/**
 * 여러 이미지 파일에서 OCR 텍스트를 추출합니다.
 * MAX_TOTAL_CHARS 초과 시 나머지 파일을 건너뜁니다.
 */
export async function extractAllImageTexts(files: File[]): Promise<string> {
  if (files.length === 0) return "";

  const results: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      results.push(
        `\n... (추가 이미지 ${files.length - results.length}개 생략)`,
      );
      break;
    }

    try {
      const ocr = await extractImageText(file);
      const header = `[이미지: ${ocr.fileName}] (문서 유형: ${ocr.documentType})`;
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const truncatedText =
        ocr.extractedText.length > remaining
          ? ocr.extractedText.slice(0, remaining) + "\n... (내용 일부 생략)"
          : ocr.extractedText;

      const finalText =
        truncatedText.length > MAX_CHARS_PER_FILE
          ? truncatedText.slice(0, MAX_CHARS_PER_FILE) + "\n... (파일 내용 일부 생략)"
          : truncatedText;

      results.push(`${header}\n${finalText}`);
      totalChars += finalText.length;
    } catch (err) {
      Sentry.captureException(err);
      console.warn(`[OCR] ${file.name} 텍스트 추출 실패:`, err);
      results.push(
        `[이미지: ${file.name}]\n(OCR 텍스트 추출 실패 — ${err instanceof Error ? err.message : "알 수 없는 오류"})`,
      );
    }
  }

  return results.join("\n\n---\n\n");
}
