// 한글 HWP 5.0 바이너리(.hwp) 텍스트 추출 서비스
//
// HWP 5.0 = CFB(Compound File Binary) 컨테이너 + raw deflate 압축 스트림 + 레코드 구조.
// 외부 변환 API 없이 브라우저 안에서 처리한다(변호사 문서의 비밀유지 — 파일이 기기 밖으로 나가지 않음).
//
// 파싱 경로:
//   CFB 파싱(xlsx 내장 CFB) → FileHeader에서 압축/암호화 플래그 확인
//   → BodyText/Section{n} 스트림 raw inflate(fflate)
//   → 레코드 순회, HWPTAG_PARA_TEXT(67)의 UTF-16LE 텍스트 추출
//
// 참고: 한글문서파일형식 5.0 공개 명세 (한컴)

import { CFB } from "xlsx";
import { inflateSync } from "fflate";

/** 파일당 최대 문자 수 (hwpx.ts와 동일 정책) */
const MAX_CHARS_PER_FILE = 15_000;

/** HWPTAG_BEGIN(16) + 51 = 문단 텍스트 레코드 */
const HWPTAG_PARA_TEXT = 67;

// 제어문자 분류 (HWP 5.0 명세 §4.2 문단의 텍스트)
// - 확장/인라인 컨트롤은 자신 포함 8개 wchar(16바이트)를 차지한다
const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);
const EIGHT_WCHAR_CONTROLS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
]);

/** CFB 컨테이너에서 스트림 내용을 Uint8Array로 찾아옵니다. */
function findStream(container: unknown, path: string): Uint8Array | null {
  const entry = CFB.find(container, path) as { content?: ArrayLike<number> } | null;
  if (!entry || !entry.content) return null;
  return entry.content instanceof Uint8Array
    ? entry.content
    : new Uint8Array(Array.from(entry.content));
}

/** FileHeader 스트림에서 (압축 여부, 암호화 여부)를 읽습니다. */
function readFileHeaderFlags(header: Uint8Array): { compressed: boolean; encrypted: boolean } {
  // offset 0~31: 시그니처 "HWP Document File", offset 32~35: 버전, offset 36~39: 속성 플래그(LE)
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const flags = view.getUint32(36, true);
  return {
    compressed: (flags & 0x1) !== 0,
    encrypted: (flags & 0x2) !== 0,
  };
}

/** 섹션 스트림의 레코드들을 순회하며 PARA_TEXT의 텍스트를 이어붙입니다. */
function extractTextFromSection(data: Uint8Array, remainingBudget: number): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const parts: string[] = [];
  let collected = 0;
  let pos = 0;

  while (pos + 4 <= data.byteLength && collected < remainingBudget) {
    const header = view.getUint32(pos, true);
    pos += 4;

    const tag = header & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (pos + 4 > data.byteLength) break;
      size = view.getUint32(pos, true);
      pos += 4;
    }
    if (pos + size > data.byteLength) break;

    if (tag === HWPTAG_PARA_TEXT) {
      const wcharCount = Math.floor(size / 2);
      let text = "";
      let i = 0;
      while (i < wcharCount) {
        const code = view.getUint16(pos + i * 2, true);
        if (code === 13 || code === 10) {
          text += "\n";
          i += 1;
        } else if (code === 9) {
          text += "\t";
          i += 8; // 인라인 컨트롤(탭)은 8 wchar 차지
        } else if (EIGHT_WCHAR_CONTROLS.has(code)) {
          i += 8;
        } else if (CHAR_CONTROLS.has(code)) {
          i += 1;
        } else {
          text += String.fromCharCode(code);
          i += 1;
        }
      }
      if (text.trim()) {
        parts.push(text);
        collected += text.length;
      }
    }

    pos += size;
  }

  return parts.join("");
}

/**
 * HWP 5.0 바이너리 버퍼에서 본문 텍스트를 추출합니다.
 * 지원하지 않는 형식(암호화·배포용 문서, 구버전 HWP 3.x 등)이면 Error를 던집니다.
 */
export function parseHwpBinary(bytes: Uint8Array): string {
  const container = CFB.read(bytes, { type: "array" });

  const fileHeader = findStream(container, "/FileHeader");
  if (!fileHeader || fileHeader.byteLength < 40) {
    throw new Error("HWP 5.0 형식이 아닙니다 (FileHeader 없음)");
  }

  const { compressed, encrypted } = readFileHeaderFlags(fileHeader);
  if (encrypted) {
    throw new Error("암호화(배포용)된 HWP 문서는 지원하지 않습니다");
  }

  const sections: string[] = [];
  let total = 0;

  for (let n = 0; total < MAX_CHARS_PER_FILE; n++) {
    const raw = findStream(container, `/BodyText/Section${n}`);
    if (!raw) break;

    const data = compressed ? inflateSync(raw) : raw;
    const text = extractTextFromSection(data, MAX_CHARS_PER_FILE - total);
    if (text) {
      sections.push(text);
      total += text.length;
    }
  }

  if (sections.length === 0) {
    throw new Error("본문 텍스트를 찾지 못했습니다");
  }

  return sections.join("\n").slice(0, MAX_CHARS_PER_FILE);
}
