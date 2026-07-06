import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Plus,
  X,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ScanLine,
  XCircle,
  Sparkles,
} from "lucide-react";
import useDropZone from "../../hooks/useDropZone";
import type {
  CaseRecord,
  RecordDocType,
  RecordSubmittedBy,
  OcrStatus,
} from "../../types/caseRecord";

const DOC_TYPE_OPTIONS: RecordDocType[] = [
  "소장",
  "답변서",
  "준비서면",
  "증거",
  "결정문",
  "판결문",
  "기타",
];

const SUBMITTED_BY_OPTIONS: RecordSubmittedBy[] = [
  "원고",
  "피고",
  "법원",
  "기타",
  "미상",
];

/** 사건기록 업로드 시 부모에게 전달할 메타 (파일은 별도 인자) */
export interface CaseRecordUploadMeta {
  docType: RecordDocType;
  submittedBy: RecordSubmittedBy;
}

interface CaseRecordsTabProps {
  caseRecords: CaseRecord[];
  onUpload: (file: File, meta: CaseRecordUploadMeta) => Promise<void>;
  onRemove: (recordId: string) => Promise<void>;
  onAnalyze: (recordId: string) => Promise<void>;
}

interface StatusBadgeStyle {
  label: string;
  className: string;
  Icon: React.ElementType;
}

const STATUS_STYLES: Record<OcrStatus, StatusBadgeStyle> = {
  pending: {
    label: "파싱 대기",
    className: "bg-text-dim/10 text-text-dim border-text-dim/20",
    Icon: Clock,
  },
  ocr_running: {
    label: "텍스트 추출 중",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Icon: ScanLine,
  },
  parsed: {
    label: "분석 가능",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Icon: CheckCircle2,
  },
  failed: {
    label: "파싱 실패",
    className: "bg-error/10 text-error border-error/20",
    Icon: XCircle,
  },
  drm_blocked: {
    label: "DRM 해제 필요",
    className: "bg-amber/10 text-amber border-amber/20",
    Icon: AlertTriangle,
  },
};

export default function CaseRecordsTab({
  caseRecords,
  onUpload,
  onRemove,
  onAnalyze,
}: CaseRecordsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<RecordDocType>("기타");
  const [submittedBy, setSubmittedBy] = useState<RecordSubmittedBy>("미상");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((droppedFiles: File[]) => {
      if (droppedFiles.length > 0) {
        setSelectedFile(droppedFiles[0]);
        setShowForm(true);
      }
    }, []),
    [".pdf"],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await onUpload(selectedFile, { docType, submittedBy });
      resetForm();
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (recordId: string) => {
    setRemovingId(recordId);
    try {
      await onRemove(recordId);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAnalyze = async (recordId: string) => {
    setAnalyzingId(recordId);
    try {
      await onAnalyze(recordId);
    } finally {
      setAnalyzingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedFile(null);
    setDocType("기타");
    setSubmittedBy("미상");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatSize = (mb: number) => {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div {...dropZoneProps}>
      {isDragging && (
        <div className="flex flex-col items-center gap-3 py-8 mb-4 border-2 border-dashed border-gold rounded-xl bg-gold/5">
          <Upload className="w-8 h-8 text-gold animate-bounce" />
          <p className="text-sm text-gold font-medium">사건기록 PDF를 여기에 놓으세요</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          사건기록 ({caseRecords.length})
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-dim rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            기록 업로드
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-surface border border-gold/20 rounded-2xl p-5 backdrop-blur-sm space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">사건기록 업로드</h4>
            <button
              onClick={resetForm}
              className="text-text-dim hover:text-error transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-dim mb-1.5 block">문서 종류</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as RecordDocType)}
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold/40 focus:outline-none transition-colors"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-dim mb-1.5 block">제출자</label>
              <select
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value as RecordSubmittedBy)}
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold/40 focus:outline-none transition-colors"
              >
                {SUBMITTED_BY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

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
              <p className="text-xs text-text-dim">PDF 파일 첨부 (전자소송에서 다운로드한 기록)</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!selectedFile || uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 업로드 중...</>
              ) : (
                <><Upload className="w-4 h-4" /> 업로드</>
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

      {caseRecords.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-2xl">
          <FileText className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
          <p className="text-text-dim mb-1">등록된 사건기록이 없습니다.</p>
          <p className="text-xs text-text-dim/60 mb-4">
            전자소송에서 다운로드한 PDF를 업로드하면 자동 분류·텍스트 추출 후 AI 분석이 가능합니다.
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              첫 기록 업로드
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {caseRecords.map((record) => {
            const dateStr = record.uploadedAt?.toDate?.()
              ? record.uploadedAt.toDate().toLocaleDateString("ko-KR")
              : "";
            const status = STATUS_STYLES[record.ocrStatus];
            const StatusIcon = status.Icon;

            return (
              <div
                key={record.id}
                className="bg-surface border border-border rounded-xl overflow-hidden"
              >
                <div className="p-4 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-text-primary font-medium truncate">
                        {record.fileName}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gold-dim text-gold border border-gold/20">
                        {record.docType}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-text-dim/10 text-text-dim border border-text-dim/15">
                        {record.submittedBy}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 ${status.className}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-text-dim mt-1">
                      {formatSize(record.fileSizeMB)}
                      {dateStr && ` · ${dateStr}`}
                      {record.submittedAt && ` · 제출일 ${record.submittedAt}`}
                    </p>
                    {record.ocrStatus === "drm_blocked" && (
                      <p className="text-xs text-amber/90 mt-1.5">
                        DRM이 걸린 PDF입니다. 전자소송에서 DRM 없는 버전으로 다시 받아 업로드해 주세요.
                      </p>
                    )}
                    {record.ocrStatus === "failed" && (
                      <p className="text-xs text-error/90 mt-1.5">
                        파싱에 실패했습니다. 파일을 확인 후 재업로드하거나 다시 시도해 주세요.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {record.storageUrl && record.storageUrl !== "#" && (
                      <a
                        href={record.storageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim"
                        title="원본 PDF 열기"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {record.ocrStatus === "parsed" && (
                      <button
                        onClick={() => handleAnalyze(record.id)}
                        disabled={analyzingId === record.id}
                        className="p-2 text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim disabled:opacity-40"
                        title={record.analyzedAt ? "AI 재분석" : "AI 분석"}
                      >
                        {analyzingId === record.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(record.id)}
                      disabled={removingId === record.id}
                      className="p-2 text-text-dim hover:text-error transition-colors rounded-lg hover:bg-error/10 disabled:opacity-40"
                      title="삭제"
                    >
                      {removingId === record.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
