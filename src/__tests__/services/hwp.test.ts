// HWP 5.0 바이너리 파서 테스트 — CFB + deflate로 합성한 HWP 파일 픽스처 사용
import { describe, it, expect } from "vitest";
import { CFB } from "xlsx";
import { deflateSync } from "fflate";
import { parseHwpBinary } from "../../services/hwp";

/** UTF-16LE wchar 배열을 바이트로 인코딩합니다. */
function encodeWchars(codes: number[]): Uint8Array {
  const out = new Uint8Array(codes.length * 2);
  const view = new DataView(out.buffer);
  codes.forEach((c, i) => view.setUint16(i * 2, c, true));
  return out;
}

/** 문자열을 wchar 코드 배열로 변환합니다. */
function toCodes(text: string): number[] {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}

/** HWP 레코드(태그 + 페이로드)를 만듭니다. */
function makeRecord(tag: number, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(4);
  // tag(10bit) | level(10bit)=0 | size(12bit)
  new DataView(header.buffer).setUint32(0, (payload.byteLength << 20) | tag, true);
  const out = new Uint8Array(4 + payload.byteLength);
  out.set(header, 0);
  out.set(payload, 4);
  return out;
}

/** FileHeader 스트림(256바이트)을 만듭니다. */
function makeFileHeader(flags: number): Uint8Array {
  const header = new Uint8Array(256);
  const signature = "HWP Document File";
  for (let i = 0; i < signature.length; i++) header[i] = signature.charCodeAt(i);
  new DataView(header.buffer).setUint32(36, flags, true);
  return header;
}

/** 합성 HWP 파일을 만듭니다. */
function makeHwpFile(paraTexts: number[][], { compressed = true, encrypted = false } = {}): Uint8Array {
  const records: Uint8Array[] = [];
  for (const codes of paraTexts) {
    records.push(makeRecord(67, encodeWchars(codes))); // HWPTAG_PARA_TEXT
  }
  const sectionRaw = new Uint8Array(records.reduce((n, r) => n + r.byteLength, 0));
  let offset = 0;
  for (const r of records) {
    sectionRaw.set(r, offset);
    offset += r.byteLength;
  }

  const section = compressed ? deflateSync(sectionRaw) : sectionRaw;
  const flags = (compressed ? 0x1 : 0) | (encrypted ? 0x2 : 0);

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "/FileHeader", makeFileHeader(flags));
  CFB.utils.cfb_add(cfb, "/BodyText/Section0", section);
  return new Uint8Array(CFB.write(cfb, { type: "array" }) as ArrayLike<number>);
}

describe("parseHwpBinary", () => {
  it("압축된 HWP에서 한국어 본문을 추출한다", () => {
    const hwp = makeHwpFile([
      [...toCodes("안녕하세요 Law-Caddy 소장입니다."), 13],
      [...toCodes("청구취지: 피고는 원고에게 금 1,000만원을 지급하라."), 13],
    ]);
    const text = parseHwpBinary(hwp);
    expect(text).toContain("안녕하세요 Law-Caddy 소장입니다.");
    expect(text).toContain("청구취지: 피고는 원고에게 금 1,000만원을 지급하라.");
  });

  it("비압축 HWP도 처리한다", () => {
    const hwp = makeHwpFile([[...toCodes("비압축 문서"), 13]], { compressed: false });
    expect(parseHwpBinary(hwp)).toContain("비압축 문서");
  });

  it("인라인·확장 컨트롤(8 wchar)을 건너뛰고 텍스트만 추출한다", () => {
    // 코드 11(그리기 개체 앵커) 뒤 7개 wchar는 컨트롤 데이터 — 텍스트로 새어나오면 안 됨
    const codes = [
      ...toCodes("앞"),
      11, 0x4141, 0x4141, 0x4141, 0x4141, 0x4141, 0x4141, 0x4141,
      ...toCodes("뒤"),
      13,
    ];
    const text = parseHwpBinary(makeHwpFile([codes]));
    expect(text).toContain("앞");
    expect(text).toContain("뒤");
    expect(text).not.toContain("䅁"); // 0x4141이 문자로 새어나오지 않아야 함
  });

  it("탭(9)은 \\t로, 줄바꿈(10·13)은 \\n으로 변환한다", () => {
    const codes = [
      ...toCodes("이름"),
      9, 0, 0, 0, 0, 0, 0, 0, // 탭 인라인 컨트롤(8 wchar)
      ...toCodes("홍길동"),
      13,
    ];
    const text = parseHwpBinary(makeHwpFile([codes]));
    expect(text).toContain("이름\t홍길동");
    expect(text).toContain("\n");
  });

  it("암호화 플래그가 켜진 문서는 거부한다", () => {
    const hwp = makeHwpFile([[...toCodes("비밀"), 13]], { encrypted: true });
    expect(() => parseHwpBinary(hwp)).toThrow(/암호화/);
  });

  it("HWP가 아닌 데이터는 거부한다", () => {
    expect(() => parseHwpBinary(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
