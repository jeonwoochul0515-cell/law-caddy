# HWP/DOCX 자동 텍스트 추출 리서치

> 현재: HWP/DOCX 업로드 시 "PDF로 변환 후 업로드하세요" 안내만 표시
> 목표: 변환 없이 자동으로 텍스트 추출

---

## 현재 지원 현황

| 형식 | 지원 | 방법 |
|------|------|------|
| PDF | ✅ | pdfjs-dist 텍스트 레이어 + CLOVA OCR 폴백 |
| 이미지 | ✅ | CLOVA OCR |
| Excel | ✅ | xlsx 라이브러리 |
| PPTX | ✅ | JSZip + DOMParser (이미 구현: `src/services/pptx.ts`) |
| **DOCX** | ❌ | "PDF로 변환" 안내 |
| **HWP** | ❌ | "PDF로 변환" 안내 |
| **HWPX** | ❌ | "PDF로 변환" 안내 |

---

## 핵심 발견: 이미 있는 패턴을 재활용 가능

프로젝트에 이미 `pptx.ts`에서 **JSZip + DOMParser로 ZIP 내 XML 텍스트를 추출하는 패턴**이 구현되어 있음.

DOCX와 HWPX도 **ZIP + XML 구조**이므로 동일한 패턴을 그대로 복사해서 XML 태그만 변경하면 됨.

```
PPTX = ZIP { ppt/slides/slide1.xml → <a:t>텍스트</a:t> }     ← 이미 구현됨
DOCX = ZIP { word/document.xml → <w:t>텍스트</w:t> }          ← 같은 패턴
HWPX = ZIP { Contents/section0.xml → <hp:t>텍스트</hp:t> }    ← 같은 패턴
```

---

## 포맷별 해결 방안

### 1. DOCX (쉬움 — 추가 의존성 0개)

DOCX = ZIP 안에 XML. 핵심 텍스트는 `word/document.xml`의 `<w:t>` 태그.

```typescript
// pptx.ts 패턴과 동일
const zip = await JSZip.loadAsync(arrayBuffer);
const xml = await zip.file("word/document.xml")?.async("string");
const doc = new DOMParser().parseFromString(xml, "text/xml");
const textNodes = doc.getElementsByTagNameNS(
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t"
);
```

- 추가 npm 패키지: **없음** (jszip 이미 설치됨)
- 한국어: UTF-8 XML이므로 완벽 지원
- 난이도: **1~2시간** (pptx.ts 복사 수정)

### 2. HWPX (중간 — 추가 의존성 0개)

HWPX = 한컴오피스 2020부터 기본 저장 형식. ZIP + XML (KS X 6101 OWPML 표준).

```typescript
const zip = await JSZip.loadAsync(arrayBuffer);
const xml = await zip.file("Contents/section0.xml")?.async("string");
// <hp:t> 태그에서 텍스트 추출
```

- 추가 npm 패키지: **없음**
- 한국어: 네이티브 지원 (한국 표준)
- 난이도: **3~4시간** (OWPML XML 구조 분석 필요)

### 3. HWP 바이너리 (어려움 — 라이브러리 필요)

HWP = OLE2/CFB 컨테이너 + zlib 압축 레코드 구조. ZIP이 아니라서 JSZip으로 못 열음.

| 라이브러리 | 브라우저 | 상태 | 특징 |
|-----------|---------|------|------|
| **@ohah/hwpjs** | ✅ (WASM) | 활발 (2025) | Rust+WASM, `toMarkdown()`/`toJson()` |
| **kordoc** | Node.js | 활발 (2025) | 정부 프로젝트 5건 검증, HWP/HWPX/PDF |
| hwp.js (hahnlee) | ✅ | 방치 (5년) | 비추천 |

**권장: `@ohah/hwpjs`** (브라우저 WASM)
```typescript
import { HWPDocument } from "@ohah/hwpjs";
const doc = new HWPDocument(uint8Array);
const text = doc.toMarkdown(); // 또는 toJson()
```

### 4. HWP 폴백: CloudConvert API

`@ohah/hwpjs`가 실패하는 경우 외부 API로 변환:

- **CloudConvert**: HWP→TXT 직접 변환 지원
- 무료: 10건/일
- 유료: $8/500분~
- REST API v2, Cloudflare Worker에서 호출 가능

---

## 권장 구현 전략

### 파일 업로드 시 자동 분기

```
파일 업로드
  ├─ .pdf → pdfjs-dist (기존)
  ├─ .xlsx → xlsx (기존)
  ├─ .pptx → pptx.ts JSZip (기존)
  ├─ .docx → docx.ts JSZip + <w:t> 추출 (신규, 의존성 0)
  ├─ .hwpx → hwpx.ts JSZip + <hp:t> 추출 (신규, 의존성 0)
  ├─ .hwp → @ohah/hwpjs WASM (신규, 의존성 1)
  │         └─ 실패 시 CloudConvert API 폴백
  └─ 이미지 → CLOVA OCR (기존)
```

### 구현 우선순위

| 순위 | 포맷 | 방법 | 의존성 | 소요 |
|------|------|------|--------|------|
| **1** | DOCX | JSZip (pptx.ts 패턴 복사) | 0개 | 1~2시간 |
| **2** | HWPX | JSZip (동일 패턴) | 0개 | 3~4시간 |
| **3** | HWP | @ohah/hwpjs (WASM) | 1개 | 반나절 |
| **4** | HWP 폴백 | CloudConvert API | 0개 | 반나절 |

### 신규 파일

```
src/services/docx.ts  — DOCX 텍스트 추출 (JSZip)
src/services/hwpx.ts  — HWPX 텍스트 추출 (JSZip)
src/services/hwp.ts   — HWP 바이너리 텍스트 추출 (@ohah/hwpjs + CloudConvert 폴백)
```

### 기존 파일 수정

```
src/pages/CheckpointPage.tsx — 파일 업로드 분기에 docx/hwpx/hwp 추가
src/components/cases/OpponentDocs.tsx — 동일
```

---

## 비용 영향

| 항목 | 비용 |
|------|------|
| DOCX 추출 | 0원 (브라우저 JSZip) |
| HWPX 추출 | 0원 (브라우저 JSZip) |
| HWP 추출 (WASM) | 0원 (브라우저) |
| HWP 폴백 (CloudConvert) | 10건/일 무료, 이후 $8/500분 |

---

## 참고

- [한컴테크 HWPX 포맷 구조](https://tech.hancom.com/hwpxformat/)
- [@ohah/hwpjs (GitHub)](https://github.com/ohah/hwpjs) — Rust+WASM HWP 파서
- [kordoc (GitHub)](https://github.com/chrisryugj/kordoc) — Node.js HWP/HWPX/PDF
- [CloudConvert HWP API](https://cloudconvert.com/hwp-converter)
- mammoth.js — DOCX용이지만 2.17MB로 무거움, JSZip 직접 파싱이 더 경량
