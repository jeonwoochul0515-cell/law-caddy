import { useState } from "react";
import { FileText, Mic, Plus, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import type { LegalDocument } from "../../types/document";
import type { Recording } from "../../types/recording";
import type { OpponentDoc } from "../../types/case";
import OpponentDocs from "./OpponentDocs";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  completed: { label: "완료", className: "bg-success/15 text-success" },
  processing: { label: "진행중", className: "bg-warning/15 text-warning animate-pulse" },
  checkpoint: { label: "체크포인트", className: "bg-info/15 text-info" },
  generating: { label: "생성중", className: "bg-warning/15 text-warning" },
};

const STT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  completed: { label: "완료", className: "bg-success/15 text-success" },
  processing: { label: "처리중", className: "bg-warning/15 text-warning animate-pulse" },
  pending: { label: "대기", className: "bg-surface text-text-dim" },
  failed: { label: "실패", className: "bg-error/15 text-error" },
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}분 ${s}초`;
}

interface DocumentsTabProps {
  documents: LegalDocument[];
  recordings: Recording[];
  opponentDocs: OpponentDoc[];
  onNavigateToRecord: () => void;
  onUploadOpponentDoc: (file: File, label: string) => Promise<void>;
  onRemoveOpponentDoc: (docId: string) => Promise<void>;
  caseDesc?: string;
  firmName?: string;
  lawyerName?: string;
}

export default function DocumentsTab({
  documents,
  recordings,
  opponentDocs,
  onNavigateToRecord,
  onUploadOpponentDoc,
  onRemoveOpponentDoc,
  caseDesc,
  firmName,
  lawyerName,
}: DocumentsTabProps) {
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // 복사 실패 무시
    }
  };

  return (
    <div className="space-y-8">
      {/* 문서 섹션 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            문서 ({documents.length})
          </h3>
          <button
            onClick={onNavigateToRecord}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            새 문서 생성
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-2xl">
            <FileText className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
            <p className="text-text-dim mb-4">생성된 문서가 없습니다.</p>
            <button
              onClick={onNavigateToRecord}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              첫 문서 생성하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const status = STATUS_MAP[doc.status] ?? { label: doc.status, className: "bg-surface text-text-dim" };
              const hasContent = doc.finalDocument?.trim();
              const createdDate = doc.createdAt?.toDate?.()
                ? doc.createdAt.toDate().toLocaleDateString("ko-KR")
                : "";

              return (
                <div
                  key={doc.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                    className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors"
                  >
                    <FileText className="w-5 h-5 text-gold shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium">{doc.docType}</p>
                      {createdDate && (
                        <p className="text-xs text-text-dim">{createdDate}</p>
                      )}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${status.className}`}>
                      {status.label}
                    </span>
                    {hasContent && (
                      isExpanded
                        ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-text-dim shrink-0" />
                    )}
                  </button>

                  {isExpanded && hasContent && (
                    <div className="border-t border-border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-text-dim">문서 내용</span>
                        <button
                          onClick={() => handleCopy(doc.finalDocument, doc.id)}
                          className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
                        >
                          {copiedId === doc.id ? (
                            <><Check className="w-3.5 h-3.5" /> 복사됨</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> 복사</>
                          )}
                        </button>
                      </div>
                      <div className="bg-navy-light rounded-lg p-4 max-h-80 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-sans">
                          {doc.finalDocument}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 녹음 섹션 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            녹음 ({recordings.length})
          </h3>
          <button
            onClick={onNavigateToRecord}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-dim rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            새 녹음 추가
          </button>
        </div>

        {recordings.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-2xl">
            <Mic className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
            <p className="text-text-dim mb-4">녹음 파일이 없습니다.</p>
            <button
              onClick={onNavigateToRecord}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              새 상담 녹음
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {recordings.map((rec) => {
              const isExpanded = expandedRecId === rec.id;
              const sttStatus = STT_STATUS_MAP[rec.sttStatus] ?? { label: rec.sttStatus, className: "bg-surface text-text-dim" };
              const hasTranscript = rec.transcript?.trim();

              return (
                <div
                  key={rec.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => hasTranscript && setExpandedRecId(isExpanded ? null : rec.id)}
                    className={`w-full p-4 flex items-center gap-3 text-left transition-colors ${hasTranscript ? "hover:bg-surface-hover cursor-pointer" : "cursor-default"}`}
                  >
                    <Mic className="w-5 h-5 text-amber shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium truncate">{rec.fileName}</p>
                      <p className="text-xs text-text-dim">
                        {rec.fileSizeMB.toFixed(1)} MB
                        {rec.durationSeconds > 0 && ` · ${formatDuration(rec.durationSeconds)}`}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${sttStatus.className}`}>
                      STT {sttStatus.label}
                    </span>
                    {hasTranscript && (
                      isExpanded
                        ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-text-dim shrink-0" />
                    )}
                  </button>

                  {isExpanded && hasTranscript && (
                    <div className="border-t border-border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-text-dim">대화록</span>
                        <button
                          onClick={() => handleCopy(rec.transcript!, `rec-${rec.id}`)}
                          className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
                        >
                          {copiedId === `rec-${rec.id}` ? (
                            <><Check className="w-3.5 h-3.5" /> 복사됨</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> 복사</>
                          )}
                        </button>
                      </div>
                      <div className="bg-navy-light rounded-lg p-4 max-h-60 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-sans">
                          {rec.transcript}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 상대방 서면 섹션 */}
      <OpponentDocs
        opponentDocs={opponentDocs}
        onUpload={onUploadOpponentDoc}
        onRemove={onRemoveOpponentDoc}
        caseDesc={caseDesc}
        firmName={firmName}
        lawyerName={lawyerName}
      />
    </div>
  );
}
