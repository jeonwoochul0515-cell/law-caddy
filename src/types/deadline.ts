// 사건별 기한(마감일) 데이터 타입 — 일정 탭에서 사용
import type { Timestamp } from "firebase/firestore";

export const DEADLINE_CATEGORIES = [
  "서면 제출",
  "불변기간",
  "기일",
  "법정기간",
  "기타",
] as const;

export type DeadlineCategory = (typeof DEADLINE_CATEGORIES)[number];

export interface CaseDeadline {
  id: string;
  caseId: string;
  ownerId: string;
  title: string;
  /** 마감일 (YYYY-MM-DD) */
  dueDate: string;
  /** 기산일 설명 (예: "소장 송달일 (2026.03.02)") */
  baseDateLabel?: string;
  /** 법적 근거 (예: "30일 (민사소송법 §256)") */
  rule?: string;
  category: DeadlineCategory;
  createdAt: Timestamp;
}

/** 오늘 기준 D-Day 값. 양수 = 기한 경과일, 음수 = 남은 일수 */
export function calcDDay(dueDate: string, now = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

export type DeadlineStatus = "overdue" | "imminent" | "upcoming" | "comfortable";

/** 마감일까지 남은 기간에 따른 상태. 경과=지연, 7일 이내=임박, 30일 이내=예정, 그 외=여유 */
export function calcStatus(dDay: number): DeadlineStatus {
  if (dDay > 0) return "overdue";
  if (dDay >= -7) return "imminent";
  if (dDay >= -30) return "upcoming";
  return "comfortable";
}
