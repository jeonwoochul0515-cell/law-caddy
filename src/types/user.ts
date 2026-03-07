import type { Timestamp } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  name: string;
  firmName: string;
  barLicenseNumber: string;
  role: "lawyer" | "admin";
  status: "pending" | "approved" | "rejected";
  plan: "free" | "starter" | "pro" | "team";
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  phone?: string;                    // 연락처 (휴대폰)
  privacyConsented?: boolean;         // 개인정보 수집·이용 동의
  privacyConsentedAt?: Timestamp;     // 동의 일시
  // 사업자등록증 OCR 정보
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseUrl?: string;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
}
