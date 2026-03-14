// 데모 모드 감지 및 최소한의 목(mock) 데이터
// Firebase 환경변수가 없을 때 앱이 크래시 없이 동작하도록 지원

import type { User } from "../types/user";

/**
 * 데모 모드 여부 (개발 환경에서 VITE_FIREBASE_API_KEY가 없을 때만 true)
 * production 빌드에서는 Firebase API key가 반드시 필요합니다.
 */
export const isDemoMode: boolean =
  import.meta.env.MODE !== "production" && !import.meta.env.VITE_FIREBASE_API_KEY;

/**
 * Firestore Timestamp과 호환되는 목 타임스탬프를 생성합니다.
 * toDate() 메서드를 포함하여 기존 코드에서 Timestamp처럼 사용할 수 있습니다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockTimestamp(date: Date): any {
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime(),
    isEqual: () => false,
    toJSON: () => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }),
  };
}

/**
 * 데모 사용자 (변호사 역할, 승인 완료 상태)
 */
export const DEMO_USER: User = {
  uid: "demo-user-001",
  email: "demo@lawcaddy.kr",
  name: "김변호",
  firmName: "법무법인 데모",
  barLicenseNumber: "12345",
  role: "lawyer",
  status: "approved",
  plan: "pro",
  createdAt: mockTimestamp(new Date("2025-01-15T09:00:00Z")),
};

/**
 * 관리자 페이지 테스트용 승인 대기 사용자 목록
 */
export const DEMO_ADMIN_PENDING_USERS: User[] = [
  {
    uid: "pending-user-001",
    email: "hong@lawfirm.kr",
    name: "홍길동",
    firmName: "법률사무소 정의",
    barLicenseNumber: "67890",
    role: "lawyer",
    status: "pending",
    plan: "free",
    createdAt: mockTimestamp(new Date("2025-09-01T10:00:00Z")),
  },
  {
    uid: "pending-user-002",
    email: "shin@legalgroup.kr",
    name: "신사임당",
    firmName: "법무법인 혜율",
    barLicenseNumber: "11223",
    role: "lawyer",
    status: "pending",
    plan: "free",
    createdAt: mockTimestamp(new Date("2025-09-03T15:30:00Z")),
  },
];
