import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { exportToDocx } from "../services/docxExport";
import { exportToHwpx } from "../services/hwpxExport";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import useDocumentChat, { type DocChatMessage, type Suggestion } from "../hooks/useDocumentChat";
import { updateDocument, createDocument, addTimelineEvent } from "../services/firebase/firestore";
import type { CaseType, DocType } from "../types/agent";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";

const SESSION_KEY = "law-caddy-document-state";

interface DocumentState {
  clientName: string;
  caseType: CaseType;
  caseDesc: string;
  docType: DocType;
  ownerId: string;
  firmName: string;
  lawyerName: string;
  agentResults: Record<string, string>;
  checkQuestions: CheckQuestion[];
  checkpointAnswers: CheckpointAnswer[];
  caseId?: string;
  documentId?: string;
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
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable)); } catch { /* quota */ }
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
    status,
    error: docError,
  } = useDocument();

  const {
    messages: chatMessages,
    isLoading: chatLoading,
    sendMessage,
    applySuggestions,
    startAutoReview,
  } = useDocumentChat(
    state?.docType ?? "상담 요약 리포트",
    finalDocument,
    updateFinalDocument, // 수정안 자동 적용 콜백
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

  const [docSaved, setDocSaved] = useState(false);
  const [msgSaved, setMsgSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingHwpx, setExportingHwpx] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state || initialized) return;
    setInitialized(true);

    // 체크포인트 데이터를 Firestore에 저장
    if (state.documentId && state.checkQuestions?.length) {
      updateDocument(state.documentId, {
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
        transcript: state.agentResults.stt ?? "",
        lawyerName: state.lawyerName,
        firmName: state.firmName,
        // 다른 에이전트 분석 결과를 필묵에게 전달
        precedentResult: state.agentResults.precedent ?? "",
        analysisResult: state.agentResults.analysis ?? "",
        legalResult: state.agentResults.legal ?? "",
        reviewResult: state.agentResults.review ?? "",
      },
      state.checkQuestions ?? [],
      state.checkpointAnswers ?? [],
    );
  }, [state, initialized, generateDocument]);

  // 문서 생성 완료 시 Firestore 저장
  useEffect(() => {
    if (!finalDocument || !state?.documentId || docSaved) return;
    if (status !== "completed") return;
    setDocSaved(true);

    updateDocument(state.documentId, {
      finalDocument,
      status: "completed",
    }).catch(console.error);

    if (state.caseId) {
      addTimelineEvent(state.caseId, {
        type: "doc",
        label: `${state.docType} 초안 작성 완료`,
        detail: `AI가 ${state.docType} 초안을 생성했습니다.`,
      }).catch(console.error);
    }
  }, [finalDocument, status, state, docSaved]);

  // 의뢰인 메시지 생성 완료 시 Firestore 저장
  useEffect(() => {
    if (!clientMessage || !state?.documentId || msgSaved) return;
    setMsgSaved(true);

    updateDocument(state.documentId, {
      clientMessage,
    }).catch(console.error);
  }, [clientMessage, state, msgSaved]);

  // 문서 생성 완료 시 AI 자동 검토 시작
  useEffect(() => {
    if (finalDocument && status === "completed") {
      startAutoReview();
    }
  }, [finalDocument, status, startAutoReview]);

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

  // 수정안은 채팅 훅에서 자동 적용 (handleApplyEdit 불필요)

  const handleSave = async () => {
    if (!state || !finalDocument || saving) return;
    setSaving(true);
    try {
      if (state.documentId) {
        await updateDocument(state.documentId, {
          finalDocument,
          status: "completed",
        });
      } else {
        await createDocument({
          caseId: state.caseId ?? "",
          recordingId: "",
          ownerId: state.ownerId,
          docType: state.docType,
          agentResults: {
            precedent: state.agentResults?.precedent ?? "",
            legal: state.agentResults?.legal ?? "",
            stt: state.agentResults?.stt ?? "",
            analysis: state.agentResults?.analysis ?? "",
            docgen: state.agentResults?.docgen ?? "",
            review: state.agentResults?.review ?? "",
          },
          checkQuestions: state.checkQuestions ?? [],
          answeredChecks: {},
          finalDocument,
          status: "completed",
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("문서 저장 실패:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!state) {
    return (
      <AppLayout title="문서 생성" subtitle="">
        <div className="text-center py-16 text-text-dim">사건 정보가 없습니다.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="문서 생성" subtitle={`${state.clientName} - ${state.docType}`}>
      {/* 이전 단계 */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-4 text-sm text-text-dim hover:text-text-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        이전 단계
      </button>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
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
            if (!clientMessage) handleGenerateClientMessage();
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

      {/* AI 정확성 경고 배너 */}
      {tab === "document" && finalDocument && (
        <div className="mb-3 flex items-start gap-2.5 bg-amber/5 border border-amber/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber font-medium">AI 생성 문서 — 변호사 검토 필수</p>
            <p className="text-[11px] text-text-dim mt-0.5">
              판례번호, 법조문, 사실관계를 반드시 확인하세요. [확인 필요] 표시된 부분은 정확성 검증이 필요합니다.
            </p>
          </div>
        </div>
      )}

      {/* 문서 탭 — 2컬럼 (데스크탑) */}
      {tab === "document" && (
        <div className="flex gap-4 h-[calc(100vh-220px)]">
          {/* 왼쪽: 문서 뷰어 */}
          <div className="flex-1 min-w-0 bg-surface border border-border rounded-2xl backdrop-blur-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="font-semibold text-text-primary text-sm">{state.docType} 초안</h3>
              <div className="flex items-center gap-2">
                {finalDocument && (
                  <>
                    {/* 내보내기 드롭다운 */}
                    <div className="relative" ref={exportMenuRef}>
                      <button
                        onClick={() => setShowExportMenu((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-lg text-xs text-text-dim hover:border-gold hover:text-gold transition-colors"
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
                        <div className="absolute right-0 top-full mt-1 w-48 bg-navy-light border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                          <button
                            onClick={async () => {
                              setShowExportMenu(false);
                              setExportingDocx(true);
                              try {
                                await exportToDocx(finalDocument, {
                                  docType: state.docType,
                                  clientName: state.clientName,
                                  date: new Date().toISOString().slice(0, 10),
                                });
                              } catch (err) {
                                console.error("DOCX 내보내기 실패:", err);
                              } finally {
                                setExportingDocx(false);
                              }
                            }}
                            disabled={exportingDocx}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-dim hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-40"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            {exportingDocx ? "변환 중..." : "DOCX 다운로드"}
                          </button>
                          <button
                            onClick={async () => {
                              setShowExportMenu(false);
                              setExportingHwpx(true);
                              try {
                                await exportToHwpx(finalDocument, {
                                  docType: state.docType,
                                  clientName: state.clientName,
                                  date: new Date().toISOString().slice(0, 10),
                                });
                              } catch (err) {
                                console.error("HWPX 내보내기 실패:", err);
                              } finally {
                                setExportingHwpx(false);
                              }
                            }}
                            disabled={exportingHwpx}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-dim hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-40"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {exportingHwpx ? "변환 중..." : "HWP 다운로드"}
                          </button>
                          <button
                            onClick={() => {
                              setShowExportMenu(false);
                              handleCopy(finalDocument, "doc");
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                          >
                            {copied === "doc" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied === "doc" ? "복사됨" : "텍스트 복사"}
                          </button>
                          <button
                            onClick={() => {
                              setShowExportMenu(false);
                              window.print();
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            PDF 인쇄
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-lg text-xs text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : saved ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {saving ? "저장 중..." : saved ? "저장됨" : "저장하기"}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {status === "generating_document" ? (
                <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  문서 생성 중...
                </div>
              ) : status === "error" && docError ? (
                <div className="text-center py-16">
                  <AlertTriangle className="w-8 h-8 text-error mx-auto mb-3" />
                  <p className="text-error font-medium mb-2">문서 생성 실패</p>
                  <p className="text-sm text-text-dim mb-4 max-w-md mx-auto">{docError}</p>
                  <button
                    onClick={() => {
                      if (!state) return;
                      setInitialized(false);
                    }}
                    className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors text-sm"
                  >
                    다시 시도
                  </button>
                </div>
              ) : finalDocument ? (
                <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-mono">
                  {finalDocument}
                </div>
              ) : (
                <div className="text-text-dim text-center py-16">문서가 아직 생성되지 않았습니다.</div>
              )}
            </div>
          </div>

          {/* 오른쪽: 채팅 패널 (데스크탑) */}
          <div className="hidden lg:flex w-[380px] shrink-0 bg-surface border border-border rounded-2xl backdrop-blur-sm flex-col overflow-hidden">
            {/* 채팅 헤더 */}
            <div className="p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-gold" />
                <h3 className="font-semibold text-text-primary text-sm">AI 법률 비서</h3>
              </div>
              <p className="text-[11px] text-text-dim mt-1">문서에 대해 질문하거나 수정을 요청하세요</p>
            </div>

            {/* 채팅 메시지 영역 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 && !chatLoading && (
                <div className="text-center py-8 space-y-2">
                  <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                  <p className="text-xs text-text-dim">
                    {finalDocument ? "문서를 분석하고 있습니다..." : "문서가 생성되면 자동으로 검토를 시작합니다"}
                  </p>
                </div>
              )}

              {chatMessages.map((msg: DocChatMessage) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  onApplySuggestions={applySuggestions}
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
            <div className="p-3 border-t border-border shrink-0">
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
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gold-dim/30 border border-gold/20 rounded-md text-[11px] text-gold">
                      <Paperclip className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setChatFiles((prev) => prev.filter((_, j) => j !== i))} className="hover:text-error">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => chatFileInputRef.current?.click()}
                  disabled={chatLoading}
                  className="px-2 py-2 border border-border rounded-lg text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40 shrink-0"
                  title="파일 첨부"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="질문 또는 수정 요청..."
                  rows={1}
                  className="flex-1 bg-navy-light border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none"
                />
                <button
                  onClick={handleSendChat}
                  disabled={(!chatInput.trim() && chatFiles.length === 0) || chatLoading}
                  className="px-3 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 모바일: 플로팅 채팅 버튼 */}
          <button
            onClick={() => setChatOpen(true)}
            className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40"
          >
            <MessageCircle className="w-6 h-6" />
          </button>

          {/* 모바일: 채팅 오버레이 */}
          {chatOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-navy">
              {/* 모바일 채팅 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-gold" />
                  <h3 className="font-semibold text-text-primary text-sm">AI 법률 비서</h3>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-text-dim hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 모바일 채팅 메시지 */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && !chatLoading && (
                  <div className="text-center py-8 space-y-2">
                    <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                    <p className="text-xs text-text-dim">
                      {finalDocument ? "문서를 분석하고 있습니다..." : "문서가 생성되면 자동으로 검토를 시작합니다"}
                    </p>
                  </div>
                )}

                {chatMessages.map((msg: DocChatMessage) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    onApplySuggestions={applySuggestions}
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
                      <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gold-dim/30 border border-gold/20 rounded-md text-[11px] text-gold">
                        <Paperclip className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                        <button onClick={() => setChatFiles((prev) => prev.filter((_, j) => j !== i))} className="hover:text-error">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => mobileChatFileInputRef.current?.click()}
                    disabled={chatLoading}
                    className="px-2 py-2 border border-border rounded-lg text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40 shrink-0"
                    title="파일 첨부"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="질문 또는 수정 요청..."
                    rows={1}
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={(!chatInput.trim() && chatFiles.length === 0) || chatLoading}
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
        <div className="max-w-2xl">
          <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold text-text-primary">의뢰인 카카오톡 메시지</h3>
              {clientMessage && (
                <button
                  onClick={() => handleCopy(clientMessage, "msg")}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
                >
                  {copied === "msg" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied === "msg" ? "복사됨" : "복사"}
                </button>
              )}
            </div>
            <div className="p-5">
              {status === "generating_message" ? (
                <div className="flex items-center gap-3 justify-center py-8 text-text-dim">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  메시지 생성 중...
                </div>
              ) : clientMessage ? (
                <div className="bg-[#FEE500]/10 border border-[#FEE500]/20 rounded-xl p-4">
                  <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {clientMessage}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-text-dim mb-4">의뢰인에게 보낼 메시지를 자동으로 생성합니다.</p>
                  <button
                    onClick={handleGenerateClientMessage}
                    className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
                  >
                    메시지 생성
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => navigate("/dashboard")}
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

/** 제안 카드 컴포넌트 */
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
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-2.5 transition-colors cursor-pointer ${
        checked
          ? "border-gold/40 bg-gold-dim/30"
          : "border-border hover:border-border-hover bg-navy-light/50"
      }`}
      onClick={() => !disabled && onToggle()}
    >
      <div className="flex items-start gap-2">
        <div
          className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
            checked ? "bg-gold border-gold" : "border-text-dim/40"
          }`}
        >
          {checked && <Check className="w-3 h-3 text-navy" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary">
            [제안{suggestion.id}] {suggestion.title}
          </p>
          {suggestion.description && (
            <p className="text-[11px] text-text-dim mt-0.5 line-clamp-2">{suggestion.description}</p>
          )}
          {(suggestion.current || suggestion.revised) && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-[10px] text-gold/70 hover:text-gold mt-1 flex items-center gap-0.5"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                {expanded ? "접기" : "상세 보기"}
              </button>
              {expanded && (
                <div className="mt-1.5 space-y-1.5 text-[11px]">
                  {suggestion.current && (
                    <div className="bg-red/5 border border-red/10 rounded px-2 py-1.5">
                      <span className="text-red/70 font-medium">현재: </span>
                      <span className="text-text-dim">{suggestion.current}</span>
                    </div>
                  )}
                  {suggestion.revised && (
                    <div className="bg-success/5 border border-success/10 rounded px-2 py-1.5">
                      <span className="text-success/70 font-medium">수정안: </span>
                      <span className="text-text-dim">{suggestion.revised}</span>
                    </div>
                  )}
                </div>
              )}
            </>
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
  disabled,
}: {
  message: DocChatMessage;
  onApplySuggestions: (ids: number[]) => Promise<void>;
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
          <p className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</p>
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
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
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
                className="text-[11px] text-text-dim hover:text-gold transition-colors disabled:opacity-40"
              >
                {selectedIds.size === suggestions.length ? "전체 해제" : "전체 선택"}
              </button>
              <button
                onClick={handleApply}
                disabled={disabled || selectedIds.size === 0}
                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-gold to-gold-bright text-navy text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" />
                선택 적용 ({selectedIds.size}/{suggestions.length})
              </button>
            </div>
          </div>
        )}

        {/* 적용 완료 표시 */}
        {message.editApplied && (
          <div className="flex items-center gap-1.5 text-[11px] text-success px-1">
            <Check className="w-3 h-3" />
            수정안이 문서에 적용됨
          </div>
        )}
      </div>
    </div>
  );
}
