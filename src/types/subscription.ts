import type { Timestamp } from "firebase/firestore";

export interface Subscription {
  uid: string;
  planId: "free" | "starter" | "pro" | "team";
  status: "active" | "canceled" | "past_due" | "trialing";
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  canceledAt?: Timestamp;
  billingKey?: string;
  paymentMethod?: string;
}

export interface PlanLimits {
  recordings: number; // -1 = unlimited
  documents: number;  // -1 = unlimited
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { recordings: 0, documents: 0 },
  starter: { recordings: 5, documents: 3 },
  pro: { recordings: -1, documents: -1 },
  team: { recordings: -1, documents: -1 },
};
