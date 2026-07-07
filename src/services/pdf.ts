// PDF 텍스트 추출 서비스
// 1차: pdfjs-dist 텍스트 레이어 추출
// 2차: 텍스트 없으면 페이지별 이미지 렌더링 → CLOVA OCR

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import * as Sentry from "@sentry/react";
import { callClovaOcr, extractClovaText } from "./clova-ocr";

// PDF.js 워커 설정 (Vite 호환)
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;
/** 전체 파일 합산 최대 문자 수 */
const MAX_TOTAL_CHARS = 30_000;
/** OCR 시 최대 페이지 수 (비용 절감) */
const MAX_OCR_PAGES = 10;
/** 텍스트 레이어가 "비어있다"고 판단하는 최소 글자 수 */
const MIN_TEXT_THRESHOLD = 50;

/**
 * PDF 페이지 1개를 canvas에 렌더링하여 base64 JPEG로 변환
 */
async function renderPageToBase64(
  pdfDoc: Awaited<ReturnType<typeof getDocument>["promise"]>,
  pageNum: number,
): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context 생성 실패");

  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl.split(",")[1];
}

/**
 * 단일 페이지 이미지를 CLOVA OCR로 텍스트 추출
 */
async function ocrSinglePage(base64: string, pageNum: number): Promise<string> {
  console.log(`[PDF OCR] ${pageNum}페이지 CLOVA OCR 중...`);
  const response = await callClovaOcr(base64, "jpg");
  return extractClovaText(response);
}

/**
 * 스캔 PDF의 페이지들을 순차 OCR 처리 (CLOVA 1 TPS 제한 준수)
 */
async function ocrPdfPages(
  pdfDoc: Awaited<ReturnType<typeof getDocument>["promise"]>,
  maxPages: number,
): Promise<string> {
  const totalPages = pdfDoc.numPages;
  const pagesToProcess = Math.min(totalPages, maxPages);

  // 1. 모든 페이지를 먼저 이미지로 렌더링
  console.log(`[PDF OCR] ${pagesToProcess}페이지 이미지 렌더링 중...`);
  const pageImages: Array<{ pageNum: number; base64: string }> = [];
  for (let i = 1; i <= pagesToProcess; i++) {
    try {
      const base64 = await renderPageToBase64(pdfDoc, i);
      pageImages.push({ pageNum: i, base64 });
    } catch (err) {
      console.warn(`[PDF OCR] ${i}페이지 렌더링 실패:`, err);
    }
  }

  // 2. 순차 OCR (CLOVA 1 TPS 제한)
  console.log(`[PDF OCR] ${pageImages.length}페이지 CLOVA OCR 순차 처리 시작...`);
  const results: Array<{ pageNum: number; text: string }> = [];

  for (const { pageNum, base64 } of pageImages) {
    try {
      const text = await ocrSinglePage(base64, pageNum);
      results.push({ pageNum, text });
    } catch (err) {
      console.warn(`[PDF OCR] ${pageNum}페이지 OCR 실패:`, err);
    }
  }

  // 3. 페이지 순서대로 정렬
  results.sort((a, b) => a.pageNum - b.pageNum);
  let result = results.map((r) => r.text).join("\n\n");

  if (totalPages > pagesToProcess) {
    result += `\n\n... (총 ${totalPages}페이지 중 ${pagesToProcess}페이지까지 OCR 처리)`;
  }

  return result;
}

/** 추출 결과 (OCR 사용 여부 포함) */
export interface PdfExtractResult {
  text: string;
  usedOcr: boolean;
  fileName: string;
}

/**
 * 단일 PDF 파일에서 텍스트를 추출합니다.
 * 1차: pdfjs-dist 텍스트 레이어
 * 2차: 텍스트가 부족하면 CLOVA OCR 폴백
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc;
  try {
    pdfDoc = await getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    // 암호화·DRM PDF 명시 감지 — 호출부(useCaseDetail)가 메시지의 "drm"으로 drm_blocked 판정
    if (err instanceof Error && (err.name === "PasswordException" || /password|encrypt/i.test(err.message))) {
      throw new Error(`DRM/암호화된 PDF입니다 (drm): ${file.name}`);
    }
    throw err;
  }
  const totalPages = pdfDoc.numPages;

  // 1차: 텍스트 레이어 추출 시도
  const pages: string[] = [];
  let charCount = 0;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");

    if (charCount + pageText.length > MAX_CHARS_PER_FILE) {
      pages.push(
        `\n... (이하 생략, 총 ${totalPages}페이지 중 ${i - 1}페이지까지 표시)`,
      );
      break;
    }
    pages.push(pageText);
    charCount += pageText.length;
  }

  const textResult = pages.join("\n").trim();

  // 텍스트가 충분하면 반환 (OCR 미사용)
  if (textResult.length >= MIN_TEXT_THRESHOLD) {
    console.log(`[PDF] ${file.name}: 텍스트 레이어 추출 성공 (${textResult.length}자)`);
    return { text: textResult, usedOcr: false, fileName: file.name };
  }

  // 2차: 스캔 PDF — CLOVA OCR 폴백
  console.log(`[PDF] ${file.name}: 텍스트 레이어 부족 (${textResult.length}자), CLOVA OCR 폴백 실행`);

  try {
    const ocrText = await ocrPdfPages(pdfDoc, MAX_OCR_PAGES);
    console.log(`[PDF] ${file.name}: CLOVA OCR 성공 (${ocrText.length}자)`);
    return { text: ocrText, usedOcr: true, fileName: file.name };
  } catch (err) {
    Sentry.captureException(err);
    console.error(`[PDF] ${file.name} OCR 폴백 실패:`, err);
    return { text: textResult || `(PDF 텍스트 추출 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"})`, usedOcr: false, fileName: file.name };
  }
}

/** 전체 PDF 추출 결과 */
export interface AllPdfExtractResult {
  text: string;
  ocrTexts: Array<{ fileName: string; text: string }>;
}

/**
 * 여러 PDF 파일에서 텍스트를 추출합니다.
 * OCR을 사용한 파일 목록도 함께 반환합니다.
 */
export async function extractAllPdfTexts(files: File[]): Promise<AllPdfExtractResult> {
  const results: string[] = [];
  const ocrTexts: Array<{ fileName: string; text: string }> = [];
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      results.push(
        `\n... (추가 파일 ${files.length - results.length}개 생략)`,
      );
      break;
    }

    try {
      const result = await extractPdfText(file);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const truncated = result.text.length > remaining ? result.text.slice(0, remaining) + "\n... (파일 내용 일부 생략)" : result.text;
      results.push(`[파일: ${file.name}]\n${truncated}`);
      totalChars += truncated.length;

      // OCR 사용한 파일만 별도 기록
      if (result.usedOcr) {
        ocrTexts.push({ fileName: result.fileName, text: result.text });
      }
    } catch (err) {
      console.warn(`[PDF] ${file.name} 텍스트 추출 실패:`, err);
      results.push(`[파일: ${file.name}]\n(텍스트 추출 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"})`);
    }
  }

  return { text: results.join("\n\n---\n\n"), ocrTexts };
}
