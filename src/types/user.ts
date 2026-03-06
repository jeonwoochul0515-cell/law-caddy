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
  // 사업자등록증 OCR 정보
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseUrl?: string;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
}
