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

/** 기일·마감일이 바뀐 이력 한 건 (이전 값은 지우지 않고 여기에 쌓는다) */
export interface DeadlineChange {
  /** 변경 시각 (ISO 8601) */
  changedAt: string;
  /** 이전 마감일 (YYYY-MM-DD) */
  fromDueDate: string;
  /** 새 마감일 (YYYY-MM-DD) */
  toDueDate: string;
  /** 이전 시각·장소 (있을 때만) */
  fromTime?: string;
  fromLocation?: string;
  /** 변경 사유 (예: "법원 직권 변경", "상대방 기일변경신청") */
  reason?: string;
}

export interface CaseDeadline {
  id: string;
  caseId: string;
  ownerId: string;
  title: string;
  /** 마감일 (YYYY-MM-DD) */
  dueDate: string;
  /** 기일 시각 (HH:mm, 선택 — 기일 분류에서 주로 사용) */
  time?: string;
  /** 장소 (예: "301호 법정", 선택) */
  location?: string;
  /** 기산일 설명 (예: "소장 송달일 (2026.03.02)") */
  baseDateLabel?: string;
  /** 법적 근거 (예: "30일 (민사소송법 §256)") */
  rule?: string;
  category: DeadlineCategory;
  /** 처리 완료 여부 — true면 지연·임박 집계와 알림에서 제외 */
  done?: boolean;
  /** 완료 처리한 날짜 (YYYY-MM-DD) */
  doneAt?: string;
  /** 기일·마감일 변경 이력 (오래된 순) */
  history?: DeadlineChange[];
  createdAt: Timestamp;
}

/** 오늘 기준 D-Day 값. 양수 = 기한 경과일, 음수 = 남은 일수 */
export function calcDDay(dueDate: string, now = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

export type DeadlineStatus = "done" | "overdue" | "imminent" | "upcoming" | "comfortable";

/**
 * 마감일까지 남은 기간에 따른 상태.
 * 완료 처리된 기한은 날짜와 무관하게 "done". 경과=지연, 7일 이내=임박, 30일 이내=예정, 그 외=여유
 */
export function calcStatus(dDay: number, done = false): DeadlineStatus {
  if (done) return "done";
  if (dDay > 0) return "overdue";
  if (dDay >= -7) return "imminent";
  if (dDay >= -30) return "upcoming";
  return "comfortable";
}

// ──────────────────────────────────────────────
// 법정 기간 계산 (항소기간 등)
// ──────────────────────────────────────────────

/** 자주 쓰는 법정 기간 한 건 — 기산일에서 며칠 뒤가 마감인지와 근거 조문 */
export interface LegalPeriodPreset {
  key: string;
  label: string;
  /** 기간 (일). 초일불산입이므로 마감일 = 기산일 + days */
  days: number;
  /** 근거 조문 */
  basis: string;
  /** 기산일이 무엇인지 (예: "판결정본 송달일") */
  baseLabel: string;
  category: DeadlineCategory;
}

/**
 * 기본 제공 법정 기간. 기간 계산은 민법 §157(초일불산입)·§161(말일이 토요일·공휴일이면 익일 만료)을
 * 따르고, 민사소송법 §170이 이를 준용한다. 형사는 형사소송법 §66이 같은 취지.
 * 여기 없는 기간은 "직접 입력"으로 일수를 적는다.
 */
export const LEGAL_PERIOD_PRESETS: LegalPeriodPreset[] = [
  { key: "answer", label: "답변서 제출 (30일)", days: 30, basis: "민사소송법 §256 ①", baseLabel: "소장 부본 송달일", category: "서면 제출" },
  { key: "appeal_civil", label: "항소 — 민사 (14일)", days: 14, basis: "민사소송법 §396 ①", baseLabel: "판결정본 송달일", category: "불변기간" },
  { key: "final_appeal_civil", label: "상고 — 민사 (14일)", days: 14, basis: "민사소송법 §425, §396 ①", baseLabel: "판결정본 송달일", category: "불변기간" },
  { key: "immediate_appeal_civil", label: "즉시항고 — 민사 (7일)", days: 7, basis: "민사소송법 §444 ①", baseLabel: "결정·명령 고지일", category: "불변기간" },
  { key: "payment_order_objection", label: "지급명령 이의신청 (14일)", days: 14, basis: "민사소송법 §470 ①", baseLabel: "지급명령 송달일", category: "불변기간" },
  { key: "small_claim_objection", label: "이행권고결정 이의신청 (14일)", days: 14, basis: "소액사건심판법 §5조의4 ①", baseLabel: "이행권고결정 송달일", category: "불변기간" },
  { key: "appeal_criminal", label: "항소 — 형사 (7일)", days: 7, basis: "형사소송법 §358", baseLabel: "판결 선고일", category: "불변기간" },
  { key: "final_appeal_criminal", label: "상고 — 형사 (7일)", days: 7, basis: "형사소송법 §374", baseLabel: "판결 선고일", category: "불변기간" },
  { key: "immediate_appeal_criminal", label: "즉시항고 — 형사 (7일)", days: 7, basis: "형사소송법 §405", baseLabel: "결정 고지일", category: "불변기간" },
  { key: "summary_order", label: "약식명령 정식재판 청구 (7일)", days: 7, basis: "형사소송법 §453 ①", baseLabel: "약식명령 고지일", category: "불변기간" },
  { key: "admin_suit", label: "행정소송 제소기간 (90일)", days: 90, basis: "행정소송법 §20 ①", baseLabel: "처분이 있음을 안 날", category: "법정기간" },
  { key: "admin_appeal", label: "행정심판 청구기간 (90일)", days: 90, basis: "행정심판법 §27 ①", baseLabel: "처분이 있음을 안 날", category: "법정기간" },
];

/** YYYY-MM-DD 문자열을 로컬 자정 Date로 */
function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

/** Date → YYYY-MM-DD (로컬 기준) */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DueDateResult {
  /** 최종 마감일 (YYYY-MM-DD) */
  dueDate: string;
  /** 토·일 보정 전 마감일 — 보정이 없었으면 dueDate와 같다 */
  rawDueDate: string;
  /** 말일이 토·일이라 다음 평일로 넘어갔는지 */
  rolledOver: boolean;
}

/**
 * 기산일 + 기간(일) → 마감일.
 * - 초일불산입: 기산일 다음날을 1일로 세므로 마감일 = 기산일 + days (민법 §157)
 * - 말일이 토요일·일요일이면 다음 평일로 넘긴다 (민법 §161). 공휴일은 여기서 판단하지 않으므로
 *   화면에서 "공휴일이면 그 다음 평일" 안내를 함께 보여 준다.
 */
export function computeDueDate(baseDate: string, days: number): DueDateResult {
  const base = parseYmd(baseDate);
  if (Number.isNaN(base.getTime()) || !Number.isFinite(days)) {
    throw new Error("기산일과 기간(일)을 확인해 주세요.");
  }
  const raw = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const rawDueDate = toYmd(raw);
  const due = new Date(raw);
  while (due.getDay() === 0 || due.getDay() === 6) {
    due.setDate(due.getDate() + 1);
  }
  const dueDate = toYmd(due);
  return { dueDate, rawDueDate, rolledOver: dueDate !== rawDueDate };
}
