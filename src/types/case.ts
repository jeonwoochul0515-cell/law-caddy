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

/** 심급 */
export type CaseInstance = "1심" | "항소심" | "상고심" | "기타";

export interface Case {
  id: string;
  ownerId: string;
  clientName: string;
  /** 의뢰인 휴대폰 번호 (문자 발송용, 선택) — 첫 발송 때 입력받아 저장 */
  clientPhone?: string;
  caseType: CaseType;
  description: string;
  // ── 사건 실체 정보 (선택 — 소 제기 전 상담 단계에는 없을 수 있음) ──
  /** 법원 사건번호 (예: 2026가단12345) */
  caseNumber?: string;
  /** 관할법원 (예: 부산지방법원) */
  courtName?: string;
  /** 재판부 (예: 민사3단독) */
  courtDivision?: string;
  /** 상대방 당사자 이름 */
  opponentName?: string;
  /** 심급 */
  instance?: CaseInstance;
  // ── 의뢰인 포털 (읽기 전용 공유 링크) ──
  /** 포털 접근 토큰 (32자 hex). 서버(/api/portal)가 이 값으로 사건을 찾는다 */
  portalToken?: string;
  /** 포털 활성 여부 — false면 토큰이 있어도 접근 불가 */
  portalEnabled?: boolean;
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
