// 헤더 알림 벨 데이터 집계 서비스
// 별도 알림 컬렉션 없이 기존 데이터(기한·연체·서명·플랜)에서
// "지금 주의가 필요한 항목"을 실시간으로 계산한다.

import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import type { User } from "../types/user";
import type { CaseDeadline } from "../types/deadline";
import type { SigningRequest } from "../types/signing";
import { calcDDay } from "../types/deadline";
import { getOverdueItems } from "./overdueDetector";

export type NotificationSeverity = "urgent" | "warning" | "info";

export interface NotificationItem {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** 클릭 시 이동할 경로 */
  link: string;
}

/** 기한 임박 판정 기준 (D-7 이내) */
const DEADLINE_WINDOW_DAYS = 7;
/** 서명 완료 알림 유지 기간 (최근 7일) */
const SIGNED_RECENT_MS = 7 * 24 * 60 * 60 * 1000;
/** 플랜 만료 임박 기준 (7일 이내) */
const PLAN_EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** 사건 기한: 지연 + D-7 이내 임박 항목 */
async function getDeadlineNotifications(uid: string): Promise<NotificationItem[]> {
  const snapshot = await getDocs(
    query(collection(db!, "deadlines"), where("ownerId", "==", uid)),
  );
  const items: NotificationItem[] = [];

  for (const docSnap of snapshot.docs) {
    const d = { ...docSnap.data(), id: docSnap.id } as CaseDeadline;
    const dDay = calcDDay(d.dueDate);

    if (dDay > 0) {
      items.push({
        id: `deadline-${d.id}`,
        severity: "urgent",
        title: `기한 지연: ${d.title}`,
        detail: `${dDay}일 경과 (${d.dueDate})`,
        link: `/cases/${d.caseId}`,
      });
    } else if (dDay >= -DEADLINE_WINDOW_DAYS) {
      items.push({
        id: `deadline-${d.id}`,
        severity: "warning",
        title: `기한 임박: ${d.title}`,
        detail: dDay === 0 ? `오늘 마감 (${d.dueDate})` : `D${dDay} (${d.dueDate})`,
        link: `/cases/${d.caseId}`,
      });
    }
  }

  return items;
}

/** 분할납부 연체 항목 */
async function getOverdueNotifications(uid: string): Promise<NotificationItem[]> {
  const overdue = await getOverdueItems(uid);
  return overdue.map((item) => ({
    id: `overdue-${item.installment.id}`,
    severity: "urgent" as const,
    title: `분할납부 연체: ${item.clientName}`,
    detail: `${item.overdueDays}일 연체 · ₩${item.overdueAmount.toLocaleString()}`,
    link: `/cases/${item.caseId}`,
  }));
}

/** 최근 7일 내 서명 완료된 수임계약 */
async function getSignedNotifications(uid: string): Promise<NotificationItem[]> {
  const snapshot = await getDocs(
    query(
      collection(db!, "signing_requests"),
      where("ownerId", "==", uid),
      where("status", "==", "signed"),
    ),
  );
  const now = Date.now();
  const items: NotificationItem[] = [];

  for (const docSnap of snapshot.docs) {
    const req = { ...docSnap.data(), id: docSnap.id } as SigningRequest;
    const signedMs = req.signedAt?.toDate?.().getTime();
    if (!signedMs || now - signedMs > SIGNED_RECENT_MS) continue;

    items.push({
      id: `signed-${req.id}`,
      severity: "info",
      title: `수임계약 서명 완료: ${req.clientName}`,
      detail: req.signedAt!.toDate().toLocaleDateString("ko-KR"),
      link: `/cases/${req.caseId}`,
    });
  }

  return items;
}

/** 플랜 만료 임박/만료 */
function getPlanNotifications(user: User): NotificationItem[] {
  const expiresMs = user.planExpiresAt?.toDate?.().getTime();
  if (!expiresMs) return [];

  const now = Date.now();
  if (expiresMs <= now) {
    return [
      {
        id: "plan-expired",
        severity: "urgent",
        title: "플랜 만료됨",
        detail: "무료 플랜으로 전환되었습니다. 연장 결제가 필요합니다.",
        link: "/settings",
      },
    ];
  }
  if (expiresMs - now <= PLAN_EXPIRY_WINDOW_MS) {
    const daysLeft = Math.ceil((expiresMs - now) / 86_400_000);
    return [
      {
        id: "plan-expiring",
        severity: "warning",
        title: `플랜 만료 D-${daysLeft}`,
        detail: `${new Date(expiresMs).toLocaleDateString("ko-KR")} 만료 예정`,
        link: "/settings",
      },
    ];
  }
  return [];
}

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  urgent: 0,
  warning: 1,
  info: 2,
};

/**
 * 현재 주의가 필요한 알림 목록을 집계합니다. (긴급 → 주의 → 정보 순)
 * 개별 소스 조회 실패는 무시하고 나머지를 반환합니다.
 */
export async function getNotifications(user: User): Promise<NotificationItem[]> {
  const [deadlines, overdue, signed] = await Promise.all([
    getDeadlineNotifications(user.uid).catch(() => []),
    getOverdueNotifications(user.uid).catch(() => []),
    getSignedNotifications(user.uid).catch(() => []),
  ]);

  return [...deadlines, ...overdue, ...signed, ...getPlanNotifications(user)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
