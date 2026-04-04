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
  clientPhone?: string;

  // 서명 토큰
  token: string;                 // 고유 서명 URL 토큰
  expiresAt: Timestamp;          // 만료 시각 (24시간)

  // 상태
  status: "pending" | "signed" | "expired";

  // 서명 결과
  signedAt?: Timestamp;
  signatureDataUrl?: string;     // 서명 이미지 Data URL
  signedPdfUrl?: string;         // 서명된 PDF Storage URL

  // 감사 추적 (Audit Trail)
  auditTrail?: {
    sentAt: string;              // ISO 8601 발송 시각
    openedAt?: string;           // 열람 시각
    signedAt?: string;           // 서명 시각
    signerIp?: string;           // 서명자 IP
    signerUserAgent?: string;    // 기기 정보
    documentHashBefore?: string; // 서명 전 해시 (SHA-256)
    documentHashAfter?: string;  // 서명 후 해시
  };

  createdAt: Timestamp;
}

export interface ContractFees {
  retainerAmount: number;                    // 착수금 (VAT 포함)
  successFeeType: "none" | "percent" | "fixed"; // 성과보수 유형
  successFeePercent?: number;                // 비율 (%)
  successFeeAmount?: number;                 // 정액 (원)
  depositAmount?: number;                    // 예치금
  criminalAcquittalAmount?: number;          // 형사 무죄 시 추가 보수
  criminalFineAmount?: number;               // 형사 벌금형 시 추가 보수
  specialTerms?: string;                     // 특약사항
}
