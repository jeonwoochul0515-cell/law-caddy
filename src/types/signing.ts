import type { Timestamp } from "firebase/firestore";

export interface SigningRequest {
  id: string;
  caseId: string;
  documentId?: string;           // 연결된 LegalDocument ID
  ownerId: string;               // 변호사 UID

  // 계약서 정보
  contractText: string;          // 계약서 전문 텍스트
  contractPdfUrl?: string;       // Storage에 저장된 PDF URL

  // 의뢰인 정보
  clientName: string;
  /** 의뢰인 휴대폰 (서명 전 본인 확인 — 뒷자리 4자리 대조에 쓴다) */
  clientPhone?: string;

  // 서명 토큰
  token: string;                 // 고유 서명 URL 토큰
  expiresAt: Timestamp;          // 만료 시각 (발급 후 72시간)
  /** 이 요청이 재발급된 것이면 원래 요청 ID */
  reissuedFrom?: string;

  // 상태
  status: "pending" | "signed" | "expired";

  // 서명 결과
  signedAt?: Timestamp;
  signatureDataUrl?: string;     // 서명 이미지 Data URL
  signedPdfUrl?: string;         // 서명된 PDF Storage URL
  /** 서명 화면에서 의뢰인이 고른 동의 항목 (필수 2 + 선택 2) */
  consents?: SigningConsents;

  // 감사 추적 (Audit Trail)
  auditTrail?: {
    sentAt: string;              // ISO 8601 발송 시각
    openedAt?: string;           // 열람 시각
    signedAt?: string;           // 서명 시각
    signerIp?: string;           // 서명자 IP
    signerName?: string;         // 서명 화면에서 의뢰인이 직접 입력한 이름
    verifyMethod?: "phone4" | "none"; // 본인 확인 방식
    signerUserAgent?: string;    // 기기 정보
    documentHashBefore?: string; // 서명 전 해시 (SHA-256)
    documentHashAfter?: string;  // 서명 후 해시
  };

  createdAt: Timestamp;
}

/** 서명 화면 동의 항목 — 필수 2개, 선택 2개 */
export interface SigningConsents {
  contract: boolean;        // 계약 내용 동의 (필수)
  privacy: boolean;         // 개인정보 수집·이용·제3자 제공·고유식별정보 (필수)
  explained: boolean;       // 계약 내용·진행·패소 가능성 설명을 들었음 (필수)
  aiAnalysis: boolean;      // 상담 녹음·AI 분석 활용 (선택)
  education: boolean;       // 비식별 교육자료 활용 (선택)
}

export interface ContractFees {
  retainerAmount: number;                    // 착수금 (원)
  /** 착수금·성과보수에 부가가치세가 포함된 금액인지. 없으면 포함으로 본다 */
  vatIncluded?: boolean;
  successFeeType: "none" | "percent" | "fixed"; // 성과보수 유형
  successFeePercent?: number;                // 비율 (%)
  successFeeAmount?: number;                 // 정액 (원)
  depositAmount?: number;                    // 예치금
  /** 형사 조건부 성과보수 항목들 (무죄, 집행유예, 벌금형, 감형 등) */
  criminalConditions?: { condition: string; amount: number }[];
  specialTerms?: string;                     // 특약사항
}
