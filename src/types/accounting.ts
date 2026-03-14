/**
 * LAW-CADDY 재무/회계 데이터 모델
 *
 * 1~5인 소형 법률사무소가 회계사무소에 자료를 넘기기 전까지
 * 자체적으로 관리하는 모든 재무/회계 데이터를 위한 타입 정의.
 *
 * Firestore 컬렉션 구조:
 *   fees/{feeId}                        - 수임료 관리
 *   fees/{feeId}/installments/{instId}  - 분할납부 스케줄 (서브컬렉션)
 *   case_expenses/{expenseId}           - 사건비용
 *   transactions/{txId}                 - 매출/매입
 *   office_expenses/{expId}             - 사무소 경비
 *   deposits/{depositId}               - 예수금/보관금
 *   monthly_summary/{yyyy-mm}          - 월별 요약
 *
 * 관계:
 *   fees.caseId        → cases.id
 *   case_expenses.caseId → cases.id
 *   transactions.caseId  → cases.id (선택, 사건 관련 매출일 때)
 *   deposits.caseId      → cases.id (선택)
 *
 * 모든 컬렉션은 ownerId로 변호사(사무소) 데이터 격리.
 * Firestore 보안 규칙: request.auth.uid == resource.data.ownerId
 */

import type { Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────────
// 공통 타입
// ─────────────────────────────────────────────

/** 결제/납부 수단 */
export type PaymentMethodType =
  | "계좌이체"
  | "카드"
  | "현금"
  | "수표"
  | "기타";

/** 증빙 유형 */
export type EvidenceType =
  | "세금계산서"
  | "현금영수증"
  | "카드매출전표"
  | "간이영수증"
  | "거래명세서"
  | "없음";

/** 첨부 파일 (영수증, 계약서 등) */
export interface Attachment {
  fileName: string;           // 원본 파일명
  fileUrl: string;            // Firebase Storage URL
  fileSizeMB: number;
  uploadedAt: Timestamp;
  description?: string;       // "영수증", "수임계약서" 등
}

/** 부가세 정보 */
export interface VatInfo {
  supplyAmount: number;       // 공급가액
  vatAmount: number;          // 부가세액
  totalAmount: number;        // 합계금액 (공급가액 + 부가세)
}

// ─────────────────────────────────────────────
// 1. 수임료 관리 (fees)
// ─────────────────────────────────────────────
// Firestore 경로: fees/{feeId}
// 쿼리 패턴:
//   - where("ownerId", "==", uid) — 내 사건만
//   - where("caseId", "==", caseId) — 특정 사건 수임료
//   - where("status", "==", "미완납") — 미수금 관리

/** 수임 계약 및 수임료 */
export interface Fee {
  id: string;
  caseId: string;             // → cases.id
  ownerId: string;            // 변호사 UID
  clientName: string;         // 의뢰인 이름 (비정규화, 목록 표시용)

  // ── 수임계약 정보 ──
  contract: FeeContract;

  // ── 착수금 ──
  retainer: RetainerInfo;

  // ── 성공보수 ──
  successFee: SuccessFeeInfo;

  // ── 분할납부 ──
  // 분할납부 상세 스케줄은 서브컬렉션 fees/{feeId}/installments/{instId}
  useInstallment: boolean;          // 분할납부 여부
  installmentCount?: number;        // 분할 횟수
  totalInstallmentAmount?: number;  // 분할납부 총액

  // ── 집계 ──
  totalAgreedAmount: number;  // 총 약정 수임료 (착수금 + 잔금 + 성공보수 예상)
  totalPaidAmount: number;    // 실제 입금된 총액
  totalOutstanding: number;   // 미수금 (약정 - 입금)
  status: "완납" | "미완납" | "초과납부" | "면제";

  // ── 증빙 ──
  evidenceType: EvidenceType;       // 발행한 증빙 유형
  evidenceIssued: boolean;          // 증빙 발행 여부
  attachments: Attachment[];        // 수임계약서, 영수증 등

  // ── 메타 ──
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 수임계약 정보 */
export interface FeeContract {
  signed: boolean;                  // 계약 체결 여부
  signedDate?: string;              // 계약 체결일 (YYYY-MM-DD)
  contractFileUrl?: string;         // 수임계약서 파일 URL
  contractType: "서면" | "전자" | "구두";  // 계약 형태
}

/** 착수금 정보 */
export interface RetainerInfo {
  amount: number;                   // 착수금 금액
  paidAmount: number;               // 실제 입금액
  paid: boolean;                    // 완납 여부
  paidDate?: string;                // 입금일 (YYYY-MM-DD)
  paymentMethod?: PaymentMethodType;
  vat?: VatInfo;                    // 부가세 정보 (세금계산서 발행 시)
}

/** 성공보수 정보 */
export interface SuccessFeeInfo {
  agreed: boolean;                  // 성공보수 약정 여부
  type?: "percent" | "fixed" | "tiered";  // 비율형 / 정액형 / 구간별
  percent?: number;                 // 비율 (%)
  fixedAmount?: number;             // 정액 금액
  /** 구간별 성공보수 (예: 1억 이하 10%, 1억 초과 15%) */
  tiers?: Array<{
    threshold: number;              // 기준 금액
    percent: number;                // 해당 구간 비율
  }>;
  condition?: string;               // 성공 조건 (자유 기술)
  status: "미확정" | "청구가능" | "청구완료" | "입금완료" | "해당없음";
  claimedAmount?: number;           // 청구한 성공보수 금액
  paidAmount?: number;              // 입금된 성공보수 금액
  paidDate?: string;
}

/** 분할납부 스케줄 (서브컬렉션: fees/{feeId}/installments/{instId}) */
export interface Installment {
  id: string;
  feeId: string;                    // 부모 문서 ID
  seq: number;                      // 회차 (1, 2, 3...)
  dueDate: string;                  // 납부 예정일 (YYYY-MM-DD)
  amount: number;                   // 납부 예정 금액
  paidAmount: number;               // 실제 납부 금액
  paid: boolean;                    // 납부 완료 여부
  paidDate?: string;                // 실제 납부일
  paymentMethod?: PaymentMethodType;
  overdue: boolean;                 // 연체 여부
  memo?: string;
}

// ─────────────────────────────────────────────
// 2. 사건비용 (case_expenses)
// ─────────────────────────────────────────────
// Firestore 경로: case_expenses/{expenseId}
// 쿼리 패턴:
//   - where("caseId", "==", caseId) — 특정 사건 비용
//   - where("bearer", "==", "의뢰인") + where("reimbursed", "==", false) — 미정산 의뢰인 부담금

/** 사건비용 카테고리 */
export type CaseExpenseCategory =
  | "인지대"          // 법원 인지대
  | "송달료"          // 법원 송달료
  | "감정료"          // 감정인 비용
  | "번역료"          // 번역/통역 비용
  | "출장비"          // 교통비, 숙박비
  | "등기비용"        // 등기 관련
  | "공증비용"        // 공증 관련
  | "탐정조사비"      // 사실조사
  | "복사/출력비"     // 기록열람, 복사
  | "증인여비"        // 증인 출석 비용
  | "보증보험료"      // 가압류/가처분 보증
  | "기타";

/** 비용 부담 주체 */
export type ExpenseBearer = "의뢰인" | "사무소" | "선납후정산";

/** 사건비용 */
export interface CaseExpense {
  id: string;
  caseId: string;             // → cases.id
  ownerId: string;            // 변호사 UID
  clientName: string;         // 비정규화

  category: CaseExpenseCategory;
  description: string;        // 상세 내역 (예: "서울중앙지법 인지대")
  amount: number;             // 금액
  date: string;               // 발생일 (YYYY-MM-DD)

  // ── 부담 구분 ──
  bearer: ExpenseBearer;
  /** 의뢰인 부담인 경우 정산 상태 */
  reimbursed: boolean;              // 의뢰인에게 정산 받았는지
  reimbursedDate?: string;          // 정산 받은 날짜
  reimbursedAmount?: number;        // 정산 받은 금액

  // ── 납부 정보 ──
  paymentMethod: PaymentMethodType;
  paidBy: string;                   // 실제 납부자 이름

  // ── 증빙 ──
  evidenceType: EvidenceType;
  attachments: Attachment[];        // 영수증, 납부확인서 등

  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// 3. 매출/매입 (transactions)
// ─────────────────────────────────────────────
// Firestore 경로: transactions/{txId}
// 쿼리 패턴:
//   - where("ownerId", "==", uid) + where("date", ">=", startOfMonth)
//   - where("type", "==", "매출") + where("evidenceType", "==", "세금계산서")
//   - where("caseId", "==", caseId) — 사건 관련 거래

/** 거래 유형 */
export type TransactionType = "매출" | "매입";

/** 매출 세부 유형 */
export type RevenueSubType =
  | "수임료_착수금"
  | "수임료_잔금"
  | "수임료_성공보수"
  | "자문료"
  | "강의료"
  | "원고료"
  | "기타매출";

/** 매입 세부 유형 */
export type ExpenseSubType =
  | "사무실임대료"
  | "사무용품"
  | "통신비"
  | "도서구입"
  | "교육비"
  | "교통비"
  | "접대비"
  | "광고비"
  | "보험료"
  | "회비"          // 변호사회비 등
  | "인건비"
  | "외주비"
  | "기타매입";

/** 매출/매입 거래 */
export interface Transaction {
  id: string;
  ownerId: string;

  type: TransactionType;            // 매출 / 매입
  subType: RevenueSubType | ExpenseSubType;  // 세부 유형
  description: string;              // 적요

  // ── 사건 연결 (선택) ──
  caseId?: string;                  // 사건 관련 매출일 때
  feeId?: string;                   // 수임료 관련 매출일 때 → fees.id
  clientName?: string;              // 거래 상대방 (의뢰인 또는 거래처)

  // ── 금액 ──
  vat: VatInfo;                     // 공급가액 + 부가세 + 합계
  date: string;                     // 거래일 (YYYY-MM-DD)

  // ── 결제 ──
  paymentMethod: PaymentMethodType;
  bankName?: string;                // 은행명
  accountNumber?: string;           // 계좌번호 (뒤 4자리만 저장 권장)

  // ── 증빙 ──
  evidenceType: EvidenceType;
  /** 세금계산서 정보 */
  taxInvoice?: TaxInvoiceInfo;
  /** 현금영수증 정보 */
  cashReceipt?: CashReceiptInfo;
  /** 카드 매출/매입 전표 정보 */
  cardSlip?: CardSlipInfo;

  attachments: Attachment[];

  // ── 상태 ──
  confirmed: boolean;               // 회계 확인 완료 여부
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 세금계산서 정보 */
export interface TaxInvoiceInfo {
  issueDate: string;                // 발행일
  issueNumber?: string;             // 승인번호
  supplierBizNumber: string;        // 공급자 사업자번호
  buyerBizNumber: string;           // 공급받는자 사업자번호
  electronicIssued: boolean;        // 전자세금계산서 여부
  reportedToNTS: boolean;           // 국세청 전송 여부
}

/** 현금영수증 정보 */
export interface CashReceiptInfo {
  issueDate: string;
  approvalNumber: string;           // 승인번호
  identityType: "소득공제" | "지출증빙";
  identityNumber?: string;          // 휴대폰 또는 사업자번호 (마스킹)
}

/** 카드 매출/매입 전표 정보 */
export interface CardSlipInfo {
  cardCompany: string;              // 카드사
  cardNumberLast4: string;          // 카드번호 뒤 4자리
  approvalNumber: string;           // 승인번호
  approvalDate: string;             // 승인일
  installmentMonths?: number;       // 할부 개월 (0 = 일시불)
}

// ─────────────────────────────────────────────
// 4. 사무소 경비 (office_expenses)
// ─────────────────────────────────────────────
// Firestore 경로: office_expenses/{expId}
// 쿼리 패턴:
//   - where("ownerId", "==", uid) + where("yearMonth", "==", "2026-03")
//   - where("costType", "==", "고정비") — 고정비 파악
//   - where("category", "==", "인건비") — 인건비 조회

/** 사무소 경비 카테고리 */
export type OfficeExpenseCategory =
  | "임대료"
  | "관리비"
  | "공과금_전기"
  | "공과금_수도"
  | "공과금_가스"
  | "통신비_인터넷"
  | "통신비_전화"
  | "사무용품"
  | "도서구입"
  | "소프트웨어"      // 법률DB, 사건관리 등
  | "장비_구입"       // PC, 프린터 등
  | "장비_유지보수"
  | "보험료"          // 전문인배상보험 등
  | "변호사회비"      // 대한변협, 지방변호사회
  | "교육_연수비"
  | "광고_마케팅"
  | "접대비"
  | "차량유지비"
  | "세금_공과"       // 재산세, 자동차세 등 (부가세/소득세 제외)
  | "기타";

/** 인건비 카테고리 (직원이 있는 경우) */
export type PayrollCategory =
  | "급여"
  | "상여금"
  | "퇴직금"
  | "4대보험_사업자부담"
  | "일용직"
  | "프리랜서_외주";

/** 고정비 / 변동비 */
export type CostType = "고정비" | "변동비";

/** 사무소 경비 */
export interface OfficeExpense {
  id: string;
  ownerId: string;

  category: OfficeExpenseCategory | PayrollCategory;
  costType: CostType;
  description: string;              // 상세 적요
  amount: number;
  date: string;                     // 발생일 (YYYY-MM-DD)
  yearMonth: string;                // 귀속 월 (YYYY-MM) — 월별 조회용 인덱스

  // ── 반복 경비 ──
  recurring: boolean;               // 매월 반복 여부
  recurringDay?: number;            // 매월 납부일 (1~31)

  // ── 인건비 상세 (카테고리가 PayrollCategory일 때) ──
  payroll?: PayrollDetail;

  // ── 결제/증빙 ──
  paymentMethod: PaymentMethodType;
  evidenceType: EvidenceType;
  attachments: Attachment[];

  confirmed: boolean;               // 회계 확인
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 인건비 상세 */
export interface PayrollDetail {
  employeeName: string;             // 직원 이름
  employeeType: "정규직" | "계약직" | "일용직" | "프리랜서";
  grossAmount: number;              // 세전 총액
  deductions: {                     // 공제 항목
    incomeTax: number;              // 소득세 원천징수
    localIncomeTax: number;         // 지방소득세
    nationalPension: number;        // 국민연금
    healthInsurance: number;        // 건강보험
    longTermCare: number;           // 장기요양보험
    employmentInsurance: number;    // 고용보험
  };
  netAmount: number;                // 실수령액
  payDate: string;                  // 지급일 (YYYY-MM-DD)
}

// ─────────────────────────────────────────────
// 5. 예수금/보관금 (deposits)
// ─────────────────────────────────────────────
// Firestore 경로: deposits/{depositId}
// 쿼리 패턴:
//   - where("status", "==", "보관중") — 현재 보관 중인 예치금
//   - where("caseId", "==", caseId) — 사건별 예치금

/** 예수금 유형 */
export type DepositType =
  | "의뢰인예치금"      // 의뢰인이 미리 맡긴 비용 (인지대, 송달료 등 대납용)
  | "법원공탁금"        // 법원에 공탁한 금액
  | "보증금"            // 가압류/가처분 보증금
  | "합의금예치"        // 합의금 임시 보관
  | "기타보관금";

/** 예수금 상태 */
export type DepositStatus =
  | "보관중"            // 현재 보관
  | "일부사용"          // 일부 사용됨
  | "전액사용"          // 전액 사용 완료
  | "반환완료"          // 의뢰인에게 반환
  | "공탁중";           // 법원 공탁 상태

/** 예수금/보관금 */
export interface Deposit {
  id: string;
  ownerId: string;
  caseId?: string;                  // → cases.id (선택)
  clientName: string;               // 예치인

  type: DepositType;
  description: string;              // 상세 설명

  // ── 금액 ──
  originalAmount: number;           // 최초 예치 금액
  usedAmount: number;               // 사용된 금액
  remainingAmount: number;          // 잔액 (originalAmount - usedAmount)
  status: DepositStatus;

  // ── 입금 정보 ──
  receivedDate: string;             // 입금일 (YYYY-MM-DD)
  receivedMethod: PaymentMethodType;
  bankName?: string;
  accountNumber?: string;           // 보관 계좌 (뒤 4자리)

  // ── 사용 내역 ──
  // 사용 내역은 배열로 관리 (건수가 적으므로 서브컬렉션 불필요)
  usageHistory: DepositUsage[];

  // ── 반환 정보 ──
  returnedDate?: string;            // 반환일
  returnedAmount?: number;          // 반환 금액
  returnedMethod?: PaymentMethodType;

  // ── 공탁 정보 (법원 공탁일 때) ──
  courtDeposit?: CourtDepositInfo;

  attachments: Attachment[];
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 예수금 사용 내역 */
export interface DepositUsage {
  date: string;                     // 사용일 (YYYY-MM-DD)
  amount: number;                   // 사용 금액
  purpose: string;                  // 용도 (예: "인지대 납부", "송달료 납부")
  caseExpenseId?: string;           // 연결된 사건비용 ID (있을 때)
}

/** 법원 공탁 정보 */
export interface CourtDepositInfo {
  courtName: string;                // 공탁 법원
  depositNumber: string;            // 공탁번호
  depositDate: string;              // 공탁일
  depositReason: string;            // 공탁 사유
  releaseDate?: string;             // 출급일
  releaseAmount?: number;           // 출급 금액
}

// ─────────────────────────────────────────────
// 6. 월별 요약 (monthly_summary)
// ─────────────────────────────────────────────
// Firestore 경로: monthly_summary/{ownerId}_{yyyy-mm}
// 문서 ID 형식: {ownerId}_{YYYY-MM} (예: "abc123_2026-03")
// 쿼리 패턴:
//   - 문서 ID로 직접 조회 (get)
//   - where("ownerId", "==", uid) + orderBy("yearMonth", "desc") — 최근 순

/** 월별 요약 — 회계사무소에 넘길 정리 데이터 */
export interface MonthlySummary {
  id: string;                       // {ownerId}_{YYYY-MM}
  ownerId: string;
  yearMonth: string;                // YYYY-MM (예: "2026-03")

  // ── 매출 요약 ──
  revenue: {
    retainerFees: number;           // 착수금 수입
    balanceFees: number;            // 잔금 수입
    successFees: number;            // 성공보수 수입
    consultingFees: number;         // 자문료
    otherRevenue: number;           // 기타 매출
    totalRevenue: number;           // 매출 합계
  };

  // ── 매입/비용 요약 ──
  expenses: {
    officeRent: number;             // 임대료
    utilities: number;              // 공과금 합계
    communication: number;          // 통신비 합계
    supplies: number;               // 사무용품
    payroll: number;                // 인건비 합계
    insurance: number;              // 보험료
    associationDues: number;        // 변호사회비
    marketing: number;              // 광고/마케팅
    entertainment: number;          // 접대비
    transportation: number;         // 교통비/차량유지비
    education: number;              // 교육/연수비
    otherExpenses: number;          // 기타 비용
    totalExpenses: number;          // 비용 합계
  };

  // ── 사건비용 요약 ──
  caseExpenses: {
    courtFees: number;              // 인지대+송달료
    expertFees: number;             // 감정료+번역료
    travelExpenses: number;         // 출장비
    otherCaseCosts: number;         // 기타 사건비용
    totalCaseCosts: number;         // 합계
    clientBorne: number;            // 의뢰인 부담분
    firmBorne: number;              // 사무소 부담분
    unreimbursed: number;           // 미정산 의뢰인 부담분
  };

  // ── 부가세 관련 ──
  vat: {
    outputVat: number;              // 매출세액 (매출 부가세)
    inputVat: number;               // 매입세액 (매입 부가세)
    netVat: number;                 // 납부/환급 예상 (매출세액 - 매입세액)
  };

  // ── 증빙 현황 ──
  evidence: {
    taxInvoiceIssued: number;       // 발행한 세금계산서 건수
    taxInvoiceReceived: number;     // 수취한 세금계산서 건수
    cashReceiptIssued: number;      // 발행한 현금영수증 건수
    cardSalesCount: number;         // 카드 매출 건수
    cardPurchaseCount: number;      // 카드 매입 건수
    noEvidenceCount: number;        // 증빙 미비 건수
  };

  // ── 예수금 현황 ──
  depositSummary: {
    totalHolding: number;           // 보관 중인 예수금 총액
    receivedThisMonth: number;      // 이번 달 신규 입금
    usedThisMonth: number;          // 이번 달 사용
    returnedThisMonth: number;      // 이번 달 반환
  };

  // ── 미수금 현황 ──
  receivables: {
    totalOutstanding: number;       // 미수 수임료 총액
    overdueAmount: number;          // 연체 금액
    overdueCount: number;           // 연체 건수
  };

  // ── 손익 ──
  profitLoss: {
    grossProfit: number;            // 매출 - 사건비용(사무소부담분)
    operatingProfit: number;        // 매출총이익 - 사무소경비
    netIncome: number;              // 영업이익 (세전, 간이 기준)
  };

  // ── 상태 ──
  status: "작성중" | "확정" | "전달완료";  // 회계사무소 전달 상태
  confirmedAt?: Timestamp;          // 확정일
  sentToAccountant?: boolean;       // 회계사무소 전달 여부
  sentAt?: Timestamp;               // 전달일
  accountantNotes?: string;         // 회계사무소 메모

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─────────────────────────────────────────────
// 7. Firestore 인덱스 권장 목록
// ─────────────────────────────────────────────
/**
 * firestore.indexes.json에 추가해야 할 복합 인덱스:
 *
 * fees:
 *   (ownerId ASC, status ASC, createdAt DESC)
 *   (ownerId ASC, caseId ASC)
 *
 * case_expenses:
 *   (ownerId ASC, caseId ASC, date DESC)
 *   (ownerId ASC, bearer ASC, reimbursed ASC)
 *
 * transactions:
 *   (ownerId ASC, type ASC, date DESC)
 *   (ownerId ASC, yearMonth ASC)        // yearMonth 필드 추가 권장
 *   (ownerId ASC, evidenceType ASC)
 *
 * office_expenses:
 *   (ownerId ASC, yearMonth ASC, category ASC)
 *   (ownerId ASC, costType ASC)
 *
 * deposits:
 *   (ownerId ASC, status ASC)
 *   (ownerId ASC, caseId ASC)
 *
 * monthly_summary:
 *   (ownerId ASC, yearMonth DESC)
 */
