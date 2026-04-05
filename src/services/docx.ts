// Word(.docx) 텍스트 추출 서비스
// jszip으로 ZIP 해제 → word/document.xml에서 <w:t> 텍스트 노드 추출

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;

/** jszip 모듈을 동적으로 로드 (코드 스플리팅) */
async function loadJSZip() {
  const mod = await import("jszip");
  return mod.default;
}

/** DOCX 확장자 판별 */
export function isDocxFile(file: File): boolean {
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return ext === ".docx";
}

/**
 * XML 문자열에서 <w:t> 태그 안의 텍스트를 모두 추출합니다.
 * 문단(<w:p>) 경계에서 줄바꿈을 삽입합니다.
 */
function extractTextFromDocumentXml(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  // <w:p> (문단) 단위로 처리하여 줄바꿈 유지
  const paragraphs = doc.getElementsByTagNameNS(
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "p",
  );

  const lines: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const textNodes = paragraphs[i].getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "t",
    );
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

/**
 * 단일 DOCX 파일에서 텍스트를 추출합니다.
 */
export async function extractDocxText(file: File): Promise<string> {
  const JSZip = await loadJSZip();
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // word/document.xml 읽기
  const xmlContent = await zip.file("word/document.xml")?.async("text");
  if (!xmlContent) {
    console.warn(`[DOCX] ${file.name}: word/document.xml 없음`);
    return "";
  }

  let text = extractTextFromDocumentXml(xmlContent);

  // 글자 수 제한
  if (text.length > MAX_CHARS_PER_FILE) {
    text = text.slice(0, MAX_CHARS_PER_FILE) + "\n... (내용 일부 생략)";
  }

  console.log(`[DOCX] ${file.name}: ${text.length}자 추출`);
  return text;
}
