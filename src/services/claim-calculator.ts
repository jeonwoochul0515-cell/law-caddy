// 청구취지 자동 계산 서비스
// 서혜안의 FactMaster JSON에서 금액을 추출하여 청구취지 문구 자동 생성

/** FactMaster의 금액 항목 */
export interface FactMasterAmount {
  label: string;
  value: number;
  basis?: string;
}

/** 청구취지 계산 결과 */
export interface ClaimCalculation {
  /** 원금 합계 */
  principal: number;
  /** 소장 부본 송달일까지 이율 (민법 제379조) */
  preLitigationRate: number;
  /** 소장 부본 송달일 다음날부터 이율 (소촉법 제3조) */
  postLitigationRate: number;
  /** 가집행선고 가능 여부 */
  provisionalExecution: boolean;
  /** 가집행선고 근거 */
  provisionalExecutionBasis: string;
  /** 청구취지 컨텍스트 (조필묵에게 전달할 텍스트) */
  contextText: string;
}

/**
 * 사건유형과 금액 정보를 기반으로 청구취지 관련 정보를 계산합니다.
 */
export function calculateClaim(
  caseType: string,
  amounts: FactMasterAmount[],
  docType?: string,
): ClaimCalculation {
  const principal = amounts.reduce((sum, a) => sum + (a.value || 0), 0);

  // 이율 결정
  const isCommercial = ["상사", "매매대금", "어음"].some(k => caseType.includes(k));
  const preLitigationRate = isCommercial ? 6 : 5; // 상사 6%, 민사 5%
  const postLitigationRate = 12; // 소촉법 제3조

  // 가집행선고 판단
  // 금전 지급 청구 → 가집행 가능
  // 확인 청구, 형성 청구(이혼, 사해행위취소 자체) → 가집행 불가
  // 사해행위취소+가액배상 → 가액배상 부분만 가집행 가능
  const monetaryClaims = ["대여금", "매매대금", "손해배상", "부당이득", "임금", "퇴직금", "보증금", "물품대금", "용역대금", "공사대금"];
  const isMonetary = monetaryClaims.some(k => caseType.includes(k) || (docType || "").includes(k));
  const isCancellation = ["사해행위취소", "이혼", "확인"].some(k => caseType.includes(k) || (docType || "").includes(k));

  let provisionalExecution = isMonetary;
  let provisionalExecutionBasis = "민사소송법 제213조 (재산권 청구)";

  if (isCancellation && isMonetary) {
    provisionalExecution = true;
    provisionalExecutionBasis = "민사소송법 제213조 (가액배상 청구 부분에 한하여 가집행 가능)";
  } else if (isCancellation && !isMonetary) {
    provisionalExecution = false;
    provisionalExecutionBasis = "형성의 소에는 가집행선고 불가";
  }

  // 컨텍스트 텍스트 생성
  const lines: string[] = [
    "[청구취지 자동 계산 결과]",
  ];

  if (principal > 0) {
    lines.push(`원금: ${principal.toLocaleString()}원`);
    lines.push(`소장 부본 송달일까지: 연 ${preLitigationRate}% (${isCommercial ? "상법 제54조" : "민법 제379조"})`);
    lines.push(`그 다음날부터 다 갚는 날까지: 연 ${postLitigationRate}% (소송촉진 등에 관한 특례법 제3조)`);
  }

  if (provisionalExecution) {
    lines.push(`가집행선고: 가능 (${provisionalExecutionBasis})`);
    lines.push(`→ 청구취지에 "위 판결은 가집행할 수 있다" 반드시 포함`);
  } else {
    lines.push(`가집행선고: 불가 (${provisionalExecutionBasis})`);
  }

  return {
    principal,
    preLitigationRate,
    postLitigationRate,
    provisionalExecution,
    provisionalExecutionBasis,
    contextText: lines.join("\n"),
  };
}
