import { useState, useEffect, useCallback } from "react";
import { getCase, getDocuments, getRecordings, getOpponentDocs, updateCase, addTimelineEvent, createOpponentDoc, deleteOpponentDoc, deleteCase as firestoreDeleteCase, getCaseRecords, createCaseRecord, deleteCaseRecord, updateCaseRecord } from "../services/firebase/firestore";
import { uploadOpponentDocFile, uploadCaseRecordFile } from "../services/firebase/storage";
import { isDemoMode, mockTimestamp } from "../config/demo";
import useAuth from "./useAuth";
import { extractPdfText } from "../services/pdf";
import { callClaude } from "../services/claude";
import { buildOpponentBriefAnalyzerPrompt } from "../services/prompts";
import { classifyByFileName, classifyByLLM, needsLLMRefinement } from "../services/caseRecordClassifier";
import type { Case, TimelineEvent, OpponentDoc, ContractPayment, CostItem } from "../types/case";
import type { CaseRecord, RecordDocType, RecordSubmittedBy, OcrStatus, AnalyzedClaim, SuggestedPrecedent, CaseRecordEmbeddedAnalysis } from "../types/caseRecord";
import type { CaseType } from "../types/agent";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";

/**
 * Claude 응답 텍스트에서 JSON 객체 블록을 추출한다.
 * 응답 앞뒤에 서두/맺음말이 섞여 들어와도 첫 "{" 부터 마지막 "}" 까지만 잘라낸다.
 */
function extractJsonBlock(raw: string): string | null {
  if (!raw) return null;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) return null;
  return raw.slice(first, last + 1);
}

interface UseCaseDetailReturn {
  caseData: Case | null;
  documents: LegalDocument[];
  recordings: Recording[];
  opponentDocs: OpponentDoc[];
  caseRecords: CaseRecord[];
  loading: boolean;
  error: string | null;
  updateStatus: (status: "진행중" | "완료" | "보류") => Promise<void>;
  addNote: (label: string, detail: string) => Promise<void>;
  uploadOpponentDoc: (file: File, label: string) => Promise<void>;
  removeOpponentDoc: (docId: string) => Promise<void>;
  /**
   * 사건기록을 업로드한다.
   * meta 를 생략하면 파일명 휴리스틱으로 docType·submittedBy 를 자동 추정.
   * 복수 파일 업로드는 호출 측에서 Promise.all 로 병렬 실행 권장.
   */
  uploadCaseRecord: (
    file: File,
    meta?: { docType?: RecordDocType; submittedBy?: RecordSubmittedBy },
  ) => Promise<void>;
  removeCaseRecord: (recordId: string) => Promise<void>;
  analyzeCaseRecord: (recordId: string) => Promise<void>;
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
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>([]);
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
        setCaseRecords([]);
      } else {
        const c = await getCase(caseId);
        // 소유권 검증: 본인 사건만 접근 가능
        if (c && c.ownerId !== user.uid) {
          setError("이 사건에 접근할 권한이 없습니다.");
          setCaseData(null);
          setLoading(false);
          return;
        }
        setCaseData(c);

        if (!c) {
          setLoading(false);
          return;
        }

        const [docsResult, recsResult, oppDocsResult, caseRecsResult] = await Promise.allSettled([
          getDocuments(caseId, user.uid),
          getRecordings(caseId, user.uid),
          getOpponentDocs(caseId, user.uid),
          getCaseRecords(caseId, user.uid),
        ]);
        setDocuments(docsResult.status === "fulfilled" ? docsResult.value : []);
        setRecordings(recsResult.status === "fulfilled" ? recsResult.value : []);
        setOpponentDocs(oppDocsResult.status === "fulfilled" ? oppDocsResult.value : []);
        setCaseRecords(caseRecsResult.status === "fulfilled" ? caseRecsResult.value : []);

        [docsResult, recsResult, oppDocsResult, caseRecsResult].forEach((r) => {
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
      setCaseRecords([]);
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

  // 사건기록 업로드
  const uploadCaseRecord = useCallback(
    async (
      file: File,
      meta?: { docType?: RecordDocType; submittedBy?: RecordSubmittedBy },
    ) => {
      if (!caseData) return;

      // 메타 미제공 시 파일명 휴리스틱으로 자동 추정
      const classified = classifyByFileName(file.name);
      const docType: RecordDocType = meta?.docType ?? classified.docType;
      const submittedBy: RecordSubmittedBy =
        meta?.submittedBy ?? classified.submittedBy;

      const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));

      if (isDemoMode) {
        const demoRecord: CaseRecord = {
          id: `demo-rec-${Date.now()}`,
          caseId,
          ownerId: caseData.ownerId,
          docType,
          submittedBy,
          fileName: file.name,
          storageUrl: "#",
          fileSizeMB,
          ocrStatus: "pending",
          maskedPII: false,
          uploadedAt: mockTimestamp(new Date()),
          updatedAt: mockTimestamp(new Date()),
        };
        setCaseRecords((prev) => [demoRecord, ...prev]);
        return;
      }

      const storageUrl = await uploadCaseRecordFile(file, caseData.ownerId, caseId);
      const id = await createCaseRecord({
        caseId,
        ownerId: caseData.ownerId,
        docType,
        submittedBy,
        fileName: file.name,
        storageUrl,
        fileSizeMB,
        ocrStatus: "pending",
        maskedPII: false,
      });

      setCaseRecords((prev) => [
        {
          id,
          caseId,
          ownerId: caseData.ownerId,
          docType,
          submittedBy,
          fileName: file.name,
          storageUrl,
          fileSizeMB,
          ocrStatus: "pending",
          maskedPII: false,
          uploadedAt: mockTimestamp(new Date()),
          updatedAt: mockTimestamp(new Date()),
        },
        ...prev,
      ]);

      await addTimelineEvent(caseId, {
        type: "filing",
        label: `사건기록 업로드: ${docType} (${submittedBy})`,
        detail: `파일 "${file.name}" 업로드 완료. 파싱 대기 중.`,
      });

      // 백그라운드 파싱 시작 (await 하지 않음 — UI는 업로드 직후 즉시 리턴)
      // docType/submittedBy/caseType 을 인자로 넘겨 stale closure 회피
      void parseRecordInBackground(id, file, docType, submittedBy, caseData.caseType);
    },
    // parseRecordInBackground 는 같은 클로저에 있으므로 의존성 목록에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caseData, caseId],
  );

  // 사건기록 삭제 (Storage 원본은 별도 정리)
  const removeCaseRecord = useCallback(
    async (recordId: string) => {
      setCaseRecords((prev) => prev.filter((r) => r.id !== recordId));
      if (!isDemoMode) {
        await deleteCaseRecord(recordId);
      }
    },
    [],
  );

  // 사건기록 파싱 (업로드 직후 백그라운드에서 실행)
  // pdfjs-dist 텍스트 레이어 → 부족 시 CLOVA OCR 폴백. DRM PDF는 drm_blocked 로 귀결.
  // docType/submittedBy/caseType 은 인자로 전달받아 stale closure 문제를 회피.
  const parseRecordInBackground = useCallback(
    async (
      recordId: string,
      file: File,
      currentDocType: RecordDocType,
      currentSubmittedBy: RecordSubmittedBy,
      caseType: CaseType,
    ) => {
      const applyLocal = (patch: Partial<CaseRecord>) => {
        setCaseRecords((prev) =>
          prev.map((r) => (r.id === recordId ? { ...r, ...patch } : r)),
        );
      };

      applyLocal({ ocrStatus: "ocr_running" });
      if (!isDemoMode) {
        await updateCaseRecord(recordId, { ocrStatus: "ocr_running" }).catch(
          (err) => console.warn("ocr_running 상태 저장 실패:", err),
        );
      }

      try {
        const { text, usedOcr } = await extractPdfText(file);
        const summary = text.trim().slice(0, 300);
        const updates: Partial<CaseRecord> = {
          parsedText: text,
          parsedTextSummary: summary,
          ocrStatus: "parsed",
          ocrEngine: usedOcr ? "clova-ocr" : "pdf-text",
          maskedPII: false,
        };
        if (!isDemoMode) await updateCaseRecord(recordId, updates);
        applyLocal(updates);

        // Step 2: docType/submittedBy 가 기본값이면 LLM 보정 (예외는 로그만 남기고 무시)
        if (needsLLMRefinement(currentDocType, currentSubmittedBy)) {
          try {
            const refined = await classifyByLLM({
              caseType,
              fileName: file.name,
              parsedText: text,
              currentDocType,
              currentSubmittedBy,
            });
            if (
              refined.confidence > 0 &&
              (refined.docType !== currentDocType ||
                refined.submittedBy !== currentSubmittedBy)
            ) {
              const refinePatch: Partial<CaseRecord> = {
                docType: refined.docType,
                submittedBy: refined.submittedBy,
              };
              if (!isDemoMode) {
                await updateCaseRecord(recordId, refinePatch).catch((e) =>
                  console.warn("LLM 보정 저장 실패:", e),
                );
              }
              applyLocal(refinePatch);
            }
          } catch (llmErr) {
            console.warn("LLM 분류 보정 실패 (무시):", llmErr);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isDrm = /password|encrypted|drm|permission/i.test(msg);
        const nextStatus: OcrStatus = isDrm ? "drm_blocked" : "failed";
        if (!isDemoMode) {
          await updateCaseRecord(recordId, { ocrStatus: nextStatus }).catch(
            (updateErr) => console.warn("실패 상태 저장 실패:", updateErr),
          );
        }
        applyLocal({ ocrStatus: nextStatus });
      }
    },
    [],
  );

  // 사건기록 AI 분석 (opponentBriefAnalyzer 프롬프트 → Claude → JSON 파싱 → 임베드 저장)
  const analyzeCaseRecord = useCallback(
    async (recordId: string) => {
      if (!caseData) return;
      const target = caseRecords.find((r) => r.id === recordId);
      if (!target) throw new Error("대상 사건기록을 찾을 수 없습니다.");
      if (target.ocrStatus !== "parsed" || !target.parsedText) {
        throw new Error("파싱이 완료되지 않은 기록은 분석할 수 없습니다.");
      }

      const prompt = buildOpponentBriefAnalyzerPrompt({
        caseBrief: [
          `의뢰인: ${caseData.clientName}`,
          `사건 유형: ${caseData.caseType}`,
          `사건 개요: ${caseData.description}`,
        ].join("\n"),
        caseType: caseData.caseType,
        docTypeLabel: target.docType,
        opponentBriefText: target.parsedText.slice(0, 18000),
      });

      const raw = await callClaude(
        prompt,
        "위 규칙을 정확히 지켜 JSON 객체만 출력하세요.",
      );
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) {
        throw new Error("Claude 응답에서 JSON 블록을 찾지 못했습니다.");
      }

      const parsed = JSON.parse(jsonStr) as {
        claims?: AnalyzedClaim[];
        rebuttalOutline?: string[];
        suggestedPrecedents?: SuggestedPrecedent[];
      };

      const analysis: CaseRecordEmbeddedAnalysis = {
        claims: (parsed.claims ?? []).filter(
          (c) => typeof c.citation === "string" && c.citation.trim().length > 0,
        ),
        rebuttalOutline: parsed.rebuttalOutline ?? [],
        suggestedPrecedents: (parsed.suggestedPrecedents ?? []).filter(
          (p) => (p.caseNumber && p.caseNumber.trim()) || (p.statute && p.statute.trim()),
        ),
        generatedAt: mockTimestamp(new Date()),
        modelName: "claude-sonnet-4-20250514",
      };

      const patch: Partial<CaseRecord> = {
        analysis,
        analyzedAt: mockTimestamp(new Date()),
      };

      setCaseRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, ...patch } : r)),
      );

      if (!isDemoMode) {
        await updateCaseRecord(recordId, patch);
        await addTimelineEvent(caseId, {
          type: "filing",
          label: `사건기록 AI 분석 완료: ${target.docType}`,
          detail: `주장 ${analysis.claims.length}개, 판례 제안 ${analysis.suggestedPrecedents.length}건.`,
        });
      }
    },
    [caseData, caseRecords, caseId],
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
    caseRecords,
    loading,
    error,
    updateStatus,
    addNote,
    uploadOpponentDoc,
    removeOpponentDoc,
    uploadCaseRecord,
    removeCaseRecord,
    analyzeCaseRecord,
    removeCase,
    updateContractPayment,
    addCostItem,
    updateCostItem,
    removeCostItem,
    refresh: fetchAll,
  };
}
