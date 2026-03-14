/**
 * 사건비용 발생 시 예수금 자동 차감 서비스
 *
 * 의뢰인 부담 또는 선납후정산 비용이 등록되면,
 * 해당 사건의 활성 예수금(보관중/일부사용)에서 FIFO 방식으로 자동 차감합니다.
 * 여러 예수금에 걸쳐 차감(multi-deposit spanning) 지원.
 */

import { getDepositsByCase, updateDeposit } from "./firebase/accounting";
import type { DepositUsage, DepositStatus } from "../types/accounting";

/** 자동 차감 입력 파라미터 */
export interface AutoDeductParams {
  caseId: string;
  ownerId: string;
  expenseId: string;
  amount: number;
  purpose: string;
  date: string;
}

/** 개별 예수금 차감 내역 */
export interface DeductionEntry {
  depositId: string;
  deductedAmount: number;
}

/** 자동 차감 결과 */
export interface AutoDeductResult {
  deducted: boolean;
  /** 총 차감 금액 */
  deductedAmount?: number;
  /** 미충당 잔액 */
  remainingExpense?: number;
  /** 개별 차감 내역 */
  entries?: DeductionEntry[];
}

/**
 * 예수금에서 사건비용을 자동 차감합니다.
 *
 * - 해당 사건의 활성 예수금(보관중 또는 일부사용)을 조회
 * - 가장 오래된 예수금(receivedDate 기준 FIFO)부터 차감
 * - 하나의 예수금으로 부족하면 다음 예수금에서 연속 차감
 * - 차감 후 예수금 상태를 갱신 (일부사용 또는 전액사용)
 *
 * @returns 차감 결과 (차감 여부, 총 차감액, 미충당 잔액, 개별 내역)
 */
export async function autoDeductFromDeposit(
  params: AutoDeductParams,
): Promise<AutoDeductResult> {
  const { caseId, ownerId, expenseId, amount, purpose, date } = params;

  // 0 이하 금액은 차감 불필요
  if (amount <= 0) return { deducted: false };

  // 해당 사건의 예수금 조회
  const allDeposits = await getDepositsByCase(caseId, ownerId);

  // 활성 예수금만 필터 (보관중 또는 일부사용, 잔액 있는 것)
  const activeDeposits = allDeposits.filter(
    (d) => (d.status === "보관중" || d.status === "일부사용") && d.remainingAmount > 0,
  );

  if (activeDeposits.length === 0) {
    return { deducted: false };
  }

  // FIFO: receivedDate 기준 오름차순 정렬
  activeDeposits.sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));

  let remaining = amount;
  let totalDeducted = 0;
  const entries: DeductionEntry[] = [];

  // 여러 예수금에 걸쳐 차감 (multi-deposit spanning)
  for (const deposit of activeDeposits) {
    if (remaining <= 0) break;

    const deductAmount = Math.min(deposit.remainingAmount, remaining);

    const newUsage: DepositUsage = {
      date,
      amount: deductAmount,
      purpose: `${purpose} (자동차감)`,
      caseExpenseId: expenseId,
    };

    const newUsedAmount = deposit.usedAmount + deductAmount;
    const newRemainingAmount = deposit.remainingAmount - deductAmount;

    const newStatus: DepositStatus = newRemainingAmount === 0 ? "전액사용" : "일부사용";

    await updateDeposit(deposit.id, {
      usageHistory: [...deposit.usageHistory, newUsage],
      usedAmount: newUsedAmount,
      remainingAmount: newRemainingAmount,
      status: newStatus,
    });

    remaining -= deductAmount;
    totalDeducted += deductAmount;
    entries.push({ depositId: deposit.id, deductedAmount: deductAmount });
  }

  return {
    deducted: totalDeducted > 0,
    deductedAmount: totalDeducted,
    remainingExpense: remaining,
    entries,
  };
}
