import JSZip from "jszip";
import { saveAs } from "file-saver";

interface HwpxMeta {
  docType: string;
  clientName: string;
  date: string;
}

/** XML 특수문자 이스케이프 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 마크다운/텍스트 법률 문서를 HWPX로 변환하여 다운로드 */
export async function exportToHwpx(
  content: string,
  meta: HwpxMeta,
): Promise<void> {
  const lines = content.split("\n");

  // section0.xml 본문 생성
  const paragraphs: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed === "") {
      // 빈 줄 → 빈 단락
      paragraphs.push(
        `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0">
      <hp:t></hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // # 제목 (H1) — 18pt bold, center
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      const text = escapeXml(trimmed.replace(/^#\s+/, ""));
      paragraphs.push(
        `  <hp:p paraPrIDRef="1" styleIDRef="0">
    <hp:run charPrIDRef="1">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // ## 섹션 제목 (H2) — 14pt bold, justify
    if (trimmed.startsWith("## ")) {
      const text = escapeXml(trimmed.replace(/^##\s+/, ""));
      paragraphs.push(
        `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="2">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // ### 소제목 (H3) — 14pt bold (같은 charPr 사용)
    if (trimmed.startsWith("### ")) {
      const text = escapeXml(trimmed.replace(/^###\s+/, ""));
      paragraphs.push(
        `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="2">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // 번호 목록 (1. 2. 등)
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const text = escapeXml(`${numberedMatch[1]}. ${numberedMatch[2]}`);
      paragraphs.push(
        `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0">
      <hp:t>  ${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // 글머리 기호 (- 또는 *)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const text = escapeXml(trimmed.replace(/^[-*]\s+/, ""));
      paragraphs.push(
        `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0">
      <hp:t>  \u2022 ${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // 일반 본문
    const text = escapeXml(trimmed);
    paragraphs.push(
      `  <hp:p paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
    );
  }

  const title = escapeXml(`${meta.docType} - ${meta.clientName}`);

  // --- XML 파일 내용 ---

  const mimetype = "application/hwp+zip";

  const versionXml = `<?xml version="1.0" encoding="UTF-8"?>
<opf:version xmlns:opf="http://www.idpf.org/2007/opf" major="1" minor="2" micro="0" build-version="20200630"/>`;

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0">
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </rootfiles>
</container>`;

  const contentHpf = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="1.0">
  <opf:metadata>
    <opf:title>${title}</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="LAW-CADDY"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`;

  const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:beginNum page="1" footnote="1" endnote="1"/>
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="HANGUL">
        <hh:font id="0" face="맑은 고딕" type="TTF"/>
      </hh:fontface>
      <hh:fontface lang="LATIN">
        <hh:font id="0" face="맑은 고딕" type="TTF"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties>
      <hh:charPr id="0" height="1100" bold="false" italic="false">
        <hh:fontRef hangul="0" latin="0"/>
      </hh:charPr>
      <hh:charPr id="1" height="1800" bold="true" italic="false">
        <hh:fontRef hangul="0" latin="0"/>
      </hh:charPr>
      <hh:charPr id="2" height="1400" bold="true" italic="false">
        <hh:fontRef hangul="0" latin="0"/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties>
      <hh:paraPr id="0" align="JUSTIFY">
        <hh:spacing line="160" lineType="PERCENT"/>
      </hh:paraPr>
      <hh:paraPr id="1" align="CENTER">
        <hh:spacing line="160" lineType="PERCENT"/>
      </hh:paraPr>
    </hh:paraProperties>
  </hh:refList>
</hh:head>`;

  const section0Xml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
${paragraphs.join("\n")}
</hs:sec>`;

  // --- ZIP 생성 ---
  const zip = new JSZip();

  // mimetype은 압축하지 않음 (STORE)
  zip.file("mimetype", mimetype, { compression: "STORE" });
  zip.file("version.xml", versionXml);
  zip.file("META-INF/container.xml", containerXml);
  zip.file("Contents/content.hpf", contentHpf);
  zip.file("Contents/header.xml", headerXml);
  zip.file("Contents/section0.xml", section0Xml);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/hwp+zip" });
  const filename = `${meta.docType}_${meta.clientName}_${meta.date}.hwpx`;
  saveAs(blob, filename);
}
