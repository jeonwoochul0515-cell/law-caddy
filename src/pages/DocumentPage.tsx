import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  Copy,
  Check,
  MessageSquare,
  Loader2,
  Download,
  Send,
  Bot,
  User,
  CheckCircle2,
  X,
  MessageCircle,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import useDocumentChat, { type DocChatMessage } from "../hooks/useDocumentChat";
import { updateDocument, addTimelineEvent } from "../services/firebase/firestore";
import type { CaseType, DocType } from "../types/agent";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";

/** 빠른 질문 버튼 */
const QUICK_QUESTIONS = [
  "이 문서의 법적 근거를 설명해 주세요",
  "상대방 반론에 대한 대응은?",
  "문서의 약점이나 보완할 점은?",
  "더 강력한 표현으로 수정해 주세요",
];

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
        checkpointAnswers: rawState.checkpointAnswers.map((a) => ({
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
  } = useDocumentChat(
    state?.docType ?? "상담 요약 리포트",
    finalDocument,
  );

  const [copied, setCopied] = useState<"doc" | "msg" | null>(null);
  const [tab, setTab] = useState<"document" | "message">("document");
  const [initialized, setInitialized] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const [docSaved, setDocSaved] = useState(false);
  const [msgSaved, setMsgSaved] = useState(false);

  useEffect(() => {
    console.log("[DocumentPage] useEffect 실행", { hasState: !!state, initialized, status });
    if (!state || initialized) return;
    setInitialized(true);

    console.log("[DocumentPage] 문서 생성 시작", {
      clientName: state.clientName,
      docType: state.docType,
      hasAgentResults: !!state.agentResults,
      checkQuestionsCount: state.checkQuestions?.length ?? 0,
      checkpointAnswersCount: state.checkpointAnswers?.length ?? 0,
    });

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
    if (!text || chatLoading) return;
    setChatInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleApplyEdit = (edit: string) => {
    updateFinalDocument(edit);
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
                    <button
                      onClick={() => handleCopy(finalDocument, "doc")}
                      className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-lg text-xs text-text-dim hover:border-gold hover:text-gold transition-colors"
                    >
                      {copied === "doc" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === "doc" ? "복사됨" : "복사"}
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([finalDocument], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${state.docType}_${state.clientName}_${new Date().toISOString().slice(0, 10)}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-lg text-xs text-text-dim hover:border-gold hover:text-gold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      내보내기
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
                <div className="text-center py-8 space-y-4">
                  <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                  <p className="text-xs text-text-dim">
                    문서에 대해 궁금한 점을 물어보세요
                  </p>
                  <div className="space-y-2">
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="block w-full text-left px-3 py-2 rounded-lg text-xs text-text-dim bg-navy-light border border-border hover:border-gold/30 hover:text-gold transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg: DocChatMessage) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  onApplyEdit={handleApplyEdit}
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
              <div className="flex gap-2">
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
                  disabled={!chatInput.trim() || chatLoading}
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
                  <div className="text-center py-8 space-y-4">
                    <Bot className="w-8 h-8 text-gold/40 mx-auto" />
                    <p className="text-xs text-text-dim">문서에 대해 궁금한 점을 물어보세요</p>
                    <div className="space-y-2">
                      {QUICK_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="block w-full text-left px-3 py-2 rounded-lg text-xs text-text-dim bg-surface border border-border hover:border-gold/30 hover:text-gold transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((msg: DocChatMessage) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    onApplyEdit={handleApplyEdit}
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
                <div className="flex gap-2">
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
                    disabled={!chatInput.trim() || chatLoading}
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

/** 채팅 버블 컴포넌트 */
function ChatBubble({
  message,
  onApplyEdit,
}: {
  message: DocChatMessage;
  onApplyEdit: (edit: string) => void;
}) {
  const [applied, setApplied] = useState(false);

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

  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-gold-dim flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-gold" />
      </div>
      <div className="max-w-[85%] space-y-2">
        <div className="bg-navy-light rounded-xl rounded-tl-none px-3 py-2">
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        </div>

        {message.suggestedEdit && (
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-success font-medium">수정안 제안됨</span>
              {applied ? (
                <span className="flex items-center gap-1 text-[11px] text-success">
                  <CheckCircle2 className="w-3 h-3" />
                  적용됨
                </span>
              ) : (
                <button
                  onClick={() => {
                    onApplyEdit(message.suggestedEdit!);
                    setApplied(true);
                  }}
                  className="px-2 py-0.5 bg-success/15 text-success text-[11px] font-medium rounded hover:bg-success/25 transition-colors"
                >
                  적용하기
                </button>
              )}
            </div>
            <p className="text-xs text-text-dim line-clamp-3">
              {message.suggestedEdit.slice(0, 150)}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
