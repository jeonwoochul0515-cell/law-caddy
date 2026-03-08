import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

interface DocxMeta {
  docType: string;
  clientName: string;
  date: string;
}

/** 마크다운/텍스트 법률 문서를 DOCX로 변환하여 다운로드 */
export async function exportToDocx(
  content: string,
  meta: DocxMeta,
): Promise<void> {
  const lines = content.split("\n");
  const children: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    // 빈 줄 → 빈 단락 (간격용)
    if (trimmed === "") {
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // # 제목 (H1) — 중앙 정렬, 볼드, 18pt
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 200 },
          children: [
            new TextRun({
              text: trimmed.replace(/^#\s+/, ""),
              bold: true,
              size: 36, // 18pt (half-points)
              font: { name: "맑은 고딕", hint: "eastAsia" },
            }),
          ],
        }),
      );
      continue;
    }

    // ## 섹션 제목 (H2) — 볼드, 14pt
    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: trimmed.replace(/^##\s+/, ""),
              bold: true,
              size: 28, // 14pt
              font: { name: "맑은 고딕", hint: "eastAsia" },
            }),
          ],
        }),
      );
      continue;
    }

    // ### 소제목 (H3) — 볼드, 12pt
    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: trimmed.replace(/^###\s+/, ""),
              bold: true,
              size: 24, // 12pt
              font: { name: "맑은 고딕", hint: "eastAsia" },
            }),
          ],
        }),
      );
      continue;
    }

    // 번호 목록 (1. 2. 등)
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      children.push(
        new Paragraph({
          spacing: { after: 60, line: 360 },
          indent: { left: 400 },
          children: [
            new TextRun({
              text: `${numberedMatch[1]}. ${numberedMatch[2]}`,
              size: 22, // 11pt
              font: { name: "맑은 고딕", hint: "eastAsia" },
            }),
          ],
        }),
      );
      continue;
    }

    // 글머리 기호 (- 또는 *)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      children.push(
        new Paragraph({
          spacing: { after: 60, line: 360 },
          indent: { left: 400 },
          children: [
            new TextRun({
              text: `• ${trimmed.replace(/^[-*]\s+/, "")}`,
              size: 22,
              font: { name: "맑은 고딕", hint: "eastAsia" },
            }),
          ],
        }),
      );
      continue;
    }

    // 일반 본문 — 11pt, 1.5줄 간격
    children.push(
      new Paragraph({
        spacing: { after: 80, line: 360 }, // 360 = 1.5줄 간격 (240 twips = 1줄)
        children: [
          new TextRun({
            text: trimmed,
            size: 22, // 11pt
            font: { name: "맑은 고딕", hint: "eastAsia" },
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "맑은 고딕",
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${meta.docType}_${meta.clientName}_${meta.date}.docx`;
  saveAs(blob, filename);
}
