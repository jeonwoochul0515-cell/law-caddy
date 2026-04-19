import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import type { Case } from "../../types/case";
import type { Recording } from "../../types/recording";
import type { LegalDocument } from "../../types/document";
import type { CaseRecord } from "../../types/caseRecord";
import type { Fee, Installment, CaseExpense, Deposit } from "../../types/accounting";
import type { ChatMessage } from "../../services/claude";
import { callClaudeChat } from "../../services/claude";
import { buildCaseAssistantContext } from "../../services/caseAssistant";
import { CASE_ASSISTANT_PERSONA } from "../../services/prompts";

interface CaseAssistantTabProps {
  caseData: Case;
  recordings: Recording[];
  documents: LegalDocument[];
  caseRecords: CaseRecord[];
  fee?: Fee | null;
  installments?: Installment[];
  caseExpenses?: CaseExpense[];
  deposits?: Deposit[];
}

const SUGGESTED_QUESTIONS = [
  "이 사건 변론 전략을 짜줘",
  "다음 변론기일까지 준비할 체크리스트 정리해줘",
  "상대방이 시효 항변할 가능성과 우리 측 반박을 정리해줘",
  "지금까지 받은 수임료와 잔여 청구액을 한 번 정리해줘",
  "사건기록과 녹음에서 가장 중요한 사실관계 3가지만 뽑아줘",
];

export default function CaseAssistantTab(props: CaseAssistantTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 사건 컨텍스트는 props 변화에만 의존 — 메모이제이션으로 불필요한 재직렬화 방지
  const context = useMemo(
    () =>
      buildCaseAssistantContext({
        caseData: props.caseData,
        recordings: props.recordings,
        documents: props.documents,
        caseRecords: props.caseRecords,
        fee: props.fee,
        installments: props.installments,
        caseExpenses: props.caseExpenses,
        deposits: props.deposits,
      }),
    [
      props.caseData,
      props.recordings,
      props.documents,
      props.caseRecords,
      props.fee,
      props.installments,
      props.caseExpenses,
      props.deposits,
    ],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);

    try {
      // sharedPrefix 자리에 사건 자료를 박아 cache_control: ephemeral 활용 (callClaude 내부 처리)
      // callClaudeChat 은 sharedPrefix 인자가 없으므로 systemPrompt 안에 prefix + persona 합쳐서 보냄
      const systemPrompt = `${context.prefix}\n\n---\n\n${CASE_ASSISTANT_PERSONA}`;
      const reply = await callClaudeChat(systemPrompt, next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // 실패 시 사용자 메시지는 유지 (재전송할 수 있게)
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggested = (q: string) => sendMessage(q);

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  const charCount = context.meta.approxChars.toLocaleString();
  const sourceCount = context.meta.sourceCount;

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      {/* 헤더 — 컨텍스트 메타 표시 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-text-primary">사건 AI 비서</h3>
          <span className="text-[11px] text-text-dim">
            자료 {sourceCount}개 · 약 {charCount}자
            {context.meta.truncated && (
              <span className="ml-1 text-amber/80" title="일부 긴 자료는 잘렸습니다">⚠ 일부 절단</span>
            )}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            새 대화
          </button>
        )}
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-surface border border-border rounded-2xl p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-6">
              <Sparkles className="w-10 h-10 text-purple-400/40 mx-auto mb-3" />
              <p className="text-sm text-text-primary mb-1">
                이 사건의 모든 자료를 읽은 AI 비서입니다.
              </p>
              <p className="text-xs text-text-dim">
                녹음·문서·사건기록·재무를 종합해 답변합니다. 자료에 근거 없는 추측은 하지 않습니다.
              </p>
            </div>

            <div>
              <p className="text-xs text-text-dim mb-2 font-medium">추천 질문</p>
              <div className="grid grid-cols-1 gap-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggested(q)}
                    disabled={sending}
                    className="text-left px-3 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary hover:border-gold/30 hover:bg-gold-dim/30 transition-colors disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user"
                    ? "bg-gold-dim text-text-primary border border-gold/20"
                    : "bg-navy-light text-text-primary border border-border"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-navy-light border border-border rounded-2xl px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-error/10 border border-error/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-error shrink-0" />
            <p className="text-xs text-error/90 flex-1">{error}</p>
            <button
              onClick={() => sendMessage(messages[messages.length - 1]?.content ?? "")}
              className="text-xs text-error hover:underline"
            >
              재시도
            </button>
          </div>
        )}
      </div>

      {/* 입력창 */}
      <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          placeholder="이 사건에 대해 무엇이든 물어보세요..."
          className="flex-1 px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/60 focus:border-gold/40 focus:outline-none transition-colors disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-400 text-white font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          전송
        </button>
      </form>
    </div>
  );
}
