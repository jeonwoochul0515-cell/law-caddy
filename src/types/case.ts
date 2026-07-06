import type { Timestamp } from "firebase/firestore";

export type CaseType = "민사" | "형사" | "가사" | "행정" | "노동" | "부동산" | "채권·채무" | "손해배상" | "기타";

/** 결제 수단 */
export type PaymentMethod = "카드" | "현금" | "계좌이체";

/**
 * 계약/수임료 상태 (간이 버전 — Case 문서 내 임베딩용)
 * 상세 수임료 관리는 fees 컬렉션 참조 → src/types/accounting.ts
 */
export interface ContractPayment {
  contractSigned: boolean;          // 계약 체결 유무
  retainerPaid: boolean;            // 착수금 입금 유무
  retainerAmount?: number;          // 착수금 금액 (원)
  retainerDate?: string;            // 착수금 입금일 (YYYY-MM-DD)
  retainerMethod?: PaymentMethod;   // 결제 수단
  receiptIssued?: boolean;          // 계산서 발행 여부 (현금일 때)
  successFeeAgreed: boolean;        // 성공보수 약정 유무
  successFeeType?: "percent" | "fixed"; // 성공보수 유형 (%, 정액)
  successFeePercent?: number;       // 성공보수 비율 (%)
  successFeeAmount?: number;        // 성공보수 금액 (원, 정액일 때)
}

/**
 * 부가비용 항목 (간이 버전 — Case 문서 내 임베딩용)
 * 상세 사건비용 관리는 case_expenses 컬렉션 참조 → src/types/accounting.ts
 */
export interface CostItem {
  id: string;
  description: string;           // 송달료, 인지대 등
  amount: number;                // 금액 (원)
  paid: boolean;                 // 납부 여부
  date: string;                  // ISO date string (YYYY-MM-DD)
}

export interface Case {
  id: string;
  ownerId: string;
  clientName: string;
  caseType: CaseType;
  description: string;
  status: "진행중" | "완료" | "보류";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  timeline: TimelineEvent[];
  contractPayment?: ContractPayment;
  costs?: CostItem[];
}

export interface TimelineEvent {
  type: "consult" | "doc" | "filing" | "response" | "note" | "client_care";
  date: Timestamp;
  label: string;
  detail: string;
}

export interface OpponentDoc {
  id: string;
  caseId: string;
  ownerId: string;
  fileName: string;
  fileUrl: string;
  fileSizeMB: number;
  docLabel: string;
  createdAt: Timestamp;
}
