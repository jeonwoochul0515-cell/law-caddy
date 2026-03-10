// PDF 텍스트 추출 서비스
// pdfjs-dist를 사용하여 브라우저에서 PDF 파일의 텍스트를 추출

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// PDF.js 워커 설정 (Vite 호환)
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;
/** 전체 파일 합산 최대 문자 수 */
const MAX_TOTAL_CHARS = 30_000;

/**
 * 단일 PDF 파일에서 텍스트를 추출합니다.
 * 페이지 단위로 추출하며, MAX_CHARS_PER_FILE 초과 시 중단합니다.
 */
export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages: string[] = [];
  let charCount = 0;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
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

  return pages.join("\n");
}

/**
 * 여러 PDF 파일에서 텍스트를 추출합니다.
 * MAX_TOTAL_CHARS 초과 시 나머지 파일을 건너뜁니다.
 */
export async function extractAllPdfTexts(files: File[]): Promise<string> {
  const results: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      results.push(
        `\n... (추가 파일 ${files.length - results.length}개 생략)`,
      );
      break;
    }

    try {
      const text = await extractPdfText(file);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const truncated = text.length > remaining ? text.slice(0, remaining) + "\n... (파일 내용 일부 생략)" : text;
      results.push(`[파일: ${file.name}]\n${truncated}`);
      totalChars += truncated.length;
    } catch (err) {
      console.warn(`[PDF] ${file.name} 텍스트 추출 실패:`, err);
      results.push(`[파일: ${file.name}]\n(텍스트 추출 실패 — 스캔된 이미지 PDF일 수 있습니다)`);
    }
  }

  return results.join("\n\n---\n\n");
}
