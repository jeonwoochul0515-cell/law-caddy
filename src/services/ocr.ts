// 이미지 OCR 서비스
// CLOVA OCR을 사용하여 이미지에서 텍스트를 추출하고 문서 유형을 분류

import * as Sentry from "@sentry/react";
import { callClovaOcr, extractClovaText } from "./clova-ocr";

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

/** CLOVA OCR에서 지원하는 이미지 포맷 매핑 */
function getOcrFormat(file: File): string {
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "tif" || ext === "tiff") return "tiff";
  // CLOVA는 gif, webp, bmp를 직접 지원하지 않으므로 jpg로 변환
  return "jpg";
}

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

/** 키워드 기반 문서 유형 분류 */
const DOC_TYPE_KEYWORDS: Array<[string, string[]]> = [
  ["소장", ["소장", "원고", "피고", "청구취지", "청구원인"]],
  ["답변서", ["답변서", "피고", "청구취지에 대한"]],
  ["판결문", ["판결", "선고", "주문", "이유"]],
  ["내용증명", ["내용증명", "통고", "통지"]],
  ["계약서", ["계약서", "계약", "갑", "을", "계약기간"]],
  ["등기부등본", ["등기", "등기부", "갑구", "을구", "표제부"]],
  ["고소장", ["고소장", "고소인", "피고소인"]],
  ["합의서", ["합의서", "합의"]],
  ["진단서", ["진단서", "진단", "상병명", "환자"]],
  ["차용증", ["차용증", "차용", "대여"]],
  ["각서", ["각서", "이행"]],
  ["영수증", ["영수증", "금액", "합계"]],
  ["문자메시지", ["카카오톡", "문자", "메시지"]],
  ["통화내역", ["통화", "발신", "수신", "통화시간"]],
];

function classifyDocumentType(text: string): string {
  for (const [docType, keywords] of DOC_TYPE_KEYWORDS) {
    const matchCount = keywords.filter((kw) => text.includes(kw)).length;
    if (matchCount >= 2) return docType;
  }
  return "기타";
}

/**
 * 단일 이미지 파일에서 CLOVA OCR로 텍스트를 추출하고 문서 유형을 분류합니다.
 */
export async function extractImageText(file: File): Promise<OcrResult> {
  const base64 = await fileToBase64(file);
  const format = getOcrFormat(file);

  const response = await callClovaOcr(base64, format, file.name);
  const extractedText = extractClovaText(response);
  const documentType = classifyDocumentType(extractedText);

  return {
    fileName: file.name,
    documentType,
    extractedText: extractedText || "(텍스트를 추출할 수 없습니다)",
  };
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
