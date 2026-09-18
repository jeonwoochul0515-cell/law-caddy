// 문서 생성·수정 화면 — 저장본이 있으면 그것을 열고, 재생성은 버튼으로만. AI 수정·직접 편집·되돌리기·자동저장·인쇄·내보내기
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  FileText,
  Copy,
  Check,
  MessageSquare,
  Loader2,
  Save,
  Send,
  Bot,
  User,
  X,
  MessageCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  FileDown,
  Printer,
  Paperclip,
  Pencil,
  Trash2,
  Undo2,
  RefreshCw,
} from "lucide-react";
import { exportToDocx } from "../services/docxExport";
import { exportToHwpx } from "../services/hwpxExport";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import useDocumentChat, { type DocChatMessage, type Suggestion } from "../hooks/useDocumentChat";
import {
  updateDocument,
  createDocument,
  createRecording,
  addTimelineEvent,
  getDocument,
  renameDocument,
  deleteDocument,
} from "../services/firebase/firestore";
import { uploadRecordingFile } from "../services/firebase/storage";
import type { CaseType, DocType } from "../types/agent";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";
import "../print.css";

const SESSION_KEY = "law-caddy-document-state";
const AUTO_REVIEW_KEY = "law-caddy-auto-review";
/** AI 적용·직접 편집 뒤 자동 저장까지 기다리는 시간 */
const AUTO_SAVE_DELAY_MS = 1500;

interface DocumentState {
  clientName: string;
  caseType: CaseType;
  caseDesc: string;
  docType: DocType;
  ownerId: string;
  firmName: string;
  lawyerName: string;
  barLicenseNumber?: string;
  businessAddress?: string;
  lawyerPhone?: string;
  agentResults: Record<string, string>;
  checkQuestions: CheckQuestion[];
  checkpointAnswers: CheckpointAnswer[];
  /** STT 상담 대화록 */
  transcript?: string;
  /** 녹음 화면 업로드 파일에서 추출한 텍스트 */
  fileContents?: string;
  /** 체크포인트 첨부 파일에서 추출한 텍스트 */
  attachedFileContents?: string;
  caseId?: string;
  documentId?: string;
  existingDocument?: boolean;       // true when opening existing doc from 서류철
  existingFinalDocument?: string;   // the already-generated document text
}

/** 로컬 시각을 "오후 3:12" 형식으로 */
function formatClock(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

/** 파일명에 쓸 오늘 날짜 (로컬 기준 — UTC로 찍으면 오전 9시 전엔 전날이 된다) */
function todayForFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DocumentPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const rawState = location.state as DocumentState | null;
  const state: DocumentState | null = (() => {
    if (rawState) {
      // CheckpointAnswer의 files/audioBlob은 직렬화 불가 → 텍스트만 보존
      const serializable: DocumentState = {
        ...rawState,
        checkpointAnswers: (rawState.checkpointAnswers ?? []).map((a) => ({
          ...a,
          files: [],
          audioBlob: null,
        })),
      };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable)); } catch {
        // 용량 초과 — 대화록이 길면 못 담는다. 최소한 문서 위치는 남겨 새로고침 뒤에도 열리게 한다.
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            ...serializable,
            transcript: "",
            fileContents: "",
            attachedFileContents: "",
            agentResults: {},
          }));
        } catch { /* 이것도 안 되면 포기 */ }
      }
      return rawState;
    }
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) as DocumentState : null;
    } catch { return null; }
  })();

  const {
    finalDocument,
    clientMessage,
    generateDocument,
    generateClientMessage,
    updateFinalDocument,
    setExternalDocument,
    setExternalClientMessage,
    changedSegments,
    clearHighlight,
    canUndo,
    undo,
    status,
    error: docError,
    messageStatus,
    messageError,
  } = useDocument();

  // ── 자동 검토 켜기/끄기 (기본 켬, 브라우저에 기억) ──
  const [autoReview, setAutoReview] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_REVIEW_KEY) !== "off"; } catch { return true; }
  });
  const toggleAutoReview = () => {
    setAutoReview((v) => {
      const next = !v;
      try { localStorage.setItem(AUTO_REVIEW_KEY, next ? "on" : "off"); } catch { /* 무시 */ }
      return next;
    });
  };

  // ── 저장 상태 ──
  const [documentId, setDocumentId] = useState<string | undefined>(state?.documentId);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const finalDocRef = useRef("");
  finalDocRef.current = finalDocument;
  const autoSaveTimer = useRef<number | null>(null);

  /** 본문을 Firestore에 저장. 성공하면 저장 시각을, 실패하면 오류를 화면에 남긴다 */
  const saveNow = useCallback(async (doc: string, opts?: { silent?: boolean }): Promise<boolean> => {
    if (!state || !doc) return false;
    if (!opts?.silent) setSaving(true);
    try {
      if (documentId) {
        await updateDocument(documentId, { finalDocument: doc, status: "completed" });
      } else {
        const id = await createDocument({
          caseId: state.caseId ?? "",
          recordingId: "",
          ownerId: state.ownerId,
          docType: state.docType,
          agentResults: {
            precedent: state.agentResults?.precedent ?? "",
            legal: state.agentResults?.legal ?? "",
            rag_precedent: state.agentResults?.rag_precedent ?? "",
            analysis: state.agentResults?.analysis ?? "",
            docgen: state.agentResults?.docgen ?? "",
            review: state.agentResults?.review ?? "",
          },
          checkQuestions: state.checkQuestions ?? [],
          answeredChecks: {},
          finalDocument: doc,
          status: "completed",
        });
        setDocumentId(id);
      }
      setDirty(false);
      setSaveError(null);
      setLastSavedAt(new Date());
      return true;
    } catch (err) {
      console.error("문서 저장 실패:", err);
      setSaveError(err instanceof Error ? err.message : "문서를 저장하지 못했습니다.");
      return false;
    } finally {
      if (!opts?.silent) setSaving(false);
    }
  }, [state, documentId]);

  /** 본문이 바뀔 때(AI 적용·직접 편집·되돌리기) 호출 — 되돌리기 스택에 쌓고 자동 저장을 예약 */
  const scheduleAutoSave = useCallback(() => {
    setDirty(true);
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    // 아직 Firestore 문서가 없으면 자동 저장을 하지 않는다 — "저장하기"로 만든다
    if (!documentId) return;
    autoSaveTimer.current = window.setTimeout(() => {
      saveNow(finalDocRef.current, { silent: true });
    }, AUTO_SAVE_DELAY_MS);
  }, [documentId, saveNow]);

  const handleDocumentChange = useCallback((doc: string) => {
    updateFinalDocument(doc);
    scheduleAutoSave();
  }, [updateFinalDocument, scheduleAutoSave]);

  const handleUndo = () => {
    undo();
    scheduleAutoSave();
  };

  const {
    messages: chatMessages,
    isLoading: chatLoading,
    sendMessage,
    applySuggestions,
    applyPendingEdit,
    startAutoReview,
  } = useDocumentChat(
    state?.docType ?? "상담 요약 리포트",
    finalDocument,
    handleDocumentChange, // 수정안 적용 콜백 — 저장 예약까지 한다
    { autoReReview: autoReview },
  );

  const [copied, setCopied] = useState<"doc" | "msg" | null>(null);
  const [tab, setTab] = useState<"document" | "message">("document");
  const [initialized, setInitialized] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatFiles, setChatFiles] = useState<File[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const mobileChatFileInputRef = useRef<HTMLInputElement>(null);

  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingHwpx, setExportingHwpx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 문서 제목·편집·삭제
  const [title, setTitle] = useState<string>("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 저장본을 열었는지 (true면 새 생성이 아니므로 완료 시 자동 저장·타임라인 기록을 하지 않는다) */
  const openedSavedRef = useRef(false);
  /** 이번 화면에서 새로 생성한 문서인지 — 완료 시 1회 저장 */
  const generatedRef = useRef(false);
  const completionSavedRef = useRef(false);

  /** AI 초안 생성 실행 (처음 생성 또는 "다시 생성") */
  const runGeneration = useCallback(() => {
    if (!state) return;
    generatedRef.current = true;
    completionSavedRef.current = false;
    if (documentId && state.checkQuestions?.length) {
      updateDocument(documentId, {
        checkQuestions: state.checkQuestions,
        status: "generating",
      }).catch(console.error);
    }
    generateDocument(
      {
        clientName: state.clientName,
        caseType: state.caseType,
        caseDesc: state.caseDesc,
        docType: state.docType,
        // 상담 대화록. 예전에는 agentResults.rag_precedent(첨부파일 텍스트)가 이 자리에
        // 들어가 있어서, 정작 문서를 쓰는 필묵이 대화록을 못 받고 있었다.
        transcript: state.transcript ?? "",
        // 녹음 화면 업로드 파일 + 체크포인트 첨부 파일에서 추출한 텍스트
        fileContents: [state.fileContents, state.attachedFileContents]
          .filter(Boolean)
          .join("\n\n---\n\n"),
        lawyerName: state.lawyerName,
        firmName: state.firmName,
        barLicenseNumber: state.barLicenseNumber,
        businessAddress: state.businessAddress,
        lawyerPhone: state.lawyerPhone,
        // 다른 에이전트 분석 결과를 조필묵에게 전달
        precedentResult: state.agentResults?.precedent ?? "",
        analysisResult: state.agentResults?.analysis ?? "",
        legalResult: state.agentResults?.legal ?? "",
      },
      state.checkQuestions ?? [],
      state.checkpointAnswers ?? [],
    );
  }, [state, documentId, generateDocument]);

  // ── 첫 진입: 저장본이 있으면 그것을 열고, 없을 때만 생성한다 (새로고침해도 재생성·덮어쓰기 없음) ──
  useEffect(() => {
    if (!state || initialized) return;
    setInitialized(true);

    (async () => {
      if (state.documentId) {
        try {
          const saved = await getDocument(state.documentId);
          if (saved) {
            if (saved.title) setTitle(saved.title);
            if (saved.clientMessage) setExternalClientMessage(saved.clientMessage);
            if (saved.finalDocument?.trim()) {
              openedSavedRef.current = true;
              setExternalDocument(saved.finalDocument);
              if (saved.updatedAt?.toDate) setLastSavedAt(saved.updatedAt.toDate());
              return;
            }
          }
        } catch (err) {
          console.error("저장된 문서 조회 실패:", err);
          if (state.existingDocument) {
            setLoadError("저장된 문서를 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해 주세요.");
          }
        }
      }

      // 서류철에서 연 문서인데 Firestore를 못 읽었으면 화면에 실려 온 사본으로라도 연다
      if (state.existingDocument) {
        if (state.existingFinalDocument) {
          openedSavedRef.current = true;
          setExternalDocument(state.existingFinalDocument);
        }
        return;
      }

      runGeneration();
    })();
  }, [state, initialized, runGeneration, setExternalDocument, setExternalClientMessage]);

  // ── 생성 완료 시 1회 저장 + 타임라인 기록. 실패하면 화면에 알린다 ──
  useEffect(() => {
    if (status !== "completed" || !finalDocument) return;
    if (!generatedRef.current || completionSavedRef.current) return;
    completionSavedRef.current = true;

    saveNow(finalDocument, { silent: true }).then((ok) => {
      if (ok && state?.caseId) {
        addTimelineEvent(state.caseId, {
          type: "doc",
          label: `${state.docType} 초안 작성 완료`,
          detail: `${state.docType} 초안을 생성했습니다.`,
        }).catch(console.error);
      }
    });
  }, [finalDocument, status, state, saveNow]);

  // ── 의뢰인 메시지 생성 완료 시 저장 (실패는 메시지 탭에 표시) ──
  const savedMessageRef = useRef("");
  const [msgSaveError, setMsgSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!clientMessage || !documentId || savedMessageRef.current === clientMessage) return;
    savedMessageRef.current = clientMessage;
    updateDocument(documentId, { clientMessage })
      .then(() => setMsgSaveError(null))
      .catch((err) => {
        console.error(err);
        setMsgSaveError("메시지를 저장하지 못했습니다. 복사해 두세요.");
      });
  }, [clientMessage, documentId]);

  // ── 문서 생성 완료 시 AI 자동 검토 시작 (1회, 자동 검토가 켜져 있을 때만) ──
  const autoReviewDone = useRef(false);
  useEffect(() => {
    if (finalDocument && status === "completed" && !autoReviewDone.current && autoReview) {
      autoReviewDone.current = true;
      startAutoReview();
    }
  }, [finalDocument, status, startAutoReview, autoReview]);

  // ── 저장 안 된 수정이 있으면 탭 닫기·새로고침 전에 경고 ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty && !saveError) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, saveError]);

  // 화면을 떠날 때 예약된 자동 저장 타이머 정리
  useEffect(() => () => {
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
  }, []);

  // 내보내기 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  // 새 메시지 시 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  /** 저장 안 된 수정이 있으면 확인을 받고 이동 */
  const confirmLeave = (): boolean => {
    if (!dirty && !saveError) return true;
    return window.confirm("저장하지 않은 수정이 있습니다. 그래도 이 화면을 나가시겠습니까?");
  };

  const handleGenerateClientMessage = () => {
    if (!state) return;
    generateClientMessage({
      firmName: state.firmName,
      lawyerName: state.lawyerName,
      docType: state.docType,
      caseDesc: state.caseDesc,
      finalDocument: finalDocument || undefined,
    });
  };

  const handleCopy = async (text: string, type: "doc" | "msg") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // 클립보드 접근 실패
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if ((!text && chatFiles.length === 0) || chatLoading) return;
    const filesToSend = chatFiles.length > 0 ? [...chatFiles] : undefined;
    setChatInput("");
    setChatFiles([]);

    // Firebase Storage에 파일 업로드 (백그라운드)
    if (filesToSend && state?.caseId && state?.ownerId) {
      for (const file of filesToSend) {
        uploadRecordingFile(file, state.ownerId, state.caseId)
          .then((fileUrl) =>
            createRecording({
              caseId: state.caseId!,
              ownerId: state.ownerId,
              fileName: file.name,
              fileUrl,
              fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
              durationSeconds: 0,
              sttStatus: file.type?.startsWith("audio/") ? "pending" : "completed",
            }),
          )
          .catch((err) => console.error("채팅 파일 업로드 실패:", err));
      }
    }

    await sendMessage(text || "첨부된 파일을 분석하여 문서에 반영할 내용을 제안해 주세요.", filesToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      setChatFiles((prev) => [...prev, ...Array.from(selected)]);
    }
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!finalDocument || saving) return;
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    await saveNow(finalDocument);
  };

  /** "다시 생성" — 저장본이 있으면 확인을 받는다 */
  const handleRegenerate = () => {
    if (!state) return;
    if (finalDocument) {
      const ok = window.confirm(
        "지금 문서를 버리고 AI가 처음부터 다시 만듭니다. 저장된 본문도 새 초안으로 바뀝니다. 계속할까요?",
      );
      if (!ok) return;
    }
    autoReviewDone.current = false;
    runGeneration();
  };

  // ── 직접 편집 ──
  const startEditing = () => {
    setDraft(finalDocument);
    setEditing(true);
  };
  const finishEditing = () => {
    setEditing(false);
    if (draft !== finalDocument) handleDocumentChange(draft);
  };

  // ── 제목 ──
  const displayTitle = title || `${state?.docType ?? "문서"} 초안`;
  const startTitleEdit = () => {
    setTitleDraft(title || state?.docType || "");
    setEditingTitle(true);
  };
  const finishTitleEdit = async () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next === title) return;
    setTitle(next);
    if (!documentId) return;
    try {
      await renameDocument(documentId, next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "제목을 저장하지 못했습니다.");
    }
  };

  // ── 삭제 ──
  const handleDelete = async () => {
    if (!documentId) {
      // 아직 저장된 적 없는 문서 — 화면만 떠나면 된다
      if (window.confirm("이 초안은 아직 저장되지 않았습니다. 버리고 나갈까요?")) {
        navigate(state?.caseId ? `/cases/${state.caseId}` : "/documents");
      }
      return;
    }
    const ok = window.confirm(`"${displayTitle}" 문서를 삭제합니다. 삭제한 문서는 되돌릴 수 없습니다. 계속할까요?`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteDocument(documentId);
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* 무시 */ }
      navigate(state?.caseId ? `/cases/${state.caseId}` : "/documents");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "문서를 삭제하지 못했습니다.");
      setDeleting(false);
    }
  };

  // ── 내보내기 ──
  const handleExportDocx = async () => {
    if (!state) return;
    setShowExportMenu(false);
    setExportingDocx(true);
    setExportError(null);
    try {
      await exportToDocx(finalDocument, {
        docType: title || state.docType,
        clientName: state.clientName,
        date: todayForFilename(),
      });
    } catch (err) {
      console.error("DOCX 내보내기 실패:", err);
      setExportError("Word 파일을 만들지 못했습니다. 브라우저의 다운로드 차단 여부를 확인하고 다시 시도해 주세요.");
    } finally {
      setExportingDocx(false);
    }
  };
  const handleExportHwpx = async () => {
    if (!state) return;
    setShowExportMenu(false);
    setExportingHwpx(true);
    setExportError(null);
    try {
      await exportToHwpx(finalDocument, {
        docType: title || state.docType,
        clientName: state.clientName,
        date: todayForFilename(),
      });
    } catch (err) {
      console.error("HWPX 내보내기 실패:", err);
      setExportError("한글 파일을 만들지 못했습니다. 브라우저의 다운로드 차단 여부를 확인하고 다시 시도해 주세요.");
    } finally {
      setExportingHwpx(false);
    }
  };

  if (!state) {
    return (
      <AppLayout title="문서 생성" subtitle="">
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-text-dim/40 mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">열 문서 정보가 없습니다</p>
          <p className="text-sm text-text-dim mb-5">
            새로고침하면서 화면 정보가 지워졌습니다. 만들어 둔 문서는 아래에서 다시 열 수 있습니다.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/documents" className="px-4 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity">
              문서고에서 문서 열기
            </Link>
            <Link to="/cases" className="px-4 py-2.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors">
              사건 목록으로
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const saveStatusText = saving
    ? "저장 중..."
    : saveError
      ? "저장되지 않음"
      : dirty
        ? (documentId ? "잠시 뒤 자동 저장" : "저장 안 됨 — 저장하기를 눌러 주세요")
        : lastSavedAt
          ? `저장됨 ${formatClock(lastSavedAt)}`
          : "";

  return (
    <AppLayout title={openedSavedRef.current || state.existingDocument ? "문서 수정" : "문서 생성"} subtitle={`${state.clientName} - ${state.docType}`}>
      {/* 인쇄용 사본 — 화면에서는 보이지 않고 인쇄할 때 본문만 찍힌다 */}
      {finalDocument && (
        <div className="print-area" aria-hidden="true">{finalDocument}</div>
      )}

      {/* 이전 단계 */}
      <button
        onClick={() => {
          if (!confirmLeave()) return;
          if (state.caseId) {
            navigate(`/cases/${state.caseId}`);
          } else {
            navigate(-1);
          }
        }}
        className="flex items-center gap-1.5 mb-4 min-h-[36px] text-sm text-text-dim hover:text-text-primary transition-colors print-hidden"
      >
        <ChevronLeft className="w-4 h-4" />
        {state.caseId ? "사건 상세" : "이전 단계"}
      </button>

      {/* 탭 */}
      <div className="flex gap-2 mb-4 print-hidden">
        <button
          onClick={() => setTab("document")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "document"
              ? "bg-gold-dim text-gold border border-gold/30"
              : "bg-surface text-text-dim border border-border hover:border-border-hover"
          }`}
        >
          <FileText className="w-4 h-4" />
          법률 문서
        </button>
        <button
          onClick={() => {
            setTab("message");
            if (!clientMessage && messageStatus === "idle") handleGenerateClientMessage();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "message"
              ? "bg-gold-dim text-gold border border-gold/30"
              : "bg-surface text-text-dim border border-border hover:border-border-hover"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          의뢰인 메시지
        </button>
      </div>

      {/* 저장·내보내기 오류 배너 */}
      {(saveError || exportError || loadError) && (
        <div className="mb-3 flex items-start gap-2.5 bg-error/10 border border-error/30 rounded-xl px-4 py-3 print-hidden">
          <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-error">
            {saveError && (
              <p>
                {saveError}
                {finalDocument && (
                  <button onClick={handleSave} className="ml-2 underline font-medium">다시 저장</button>
                )}
              </p>
            )}
            {exportError && <p>{exportError}</p>}
            {loadError && <p>{loadError}</p>}
          </div>
          <button
            onClick={() => { setExportError(null); setLoadError(null); }}
            aria-label="알림 닫기"
            className="text-error/70 hover:text-error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* AI 정확성 경고 배너 */}
      {tab === "document" && finalDocument && (
        <div className="mb-3 flex items-start gap-2.5 bg-amber/5 border border-amber/20 rounded-xl px-4 py-3 print-hidden">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber font-medium">AI 생성 문서 — 변호사 검토 필수</p>
            <p className="text-xs text-text-dim mt-0.5">
              판례번호, 법조문, 사실관계를 반드시 확인하세요. [확인 필요] 표시된 부분은 정확성 검증이 필요합니다.
            </p>
          </div>
        </div>
      )}

      {/* 문서 탭 — 2컬럼 (데스크탑), 휴대폰에서는 세로로 한 겹 스크롤 */}
      {tab === "document" && (
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100dvh-140px)] print-hidden">
          {/* 왼쪽: 문서 뷰어 */}
          <div className="w-full lg:w-[60%] min-w-0 bg-surface border border-border rounded-2xl backdrop-blur-sm flex flex-col lg:overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={finishTitleEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") finishTitleEdit(); if (e.key === "Escape") setEditingTitle(false); }}
                    aria-label="문서 제목"
                    className="bg-navy-light border border-gold/40 rounded-lg px-2 py-1 text-base text-text-primary focus:outline-none min-w-[12rem]"
                  />
                ) : (
                  <button
                    onClick={startTitleEdit}
                    title="제목 바꾸기"
                    className="flex items-center gap-1.5 min-w-0 text-left group"
                  >
                    <h3 className="font-semibold text-text-primary text-base truncate">{displayTitle}</h3>
                    <Pencil className="w-3.5 h-3.5 text-text-dim/60 group-hover:text-gold shrink-0" />
                  </button>
                )}
                {changedSegments && !editing && (
                  <button
                    onClick={clearHighlight}
                    title="변경 강조 끄기"
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 rounded-full hover:bg-emerald-500/25 transition-colors"
                  >
                    <span>변경 강조</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {saveStatusText && (
                  <span className={`text-xs mr-1 ${saveError ? "text-error" : dirty ? "text-amber" : "text-text-dim"}`}>
                    {saveStatusText}
                  </span>
                )}
                {finalDocument && status === "completed" && (
                  <>
                    {editing ? (
                      <>
                        <button
                          onClick={finishEditing}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-gradient-to-r from-gold to-gold-bright text-navy rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Check className="w-3.5 h-3.5" />
                          편집 완료
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:text-text-primary transition-colors"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={startEditing}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
                          title="본문을 직접 고칩니다"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          직접 편집
                        </button>
                        <button
                          onClick={handleUndo}
                          disabled={!canUndo}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="직전 판본으로 되돌리기"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          되돌리기
                        </button>

                        {/* 내보내기 드롭다운 */}
                        <div className="relative" ref={exportMenuRef}>
                          <button
                            onClick={() => setShowExportMenu((v) => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
                          >
                            {(exportingDocx || exportingHwpx) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileDown className="w-3.5 h-3.5" />
                            )}
                            내보내기
                            <ChevronDown className="w-3 h-3" />
                          </button>

                          {showExportMenu && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-navy-light border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                              <button
                                onClick={handleExportHwpx}
                                disabled={exportingHwpx}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-dim hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-40"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {exportingHwpx ? "변환 중..." : "한글(HWPX) 다운로드"}
                              </button>
                              <p className="px-3 pb-1.5 -mt-1 text-[11px] text-text-dim/70">한글 2020 이상에서 열립니다</p>
                              <button
                                onClick={handleExportDocx}
                                disabled={exportingDocx}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-dim hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-40"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                {exportingDocx ? "변환 중..." : "Word(DOCX) 다운로드"}
                              </button>
                              <button
                                onClick={() => {
                                  setShowExportMenu(false);
                                  window.print();
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                PDF로 저장(인쇄)
                              </button>
                              <p className="px-3 pb-1.5 -mt-1 text-[11px] text-text-dim/70">인쇄 창에서 대상을 "PDF로 저장"으로 고르세요</p>
                              <button
                                onClick={() => {
                                  setShowExportMenu(false);
                                  handleCopy(finalDocument, "doc");
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                              >
                                {copied === "doc" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied === "doc" ? "복사됨" : "텍스트 복사"}
                              </button>
                              <div className="border-t border-border" />
                              <button
                                onClick={() => { setShowExportMenu(false); handleRegenerate(); }}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-amber hover:bg-surface transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                AI로 처음부터 다시 생성
                              </button>
                              <button
                                onClick={() => { setShowExportMenu(false); handleDelete(); }}
                                disabled={deleting}
                                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-error hover:bg-surface transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {deleting ? "삭제 중..." : "이 문서 삭제"}
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={handleSave}
                          disabled={saving || (!dirty && !saveError && !!documentId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40 ${
                            dirty || saveError || !documentId
                              ? "bg-gradient-to-r from-gold to-gold-bright text-navy hover:opacity-90"
                              : "border border-border text-text-dim"
                          }`}
                        >
                          {saving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : !dirty && !saveError && documentId ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          {saving ? "저장 중..." : !dirty && !saveError && documentId ? "저장됨" : "저장하기"}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 lg:overflow-y-auto p-5 pb-28 lg:pb-5">
              {status === "generating_document" ? (
                <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  문서 생성 중... (보통 1~3분 걸립니다)
                </div>
              ) : status === "error" && docError ? (
                <div className="text-center py-16">
                  <AlertTriangle className="w-8 h-8 text-error mx-auto mb-3" />
                  <p className="text-error font-medium mb-2">문서 생성 실패</p>
                  <p className="text-sm text-text-dim mb-4 max-w-md mx-auto">{docError}</p>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={handleRegenerate}
                      className="px-4 py-2.5 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors text-sm"
                    >
                      다시 생성
                    </button>
                    {state.caseId && (
                      <Link to={`/cases/${state.caseId}`} className="px-4 py-2.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors">
                        사건 상세로
                      </Link>
                    )}
                  </div>
                </div>
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  aria-label="문서 본문 편집"
                  className="w-full min-h-[60vh] lg:min-h-full bg-navy-light border border-gold/30 rounded-xl p-4 text-[17px] text-text-primary leading-[1.9] font-sans focus:outline-none focus:border-gold/60 resize-y"
                />
              ) : finalDocument ? (
                <div className="whitespace-pre-wrap text-[17px] text-text-primary leading-[1.9] font-sans">
                  {changedSegments
                    ? changedSegments.map((seg, i) =>
                        seg.type === "added" ? (
                          <mark
                            key={i}
                            className="bg-emerald-500/20 text-emerald-100 rounded px-0.5"
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )
                    : finalDocument}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-text-dim mb-4">문서가 아직 생성되지 않았습니다.</p>
                  <button
                    onClick={handleRegenerate}
                    className="px-4 py-2.5 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors text-sm"
                  >
                    AI로 초안 만들기
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 채팅 패널 (데스크탑) */}
          <div className="hidden lg:flex w-[40%] shrink-0 bg-surface border border-border rounded-2xl backdrop-blur-sm flex-col overflow-hidden">
            {/* 채팅 헤더 */}
            <div className="px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-gold" />
                  <h3 className="font-semibold text-text-primary text-base">AI 법률 비서</h3>
                </div>
                <AutoReviewToggle on={autoReview} onToggle={toggleAutoReview} />
              </div>
              <p className="text-sm text-text-dim mt-1">문서에 대해 질문하거나 수정을 요청하세요</p>
            </div>

            {/* 채팅 메시지 영역 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && !chatLoading && (
                <div className="text-center py-8 space-y-2">
                  <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                  <p className="text-sm text-text-dim">
                    {finalDocument
                      ? (autoReview ? "문서를 분석하고 있습니다..." : "자동 검토가 꺼져 있습니다. 질문이나 수정 요청을 입력하세요.")
                      : "문서가 생성되면 자동으로 검토를 시작합니다"}
                  </p>
                </div>
              )}

              {chatMessages.map((msg: DocChatMessage) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  onApplySuggestions={applySuggestions}
                  onApplyPendingEdit={applyPendingEdit}
                  disabled={chatLoading}
                />
              ))}

              {chatLoading && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-gold-dim flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-gold" />
                  </div>
                  <div className="bg-navy-light rounded-xl rounded-tl-none px-3 py-2">
                    <Loader2 className="w-4 h-4 text-gold animate-spin" />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* 채팅 입력 */}
            <div className="p-4 border-t border-border shrink-0 bg-navy-light/30">
              <input
                ref={chatFileInputRef}
                type="file"
                multiple
                onChange={handleChatFileSelect}
                style={{ position: "fixed", top: "-9999px", left: "-9999px" }}
              />
              {chatFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {chatFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gold-dim/30 border border-gold/20 rounded-md text-xs text-gold">
                      <Paperclip className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setChatFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`${f.name} 첨부 지우기`} className="p-1 hover:text-error">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => chatFileInputRef.current?.click()}
                  disabled={chatLoading}
                  className="px-2.5 py-2 border border-border rounded-lg text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40 shrink-0"
                  title="파일 첨부"
                  aria-label="파일 첨부"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="질문 또는 수정 요청..."
                  rows={2}
                  className="flex-1 bg-navy-light border border-border rounded-lg px-3 py-2.5 text-[16px] text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none"
                />
                <button
                  onClick={handleSendChat}
                  disabled={(!chatInput.trim() && chatFiles.length === 0) || chatLoading}
                  aria-label="보내기"
                  className="px-3.5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 모바일: 플로팅 채팅 버튼 */}
          {!editing && (
            <button
              onClick={() => setChatOpen(true)}
              aria-label="AI 법률 비서 열기"
              className="lg:hidden fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40"
            >
              <MessageCircle className="w-6 h-6" />
            </button>
          )}

          {/* 모바일: 채팅 오버레이 */}
          {chatOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-navy" role="dialog" aria-label="AI 법률 비서">
              {/* 모바일 채팅 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-gold" />
                  <h3 className="font-semibold text-text-primary text-sm">AI 법률 비서</h3>
                </div>
                <div className="flex items-center gap-2">
                  <AutoReviewToggle on={autoReview} onToggle={toggleAutoReview} />
                  <button onClick={() => setChatOpen(false)} aria-label="닫기" className="p-2 text-text-dim hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 모바일 채팅 메시지 */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && !chatLoading && (
                  <div className="text-center py-8 space-y-2">
                    <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                    <p className="text-xs text-text-dim">
                      {finalDocument
                        ? (autoReview ? "문서를 분석하고 있습니다..." : "자동 검토가 꺼져 있습니다. 질문이나 수정 요청을 입력하세요.")
                        : "문서가 생성되면 자동으로 검토를 시작합니다"}
                    </p>
                  </div>
                )}

                {chatMessages.map((msg: DocChatMessage) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    onApplySuggestions={applySuggestions}
                    onApplyPendingEdit={applyPendingEdit}
                    disabled={chatLoading}
                  />
                ))}

                {chatLoading && (
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-gold-dim flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-gold" />
                    </div>
                    <div className="bg-surface rounded-xl rounded-tl-none px-3 py-2">
                      <Loader2 className="w-4 h-4 text-gold animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* 모바일 채팅 입력 */}
              <div className="p-3 border-t border-border shrink-0">
                <input
                  ref={mobileChatFileInputRef}
                  type="file"
                  multiple
                  onChange={handleChatFileSelect}
                  style={{ position: "fixed", top: "-9999px", left: "-9999px" }}
                />
                {chatFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {chatFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gold-dim/30 border border-gold/20 rounded-md text-xs text-gold">
                        <Paperclip className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                        <button onClick={() => setChatFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`${f.name} 첨부 지우기`} className="p-1 hover:text-error">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => mobileChatFileInputRef.current?.click()}
                    disabled={chatLoading}
                    className="px-2.5 py-2 border border-border rounded-lg text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40 shrink-0"
                    title="파일 첨부"
                    aria-label="파일 첨부"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="질문 또는 수정 요청..."
                    rows={1}
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-[16px] text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={(!chatInput.trim() && chatFiles.length === 0) || chatLoading}
                    aria-label="보내기"
                    className="px-3 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 의뢰인 메시지 탭 */}
      {tab === "message" && (
        <div className="max-w-2xl print-hidden">
          <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold text-text-primary">의뢰인 카카오톡 메시지</h3>
              {clientMessage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateClientMessage}
                    disabled={messageStatus === "generating"}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-4 h-4" />
                    다시 만들기
                  </button>
                  <button
                    onClick={() => handleCopy(clientMessage, "msg")}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
                  >
                    {copied === "msg" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === "msg" ? "복사됨" : "복사"}
                  </button>
                </div>
              )}
            </div>
            <div className="p-5">
              {messageStatus === "generating" ? (
                <div className="flex items-center gap-3 justify-center py-8 text-text-dim">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  메시지 생성 중...
                </div>
              ) : messageStatus === "error" ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-8 h-8 text-error mx-auto mb-3" />
                  <p className="text-error font-medium mb-1">메시지를 만들지 못했습니다</p>
                  <p className="text-sm text-text-dim mb-4 max-w-md mx-auto">{messageError}</p>
                  <p className="text-xs text-text-dim mb-4">문서 본문은 그대로 있습니다. 메시지만 다시 만듭니다.</p>
                  <button
                    onClick={handleGenerateClientMessage}
                    className="px-4 py-2.5 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors text-sm"
                  >
                    메시지 다시 만들기
                  </button>
                </div>
              ) : clientMessage ? (
                <>
                  <div className="bg-[#FEE500]/10 border border-[#FEE500]/20 rounded-xl p-4">
                    <p className="text-[15px] text-text-primary whitespace-pre-wrap leading-relaxed">
                      {clientMessage}
                    </p>
                  </div>
                  {msgSaveError && <p className="mt-2 text-xs text-error">{msgSaveError}</p>}
                  <p className="mt-3 text-xs text-text-dim">
                    보내기 전에 승패·금액·기한을 단정하는 말이 없는지 한 번 더 읽어 주세요. 최종 판단은 변호사가 합니다.
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-text-dim mb-4">의뢰인에게 보낼 메시지를 자동으로 생성합니다.</p>
                  <button
                    onClick={handleGenerateClientMessage}
                    className="px-4 py-2.5 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
                  >
                    메시지 생성
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => { if (confirmLeave()) navigate("/dashboard"); }}
              className="px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/** 자동 검토 켜기/끄기 스위치 */
function AutoReviewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      title={on ? "제안을 적용할 때마다 AI가 다시 검토합니다 (끄면 요청할 때만)" : "자동 검토 꺼짐 — 요청할 때만 검토합니다"}
      className={`flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-full text-xs border transition-colors ${
        on ? "bg-gold-dim text-gold border-gold/30" : "bg-surface text-text-dim border-border"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${on ? "bg-gold" : "bg-text-dim/40"}`} />
      자동 검토 {on ? "켬" : "끔"}
    </button>
  );
}

/** 제안 카드 컴포넌트 — 클릭 없이 내용이 바로 보이도록 */
function SuggestionCard({
  suggestion,
  checked,
  onToggle,
  disabled,
}: {
  suggestion: Suggestion;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-3.5 transition-colors cursor-pointer ${
        checked
          ? "border-gold/40 bg-gold-dim/30"
          : "border-border hover:border-border-hover bg-navy-light/50"
      }`}
      onClick={() => !disabled && onToggle()}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`w-5 h-5 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
            checked ? "bg-gold border-gold" : "border-text-dim/40"
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5 text-navy" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            제안 {suggestion.id}. {suggestion.title}
          </p>
          {suggestion.description && (
            <p className="text-[13px] text-text-dim mt-1 leading-relaxed">{suggestion.description}</p>
          )}
          {(suggestion.current || suggestion.revised) && (
            <div className="mt-2 space-y-2 text-[13px]">
              {suggestion.current && (
                <div className="bg-red/5 border border-red/10 rounded-lg px-3 py-2">
                  <span className="text-red/80 font-semibold text-xs">현재 </span>
                  <span className="text-text-dim leading-relaxed">{suggestion.current}</span>
                </div>
              )}
              {suggestion.revised && (
                <div className="bg-success/5 border border-success/10 rounded-lg px-3 py-2">
                  <span className="text-success/80 font-semibold text-xs">수정안 </span>
                  <span className="text-text-primary leading-relaxed">{suggestion.revised}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 채팅 버블 컴포넌트 */
function ChatBubble({
  message,
  onApplySuggestions,
  onApplyPendingEdit,
  disabled,
}: {
  message: DocChatMessage;
  onApplySuggestions: (ids: number[]) => Promise<void>;
  onApplyPendingEdit: (messageId: string) => void;
  disabled: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 자동 검토 요청은 UI에 표시하지 않음
  if (message.role === "user" && message.content === "[자동 검토 요청]") {
    return null;
  }

  if (message.role === "user") {
    return (
      <div className="flex items-start gap-2 justify-end">
        <div className="bg-gold-dim rounded-xl rounded-tr-none px-3 py-2 max-w-[85%]">
          <p className="text-[15px] text-text-primary whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-text-dim" />
        </div>
      </div>
    );
  }

  const suggestions = message.suggestions ?? [];
  // 제안 블록 텍스트를 본문에서 제거하여 깔끔하게 표시
  const displayContent = suggestions.length > 0
    ? message.content.replace(/\[제안\d+\][\s\S]*$/m, "").trim()
    : message.content;

  const toggleSuggestion = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  };

  const handleApply = () => {
    if (selectedIds.size === 0 || disabled) return;
    onApplySuggestions(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-gold-dim flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-gold" />
      </div>
      <div className="max-w-[85%] space-y-2">
        {/* 본문 텍스트 */}
        {displayContent && (
          <div className="bg-navy-light rounded-xl rounded-tl-none px-3 py-2">
            <p className="text-[15px] text-text-primary whitespace-pre-wrap leading-relaxed">
              {displayContent}
            </p>
          </div>
        )}

        {/* 수정 제안 카드들 */}
        {suggestions.length > 0 && !message.editApplied && (
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                checked={selectedIds.has(s.id)}
                onToggle={() => toggleSuggestion(s.id)}
                disabled={disabled}
              />
            ))}

            {/* 전체 선택 + 적용 버튼 */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={selectAll}
                disabled={disabled}
                className="text-xs min-h-[32px] px-1 text-text-dim hover:text-gold transition-colors disabled:opacity-40"
              >
                {selectedIds.size === suggestions.length ? "전체 해제" : "전체 선택"}
              </button>
              <button
                onClick={handleApply}
                disabled={disabled || selectedIds.size === 0}
                className="flex items-center gap-1 px-3 py-2 min-h-[36px] bg-gradient-to-r from-gold to-gold-bright text-navy text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" />
                선택 적용 ({selectedIds.size}/{suggestions.length})
              </button>
            </div>
          </div>
        )}

        {/* 자동 적용을 보류한 전체 수정안 — 변호사가 확인 후 적용 */}
        {message.pendingEdit && !message.editApplied && (
          <div className="bg-amber/5 border border-amber/30 rounded-xl px-3 py-2.5 space-y-2">
            <p className="text-xs text-amber leading-relaxed">{message.pendingReason}</p>
            <details className="text-xs text-text-dim">
              <summary className="cursor-pointer text-text-primary">수정안 내용 보기</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">{message.pendingEdit}</pre>
            </details>
            <button
              onClick={() => onApplyPendingEdit(message.id)}
              disabled={disabled}
              className="px-3 py-2 min-h-[36px] bg-amber/20 text-amber text-xs font-semibold rounded-lg hover:bg-amber/30 transition-colors disabled:opacity-40"
            >
              확인했습니다, 그래도 적용
            </button>
          </div>
        )}

        {/* 적용 완료 표시 */}
        {message.editApplied && (
          <div className="flex items-center gap-1.5 text-xs text-success px-1">
            <Check className="w-3 h-3" />
            수정안이 문서에 적용됨 · 되돌리기 버튼으로 이전 판본으로 갈 수 있습니다
          </div>
        )}
      </div>
    </div>
  );
}
