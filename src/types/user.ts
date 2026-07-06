import type { Timestamp } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  photoURL?: string;
  name: string;
  firmName: string;
  barLicenseNumber: string;
  role: "lawyer" | "admin";
  status: "pending" | "approved" | "rejected";
  plan: "free" | "starter" | "pro" | "team";
  /** 유료 플랜 만료일 (단건 결제 기반 — 없으면 만료 없음: 관리자 수동 부여 등) */
  planExpiresAt?: Timestamp;
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  phone?: string;                    // 연락처 (휴대폰)
  privacyConsented?: boolean;         // 개인정보 수집·이용 동의
  privacyConsentedAt?: Timestamp;     // 동의 일시
  officePhone?: string;               // 사무실 전화번호 (선택)
  // 사업자등록증 OCR 정보
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseUrl?: string;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
  businessCorporateNumber?: string;
  businessTaxOffice?: string;
  businessTaxType?: string;
  profileCompleted?: boolean;       // 프로필 설정 완료 여부 (구글 로그인 후)
}
