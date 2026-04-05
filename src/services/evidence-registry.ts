// 증거번호-파일 매핑 레지스트리
// 업로드 파일에 자동으로 "갑 제N호증" 부여 + 조필묵 컨텍스트 생성

/** 증거 항목 */
export interface EvidenceItem {
  /** 내부 참조 ID */
  docRefId: string;
  /** 증거번호: "갑 제1호증" */
  evidenceNumber: string;
  /** 원본 파일명 */
  fileName: string;
  /** 증거 설명 (자동 생성 또는 수동 입력) */
  description: string;
  /** 페이지 수 (알 수 있는 경우) */
  pageCount?: number;
}

/**
 * 파일 목록에서 증거 레지스트리를 생성합니다.
 * 갑 제1호증, 갑 제2호증... 순서로 자동 번호 부여.
 */
export function createEvidenceRegistry(
  files: Array<{ name: string; description?: string; pageCount?: number }>,
  side: "갑" | "을" = "갑",
): EvidenceItem[] {
  return files.map((file, index) => ({
    docRefId: `DocRef-${index + 1}`,
    evidenceNumber: `${side} 제${index + 1}호증`,
    fileName: file.name,
    description: file.description ?? guessDescription(file.name),
    pageCount: file.pageCount,
  }));
}

/**
 * 증거 레지스트리를 조필묵(docgen) 프롬프트에 주입할 텍스트로 변환합니다.
 */
export function formatEvidenceForPrompt(items: EvidenceItem[]): string {
  if (items.length === 0) return "";

  const lines = [
    "[증거번호 매핑 (EvidenceRegistry)]",
    "아래는 의뢰인이 제출한 증거 파일과 자동 부여된 증거번호입니다.",
    "본문에서 증거를 인용할 때 반드시 이 번호를 사용하세요.",
    "",
  ];

  for (const item of items) {
    const pageInfo = item.pageCount ? ` (${item.pageCount}쪽)` : "";
    lines.push(`${item.evidenceNumber}: ${item.description}${pageInfo} — ${item.fileName}`);
  }

  lines.push("");
  lines.push("입증방법 섹션에도 위 목록을 그대로 기재하세요.");
  lines.push("본문에서 \"(갑 제1호증)\" 또는 \"(갑 제1호증 3쪽)\" 형태로 인용하세요.");

  return lines.join("\n");
}

/** 파일명에서 증거 설명을 추측 */
function guessDescription(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, ""); // 확장자 제거

  // 일반적인 법률 증거 파일명 패턴 매칭
  const patterns: Array<[RegExp, string]> = [
    [/계약서/i, "계약서"],
    [/내용증명/i, "내용증명"],
    [/등기/i, "등기부등본"],
    [/진단서/i, "진단서"],
    [/영수증/i, "영수증"],
    [/통장|거래내역|이체/i, "금융거래 내역"],
    [/카카오|카톡|문자|메시지/i, "메시지 대화 캡처"],
    [/사진|photo|img/i, "사진"],
    [/결정|가압류|가처분/i, "법원 결정문"],
    [/판결/i, "판결문"],
    [/공문/i, "공문서"],
  ];

  for (const [regex, desc] of patterns) {
    if (regex.test(name)) return desc;
  }

  return name; // 매칭 안 되면 파일명 그대로
}
