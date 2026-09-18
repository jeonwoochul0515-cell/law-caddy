// 사건기록 PDF의 글자를 끝까지 읽고 "몇 쪽 중 몇 쪽을 읽었는지"를 함께 돌려주는 추출기
//
// src/services/pdf.ts(상담 첨부용)는 파일당 15,000자에서 잘라 버리고 잘린 사실을 문장으로만 남긴다.
// 사건기록은 200쪽짜리도 흔해 그 상한이 곧 "앞부분만 보고 분석 가능이라 표시"하는 사고로 이어졌다(r1-06-10).
// 여기서는 글자 PDF는 저장 한도(Firestore 1MB) 안에서 최대한 읽고, 스캔본은 OCR 쪽수 상한을 두되
// 읽은 쪽수·전체 쪽수·잘림 여부를 숫자로 돌려줘 화면이 사실대로 표시하게 한다.

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { callClovaOcr, extractClovaText } from "./clova-ocr";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/**
 * 저장 가능한 최대 글자 수. Firestore 문서 1MB 한도에서 한글(3바이트) 기준 여유를 둔 값.
 * 200쪽 기록도 대개 이 안에 들어온다.
 */
export const MAX_RECORD_CHARS = 150_000;
/** 스캔본 OCR 최대 쪽수 (CLOVA 1 TPS·비용) */
export const MAX_RECORD_OCR_PAGES = 30;
/** 텍스트 레이어가 "비어 있다"고 보는 최소 글자 수 */
const MIN_TEXT_THRESHOLD = 50;

export interface RecordTextResult {
  text: string;
  usedOcr: boolean;
  pagesTotal: number;
  pagesRead: number;
  truncated: boolean;
}

type PdfDoc = Awaited<ReturnType<typeof getDocument>["promise"]>;

async function renderPageToBase64(pdfDoc: PdfDoc, pageNum: number): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 변환에 실패했습니다.");
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl.split(",")[1];
}

/**
 * PDF 한 개의 글자를 읽는다.
 * 1차 텍스트 레이어(전 쪽, MAX_RECORD_CHARS까지) → 부족하면 2차 CLOVA OCR(MAX_RECORD_OCR_PAGES까지).
 * 암호화·DRM PDF는 메시지에 "drm"을 넣어 던진다 (호출부가 drm_blocked로 분류).
 */
export async function extractRecordText(file: File): Promise<RecordTextResult> {
  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc: PdfDoc;
  try {
    pdfDoc = await getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    if (err instanceof Error && (err.name === "PasswordException" || /password|encrypt/i.test(err.message))) {
      throw new Error(`보안(DRM)·암호가 걸린 PDF입니다 (drm): ${file.name}`);
    }
    throw err;
  }
  const pagesTotal = pdfDoc.numPages;

  // 1차: 텍스트 레이어
  const pages: string[] = [];
  let charCount = 0;
  let pagesRead = 0;
  let truncated = false;
  for (let i = 1; i <= pagesTotal; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    if (charCount + pageText.length > MAX_RECORD_CHARS) {
      truncated = true;
      break;
    }
    pages.push(pageText);
    charCount += pageText.length;
    pagesRead = i;
  }
  const textResult = pages.join("\n").trim();
  if (textResult.length >= MIN_TEXT_THRESHOLD) {
    return { text: textResult, usedOcr: false, pagesTotal, pagesRead, truncated };
  }

  // 2차: 스캔본 — 쪽 단위 OCR
  const ocrPages = Math.min(pagesTotal, MAX_RECORD_OCR_PAGES);
  const results: string[] = [];
  let ocrRead = 0;
  for (let i = 1; i <= ocrPages; i++) {
    const base64 = await renderPageToBase64(pdfDoc, i);
    const response = await callClovaOcr(base64, "jpg");
    results.push(extractClovaText(response));
    ocrRead = i;
  }
  const ocrText = results.join("\n\n").trim();
  if (!ocrText) {
    throw new Error("글자를 읽지 못했습니다. 스캔 상태가 나쁘거나 빈 문서일 수 있습니다.");
  }
  return {
    text: ocrText,
    usedOcr: true,
    pagesTotal,
    pagesRead: ocrRead,
    truncated: ocrRead < pagesTotal,
  };
}
