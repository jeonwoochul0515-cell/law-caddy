// 요금제 사용량 제한 확인 훅
// 현재 사용자의 플랜에 따라 녹음/문서 생성 가능 여부를 반환

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { isDemoMode } from "../config/demo";
import useAuth from "./useAuth";
import { PLAN_LIMITS } from "../types/subscription";
import type { PlanLimits } from "../types/subscription";

interface UsePlanLimitsResult {
  plan: string;
  canRecord: boolean;
  canGenerateDoc: boolean;
  recordingsUsed: number;
  recordingsLimit: number;
  docsUsed: number;
  docsLimit: number;
  isLoading: boolean;
  /** 사용량을 다시 조회합니다 (녹음/문서 생성 후 호출) */
  refresh: () => void;
}

/** 현재 월의 1일 00:00:00 Timestamp를 반환합니다 */
function getFirstDayOfMonth(): Timestamp {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return Timestamp.fromDate(first);
}

/**
 * 요금제 사용량 제한을 확인하는 훅
 *
 * - free/starter: 사건 분석 5건/월, 문서 3건/월 (동일 — Starter 무료 개방)
 * - pro / team: 무제한 (Firestore 쿼리 생략)
 */
export default function usePlanLimits(): UsePlanLimitsResult {
  const user = useAuth((s) => s.user);
  // 단건 결제 기반 만료 처리: planExpiresAt이 지났으면 free 취급.
  // planExpiresAt이 없으면 만료 없음(관리자 수동 부여 등 기존 사용자 보호).
  const expired =
    !!user?.planExpiresAt && user.planExpiresAt.toDate().getTime() < Date.now();
  const plan = expired ? "free" : (user?.plan ?? "free");
  const limits: PlanLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const [recordingsUsed, setRecordingsUsed] = useState(0);
  const [docsUsed, setDocsUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    // 사용자 미인증 → 로딩 완료, 0 사용량
    if (!user) {
      setRecordingsUsed(0);
      setDocsUsed(0);
      setIsLoading(false);
      return;
    }

    // 무제한 플랜 → Firestore 쿼리 불필요
    if (limits.recordings === -1 && limits.documents === -1) {
      setRecordingsUsed(0);
      setDocsUsed(0);
      setIsLoading(false);
      return;
    }

    // 데모 모드 → Firestore 쿼리 불가
    if (isDemoMode) {
      setRecordingsUsed(0);
      setDocsUsed(0);
      setIsLoading(false);
      return;
    }

    // free 플랜 → 쿼리 없이 0 제한
    if (limits.recordings === 0 && limits.documents === 0) {
      setRecordingsUsed(0);
      setDocsUsed(0);
      setIsLoading(false);
      return;
    }

    let canceled = false;
    setIsLoading(true);

    const fetchUsage = async () => {
      try {
        const firstDay = getFirstDayOfMonth();

        // (2026-07-31) 녹음이 아니라 **사건 생성 수**를 센다.
        // 서버(plan.ts requireUsageQuota)가 cases 기준으로 막으므로 화면도 같은 기준이어야
        // "화면엔 여유가 있는데 서버가 거부"하는 상황이 생기지 않는다.
        // 녹음 문서는 파일 업로드 때만 생기므로(메모만 입력하면 안 생김) 지표로 부정확하다.
        const [recordingsSnap, docsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db!, "cases"),
              where("ownerId", "==", user.uid),
              where("createdAt", ">=", firstDay),
            ),
          ),
          getDocs(
            query(
              collection(db!, "documents"),
              where("ownerId", "==", user.uid),
              where("createdAt", ">=", firstDay),
            ),
          ),
        ]);

        if (!canceled) {
          setRecordingsUsed(recordingsSnap.size);
          setDocsUsed(docsSnap.size);
        }
      } catch (error: unknown) {
        // 쿼리 실패 시 보수적으로 0 유지 (차단하지 않음)
        if (!canceled) {
          console.error("사용량 조회 실패:", error);
          setRecordingsUsed(0);
          setDocsUsed(0);
        }
      } finally {
        if (!canceled) {
          setIsLoading(false);
        }
      }
    };

    fetchUsage();

    return () => {
      canceled = true;
    };
  }, [user, limits.recordings, limits.documents, refreshKey]);

  // 제한 계산
  const recordingsLimit = limits.recordings; // -1 = 무제한, 0 = 불가
  const docsLimit = limits.documents;

  const canRecord =
    recordingsLimit === -1 ? true : recordingsUsed < recordingsLimit;
  const canGenerateDoc =
    docsLimit === -1 ? true : docsUsed < docsLimit;

  return {
    plan,
    canRecord,
    canGenerateDoc,
    recordingsUsed,
    recordingsLimit,
    docsUsed,
    docsLimit,
    isLoading,
    refresh,
  };
}
