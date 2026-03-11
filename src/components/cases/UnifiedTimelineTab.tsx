import { useState, useCallback } from "react";
import {
  Mic, FileText, Calendar, Clock, StickyNote, Heart,
  Plus, X, ChevronDown, ChevronUp, Copy, Check,
  FileWarning, Upload, Loader2, Download, File, Image, FileIcon,
  MessageSquareText,
} from "lucide-react";
import useDropZone from "../../hooks/useDropZone";
import type { TimelineEvent, OpponentDoc } from "../../types/case";
import type { LegalDocument } from "../../types/document";
import type { Recording } from "../../types/recording";
import { getFileTypeInfo, isAudioFile, type FileCategory } from "../../utils/fileType";

// ─── 타입 ───────────────────────────────────────

/** 통합 타임라인 아이템: 타임라인 이벤트 / 문서 / 녹음 / 상대방 서면을 하나로 */
type UnifiedItem =
  | { kind: "event"; data: TimelineEvent; date: Date }
  | { kind: "document"; data: LegalDocument; date: Date }
  | { kind: "recording"; data: Recording; date: Date }
  | { kind: "opponent"; data: OpponentDoc; date: Date };

// ─── 유틸 ───────────────────────────────────────

function toDate(ts: { toDate?: () => Date; seconds?: number } | undefined): Date {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return new Date(0);
}

function formatDateFull(d: Date): string {
  if (d.getTime() === 0) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(d: Date): string {
  if (d.getTime() === 0) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}분 ${s}초`;
}

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

type FilterKind = "all" | "event" | "document" | "recording" | "opponent";

// ─── Props ──────────────────────────────────────

interface UnifiedTimelineTabProps {
  timeline: TimelineEvent[];
  documents: LegalDocument[];
  recordings: Recording[];
  opponentDocs: OpponentDoc[];
  onAddNote: (label: string, detail: string) => Promise<void>;
  onNavigateToRecord: () => void;
  onUploadOpponentDoc: (file: File, label: string) => Promise<void>;
  onRemoveOpponentDoc: (docId: string) => Promise<void>;
}

// ─── 컴포넌트 ───────────────────────────────────

export default function UnifiedTimelineTab({
  timeline,
  documents,
  recordings,
  opponentDocs,
  onAddNote,
  onNavigateToRecord,
  onUploadOpponentDoc,
  onRemoveOpponentDoc,
}: UnifiedTimelineTabProps) {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 메모 추가 폼
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteLabel, setNoteLabel] = useState("");
  const [noteDetail, setNoteDetail] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  // 상대방 서면 업로드 폼
  const [showOppForm, setShowOppForm] = useState(false);
  const [oppFile, setOppFile] = useState<File | null>(null);
  const [oppLabel, setOppLabel] = useState("");
  const [uploadingOpp, setUploadingOpp] = useState(false);

  // 드래그 앤 드롭
  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((droppedFiles: File[]) => {
      if (droppedFiles.length > 0) {
        setOppFile(droppedFiles[0]);
        if (!oppLabel.trim()) {
          setOppLabel(droppedFiles[0].name.replace(/\.[^/.]+$/, ""));
        }
        setShowOppForm(true);
      }
    }, [oppLabel]),
  );

  // 통합 아이템 리스트 구성
  const items: UnifiedItem[] = [];

  for (const ev of timeline) {
    items.push({ kind: "event", data: ev, date: toDate(ev.date) });
  }
  for (const doc of documents) {
    items.push({ kind: "document", data: doc, date: toDate(doc.createdAt) });
  }
  for (const rec of recordings) {
    items.push({ kind: "recording", data: rec, date: toDate(rec.createdAt) });
  }
  for (const opp of opponentDocs) {
    items.push({ kind: "opponent", data: opp, date: toDate(opp.createdAt) });
  }

  // 필터
  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);

  // 최신순 정렬
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

  // 날짜별 그룹핑
  const grouped = new Map<string, UnifiedItem[]>();
  for (const item of filtered) {
    const key = item.date.getTime() === 0 ? "날짜 없음" : formatDateFull(item.date);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* 무시 */ }
  };

  const handleNoteSubmit = async () => {
    if (!noteLabel.trim()) return;
    setSubmittingNote(true);
    try {
      await onAddNote(noteLabel.trim(), noteDetail.trim());
      setNoteLabel("");
      setNoteDetail("");
      setShowNoteForm(false);
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleOppUpload = async () => {
    if (!oppFile || !oppLabel.trim()) return;
    setUploadingOpp(true);
    try {
      await onUploadOpponentDoc(oppFile, oppLabel.trim());
      setOppFile(null);
      setOppLabel("");
      setShowOppForm(false);
    } finally {
      setUploadingOpp(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const FILTERS: { key: FilterKind; label: string; count: number }[] = [
    { key: "all", label: "전체", count: items.length },
    { key: "document", label: "문서", count: documents.length },
    { key: "recording", label: "첨부파일", count: recordings.length },
    { key: "opponent", label: "상대방 서면", count: opponentDocs.length },
    { key: "event", label: "메모·활동", count: timeline.length },
  ];

  return (
    <div className="space-y-4" {...dropZoneProps}>
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="flex flex-col items-center gap-3 py-10 border-2 border-dashed border-gold rounded-xl bg-gold/5">
          <Upload className="w-10 h-10 text-gold animate-bounce" />
          <p className="text-sm text-gold font-medium">파일을 여기에 놓으세요</p>
        </div>
      )}

      {/* 필터 + 액션 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filter === f.key
                  ? "bg-gold-dim text-gold border border-gold/30"
                  : "bg-surface text-text-dim border border-border hover:border-border-hover"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowNoteForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            메모
          </button>
          <button
            onClick={() => setShowOppForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            상대방 서면
          </button>
          <button
            onClick={onNavigateToRecord}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            새 상담
          </button>
        </div>
      </div>

      {/* 메모 추가 폼 */}
      {showNoteForm && (
        <div className="bg-surface border border-gold/20 rounded-2xl p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">메모 추가</h4>
            <button onClick={() => setShowNoteForm(false)} className="text-text-dim hover:text-error transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={noteLabel}
            onChange={(e) => setNoteLabel(e.target.value)}
            placeholder="메모 제목"
            className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
          />
          <textarea
            value={noteDetail}
            onChange={(e) => setNoteDetail(e.target.value)}
            placeholder="상세 내용을 입력하세요..."
            rows={3}
            className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={handleNoteSubmit}
              disabled={!noteLabel.trim() || submittingNote}
              className="px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submittingNote ? "추가 중..." : "추가"}
            </button>
            <button
              onClick={() => setShowNoteForm(false)}
              className="px-4 py-2 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 상대방 서면 업로드 폼 */}
      {showOppForm && (
        <div className="bg-surface border border-gold/20 rounded-2xl p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">상대방 서면 등록</h4>
            <button onClick={() => setShowOppForm(false)} className="text-text-dim hover:text-error transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={oppLabel}
            onChange={(e) => setOppLabel(e.target.value)}
            placeholder="서면 제목 (예: 피고 답변서)"
            className="w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
          />
          <label className="flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-gold/30 transition-colors">
            <Upload className="w-6 h-6 text-text-dim" />
            <span className="text-sm text-text-dim">
              {oppFile ? oppFile.name : "파일 선택"}
            </span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setOppFile(e.target.files[0]);
              }}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleOppUpload}
              disabled={!oppFile || !oppLabel.trim() || uploadingOpp}
              className="px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploadingOpp ? (
                <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 업로드 중...</span>
              ) : "등록"}
            </button>
            <button
              onClick={() => { setShowOppForm(false); setOppFile(null); setOppLabel(""); }}
              className="px-4 py-2 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 타임라인 리스트 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
          <p className="text-text-dim mb-4">
            {filter === "all" ? "아직 활동 내역이 없습니다." : "해당 항목이 없습니다."}
          </p>
          <button
            onClick={onNavigateToRecord}
            className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
          >
            첫 상담 시작하기
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateLabel, dateItems]) => (
            <div key={dateLabel}>
              {/* 날짜 구분선 */}
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-3.5 h-3.5 text-text-dim" />
                <span className="text-xs font-medium text-text-dim">{dateLabel}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-2 pl-2">
                {dateItems.map((item, idx) => {
                  const itemKey = getItemKey(item, idx);
                  const isExpanded = expandedId === itemKey;

                  if (item.kind === "event") {
                    return (
                      <EventCard
                        key={itemKey}
                        event={item.data}
                        time={formatTime(item.date)}
                      />
                    );
                  }

                  if (item.kind === "document") {
                    return (
                      <DocumentCard
                        key={itemKey}
                        doc={item.data}
                        time={formatTime(item.date)}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(itemKey)}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    );
                  }

                  if (item.kind === "recording") {
                    return (
                      <RecordingCard
                        key={itemKey}
                        rec={item.data}
                        time={formatTime(item.date)}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(itemKey)}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    );
                  }

                  if (item.kind === "opponent") {
                    return (
                      <OpponentCard
                        key={itemKey}
                        doc={item.data}
                        time={formatTime(item.date)}
                        onRemove={() => onRemoveOpponentDoc(item.data.id)}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 키 생성 ────────────────────────────────────

function getItemKey(item: UnifiedItem, idx: number): string {
  switch (item.kind) {
    case "event": return `ev-${idx}`;
    case "document": return `doc-${item.data.id}`;
    case "recording": return `rec-${item.data.id}`;
    case "opponent": return `opp-${item.data.id}`;
  }
}

// ─── 서브 컴포넌트 ──────────────────────────────

const EVENT_ICONS: Record<TimelineEvent["type"], React.ElementType> = {
  consult: Mic,
  doc: FileText,
  filing: Calendar,
  response: FileText,
  note: StickyNote,
  client_care: Heart,
};

function EventCard({ event, time }: { event: TimelineEvent; time: string }) {
  const Icon = EVENT_ICONS[event.type] ?? Clock;
  return (
    <div className="flex gap-3 items-start p-3 bg-surface border border-border rounded-xl">
      <div className="w-8 h-8 bg-gold-dim rounded-full flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gold" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-text-primary font-medium">{event.label}</p>
          {time && <span className="text-[10px] text-text-dim">{time}</span>}
        </div>
        {event.detail && (
          <p className="text-xs text-text-dim mt-0.5">{event.detail}</p>
        )}
      </div>
    </div>
  );
}

function DocumentCard({
  doc, time, isExpanded, onToggle, copiedId, onCopy,
}: {
  doc: LegalDocument;
  time: string;
  isExpanded: boolean;
  onToggle: () => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const status = STATUS_MAP[doc.status] ?? { label: doc.status, className: "bg-surface text-text-dim" };
  const hasContent = doc.finalDocument?.trim();

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="w-8 h-8 bg-gold/10 rounded-full flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-text-primary font-medium">{doc.docType}</p>
            {time && <span className="text-[10px] text-text-dim">{time}</span>}
          </div>
          <p className="text-xs text-text-dim">법률 문서</p>
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
              onClick={() => onCopy(doc.finalDocument, `doc-${doc.id}`)}
              className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
            >
              {copiedId === `doc-${doc.id}` ? (
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

      {isExpanded && !hasContent && doc.agentResults && (
        <div className="border-t border-border p-4">
          <p className="text-xs text-text-dim mb-2">에이전트 분석 결과 요약</p>
          <div className="space-y-2">
            {Object.entries(doc.agentResults)
              .filter(([, v]) => v?.trim())
              .map(([key, val]) => (
                <details key={key} className="bg-navy-light rounded-lg border border-border">
                  <summary className="px-3 py-2 text-xs text-text-dim cursor-pointer hover:text-gold transition-colors">
                    {key === "precedent" ? "판례 검색" : key === "legal" ? "적법성 검증" : key === "stt" ? "음성 변환" : key === "analysis" ? "쟁점 분석" : key === "docgen" ? "문서 작성" : key === "review" ? "검토·감수" : key}
                  </summary>
                  <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-xs text-text-primary leading-relaxed font-sans">{val}</pre>
                  </div>
                </details>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 파일 카테고리별 아이콘 매핑 */
const FILE_ICON_MAP: Record<FileCategory, React.ElementType> = {
  audio: Mic,
  pdf: File,
  image: Image,
  document: FileIcon,
  general: FileIcon,
};

function RecordingCard({
  rec, time, isExpanded, onToggle, copiedId, onCopy,
}: {
  rec: Recording;
  time: string;
  isExpanded: boolean;
  onToggle: () => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const sttStatus = STT_STATUS_MAP[rec.sttStatus] ?? { label: rec.sttStatus, className: "bg-surface text-text-dim" };
  const hasTranscript = rec.transcript?.trim();

  // 파일 유형 감지 — 오디오가 아닌 파일도 올바르게 표시
  const fileInfo = getFileTypeInfo(rec.fileName);
  const isAudio = isAudioFile(rec.fileName);
  const Icon = isAudio ? Mic : FILE_ICON_MAP[fileInfo.category];
  const iconColor = isAudio ? "text-amber" : fileInfo.colorClass;
  const iconBg = isAudio ? "bg-amber/10" : fileInfo.bgClass;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => (hasTranscript || rec.fileUrl) && onToggle()}
        className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${hasTranscript || rec.fileUrl ? "hover:bg-surface-hover cursor-pointer" : "cursor-default"}`}
      >
        <div className={`w-8 h-8 ${iconBg} rounded-full flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-text-primary font-medium truncate">{rec.fileName}</p>
            {time && <span className="text-[10px] text-text-dim">{time}</span>}
          </div>
          <p className="text-xs text-text-dim">
            {rec.fileSizeMB.toFixed(1)} MB
            {isAudio && rec.durationSeconds > 0 && ` · ${formatDuration(rec.durationSeconds)}`}
            {!isAudio && ` · ${fileInfo.label}`}
          </p>
          {/* STT 대화록 요약 (접힌 상태) */}
          {hasTranscript && !isExpanded && (
            <p className="text-[11px] text-info mt-0.5 truncate">
              대화록 {rec.utterances?.length ?? 0}턴 · {formatDuration(rec.durationSeconds)}
            </p>
          )}
        </div>
        {isAudio && (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${sttStatus.className}`}>
            STT {sttStatus.label}
          </span>
        )}
        {hasTranscript && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 bg-info/15 text-info">
            대화록
          </span>
        )}
        {(hasTranscript || rec.fileUrl) && (
          isExpanded
            ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0" />
            : <ChevronDown className="w-4 h-4 text-text-dim shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border p-4 space-y-3">
          {/* 오디오 재생 + 다운로드 (오디오 파일만) */}
          {rec.fileUrl && isAudio && (
            <div className="flex items-center gap-3">
              <audio controls src={rec.fileUrl} className="flex-1 h-8" />
              <a
                href={rec.fileUrl}
                download={rec.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                다운로드
              </a>
            </div>
          )}

          {/* 비-오디오 파일 다운로드 */}
          {rec.fileUrl && !isAudio && (
            <a
              href={rec.fileUrl}
              download={rec.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-text-dim hover:text-gold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {rec.fileName} 다운로드
            </a>
          )}

          {/* 대화록 */}
          {hasTranscript && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-3.5 h-3.5 text-info" />
                  <span className="text-xs text-info font-medium">대화록</span>
                  {rec.utterances && (
                    <span className="text-[10px] text-text-dim">
                      {rec.utterances.length}턴
                      {Object.keys(rec.speakers ?? {}).length > 0 && ` · 화자 ${Object.keys(rec.speakers ?? {}).length}명`}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onCopy(rec.transcript!, `rec-${rec.id}`)}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OpponentCard({
  doc, time, onRemove,
}: {
  doc: OpponentDoc;
  time: string;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl">
      <div className="w-8 h-8 bg-error/10 rounded-full flex items-center justify-center shrink-0">
        <FileWarning className="w-4 h-4 text-error" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-text-primary font-medium truncate">{doc.docLabel}</p>
          {time && <span className="text-[10px] text-text-dim">{time}</span>}
        </div>
        <p className="text-xs text-text-dim">
          {doc.fileName} · {doc.fileSizeMB.toFixed(1)} MB
        </p>
      </div>
      {doc.fileUrl && doc.fileUrl !== "#" && (
        <a
          href={doc.fileUrl}
          download={doc.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-text-dim hover:text-gold rounded-lg transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
        </a>
      )}
      {confirming ? (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => { onRemove(); setConfirming(false); }}
            className="px-2 py-1 text-[10px] bg-error/15 text-error rounded-md hover:bg-error/25 transition-colors"
          >
            삭제
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-1 text-[10px] bg-surface text-text-dim rounded-md hover:bg-surface-hover transition-colors"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="p-1.5 text-text-dim hover:text-error rounded-lg hover:bg-error/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
