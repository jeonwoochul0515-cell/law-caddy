import { useState, useRef } from "react";
import { Upload, FileText, Trash2, Plus, X, ExternalLink, Loader2 } from "lucide-react";
import type { OpponentDoc } from "../../types/case";

interface OpponentDocsProps {
  opponentDocs: OpponentDoc[];
  onUpload: (file: File, label: string) => Promise<void>;
  onRemove: (docId: string) => Promise<void>;
}

export default function OpponentDocs({
  opponentDocs,
  onUpload,
  onRemove,
}: OpponentDocsProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docLabel, setDocLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedFile(null);
      setDocLabel("");
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

  const formatSize = (mb: number) => {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
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
              onClick={() => { setShowForm(false); setSelectedFile(null); setDocLabel(""); }}
              className="text-text-dim hover:text-error transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            value={docLabel}
            onChange={(e) => setDocLabel(e.target.value)}
            placeholder="서면 이름 (예: 상대방 답변서)"
            className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-gold/30 transition-colors"
          >
            <Upload className="w-6 h-6 text-text-dim" />
            {selectedFile ? (
              <div className="text-center">
                <p className="text-sm text-text-primary font-medium">{selectedFile.name}</p>
                <p className="text-xs text-text-dim">{formatSize(selectedFile.size / (1024 * 1024))}</p>
              </div>
            ) : (
              <p className="text-sm text-text-dim">파일을 선택하세요 (PDF, HWP, DOCX, 이미지)</p>
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
              onClick={() => { setShowForm(false); setSelectedFile(null); setDocLabel(""); }}
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
          <p className="text-text-dim mb-4">등록된 상대방 서면이 없습니다.</p>
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

            return (
              <div
                key={oppDoc.id}
                className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3"
              >
                <FileText className="w-5 h-5 text-amber shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{oppDoc.docLabel}</p>
                  <p className="text-xs text-text-dim">
                    {oppDoc.fileName} · {formatSize(oppDoc.fileSizeMB)}
                    {dateStr && ` · ${dateStr}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
