// 버그 리포트 타입 (BugReportButton이 생성, 관리자 페이지에서 조회)
import type { Timestamp } from "firebase/firestore";

export interface BugReport {
  id: string;
  description: string;
  page: string;
  userAgent: string;
  screenSize: string;
  reporterUid: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  createdAt: Timestamp;
  /** open: 미처리, resolved: 처리 완료 */
  status: "open" | "resolved";
}
