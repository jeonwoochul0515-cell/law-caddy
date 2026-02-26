import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, Copy, Check, MessageSquare, Loader2, Download } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import type { CaseType, DocType } from "../types/agent";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";

export default function DocumentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
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
  } | null;

  const { finalDocument, clientMessage, generateDocument, generateClientMessage, status } = useDocument();
  const [copied, setCopied] = useState<"doc" | "msg" | null>(null);
  const [tab, setTab] = useState<"document" | "message">("document");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!state || initialized) return;
    setInitialized(true);

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

  if (!state) {
    return (
      <AppLayout title="문서 생성" subtitle="">
        <div className="text-center py-16 text-text-dim">사건 정보가 없습니다.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="문서 생성" subtitle={`${state.clientName} - ${state.docType}`}>
      {/* 탭 */}
      <div className="flex gap-2 mb-6">
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

      {/* 문서 탭 */}
      {tab === "document" && (
        <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h3 className="font-semibold text-text-primary">{state.docType} 초안</h3>
            <div className="flex items-center gap-2">
              {finalDocument && (
                <>
                  <button
                    onClick={() => handleCopy(finalDocument, "doc")}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors"
                  >
                    {copied === "doc" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === "doc" ? "복사됨" : "복사"}
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold hover:text-gold transition-colors">
                    <Download className="w-4 h-4" />
                    내보내기
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="p-5">
            {status === "generating_document" ? (
              <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
                <Loader2 className="w-5 h-5 animate-spin" />
                문서 생성 중...
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

          {/* 완료 버튼 */}
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
