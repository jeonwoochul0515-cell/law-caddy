// 사건(Case) CRUD 훅
// Firestore cases 컬렉션과 연동하여 사건 목록 관리

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { isDemoMode } from "../config/demo";
import useAuth from "./useAuth";
import type { Case, CaseType } from "../types/case";

/** 새 사건 생성 시 입력 데이터 */
export interface NewCaseData {
  clientName: string;
  caseType: CaseType;
  description: string;
  clientPhone?: string;
  caseNumber?: string;
  courtName?: string;
  courtDivision?: string;
  opponentName?: string;
  instance?: Case["instance"];
}

/** 사건 수정 시 변경 가능한 필드 */
interface EditCaseData {
  clientName?: string;
  caseType?: CaseType;
  description?: string;
  status?: "진행중" | "완료" | "보류";
  clientPhone?: string;
  caseNumber?: string;
  courtName?: string;
  courtDivision?: string;
  opponentName?: string;
  instance?: Case["instance"];
}

/** useCases 반환 타입 */
interface UseCasesReturn {
  cases: Case[];
  loading: boolean;
  error: string | null;
  fetchCases: () => Promise<void>;
  addCase: (data: NewCaseData) => Promise<string>;
  editCase: (id: string, data: EditCaseData) => Promise<void>;
}

/**
 * Firestore cases 컬렉션 CRUD 훅
 *
 * - 마운트 시 현재 로그인한 사용자의 사건 목록을 자동 조회
 * - 사건 생성, 수정 기능 제공
 */
export default function useCases(): UseCasesReturn {
  const user = useAuth((state) => state.user);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 현재 사용자의 사건 목록 조회 */
  const fetchCases = useCallback(async () => {
    if (!user) {
      setCases([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 데모 모드: Firebase 미설정
    if (isDemoMode) {
      setCases([]);
      setLoading(false);
      return;
    }

    try {
      const casesRef = collection(db!, "cases");
      const q = query(
        casesRef,
        where("ownerId", "==", user.uid),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(q);
      const fetchedCases: Case[] = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as Omit<Case, "id">),
        id: docSnap.id,
      }));

      setCases(fetchedCases);
    } catch (err: unknown) {
      console.error("사건 목록 조회 실패:", err);
      setError("사건 목록을 불러오는 데 실패했습니다.");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /** 새 사건 생성 */
  const addCase = useCallback(
    async (data: NewCaseData): Promise<string> => {
      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      try {
        const casesRef = collection(db!, "cases");
        // 선택 필드는 값이 있을 때만 저장 (Firestore는 undefined를 거부)
        const optionalFields = Object.fromEntries(
          (["clientPhone", "caseNumber", "courtName", "courtDivision", "opponentName", "instance"] as const)
            .filter((k) => data[k])
            .map((k) => [k, data[k]]),
        );
        const newCase = {
          ownerId: user.uid,
          clientName: data.clientName,
          caseType: data.caseType,
          description: data.description,
          ...optionalFields,
          status: "진행중" as const,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          timeline: [],
        };

        const docRef = await addDoc(casesRef, newCase);

        // 로컬 목록에 추가 (서버 타임스탬프 대신 임시값)
        const tempCase: Case = {
          id: docRef.id,
          ownerId: user.uid,
          clientName: data.clientName,
          caseType: data.caseType,
          description: data.description,
          ...optionalFields,
          status: "진행중",
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as Timestamp,
          updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as Timestamp,
          timeline: [],
        };

        setCases((prev) => [tempCase, ...prev]);
        return docRef.id;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "사건 생성 중 오류가 발생했습니다.";
        throw new Error(message);
      }
    },
    [user],
  );

  /** 사건 정보 수정 */
  const editCase = useCallback(
    async (id: string, data: EditCaseData): Promise<void> => {
      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      try {
        const caseRef = doc(db!, "cases", id);
        const updateData = {
          ...data,
          updatedAt: serverTimestamp(),
        };

        await updateDoc(caseRef, updateData);

        // 로컬 목록 업데이트
        setCases((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, ...data } : c,
          ),
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "사건 수정 중 오류가 발생했습니다.";
        throw new Error(message);
      }
    },
    [user],
  );

  // 마운트 시 + 사용자 변경 시 자동 조회
  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  return {
    cases,
    loading,
    error,
    fetchCases,
    addCase,
    editCase,
  };
}
