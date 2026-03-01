import { useState, useRef } from "react";
import {
  Upload, FileText, Trash2, Plus, X, ExternalLink,
  Loader2, MessageSquare, Copy, Check,
} from "lucide-react";
import { callClaude } from "../../services/claude";
import { buildOpponentDocMessagePrompt } from "../../services/prompts";
import type { OpponentDoc } from "../../types/case";

interface OpponentDocsProps {
  opponentDocs: OpponentDoc[];
  onUpload: (file: File, label: string) => Promise<void>;
  onRemove: (docId: string) => Promise<void>;
  caseDesc?: string;
  firmName?: string;
  lawyerName?: string;
}

export default function OpponentDocs({
  opponentDocs,
  onUpload,
  onRemove,
  caseDesc = "",
  firmName = "",
  lawyerName = "",
}: OpponentDocsProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docLabel, setDocLabel] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 카톡 메시지 생성 상태
  const [generatingMsgId, setGeneratingMsgId] = useState<string | null>(null);
  const [generatedMessages, setGeneratedMessages] = useState<Record<string, string>>({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  // 텍스트 입력 프롬프트용 (업로드 시 저장)
  const [docContents, setDocContents] = useState<Record<string, string>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docLabel.trim()) {
        setDocLabel(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !docLabel.trim()) return;
    setUploading(true);
    try {
      await onUpload(selectedFile, docLabel.trim());
      // 텍스트 내용이 있으면 docId와 매핑하여 저장 (최신 문서)
      if (docContent.trim()) {
        // 업로드 후 가장 최근 문서에 텍스트 연결
        const latestKey = `pending-${Date.now()}`;
        setDocContents((prev) => ({ ...prev, [latestKey]: docContent.trim() }));
      }
      setSelectedFile(null);
      setDocLabel("");
      setDocContent("");
      setShowForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (docId: string) => {
    setRemovingId(docId);
    try {
      await onRemove(docId);
    } finally {
      setRemovingId(null);
    }
  };

  const handleGenerateMessage = async (oppDoc: OpponentDoc) => {
    // 이미 생성된 메시지가 있으면 토글
    if (generatedMessages[oppDoc.id]) {
      setGeneratedMessages((prev) => {
        const next = { ...prev };
        delete next[oppDoc.id];
        return next;
      });
      return;
    }

    setGeneratingMsgId(oppDoc.id);
    try {
      const content = docContents[oppDoc.id] || oppDoc.docLabel;
      const prompt = buildOpponentDocMessagePrompt({
        firmName,
        lawyerName,
        docLabel: oppDoc.docLabel,
        opponentContent: content,
        caseDesc,
      });
      const message = await callClaude(
        prompt,
        `상대방이 보낸 "${oppDoc.docLabel}"의 내용을 분석하고, 의뢰인에게 보낼 카카오톡 메시지를 작성해 주세요.`,
      );
      setGeneratedMessages((prev) => ({ ...prev, [oppDoc.id]: message }));
    } catch (err) {
      console.error("카톡 메시지 생성 실패:", err);
    } finally {
      setGeneratingMsgId(null);
    }
  };

  const handleCopyMessage = async (docId: string) => {
    const msg = generatedMessages[docId];
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedMsgId(docId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch { /* clipboard fail */ }
  };

  const formatSize = (mb: number) => {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedFile(null);
    setDocLabel("");
    setDocContent("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          상대방 서면 ({opponentDocs.length})
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-dim rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            서면 등록
          </button>
        )}
      </div>

      {/* 업로드 폼 */}
      {showForm && (
        <div className="bg-surface border border-gold/20 rounded-2xl p-5 backdrop-blur-sm space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">상대방 서면 등록</h4>
            <button
              onClick={resetForm}
              className="text-text-dim hover:text-error transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            value={docLabel}
            onChange={(e) => setDocLabel(e.target.value)}
            placeholder="서면 이름 (예: 상대방 답변서, 제1차 준비서면)"
            className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
          />

          {/* 서면 내용 텍스트 입력 */}
          <div>
            <label className="text-xs text-text-dim mb-1.5 block">
              서면 핵심 내용 (붙여넣기 또는 요약 입력)
            </label>
            <textarea
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="상대방 서면의 핵심 주장이나 내용을 붙여넣으세요. 입력하시면 AI가 의뢰인에게 보낼 쉬운 설명 메시지를 자동 생성합니다."
              rows={4}
              className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* 파일 업로드 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-gold/30 transition-colors"
          >
            <Upload className="w-5 h-5 text-text-dim" />
            {selectedFile ? (
              <div className="text-center">
                <p className="text-sm text-text-primary font-medium">{selectedFile.name}</p>
                <p className="text-xs text-text-dim">{formatSize(selectedFile.size / (1024 * 1024))}</p>
              </div>
            ) : (
              <p className="text-xs text-text-dim">파일 첨부 (PDF, HWP, DOCX, 이미지)</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.hwp,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!selectedFile || !docLabel.trim() || uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 업로드 중...</>
              ) : (
                <><Upload className="w-4 h-4" /> 등록</>
              )}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 서면 목록 */}
      {opponentDocs.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-2xl">
          <FileText className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
          <p className="text-text-dim mb-1">등록된 상대방 서면이 없습니다.</p>
          <p className="text-xs text-text-dim/60 mb-4">상대방 답변서를 등록하면 AI가 의뢰인용 카톡 메시지를 자동 생성합니다.</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              첫 서면 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {opponentDocs.map((oppDoc) => {
            const dateStr = oppDoc.createdAt?.toDate?.()
              ? oppDoc.createdAt.toDate().toLocaleDateString("ko-KR")
              : "";
            const isGenerating = generatingMsgId === oppDoc.id;
            const generatedMsg = generatedMessages[oppDoc.id];

            return (
              <div key={oppDoc.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* 카드 헤더 */}
                <div className="p-4 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary font-medium truncate">{oppDoc.docLabel}</p>
                    <p className="text-xs text-text-dim">
                      {oppDoc.fileName} · {formatSize(oppDoc.fileSizeMB)}
                      {dateStr && ` · ${dateStr}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 카톡 메시지 생성 버튼 */}
                    <button
                      onClick={() => handleGenerateMessage(oppDoc)}
                      disabled={isGenerating}
                      title="의뢰인 카톡 메시지 생성"
                      className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                        generatedMsg
                          ? "text-[#FEE500] bg-[#FEE500]/10 hover:bg-[#FEE500]/20"
                          : "text-text-dim hover:text-[#FEE500] hover:bg-[#FEE500]/10"
                      }`}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <MessageSquare className="w-4 h-4" />
                      )}
                    </button>
                    {oppDoc.fileUrl !== "#" && (
                      <a
                        href={oppDoc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleRemove(oppDoc.id)}
                      disabled={removingId === oppDoc.id}
                      className="p-2 text-text-dim hover:text-error transition-colors rounded-lg hover:bg-error/10 disabled:opacity-40"
                    >
                      {removingId === oppDoc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 생성된 카톡 메시지 */}
                {generatedMsg && (
                  <div className="border-t border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[#FEE500]">의뢰인 카카오톡 메시지</span>
                      <button
                        onClick={() => handleCopyMessage(oppDoc.id)}
                        className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
                      >
                        {copiedMsgId === oppDoc.id ? (
                          <><Check className="w-3.5 h-3.5" /> 복사됨</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> 복사</>
                        )}
                      </button>
                    </div>
                    <div className="bg-[#FEE500]/5 border border-[#FEE500]/15 rounded-xl p-4">
                      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                        {generatedMsg}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
