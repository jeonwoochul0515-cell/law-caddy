// PowerPoint(.pptx) 텍스트 추출 서비스
// jszip으로 ZIP 해제 → slide*.xml에서 <a:t> 텍스트 노드 추출

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;
/** 전체 파일 합산 최대 문자 수 */
const MAX_TOTAL_CHARS = 30_000;

/** jszip 모듈을 동적으로 로드 (코드 스플리팅) */
async function loadJSZip() {
  const mod = await import("jszip");
  return mod.default;
}

/** 추출 결과 */
export interface PptxExtractResult {
  text: string;
  fileName: string;
}

/** 전체 PPTX 추출 결과 */
export interface AllPptxExtractResult {
  text: string;
}

/**
 * XML 문자열에서 <a:t> 태그 안의 텍스트를 모두 추출합니다.
 * DOMParser를 사용하여 안전하게 파싱합니다.
 */
function extractTextFromSlideXml(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  // <a:t> 태그는 네임스페이스가 있으므로 getElementsByTagNameNS 사용
  const textNodes = doc.getElementsByTagNameNS(
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "t",
  );

  const texts: string[] = [];
  for (let i = 0; i < textNodes.length; i++) {
    const content = textNodes[i].textContent?.trim();
    if (content) texts.push(content);
  }

  return texts.join(" ");
}

/**
 * 단일 PPTX 파일에서 텍스트를 추출합니다.
 * 슬라이드별로 텍스트를 구분하여 반환합니다.
 */
export async function extractPptxText(file: File): Promise<PptxExtractResult> {
  const JSZip = await loadJSZip();
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // ppt/slides/slide1.xml, slide2.xml, ... 파일 찾기
  const slideEntries: Array<{ num: number; path: string }> = [];
  zip.forEach((path) => {
    const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideEntries.push({ num: parseInt(match[1], 10), path });
    }
  });

  // 슬라이드 번호순 정렬
  slideEntries.sort((a, b) => a.num - b.num);

  const slideTexts: string[] = [];
  let charCount = 0;

  for (const entry of slideEntries) {
    if (charCount >= MAX_CHARS_PER_FILE) break;

    const xmlContent = await zip.file(entry.path)?.async("text");
    if (!xmlContent) continue;

    const slideText = extractTextFromSlideXml(xmlContent);
    if (!slideText) continue;

    const header = `[슬라이드 ${entry.num}]`;
    const remaining = MAX_CHARS_PER_FILE - charCount;
    const truncated = slideText.length > remaining
      ? slideText.slice(0, remaining) + "\n... (슬라이드 내용 일부 생략)"
      : slideText;

    slideTexts.push(`${header}\n${truncated}`);
    charCount += header.length + 1 + truncated.length;
  }

  const text = slideTexts.join("\n\n");
  console.log(`[PPTX] ${file.name}: ${slideEntries.length}개 슬라이드, ${text.length}자 추출`);

  return { text, fileName: file.name };
}

/**
 * 여러 PPTX 파일에서 텍스트를 추출합니다.
 */
export async function extractAllPptxTexts(files: File[]): Promise<AllPptxExtractResult> {
  const results: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      results.push(`\n... (추가 파일 ${files.length - results.length}개 생략)`);
      break;
    }

    try {
      const result = await extractPptxText(file);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const truncated = result.text.length > remaining
        ? result.text.slice(0, remaining) + "\n... (파일 내용 일부 생략)"
        : result.text;
      results.push(`[파일: ${file.name}]\n${truncated}`);
      totalChars += truncated.length;
    } catch (err) {
      console.warn(`[PPTX] ${file.name} 텍스트 추출 실패:`, err);
      results.push(`[파일: ${file.name}]\n(텍스트 추출 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"})`);
    }
  }

  return { text: results.join("\n\n---\n\n") };
}
