// hwpx 내보내기 서식 검증 — 실무 서면(고소장·항소이유서) 실측 스타일과 일치하는지
import { describe, it, expect, vi, beforeAll } from "vitest";
import JSZip from "jszip";

const saveAsMock = vi.fn();
vi.mock("file-saver", () => ({ saveAs: (...args: unknown[]) => saveAsMock(...args) }));

import { exportToHwpx } from "../../services/hwpxExport";

let headerXml = "";
let sectionXml = "";

beforeAll(async () => {
  await exportToHwpx(
    [
      "# 준비서면",
      "",
      "## 1. 기초 사실",
      "원고는 2024. 1. 5. 피고에게 금 50,000,000원을 대여하였습니다.",
      "",
      "2026. 7. 30.",
      "원고 소송대리인 변호사 김창희 (인)",
    ].join("\n"),
    { docType: "준비서면", clientName: "테스트", date: "2026-07-30" },
  );

  const blob = saveAsMock.mock.calls[0][0] as Blob;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  headerXml = await zip.file("Contents/header.xml")!.async("string");
  sectionXml = await zip.file("Contents/section0.xml")!.async("string");
});

describe("hwpx 내보내기 실무 서식", () => {
  it("본문 폰트가 휴먼명조다", () => {
    expect(headerXml).toContain('face="휴먼명조"');
    expect(headerXml).toContain('familyType="FCAT_MYUNGJO"');
  });

  it("본문 12pt·제목 20pt다 (charPr id 0/2)", () => {
    expect(headerXml).toMatch(/<hh:charPr id="0" height="1200"/);
    expect(headerXml).toMatch(/<hh:charPr id="2" height="2000"/);
  });

  it("본문 줄간격이 250%다 (실무 서면 표준)", () => {
    const bodyPara = headerXml.match(/<hh:paraPr id="0"[\s\S]*?<\/hh:paraPr>/)?.[0] ?? "";
    expect(bodyPara).toContain('horizontal="JUSTIFY"');
    expect(bodyPara).toContain('value="250"');
  });

  it("오른쪽 정렬 paraPr(id=2)이 존재한다", () => {
    const rightPara = headerXml.match(/<hh:paraPr id="2"[\s\S]*?<\/hh:paraPr>/)?.[0] ?? "";
    expect(rightPara).toContain('horizontal="RIGHT"');
  });

  it("날짜 줄과 서명 줄이 오른쪽 정렬(paraPrIDRef=2)로 나간다", () => {
    const datePara = sectionXml.match(/<hp:p[^>]*paraPrIDRef="2"[\s\S]*?2026\. 7\. 30\./);
    const signPara = sectionXml.match(/<hp:p[^>]*paraPrIDRef="2"[\s\S]*?\(인\)/);
    expect(datePara).not.toBeNull();
    expect(signPara).not.toBeNull();
  });

  it("일반 본문은 양쪽정렬(paraPrIDRef=0)로 나간다", () => {
    expect(sectionXml).toMatch(/<hp:p[^>]*paraPrIDRef="0"[\s\S]*?대여하였습니다/);
  });

  it("페이지 여백이 실무 서면과 동일하다 (좌우 8504)", () => {
    expect(sectionXml).toContain('left="8504" right="8504"');
  });
});
