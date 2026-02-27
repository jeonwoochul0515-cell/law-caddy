import { useState, useEffect, useCallback } from "react";
import { getCase, getDocuments, getRecordings, updateCase, addTimelineEvent } from "../services/firebase/firestore";
import { isDemoMode, DEMO_CASES, DEMO_DOCUMENTS, DEMO_RECORDINGS, mockTimestamp } from "../config/demo";
import type { Case, TimelineEvent } from "../types/case";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";

interface UseCaseDetailReturn {
  caseData: Case | null;
  documents: LegalDocument[];
  recordings: Recording[];
  loading: boolean;
  error: string | null;
  updateStatus: (status: "진행중" | "완료" | "보류") => Promise<void>;
  addNote: (label: string, detail: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export default function useCaseDetail(caseId: string): UseCaseDetailReturn {
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);

    try {
      if (isDemoMode) {
        const found = DEMO_CASES.find((c) => c.id === caseId) ?? null;
        setCaseData(found);
        setDocuments(DEMO_DOCUMENTS.filter((d) => d.caseId === caseId));
        setRecordings(DEMO_RECORDINGS.filter((r) => r.caseId === caseId));
      } else {
        const [c, docs, recs] = await Promise.all([
          getCase(caseId),
          getDocuments(caseId),
          getRecordings(caseId),
        ]);
        setCaseData(c);
        setDocuments(docs);
        setRecordings(recs);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "사건 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateStatus = useCallback(
    async (newStatus: "진행중" | "완료" | "보류") => {
      if (!caseData) return;
      const oldStatus = caseData.status;
      if (oldStatus === newStatus) return;

      // 낙관적 업데이트
      setCaseData((prev) => prev ? { ...prev, status: newStatus } : prev);

      // 타임라인에 상태 변경 이벤트 추가
      const event: TimelineEvent = {
        type: "note",
        date: mockTimestamp(new Date()),
        label: `상태 변경: ${oldStatus} → ${newStatus}`,
        detail: `사건 상태가 "${oldStatus}"에서 "${newStatus}"(으)로 변경되었습니다.`,
      };
      setCaseData((prev) => {
        if (!prev) return prev;
        return { ...prev, timeline: [...(prev.timeline ?? []), event] };
      });

      if (!isDemoMode) {
        try {
          await updateCase(caseId, { status: newStatus });
          await addTimelineEvent(caseId, {
            type: "note",
            label: `상태 변경: ${oldStatus} → ${newStatus}`,
            detail: `사건 상태가 "${oldStatus}"에서 "${newStatus}"(으)로 변경되었습니다.`,
          });
        } catch {
          // 롤백
          setCaseData((prev) => prev ? { ...prev, status: oldStatus } : prev);
        }
      }
    },
    [caseData, caseId],
  );

  const addNote = useCallback(
    async (label: string, detail: string) => {
      if (!caseData) return;

      const event: TimelineEvent = {
        type: "note",
        date: mockTimestamp(new Date()),
        label,
        detail,
      };

      // 낙관적 업데이트
      setCaseData((prev) => {
        if (!prev) return prev;
        return { ...prev, timeline: [...(prev.timeline ?? []), event] };
      });

      if (!isDemoMode) {
        try {
          await addTimelineEvent(caseId, { type: "note", label, detail });
        } catch {
          // 롤백
          setCaseData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              timeline: (prev.timeline ?? []).filter((e) => e !== event),
            };
          });
        }
      }
    },
    [caseData, caseId],
  );

  return {
    caseData,
    documents,
    recordings,
    loading,
    error,
    updateStatus,
    addNote,
    refresh: fetchAll,
  };
}
