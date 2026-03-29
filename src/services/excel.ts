// Excel 텍스트 추출 서비스
// xlsx(SheetJS) 라이브러리를 사용하여 .xls/.xlsx 파일에서 텍스트를 추출

/** 파일당 최대 문자 수 */
const MAX_CHARS_PER_FILE = 15_000;
/** 전체 파일 합산 최대 문자 수 */
const MAX_TOTAL_CHARS = 30_000;

/** xlsx 모듈을 동적으로 로드 (코드 스플리팅) */
async function loadXLSX() {
  return await import("xlsx");
}

/** 추출 결과 */
export interface ExcelExtractResult {
  text: string;
  fileName: string;
}

/** 전체 Excel 추출 결과 */
export interface AllExcelExtractResult {
  text: string;
}

/**
 * 단일 Excel 파일에서 텍스트를 추출합니다.
 * 시트별로 파이프(|) 구분 테이블 형태로 변환합니다.
 */
export async function extractExcelText(file: File): Promise<ExcelExtractResult> {
  const XLSX = await loadXLSX();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const sheetTexts: string[] = [];
  let charCount = 0;

  for (const sheetName of workbook.SheetNames) {
    if (charCount >= MAX_CHARS_PER_FILE) break;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // 파이프 구분자로 테이블 구조 유지 (법률 재무 문서에 적합)
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: " | ", RS: "\n" });
    if (!csv.trim()) continue;

    const header = `[시트: ${sheetName}]`;
    const remaining = MAX_CHARS_PER_FILE - charCount;
    const truncated = csv.length > remaining
      ? csv.slice(0, remaining) + "\n... (시트 내용 일부 생략)"
      : csv;

    sheetTexts.push(`${header}\n${truncated}`);
    charCount += header.length + 1 + truncated.length;
  }

  const text = sheetTexts.join("\n\n");
  console.log(`[Excel] ${file.name}: ${workbook.SheetNames.length}개 시트, ${text.length}자 추출`);

  return { text, fileName: file.name };
}

/**
 * 여러 Excel 파일에서 텍스트를 추출합니다.
 */
export async function extractAllExcelTexts(files: File[]): Promise<AllExcelExtractResult> {
  const results: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      results.push(`\n... (추가 파일 ${files.length - results.length}개 생략)`);
      break;
    }

    try {
      const result = await extractExcelText(file);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const truncated = result.text.length > remaining
        ? result.text.slice(0, remaining) + "\n... (파일 내용 일부 생략)"
        : result.text;
      results.push(`[파일: ${file.name}]\n${truncated}`);
      totalChars += truncated.length;
    } catch (err) {
      console.warn(`[Excel] ${file.name} 텍스트 추출 실패:`, err);
      results.push(`[파일: ${file.name}]\n(텍스트 추출 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"})`);
    }
  }

  return { text: results.join("\n\n---\n\n") };
}
