/**
 * 실비 자동 계산기 — 인지대/송달료
 *
 * 한국 민사소송 등 인지법 기준 인지대 계산 및
 * 송달료 계산 유틸리티.
 */

// ─── 타입 ──────────────────────────────────────────

/** 심급 */
export type CourtLevel = "1심" | "항소심" | "상고심";

/** 인지대 계산 옵션 */
export interface StampFeeOptions {
  /** 심급 (기본: 1심) */
  level: CourtLevel;
  /** 소액사건 여부 (소가 1,000만원 이하 시 자동 적용 가능) */
  isSmallClaim?: boolean;
  /** 전자소송 할인 적용 여부 (기본: true) */
  isElectronic?: boolean;
}

/** 송달료 계산 옵션 */
export interface ServiceFeeOptions {
  /** 심급 (기본: 1심) */
  level?: CourtLevel;
  /** 송달 회분 수 (미지정 시 심급 기본값 사용) */
  rounds?: number;
  /** 1회분 송달료 단가 (기본: 5,200원, 2025년 기준) */
  unitCost?: number;
}

/** 전체 실비 계산 결과 */
export interface CourtFeeResult {
  stampFee: number;
  serviceFee: number;
  total: number;
  breakdown: string;
}

/** 전체 실비 계산 파라미터 */
export interface CourtFeeParams {
  claimAmount: number;
  partyCount: number;
  level: CourtLevel;
  isSmallClaim?: boolean;
  isElectronic?: boolean;
  rounds?: number;
  unitCost?: number;
}

// ─── 상수 ──────────────────────────────────────────

/** 심급별 인지 배수 */
const LEVEL_MULTIPLIER: Record<CourtLevel, number> = {
  "1심": 1,
  "항소심": 1.5,
  "상고심": 2,
};

/** 심급별 기본 송달 회분 수 */
const DEFAULT_ROUNDS: Record<CourtLevel, number> = {
  "1심": 15,
  "항소심": 12,
  "상고심": 8,
};

/** 1회분 송달료 단가 (2025년 기준) */
const DEFAULT_UNIT_COST = 5_200;

/** 소액사건 기준 소가 */
const SMALL_CLAIM_THRESHOLD = 10_000_000;

/** 인지대 최소 금액 */
const MIN_STAMP_FEE = 1_000;

/** 전자소송 할인율 (10%) */
const ELECTRONIC_DISCOUNT_RATE = 0.1;

// ─── 인지대 계산 ───────────────────────────────────

/**
 * 민사소송 등 인지법에 따른 인지대를 계산합니다.
 *
 * 구간별 누진 요율:
 *  - 1,000만원 이하: 소가 x 0.5%
 *  - 1,000만원 초과 ~ 1억원 이하: 50,000 + (소가 - 1,000만) x 0.45%
 *  - 1억원 초과 ~ 10억원 이하: 455,000 + (소가 - 1억) x 0.4%
 *  - 10억원 초과: 4,055,000 + (소가 - 10억) x 0.35%
 *
 * 후처리:
 *  - 심급 배수: 1심 x1, 항소심 x1.5, 상고심 x2
 *  - 소액사건(소가 1,000만원 이하): x0.5
 *  - 전자소송: 10% 할인
 *  - 최소 1,000원
 *  - 100원 미만 절사
 */
export function calculateStampFee(
  claimAmount: number,
  options: StampFeeOptions
): number {
  if (claimAmount <= 0) return 0;

  const { level, isSmallClaim, isElectronic } = options;

  // 기본 인지액 (누진 구간)
  let baseFee: number;

  if (claimAmount <= 10_000_000) {
    baseFee = claimAmount * 0.005;
  } else if (claimAmount <= 100_000_000) {
    baseFee = 50_000 + (claimAmount - 10_000_000) * 0.0045;
  } else if (claimAmount <= 1_000_000_000) {
    baseFee = 455_000 + (claimAmount - 100_000_000) * 0.004;
  } else {
    baseFee = 4_055_000 + (claimAmount - 1_000_000_000) * 0.0035;
  }

  // 심급 배수 적용
  baseFee *= LEVEL_MULTIPLIER[level];

  // 소액사건 감액 (x0.5)
  if (isSmallClaim) {
    baseFee *= 0.5;
  }

  // 전자소송 할인 (10%)
  if (isElectronic) {
    baseFee *= 1 - ELECTRONIC_DISCOUNT_RATE;
  }

  // 최소 인지대
  baseFee = Math.max(baseFee, MIN_STAMP_FEE);

  // 100원 미만 절사
  baseFee = Math.floor(baseFee / 100) * 100;

  return baseFee;
}

// ─── 송달료 계산 ───────────────────────────────────

/**
 * 송달료를 계산합니다.
 *
 * 산식: 당사자 수 x 회분 수 x 1회분 단가
 */
export function calculateServiceFee(
  partyCount: number,
  options?: ServiceFeeOptions
): number {
  if (partyCount <= 0) return 0;

  const level = options?.level ?? "1심";
  const rounds = options?.rounds ?? DEFAULT_ROUNDS[level];
  const unitCost = options?.unitCost ?? DEFAULT_UNIT_COST;

  return partyCount * rounds * unitCost;
}

// ─── 전체 실비 계산 ────────────────────────────────

/**
 * 인지대 + 송달료 합계를 계산하고 내역 문자열을 생성합니다.
 */
export function calculateTotalCourtFees(params: CourtFeeParams): CourtFeeResult {
  const {
    claimAmount,
    partyCount,
    level,
    isSmallClaim,
    isElectronic,
    rounds,
    unitCost,
  } = params;

  const stampFee = calculateStampFee(claimAmount, {
    level,
    isSmallClaim,
    isElectronic,
  });

  const serviceFee = calculateServiceFee(partyCount, {
    level,
    rounds,
    unitCost,
  });

  const total = stampFee + serviceFee;

  // 내역 텍스트 생성
  const effectiveRounds = rounds ?? DEFAULT_ROUNDS[level];
  const effectiveUnitCost = unitCost ?? DEFAULT_UNIT_COST;

  const parts: string[] = [];

  parts.push(`[인지대] 소가 ${formatKoreanWon(claimAmount)} 기준`);
  parts.push(`  심급: ${level} (배수 x${LEVEL_MULTIPLIER[level]})`);
  if (isSmallClaim) parts.push("  소액사건 감액 적용 (x0.5)");
  if (isElectronic) parts.push("  전자소송 할인 적용 (-10%)");
  parts.push(`  인지대: ${formatKoreanWon(stampFee)}`);
  parts.push("");
  parts.push(`[송달료] 당사자 ${partyCount}명 x ${effectiveRounds}회분 x ${formatKoreanWon(effectiveUnitCost)}`);
  parts.push(`  송달료: ${formatKoreanWon(serviceFee)}`);
  parts.push("");
  parts.push(`[합계] ${formatKoreanWon(total)}`);

  return {
    stampFee,
    serviceFee,
    total,
    breakdown: parts.join("\n"),
  };
}

// ─── 유틸 ──────────────────────────────────────────

/** 숫자를 한국 원화 형식 문자열로 변환 */
export function formatKoreanWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 소액사건 기준 소가 반환 */
export function getSmallClaimThreshold(): number {
  return SMALL_CLAIM_THRESHOLD;
}

/** 심급별 기본 송달 회분 수 반환 */
export function getDefaultRounds(level: CourtLevel): number {
  return DEFAULT_ROUNDS[level];
}

/** 기본 송달료 단가 반환 */
export function getDefaultUnitCost(): number {
  return DEFAULT_UNIT_COST;
}
