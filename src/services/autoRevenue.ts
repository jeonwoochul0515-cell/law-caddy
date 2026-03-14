// 수임료 입금 시 사건별 매출 자동 인식 서비스
//
// 착수금/분할납부/성공보수/자문료 입금 처리 시
// transactions 컬렉션에 매출(Revenue) 레코드를 자동 생성합니다.

import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { createTransaction } from "./firebase/accounting";
import type {
  RevenueSubType,
  PaymentMethodType,
  VatInfo,
} from "../types/accounting";

/** 수임료 납부 유형 */
export type FeePaymentType = "착수금" | "분할납부" | "성공보수" | "자문료";

/** createRevenueFromFeePayment 파라미터 */
export interface CreateRevenueParams {
  ownerId: string;
  caseId: string;
  feeId: string;
  clientName: string;
  paymentType: FeePaymentType;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: PaymentMethodType;
}

/** paymentType → RevenueSubType 매핑 */
const PAYMENT_TYPE_TO_SUBTYPE: Record<FeePaymentType, RevenueSubType> = {
  "착수금": "수임료_착수금",
  "분할납부": "수임료_잔금",
  "성공보수": "수임료_성공보수",
  "자문료": "자문료",
};

/** paymentType → 적요 설명 */
const PAYMENT_TYPE_DESCRIPTION: Record<FeePaymentType, string> = {
  "착수금": "착수금 입금",
  "분할납부": "분할납부금 입금",
  "성공보수": "성공보수 입금",
  "자문료": "자문료 입금",
};

/** 부가세 계산 (총액에서 공급가액과 부가세 역산) */
function calculateVatFromTotal(totalAmount: number): VatInfo {
  const supplyAmount = Math.round(totalAmount / 1.1);
  const vatAmount = totalAmount - supplyAmount;
  return { supplyAmount, vatAmount, totalAmount };
}

/**
 * 동일한 매출이 이미 등록되어 있는지 확인합니다.
 * caseId + feeId + amount + date 조합으로 중복 검사합니다.
 */
async function isDuplicateRevenue(
  ownerId: string,
  caseId: string,
  feeId: string,
  amount: number,
  date: string,
): Promise<boolean> {
  try {
    const q = query(
      collection(db!, "transactions"),
      where("ownerId", "==", ownerId),
      where("caseId", "==", caseId),
      where("feeId", "==", feeId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.some((docSnap) => {
      const data = docSnap.data();
      return data.vat?.totalAmount === amount && data.date === date;
    });
  } catch {
    // 중복 검사 실패 시 안전하게 false 반환 (매출 생성 허용)
    return false;
  }
}

/**
 * 수임료 입금 시 매출(Transaction) 레코드를 자동 생성합니다.
 *
 * @returns 생성된 거래 ID, 또는 중복인 경우 null
 */
export async function createRevenueFromFeePayment(
  params: CreateRevenueParams,
): Promise<string | null> {
  const {
    ownerId,
    caseId,
    feeId,
    clientName,
    paymentType,
    amount,
    date,
    paymentMethod,
  } = params;

  // 금액이 0 이하면 매출 생성 불필요
  if (amount <= 0) return null;

  // 중복 검사
  const duplicate = await isDuplicateRevenue(ownerId, caseId, feeId, amount, date);
  if (duplicate) return null;

  const subType = PAYMENT_TYPE_TO_SUBTYPE[paymentType];
  const description = `${clientName} - ${PAYMENT_TYPE_DESCRIPTION[paymentType]}`;
  const vat = calculateVatFromTotal(amount);

  const transactionId = await createTransaction({
    ownerId,
    type: "매출",
    subType,
    description,
    caseId,
    feeId,
    clientName,
    vat,
    date,
    paymentMethod,
    evidenceType: "없음",
    attachments: [],
    confirmed: false,
  });

  return transactionId;
}
