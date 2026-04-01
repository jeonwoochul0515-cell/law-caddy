// 법률 문서 후처리 — 플레이스홀더 검출 및 자동 치환

/** 플레이스홀더 경고 */
export interface PlaceholderWarning {
  pattern: string;
  location: string;
  suggestion: string;
}

/** 후처리 결과 */
export interface PostProcessResult {
  /** 정리된 문서 */
  document: string;
  /** 잔존 플레이스홀더 경고 */
  warnings: PlaceholderWarning[];
  /** 자동 치환된 항목 수 */
  replacedCount: number;
}

/** 플레이스홀더 패턴 */
const PLACEHOLDER_PATTERNS = [
  { regex: /【[^】]*입력[^】]*】/g, type: "bracket" },
  { regex: /【[^】]*기재[^】]*】/g, type: "bracket" },
  { regex: /【[^】]*확인[^】]*】/g, type: "bracket" },
  { regex: /\[대표자명 입력 필요\]/g, type: "square" },
  { regex: /\[[^\]]*입력 필요[^\]]*\]/g, type: "square" },
  { regex: /\[[^\]]*확인 필요[^\]]*\]/g, type: "square" },
  { regex: /○{3,}/g, type: "circle" },
];

/**
 * 문서에서 플레이스홀더를 검출하고 가능한 경우 자동 치환합니다.
 * Claude API 호출 없이 정규식 + FactMaster 매칭으로 처리합니다.
 */
export function postProcessDocument(
  document: string,
  factMaster?: {
    parties?: Array<{ role: string; name: string; address?: string }>;
    amounts?: Array<{ label: string; value: number }>;
  },
): PostProcessResult {
  let processed = document;
  const warnings: PlaceholderWarning[] = [];
  let replacedCount = 0;

  // FactMaster로 자동 치환 가능한 것들
  if (factMaster?.parties) {
    for (const party of factMaster.parties) {
      // 【여기에 피고의 정확한 주소를 기재하세요】 같은 패턴
      if (party.address) {
        const addrPattern = new RegExp(`【[^】]*${party.role}[^】]*주소[^】]*】`, "g");
        if (addrPattern.test(processed)) {
          processed = processed.replace(addrPattern, party.address);
          replacedCount++;
        }
      }
      if (party.name) {
        const namePattern = new RegExp(`【[^】]*${party.role}[^】]*이름[^】]*】`, "g");
        if (namePattern.test(processed)) {
          processed = processed.replace(namePattern, party.name);
          replacedCount++;
        }
        // [대표자명 입력 필요] 패턴
        if (party.role === "피고" || party.role === "대표자") {
          processed = processed.replace(/\[대표자명 입력 필요\]/g, party.name);
          replacedCount++;
        }
      }
    }
  }

  // 잔존 플레이스홀더 검출
  for (const { regex, type } of PLACEHOLDER_PATTERNS) {
    const matches = processed.match(regex);
    if (matches) {
      for (const match of matches) {
        // 이미 치환된 것은 건너뛰기
        if (!processed.includes(match)) continue;

        const lineIndex = processed.substring(0, processed.indexOf(match)).split("\n").length;
        warnings.push({
          pattern: match,
          location: `${lineIndex}번째 줄 부근`,
          suggestion: type === "circle"
            ? "구체적인 정보로 대체 필요 (이름, 금액, 날짜 등)"
            : `${match} → 실제 정보로 대체 필요`,
        });
      }
    }
  }

  return { document: processed, warnings, replacedCount };
}
