// 한글 HWPX(.hwpx) 텍스트 추출 서비스
// jszip으로 ZIP 해제 → Contents/section*.xml에서 텍스트 노드 추출
// HWPX는 한컴오피스 2020부터 기본 저장 형식 (KS X 6101 OWPML 표준)

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;

/** jszip 모듈을 동적으로 로드 (코드 스플리팅) */
async function loadJSZip() {
  const mod = await import("jszip");
  return mod.default;
}

/** HWPX 확장자 판별 */
export function isHwpxFile(file: File): boolean {
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return ext === ".hwpx";
}

/** HWP(바이너리) 확장자 판별 */
export function isHwpFile(file: File): boolean {
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return ext === ".hwp";
}

/**
 * HWPX XML에서 텍스트를 추출합니다.
 * OWPML 네임스페이스의 <hp:t> 또는 <t> 태그에서 텍스트를 읽습니다.
 * 문단(<hp:p>) 경계에서 줄바꿈을 삽입합니다.
 */
function extractTextFromHwpxXml(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  // HWPX는 여러 네임스페이스를 사용할 수 있음
  // hp: = http://www.hancom.co.kr/hwpml/2011/paragraph
  // 또는 네임스페이스 없이 <t> 태그 사용
  const HWPX_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";

  // 먼저 네임스페이스 기반으로 시도
  const paragraphs = doc.getElementsByTagNameNS(HWPX_NS, "p");

  if (paragraphs.length > 0) {
    const lines: string[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const textNodes = paragraphs[i].getElementsByTagNameNS(HWPX_NS, "t");
      const texts: string[] = [];
      for (let j = 0; j < textNodes.length; j++) {
        const content = textNodes[j].textContent;
        if (content) texts.push(content);
      }
      const line = texts.join("");
      if (line.trim()) lines.push(line);
    }
    return lines.join("\n");
  }

  // 네임스페이스 없이 폴백: 모든 <t> 태그에서 텍스트 추출
  const allTags = doc.getElementsByTagName("t");
  const texts: string[] = [];
  for (let i = 0; i < allTags.length; i++) {
    const content = allTags[i].textContent?.trim();
    if (content) texts.push(content);
  }

  if (texts.length > 0) return texts.join(" ");

  // 최종 폴백: XML에서 태그를 제거하고 텍스트만 추출
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 단일 HWPX 파일에서 텍스트를 추출합니다.
 */
export async function extractHwpxText(file: File): Promise<string> {
  const JSZip = await loadJSZip();
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Contents/section0.xml, section1.xml, ... 파일 찾기
  const sectionEntries: Array<{ num: number; path: string }> = [];
  zip.forEach((path) => {
    const match = path.match(/Contents\/section(\d+)\.xml$/i);
    if (match) {
      sectionEntries.push({ num: parseInt(match[1], 10), path });
    }
  });

  // 섹션 번호순 정렬
  sectionEntries.sort((a, b) => a.num - b.num);

  // 섹션이 없으면 다른 경로 시도 (Contents/content.hpf 등)
  if (sectionEntries.length === 0) {
    // 모든 XML 파일에서 텍스트 추출 시도
    const allTexts: string[] = [];
    const xmlFiles: string[] = [];
    zip.forEach((path) => {
      if (path.endsWith(".xml") && path.startsWith("Contents/")) {
        xmlFiles.push(path);
      }
    });

    for (const path of xmlFiles) {
      const content = await zip.file(path)?.async("text");
      if (content) {
        const text = extractTextFromHwpxXml(content);
        if (text.trim()) allTexts.push(text);
      }
    }

    const result = allTexts.join("\n\n");
    console.log(`[HWPX] ${file.name}: XML ${xmlFiles.length}개에서 ${result.length}자 추출`);
    return result.slice(0, MAX_CHARS_PER_FILE);
  }

  const sectionTexts: string[] = [];
  let charCount = 0;

  for (const entry of sectionEntries) {
    if (charCount >= MAX_CHARS_PER_FILE) break;

    const xmlContent = await zip.file(entry.path)?.async("text");
    if (!xmlContent) continue;

    const sectionText = extractTextFromHwpxXml(xmlContent);
    if (!sectionText) continue;

    const remaining = MAX_CHARS_PER_FILE - charCount;
    const truncated = sectionText.length > remaining
      ? sectionText.slice(0, remaining) + "\n... (내용 일부 생략)"
      : sectionText;

    sectionTexts.push(truncated);
    charCount += truncated.length;
  }

  const text = sectionTexts.join("\n\n");
  console.log(`[HWPX] ${file.name}: ${sectionEntries.length}개 섹션, ${text.length}자 추출`);
  return text;
}

/**
 * HWP 바이너리 파일에서 텍스트 추출을 시도합니다.
 * @ohah/hwpjs가 설치되어 있으면 사용, 없으면 안내 메시지 반환.
 */
export async function extractHwpText(file: File): Promise<string> {
  // HWPX로 저장된 파일이 .hwp 확장자로 올 수 있으므로 먼저 ZIP 시도
  try {
    const JSZip = await loadJSZip();
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // ZIP으로 열리면 실제로는 HWPX
    let hasSection = false;
    zip.forEach((path) => {
      if (path.startsWith("Contents/")) hasSection = true;
    });

    if (hasSection) {
      console.log(`[HWP] ${file.name}: 실제로는 HWPX 형식 → HWPX 추출기 사용`);
      // File 객체를 다시 만들지 않고 직접 처리
      const sectionTexts: string[] = [];
      const xmlFiles: string[] = [];
      zip.forEach((path) => {
        if (path.match(/Contents\/section\d+\.xml$/i)) xmlFiles.push(path);
      });
      xmlFiles.sort();

      for (const path of xmlFiles) {
        const content = await zip.file(path)?.async("text");
        if (content) {
          const text = extractTextFromHwpxXml(content);
          if (text.trim()) sectionTexts.push(text);
        }
      }

      if (sectionTexts.length > 0) {
        return sectionTexts.join("\n\n").slice(0, MAX_CHARS_PER_FILE);
      }
    }
  } catch {
    // ZIP으로 열 수 없음 → 진짜 HWP 바이너리
  }

  // HWP 바이너리: 현재는 안내 메시지 반환
  // 향후 @ohah/hwpjs WASM 통합 시 여기서 처리
  console.warn(`[HWP] ${file.name}: HWP 바이너리 형식 — 텍스트 추출 제한적`);
  return `[${file.name}] HWP 바이너리 파일입니다. 텍스트 추출을 위해 한글에서 HWPX 또는 PDF로 다시 저장해 주세요. (파일 → 다른 이름으로 저장 → HWPX 또는 PDF)`;
}
