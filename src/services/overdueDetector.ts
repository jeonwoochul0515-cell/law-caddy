// 분할납부 연체 자동 감지 서비스
// 미완납 수임료의 분할납부 스케줄에서 기한 초과 항목을 탐지

import { getOverdueFees, getInstallments } from "./firebase/accounting";
import type { Fee, Installment } from "../types/accounting";

/** 연체 항목 정보 */
export interface OverdueItem {
  fee: Fee;
  installment: Installment;
  overdueDays: number;
  caseId: string;
  clientName: string;
  overdueAmount: number;
  totalRemaining: number;
}

/**
 * 특정 변호사의 연체 분할납부 항목을 조회합니다.
 *
 * 1. 미완납 수임료(status === "미완납") 중 분할납부 사용 건을 조회
 * 2. 각 수임료의 분할납부 스케줄에서 미납 + 기한 초과 항목을 필터링
 * 3. 연체일수 내림차순으로 정렬하여 반환
 *
 * @param ownerId - 변호사 UID
 * @returns 연체 항목 배열 (연체일수 내림차순)
 */
export async function getOverdueItems(ownerId: string): Promise<OverdueItem[]> {
  try {
    // 1. 미완납 수임료 조회
    const fees = await getOverdueFees(ownerId);

    // 분할납부 사용 건만 필터링
    const installmentFees = fees.filter((fee) => fee.useInstallment);

    if (installmentFees.length === 0) {
      return [];
    }

    // 2. 각 수임료의 분할납부 스케줄 조회 (병렬)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueItems: OverdueItem[] = [];

    const installmentResults = await Promise.all(
      installmentFees.map(async (fee) => {
        const installments = await getInstallments(fee.id);
        return { fee, installments };
      }),
    );

    // 3. 미납 + 기한 초과 항목 필터링
    for (const { fee, installments } of installmentResults) {
      for (const installment of installments) {
        // 이미 납부 완료된 건은 제외
        if (installment.paid) continue;

        // 납부 예정일 파싱 (YYYY-MM-DD)
        const dueDate = new Date(installment.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        // 기한 초과 여부 확인
        if (dueDate < today) {
          const diffMs = today.getTime() - dueDate.getTime();
          const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const overdueAmount = installment.amount - installment.paidAmount;

          overdueItems.push({
            fee,
            installment,
            overdueDays,
            caseId: fee.caseId,
            clientName: fee.clientName,
            overdueAmount,
            totalRemaining: fee.totalOutstanding,
          });
        }
      }
    }

    // 4. 연체일수 내림차순 정렬
    overdueItems.sort((a, b) => b.overdueDays - a.overdueDays);

    return overdueItems;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`연체 항목 조회 실패: ${error.message}`);
    }
    throw new Error("연체 항목 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}
