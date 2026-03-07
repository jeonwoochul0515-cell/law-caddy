import { useState, useEffect, useCallback } from "react";
import { getCase, getDocuments, getRecordings, getOpponentDocs, updateCase, addTimelineEvent, createOpponentDoc, deleteOpponentDoc, deleteCase as firestoreDeleteCase } from "../services/firebase/firestore";
import { uploadOpponentDocFile } from "../services/firebase/storage";
import { isDemoMode, mockTimestamp } from "../config/demo";
import useAuth from "./useAuth";
import type { Case, TimelineEvent, OpponentDoc, ContractPayment, CostItem } from "../types/case";
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
  removeCase: () => Promise<void>;
  updateContractPayment: (data: ContractPayment) => Promise<void>;
  addCostItem: (item: Omit<CostItem, "id">) => Promise<void>;
  updateCostItem: (itemId: string, data: Partial<CostItem>) => Promise<void>;
  removeCostItem: (itemId: string) => Promise<void>;
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
        const c = await getCase(caseId);
        setCaseData(c);

        const [docsResult, recsResult, oppDocsResult] = await Promise.allSettled([
          getDocuments(caseId, user.uid),
          getRecordings(caseId, user.uid),
          getOpponentDocs(caseId, user.uid),
        ]);
        setDocuments(docsResult.status === "fulfilled" ? docsResult.value : []);
        setRecordings(recsResult.status === "fulfilled" ? recsResult.value : []);
        setOpponentDocs(oppDocsResult.status === "fulfilled" ? oppDocsResult.value : []);

        [docsResult, recsResult, oppDocsResult].forEach((r) => {
          if (r.status === "rejected") console.warn("하위 데이터 로딩 실패:", r.reason);
        });
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

      setCaseData((prev) => prev ? { ...prev, status: newStatus } : prev);

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

      setCaseData((prev) => {
        if (!prev) return prev;
        return { ...prev, timeline: [...(prev.timeline ?? []), event] };
      });

      if (!isDemoMode) {
        try {
          await addTimelineEvent(caseId, { type: "note", label, detail });
        } catch {
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

  // 사건 삭제
  const removeCase = useCallback(async () => {
    if (!caseId) return;
    if (!isDemoMode) {
      await firestoreDeleteCase(caseId);
    }
  }, [caseId]);

  // 계약/수임료 상태 업데이트
  const updateContractPayment = useCallback(
    async (data: ContractPayment) => {
      if (!caseData) return;
      const old = caseData.contractPayment;
      setCaseData((prev) => prev ? { ...prev, contractPayment: data } : prev);

      if (!isDemoMode) {
        try {
          await updateCase(caseId, { contractPayment: data });
        } catch {
          setCaseData((prev) => prev ? { ...prev, contractPayment: old } : prev);
        }
      }
    },
    [caseData, caseId],
  );

  // 부가비용 추가
  const addCostItem = useCallback(
    async (item: Omit<CostItem, "id">) => {
      if (!caseData) return;
      const newItem: CostItem = { ...item, id: crypto.randomUUID() };
      const oldCosts = caseData.costs ?? [];
      const newCosts = [...oldCosts, newItem];

      setCaseData((prev) => prev ? { ...prev, costs: newCosts } : prev);

      if (!isDemoMode) {
        try {
          await updateCase(caseId, { costs: newCosts });
        } catch {
          setCaseData((prev) => prev ? { ...prev, costs: oldCosts } : prev);
        }
      }
    },
    [caseData, caseId],
  );

  // 부가비용 수정
  const updateCostItem = useCallback(
    async (itemId: string, data: Partial<CostItem>) => {
      if (!caseData) return;
      const oldCosts = caseData.costs ?? [];
      const newCosts = oldCosts.map((c) => c.id === itemId ? { ...c, ...data } : c);

      setCaseData((prev) => prev ? { ...prev, costs: newCosts } : prev);

      if (!isDemoMode) {
        try {
          await updateCase(caseId, { costs: newCosts });
        } catch {
          setCaseData((prev) => prev ? { ...prev, costs: oldCosts } : prev);
        }
      }
    },
    [caseData, caseId],
  );

  // 부가비용 삭제
  const removeCostItem = useCallback(
    async (itemId: string) => {
      if (!caseData) return;
      const oldCosts = caseData.costs ?? [];
      const newCosts = oldCosts.filter((c) => c.id !== itemId);

      setCaseData((prev) => prev ? { ...prev, costs: newCosts } : prev);

      if (!isDemoMode) {
        try {
          await updateCase(caseId, { costs: newCosts });
        } catch {
          setCaseData((prev) => prev ? { ...prev, costs: oldCosts } : prev);
        }
      }
    },
    [caseData, caseId],
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
    removeCase,
    updateContractPayment,
    addCostItem,
    updateCostItem,
    removeCostItem,
    refresh: fetchAll,
  };
}
