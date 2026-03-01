import { useState, useEffect, useCallback } from "react";
import { getCase, getDocuments, getRecordings, getOpponentDocs, updateCase, addTimelineEvent, createOpponentDoc, deleteOpponentDoc } from "../services/firebase/firestore";
import { uploadOpponentDocFile } from "../services/firebase/storage";
import { isDemoMode, mockTimestamp } from "../config/demo";
import useAuth from "./useAuth";
import type { Case, TimelineEvent, OpponentDoc } from "../types/case";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";

interface UseCaseDetailReturn {
  caseData: Case | null;
  documents: LegalDocument[];
  recordings: Recording[];
  opponentDocs: OpponentDoc[];
  loading: boolean;
  error: string | null;
  updateStatus: (status: "진행중" | "완료" | "보류") => Promise<void>;
  addNote: (label: string, detail: string) => Promise<void>;
  uploadOpponentDoc: (file: File, label: string) => Promise<void>;
  removeOpponentDoc: (docId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export default function useCaseDetail(caseId: string): UseCaseDetailReturn {
  const user = useAuth((s) => s.user);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [opponentDocs, setOpponentDocs] = useState<OpponentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!caseId || !user) return;
    setLoading(true);
    setError(null);

    try {
      if (isDemoMode) {
        setCaseData(null);
        setDocuments([]);
        setRecordings([]);
        setOpponentDocs([]);
      } else {
        const [c, docs, recs, oppDocs] = await Promise.all([
          getCase(caseId),
          getDocuments(caseId, user.uid),
          getRecordings(caseId, user.uid),
          getOpponentDocs(caseId, user.uid),
        ]);
        setCaseData(c);
        setDocuments(docs);
        setRecordings(recs);
        setOpponentDocs(oppDocs);
      }
    } catch (err: unknown) {
      console.error("사건 데이터 로딩 실패:", err);
      setError("사건 데이터를 불러오는 데 실패했습니다.");
      setCaseData(null);
      setDocuments([]);
      setRecordings([]);
      setOpponentDocs([]);
    } finally {
      setLoading(false);
    }
  }, [caseId, user]);

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

  const uploadOpponentDoc = useCallback(
    async (file: File, label: string) => {
      if (!caseData) return;

      if (isDemoMode) {
        const demoDoc: OpponentDoc = {
          id: `demo-opp-${Date.now()}`,
          caseId,
          ownerId: caseData.ownerId,
          fileName: file.name,
          fileUrl: "#",
          fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
          docLabel: label,
          createdAt: mockTimestamp(new Date()),
        };
        setOpponentDocs((prev) => [demoDoc, ...prev]);
        return;
      }

      const fileUrl = await uploadOpponentDocFile(file, caseData.ownerId, caseId);
      const id = await createOpponentDoc({
        caseId,
        ownerId: caseData.ownerId,
        fileName: file.name,
        fileUrl,
        fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
        docLabel: label,
      });
      setOpponentDocs((prev) => [
        { id, caseId, ownerId: caseData.ownerId, fileName: file.name, fileUrl, fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)), docLabel: label, createdAt: mockTimestamp(new Date()) },
        ...prev,
      ]);
      await addTimelineEvent(caseId, {
        type: "response",
        label: `상대방 서면 등록: ${label}`,
        detail: `파일 "${file.name}" 업로드 완료.`,
      });
    },
    [caseData, caseId],
  );

  const removeOpponentDoc = useCallback(
    async (docId: string) => {
      setOpponentDocs((prev) => prev.filter((d) => d.id !== docId));
      if (!isDemoMode) {
        await deleteOpponentDoc(docId);
      }
    },
    [],
  );

  return {
    caseData,
    documents,
    recordings,
    opponentDocs,
    loading,
    error,
    updateStatus,
    addNote,
    uploadOpponentDoc,
    removeOpponentDoc,
    refresh: fetchAll,
  };
}
