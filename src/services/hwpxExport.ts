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

/*
 * 공통 XML 네임스페이스 선언 (OWPML / KS X 6101 기반).
 * 실제 한컴오피스 한글이 생성하는 HWPX 파일에서 추출한 네임스페이스를 그대로 사용한다.
 */
const NS_ATTRS = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
].join(" ");

/** 고유 paragraph id 생성 (한글은 랜덤 uint32 사용) */
function paraId(): string {
  return String(Math.floor(Math.random() * 4294967295));
}

/** 마크다운/텍스트 법률 문서를 HWPX로 변환하여 다운로드 */
export async function exportToHwpx(
  content: string,
  meta: HwpxMeta,
): Promise<void> {
  const lines = content.split("\n");

  // --- section0.xml 본문 단락 생성 ---
  const paragraphs: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed === "") {
      // 빈 줄 -> 빈 단락
      paragraphs.push(
        `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:t/>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // # 제목 (H1) -- 18pt bold, center => paraPrIDRef="1" (CENTER), charPrIDRef="2" (1800)
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      const text = escapeXml(trimmed.replace(/^#\s+/, ""));
      paragraphs.push(
        `  <hp:p id="${paraId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="2">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // ## 섹션 제목 (H2) -- 14pt bold => charPrIDRef="3" (1400 bold)
    if (trimmed.startsWith("## ")) {
      const text = escapeXml(trimmed.replace(/^##\s+/, ""));
      paragraphs.push(
        `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="3">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // ### 소제목 (H3) -- 12pt bold => charPrIDRef="4" (1200 bold)
    if (trimmed.startsWith("### ")) {
      const text = escapeXml(trimmed.replace(/^###\s+/, ""));
      paragraphs.push(
        `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="4">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
      );
      continue;
    }

    // 날짜·서명 줄 → 오른쪽 정렬 (실무 서면 관례)
    // ※ 번호 목록 검사보다 먼저 — "2026. 7. 30."이 번호 목록으로 오인되는 것 방지
    //  - 날짜만 있는 줄: "2026. 7. 30." / "2026년 7월 30일"
    //  - 서명 줄: "(인)"·"(서명)"으로 끝나는 줄
    const isDateLine = /^\d{4}\s*[.년]\s*\d{1,2}\s*[.월]\s*\d{1,2}\s*[.일]?\s*$/.test(trimmed);
    const isSignLine = /\((인|서명)\)\s*$/.test(trimmed);
    if (isDateLine || isSignLine) {
      paragraphs.push(
        `  <hp:p id="${paraId()}" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:t>${escapeXml(trimmed)}</hp:t>
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
        `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
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
        `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
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
      `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:t>${text}</hp:t>
    </hp:run>
  </hp:p>`,
    );
  }

  const title = escapeXml(`${meta.docType} - ${meta.clientName}`);
  const now = new Date().toISOString();

  // ============================================================
  // 1. mimetype (ZIP 첫 번째 엔트리, 비압축)
  // ============================================================
  const mimetype = "application/hwp+zip";

  // ============================================================
  // 2. version.xml  --  OWPML HCFVersion (NOT IDPF OPF)
  // ============================================================
  const versionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="12, 0, 0, 1 WIN32LEWindows_10"/>`;

  // ============================================================
  // 3. META-INF/container.xml  --  OCF 컨테이너
  // ============================================================
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;

  // ============================================================
  // 4. META-INF/manifest.xml  --  ODF manifest (빈 항목)
  // ============================================================
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`;

  // ============================================================
  // 5. META-INF/container.rdf  --  패키지 관계 RDF
  // ============================================================
  const containerRdf = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="">
    <ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/>
  </rdf:Description>
  <rdf:Description rdf:about="Contents/header.xml">
    <rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/>
  </rdf:Description>
  <rdf:Description rdf:about="">
    <ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/>
  </rdf:Description>
  <rdf:Description rdf:about="Contents/section0.xml">
    <rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/>
  </rdf:Description>
  <rdf:Description rdf:about="">
    <rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/>
  </rdf:Description>
</rdf:RDF>`;

  // ============================================================
  // 6. Contents/content.hpf  --  OPF 패키지 (IDPF + Hancom 네임스페이스 혼합)
  // ============================================================
  const contentHpf = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package ${NS_ATTRS} version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>${title}</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="LAW-CADDY"/>
    <opf:meta name="subject" content="${escapeXml(meta.docType)}"/>
    <opf:meta name="description" content=""/>
    <opf:meta name="lastsaveby" content="LAW-CADDY"/>
    <opf:meta name="CreatedDate" content="${now}"/>
    <opf:meta name="ModifiedDate" content="${now}"/>
    <opf:meta name="date" content="${now}"/>
    <opf:meta name="keyword" content=""/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="yes"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;

  // ============================================================
  // 7. settings.xml  --  애플리케이션 설정
  // ============================================================
  const settingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`;

  // ============================================================
  // 8. Contents/header.xml  --  문서 서식 정의 (font / charPr / paraPr / style)
  //    A4 용지(59528 x 84186 HWPUNIT), 맑은 고딕, 7개 언어 fontface
  // ============================================================
  const fontFaceLangs = [
    "HANGUL",
    "LATIN",
    "HANJA",
    "JAPANESE",
    "OTHER",
    "SYMBOL",
    "USER",
  ];

  // (2026-07-30) \uC2E4\uC81C \uBC95\uB960\uC0AC\uBB34\uC18C \uC11C\uBA74(\uACE0\uC18C\uC7A5\u00B7\uD56D\uC18C\uC774\uC720\uC11C hwpx)\uC5D0\uC11C \uCD94\uCD9C\uD55C \uC11C\uC2DD\uC73C\uB85C \uAD50\uCCB4.
  // id=0 \uD734\uBA3C\uBA85\uC870(\uBCF8\uBB38\u00B7\uC81C\uBAA9 \u2014 \uC2E4\uBB34 \uD45C\uC900), id=1 \uB9D1\uC740 \uACE0\uB515(\uBCF4\uC870)
  const fontfacesXml = fontFaceLangs
    .map(
      (lang) => `      <hh:fontface lang="${lang}" fontCnt="2">
        <hh:font id="0" face="\uD734\uBA3C\uBA85\uC870" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_MYUNGJO" weight="4" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
        <hh:font id="1" face="\uB9D1\uC740 \uACE0\uB515" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>`,
    )
    .join("\n");

  /* charPr 정의 (실무 서면 실측 기준):
   *  id=0  본문  12pt (height=1200) — 휴먼명조
   *  id=1  보조  10pt
   *  id=2  H1 문서 제목 20pt bold (height=2000)
   *  id=3  H2 섹션 제목 14pt bold (height=1400)
   *  id=4  H3 소제목 12pt bold (height=1200)
   */
  function charPrXml(
    id: number,
    height: number,
    bold: boolean,
    color = "#000000",
  ): string {
    const fontRef =
      '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>';
    const ratio =
      '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>';
    const spacing =
      '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>';
    const relSz =
      '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>';
    const offset =
      '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>';

    return `      <hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"${bold ? ' bold="1"' : ""}>
        ${fontRef}
        ${ratio}
        ${spacing}
        ${relSz}
        ${offset}
        <hh:underline type="NONE" shape="SOLID" color="#000000"/>
        <hh:strikeout shape="NONE" color="#000000"/>
        <hh:outline type="NONE"/>
        <hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>
      </hh:charPr>`;
  }

  /* paraPr 정의 (실무 서면 실측 기준):
   *  id=0  양쪽정렬 (JUSTIFY), 줄간 250%  -- 본문 (법률 서면 표준 줄간격)
   *  id=1  가운데정렬 (CENTER), 줄간 160%  -- 제목용
   *  id=2  오른쪽정렬 (RIGHT), 줄간 250%  -- 날짜·서명용
   */
  function paraPrXml(id: number, align: string, lineSpacing = 250): string {
    return `      <hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">
        <hh:align horizontal="${align}" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
        <hh:margin>
          <hc:intent value="0" unit="HWPUNIT"/>
          <hc:left value="0" unit="HWPUNIT"/>
          <hc:right value="0" unit="HWPUNIT"/>
          <hc:prev value="0" unit="HWPUNIT"/>
          <hc:next value="0" unit="HWPUNIT"/>
        </hh:margin>
        <hh:lineSpacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/>
        <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;
  }

  const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head ${NS_ATTRS} version="1.5" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="7">
${fontfacesXml}
    </hh:fontfaces>
    <hh:borderFills itemCnt="2">
      <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
      </hh:borderFill>
      <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
        <hc:fillBrush>
          <hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>
        </hc:fillBrush>
      </hh:borderFill>
    </hh:borderFills>
    <hh:charProperties itemCnt="5">
${charPrXml(0, 1200, false)}
${charPrXml(1, 1000, false)}
${charPrXml(2, 2000, true)}
${charPrXml(3, 1400, true)}
${charPrXml(4, 1200, true)}
    </hh:charProperties>
    <hh:tabProperties itemCnt="1">
      <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
    </hh:tabProperties>
    <hh:paraProperties itemCnt="3">
${paraPrXml(0, "JUSTIFY", 250)}
${paraPrXml(1, "CENTER", 160)}
${paraPrXml(2, "RIGHT", 250)}
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="\uBC14\uD0D5\uAE00" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
  <hh:compatibleDocument targetProgram="HWP201X">
    <hh:layoutCompatibility/>
  </hh:compatibleDocument>
  <hh:docOption>
    <hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/>
  </hh:docOption>
</hh:head>`;

  // ============================================================
  // 9. Contents/section0.xml  --  본문
  //    첫 번째 단락에 secPr (페이지 설정)을 포함해야 한다.
  //    A4: width=59528  height=84186 (HWPUNIT, 1/7200 inch)
  // ============================================================
  const secPrParagraph = `  <hp:p id="${paraId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY">
          <hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>
    </hp:run>
    <hp:run charPrIDRef="0">
      <hp:t/>
    </hp:run>
  </hp:p>`;

  const section0Xml = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec ${NS_ATTRS}>
${secPrParagraph}
${paragraphs.join("\n")}
</hs:sec>`;

  // ============================================================
  // ZIP 생성
  // ============================================================
  const zip = new JSZip();

  // mimetype 은 반드시 첫 번째 엔트리, 비압축 (STORE)
  zip.file("mimetype", mimetype, { compression: "STORE" });

  // version.xml (루트)
  zip.file("version.xml", versionXml);

  // settings.xml (루트)
  zip.file("settings.xml", settingsXml);

  // META-INF/
  zip.file("META-INF/container.xml", containerXml);
  zip.file("META-INF/manifest.xml", manifestXml);
  zip.file("META-INF/container.rdf", containerRdf);

  // Contents/
  zip.file("Contents/content.hpf", contentHpf);
  zip.file("Contents/header.xml", headerXml);
  zip.file("Contents/section0.xml", section0Xml);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/hwp+zip",
  });
  const filename = `${meta.docType}_${meta.clientName}_${meta.date}.hwpx`;
  saveAs(blob, filename);
}
