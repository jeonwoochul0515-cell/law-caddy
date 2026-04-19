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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import useDropZone from "../../hooks/useDropZone";
import { classifyByFileName } from "../../services/caseRecordClassifier";
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

/** 사건기록 업로드 시 부모에게 전달할 메타 — 생략 시 자동 추정 */
export interface CaseRecordUploadMeta {
  docType?: RecordDocType;
  submittedBy?: RecordSubmittedBy;
}

interface CaseRecordsTabProps {
  caseRecords: CaseRecord[];
  onUpload: (file: File, meta?: CaseRecordUploadMeta) => Promise<void>;
  onRemove: (recordId: string) => Promise<void>;
  onAnalyze: (recordId: string) => Promise<void>;
}

/** 업로드 큐의 개별 파일 상태 */
interface PendingFile {
  file: File;
  docType: RecordDocType;
  submittedBy: RecordSubmittedBy;
  autoClassified: boolean; // true: 파일명 휴리스틱 성공, false: 기본값(사용자 수동 조정 필요)
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queueFiles = (files: File[]) => {
    if (files.length === 0) return;
    const queued: PendingFile[] = files.map((file) => {
      const cls = classifyByFileName(file.name);
      return {
        file,
        docType: cls.docType,
        submittedBy: cls.submittedBy,
        autoClassified: cls.confidence > 0,
      };
    });
    setPendingFiles((prev) => [...prev, ...queued]);
    setShowForm(true);
  };

  const handleAnalyze = async (recordId: string) => {
    setAnalyzingId(recordId);
    setAnalyzeError((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
    try {
      await onAnalyze(recordId);
      setExpandedId(recordId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnalyzeError((prev) => ({ ...prev, [recordId]: msg }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((droppedFiles: File[]) => {
      queueFiles(droppedFiles);
    }, []),
    [".pdf"],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    queueFiles(files);
    // 같은 파일 재선택 허용을 위해 value 초기화
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePending = (index: number, patch: Partial<PendingFile>) => {
    setPendingFiles((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch, autoClassified: false } : p)),
    );
  };

  const handleSubmit = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: pendingFiles.length });
    try {
      // 순차 업로드 — 네트워크 부담·Firestore 쓰기 한도 고려 (병렬로 바꾸려면 Promise.all)
      for (let i = 0; i < pendingFiles.length; i++) {
        const p = pendingFiles[i];
        await onUpload(p.file, { docType: p.docType, submittedBy: p.submittedBy });
        setUploadProgress({ done: i + 1, total: pendingFiles.length });
      }
      resetForm();
    } finally {
      setUploading(false);
      setUploadProgress(null);
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

  const resetForm = () => {
    setShowForm(false);
    setPendingFiles([]);
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
            <h4 className="text-sm font-semibold text-text-primary">
              사건기록 업로드
              {pendingFiles.length > 0 && (
                <span className="ml-2 text-xs text-text-dim">
                  {pendingFiles.length}개 선택됨
                </span>
              )}
            </h4>
            <button
              onClick={resetForm}
              className="text-text-dim hover:text-error transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 파일 선택/드래그 영역 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-gold/30 transition-colors"
          >
            <Upload className="w-5 h-5 text-text-dim" />
            <p className="text-xs text-text-dim">
              PDF 파일 다중 선택 가능 (여기에 끌어다 놓아도 됩니다)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* 선택된 파일 리스트 — 자동 분류 결과 미리보기 + 수정 */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {pendingFiles.map((p, idx) => (
                <div
                  key={`${p.file.name}-${idx}`}
                  className="bg-navy-light border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium truncate">
                        {p.file.name}
                      </p>
                      <p className="text-[11px] text-text-dim">
                        {formatSize(p.file.size / (1024 * 1024))}
                        {p.autoClassified ? (
                          <span className="ml-2 text-emerald-400/80">· 자동 분류됨</span>
                        ) : (
                          <span className="ml-2 text-text-dim/60">· 수동 확인 필요</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemovePending(idx)}
                      className="p-1.5 text-text-dim hover:text-error transition-colors rounded-lg hover:bg-error/10"
                      title="이 파일 제외"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={p.docType}
                      onChange={(e) =>
                        handleUpdatePending(idx, {
                          docType: e.target.value as RecordDocType,
                        })
                      }
                      className="px-2.5 py-1.5 bg-surface border border-border rounded-md text-xs text-text-primary focus:border-gold/40 focus:outline-none transition-colors"
                    >
                      {DOC_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <select
                      value={p.submittedBy}
                      onChange={(e) =>
                        handleUpdatePending(idx, {
                          submittedBy: e.target.value as RecordSubmittedBy,
                        })
                      }
                      className="px-2.5 py-1.5 bg-surface border border-border rounded-md text-xs text-text-primary focus:border-gold/40 focus:outline-none transition-colors"
                    >
                      {SUBMITTED_BY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={pendingFiles.length === 0 || uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  업로드 중 {uploadProgress && `(${uploadProgress.done}/${uploadProgress.total})`}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {pendingFiles.length > 0
                    ? `${pendingFiles.length}개 업로드`
                    : "업로드"}
                </>
              )}
            </button>
            <button
              onClick={resetForm}
              disabled={uploading}
              className="px-4 py-2 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40"
            >
              취소
            </button>
            {pendingFiles.length > 0 && !uploading && (
              <span className="text-[11px] text-text-dim ml-auto">
                자동 분류가 틀렸으면 위 드롭다운에서 수정하세요
              </span>
            )}
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

            const isAnalyzing = analyzingId === record.id;
            const canAnalyze = record.ocrStatus === "parsed";
            const hasAnalysis = !!record.analysis;
            const isExpanded = expandedId === record.id;
            const errMsg = analyzeError[record.id];

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
                      {hasAnalysis && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20">
                          <Sparkles className="w-3 h-3" />
                          분석 완료
                        </span>
                      )}
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
                    {errMsg && (
                      <p className="text-xs text-error/90 mt-1.5">분석 실패: {errMsg}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canAnalyze && (
                      <button
                        onClick={() => handleAnalyze(record.id)}
                        disabled={isAnalyzing}
                        title={hasAnalysis ? "재분석" : "AI 분석 실행"}
                        className="p-2 text-text-dim hover:text-purple-400 transition-colors rounded-lg hover:bg-purple-500/10 disabled:opacity-40"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {hasAnalysis && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        title={isExpanded ? "접기" : "분석 결과 보기"}
                        className="p-2 text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
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

                {hasAnalysis && isExpanded && record.analysis && (
                  <div className="border-t border-border p-4 space-y-4 bg-navy-light/30">
                    <div className="flex items-center gap-2 text-xs text-purple-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-medium">AI 초안 — 변호사 검토 필수</span>
                    </div>

                    {/* 상대방 주장 */}
                    {record.analysis.claims.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-text-primary mb-2">
                          상대방 주장 ({record.analysis.claims.length})
                        </h5>
                        <div className="space-y-3">
                          {record.analysis.claims.map((claim) => (
                            <div
                              key={claim.index}
                              className="bg-surface border border-border rounded-lg p-3 space-y-2"
                            >
                              <p className="text-sm text-text-primary">
                                <span className="text-gold mr-1.5">{claim.index}.</span>
                                {claim.summary}
                              </p>
                              {claim.citation && (
                                <blockquote className="text-xs text-text-dim border-l-2 border-gold/40 pl-3 italic">
                                  &ldquo;{claim.citation}&rdquo;
                                  {claim.citationPage && (
                                    <span className="ml-1.5 text-text-dim/60">
                                      (p.{claim.citationPage})
                                    </span>
                                  )}
                                </blockquote>
                              )}
                              {claim.basis && (
                                <p className="text-xs text-text-dim">
                                  <span className="text-text-dim/70">근거: </span>
                                  {claim.basis}
                                </p>
                              )}
                              {claim.weakness && (
                                <p className="text-xs text-amber/90">
                                  <span className="text-amber/70">약점: </span>
                                  {claim.weakness}
                                </p>
                              )}
                              {claim.rebuttalPoint && (
                                <p className="text-xs text-emerald-400">
                                  <span className="text-emerald-400/70">반박: </span>
                                  {claim.rebuttalPoint}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 반박 준비서면 골격 */}
                    {record.analysis.rebuttalOutline.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-text-primary mb-2">
                          반박 준비서면 골격
                        </h5>
                        <ul className="space-y-1 text-sm text-text-primary">
                          {record.analysis.rebuttalOutline.map((line, idx) => (
                            <li key={idx} className="text-text-dim">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 제안 판례·법조문 */}
                    {record.analysis.suggestedPrecedents.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-text-primary mb-2">
                          제안 판례·법조문 ({record.analysis.suggestedPrecedents.length})
                        </h5>
                        <div className="space-y-2">
                          {record.analysis.suggestedPrecedents.map((p, idx) => (
                            <div
                              key={idx}
                              className="bg-surface border border-border rounded-lg p-3 text-xs space-y-1"
                            >
                              {p.caseNumber && (
                                <p className="text-gold font-medium">{p.caseNumber}</p>
                              )}
                              {p.statute && (
                                <p className="text-text-primary">{p.statute}</p>
                              )}
                              <p className="text-text-dim">{p.relevance}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
