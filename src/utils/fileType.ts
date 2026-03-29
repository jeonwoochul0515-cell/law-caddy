/** 파일 유형 분류 유틸리티 */

export type FileCategory =
  | "audio"
  | "pdf"
  | "image"
  | "document"
  | "general";

export interface FileTypeInfo {
  category: FileCategory;
  label: string;
  colorClass: string;
  bgClass: string;
}

const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac", ".flac", ".wma"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
const DOC_EXTS = new Set([".hwp", ".hwpx", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf"]);

function getExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function getFileTypeInfo(fileName: string): FileTypeInfo {
  const ext = getExt(fileName);

  if (AUDIO_EXTS.has(ext)) {
    return { category: "audio", label: "음성 파일", colorClass: "text-amber", bgClass: "bg-amber/10" };
  }
  if (ext === ".pdf") {
    return { category: "pdf", label: "PDF 문서", colorClass: "text-error", bgClass: "bg-error/10" };
  }
  if (IMAGE_EXTS.has(ext)) {
    return { category: "image", label: "이미지", colorClass: "text-info", bgClass: "bg-info/10" };
  }
  if (DOC_EXTS.has(ext)) {
    return { category: "document", label: "문서 파일", colorClass: "text-gold", bgClass: "bg-gold/10" };
  }
  return { category: "general", label: "첨부파일", colorClass: "text-text-dim", bgClass: "bg-white/5" };
}

/** 녹음 파일이 실제 오디오인지 여부 */
export function isAudioFile(fileName: string): boolean {
  return AUDIO_EXTS.has(getExt(fileName));
}

const EXCEL_EXTS = new Set([".xls", ".xlsx"]);
const EXCEL_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** Excel 파일 여부 (File 객체 또는 파일명) */
export function isExcelFile(file: File | string): boolean {
  if (typeof file === "string") return EXCEL_EXTS.has(getExt(file));
  return EXCEL_MIMES.has(file.type) || EXCEL_EXTS.has(getExt(file.name));
}

const PPTX_EXTS = new Set([".pptx"]);
const PPTX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** PPTX 파일 여부 (레거시 .ppt 제외 — 클라이언트 파싱 불가) */
export function isPptxFile(file: File | string): boolean {
  if (typeof file === "string") return PPTX_EXTS.has(getExt(file));
  return PPTX_MIMES.has(file.type) || PPTX_EXTS.has(getExt(file.name));
}

/** 레거시 .ppt 파일 여부 */
export function isLegacyPptFile(file: File | string): boolean {
  const name = typeof file === "string" ? file : file.name;
  return getExt(name) === ".ppt";
}
