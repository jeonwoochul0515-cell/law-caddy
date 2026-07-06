import { useState } from "react";
import {
  FileText, Mic, Clock, Calendar, StickyNote, FileWarning, Heart,
  MessageSquareText, ChevronDown, ChevronUp, Copy, Check, Download,
  Image, FileIcon, File, Paperclip, Bot, Loader2,
} from "lucide-react";
import type { Case, TimelineEvent, OpponentDoc, ContractPayment, CostItem } from "../../types/case";
import type { LegalDocument } from "../../types/document";
import type { Recording } from "../../types/recording";
import type { SigningRequest } from "../../types/signing";
import { getFileTypeInfo, isAudioFile } from "../../utils/fileType";
// 동적 import로 변경 — CaseDetailPage 청크 비대화 방지
const loadDocxExport = () => import("../../services/docxExport");
const loadHwpxExport = () => import("../../services/hwpxExport");
import ContractPaymentSection from "./ContractPaymentSection";
import CostsSection from "./CostsSection";

const TIMELINE_ICONS: Record<TimelineEvent["type"], React.ElementType> = {
  consult: Mic,
  doc: FileText,
  filing: Calendar,
  response: FileText,
  note: StickyNote,
  client_care: Heart,
};

interface OverviewTabProps {
  caseData: Case;
  documents: LegalDocument[];
  recordings: Recording[];
  opponentDocs: OpponentDoc[];
  onNavigateToRecord: () => void;
  onSwitchTab: (tab: string) => void;
  onUpdateContractPayment: (data: ContractPayment) => Promise<void>;
  onAddCostItem: (item: Omit<CostItem, "id">) => Promise<void>;
  onUpdateCostItem: (id: string, data: Partial<CostItem>) => Promise<void>;
  onRemoveCostItem: (id: string) => Promise<void>;
  onNavigateToDocument?: (doc: LegalDocument) => void;
  onCreateContract?: () => void;
  signingRequests?: SigningRequest[];
}

/** 파일 카테고리별 아이콘 매핑 */
const FILE_ICON_MAP: Record<string, React.ElementType> = {
  audio: Mic,
  pdf: File,
  image: Image,
  document: FileIcon,
  general: FileIcon,
};

export default function OverviewTab({
  caseData,
  documents,
  recordings,
  opponentDocs,
  onNavigateToRecord,
  onSwitchTab,
  onUpdateContractPayment,
  onAddCostItem,
  onUpdateCostItem,
  onRemoveCostItem,
  onNavigateToDocument,
  onCreateContract,
  signingRequests,
}: OverviewTabProps) {
  const timeline = caseData.timeline ?? [];
  const createdDate = caseData.createdAt?.toDate?.()
    ? caseData.createdAt.toDate().toLocaleDateString("ko-KR")
    : "-";

  const recentTimeline = [...timeline].reverse().slice(0, 3);

  // STT 대화록이 있는 녹음
  const recordingsWithTranscript = recordings.filter((r) => r.transcript?.trim());

  // 서류철 폴더 데이터
  const folders: FolderData[] = [
    {
      key: "legal_doc",
      label: "법률문서",
      icon: FileText,
      count: documents.length,
      colorClass: "text-gold",
      bgClass: "bg-gold/10",
      borderActive: "border-gold/40",
      preview: documents[0]?.docType,
    },
    {
      key: "recording",
      label: "첨부파일",
      icon: Paperclip,
      count: recordings.length,
      colorClass: "text-amber",
      bgClass: "bg-amber/10",
      borderActive: "border-amber/40",
      preview: recordings[0]?.fileName,
    },
    {
      key: "opponent",
      label: "상대방 서면",
      icon: FileWarning,
      count: opponentDocs.length,
      colorClass: "text-error",
      bgClass: "bg-error/10",
      borderActive: "border-error/40",
      preview: opponentDocs[0]?.docLabel,
    },
    {
      key: "stt_transcript",
      label: "STT 대화록",
      icon: MessageSquareText,
      count: recordingsWithTranscript.length,
      colorClass: "text-info",
      bgClass: "bg-info/10",
      borderActive: "border-info/40",
      preview: recordingsWithTranscript.length > 0
        ? `${recordingsWithTranscript[0].utterances?.length ?? 0}턴 대화`
        : undefined,
    },
  ];

  // 열린 서류철 상태
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const contractPayment = caseData.contractPayment ?? {
    contractSigned: false,
    retainerPaid: false,
    successFeeAgreed: false,
  };

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "문서", value: documents.length, icon: FileText, color: "text-gold" },
          { label: "첨부파일", value: recordings.length, icon: Mic, color: "text-amber" },
          { label: "상대방 서면", value: opponentDocs.length, icon: FileWarning, color: "text-error" },
          { label: "타임라인", value: timeline.length, icon: Clock, color: "text-info" },
          { label: "등록일", value: createdDate, icon: Calendar, color: "text-text-dim" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-surface border border-border rounded-2xl p-4 backdrop-blur-sm"
          >
            <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className="text-xl font-semibold text-text-primary">{stat.value}</p>
            <p className="text-xs text-text-dim">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 계약/수임료 현황 + 부가비용 관리 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ContractPaymentSection
          data={contractPayment}
          onUpdate={onUpdateContractPayment}
          onCreateContract={onCreateContract}
          signingRequests={signingRequests}
        />
        <CostsSection
          costs={caseData.costs ?? []}
          onAdd={onAddCostItem}
          onUpdate={onUpdateCostItem}
          onRemove={onRemoveCostItem}
        />
      </div>

      {/* 최근 타임라인 */}
      <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">최근 활동</h3>
          {timeline.length > 3 && (
            <button
              onClick={() => onSwitchTab("timeline")}
              className="text-xs text-gold hover:text-gold-bright transition-colors"
            >
              전체 보기
            </button>
          )}
        </div>
        {recentTimeline.length === 0 ? (
          <p className="text-sm text-text-dim py-4 text-center">아직 활동 내역이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {recentTimeline.map((event, i) => {
              const Icon = TIMELINE_ICONS[event.type] ?? Clock;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-gold-dim rounded-full flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-gold" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary font-medium">{event.label}</p>
                    <p className="text-xs text-text-dim truncate">{event.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 서류철 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">서류철</h3>
          <button
            onClick={() => onSwitchTab("timeline")}
            className="text-xs text-gold hover:text-gold-bright transition-colors"
          >
            전체 보기
          </button>
        </div>

        {/* 폴더 카드 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {folders.map((folder) => (
            <FolderCard
              key={folder.key}
              folder={folder}
              isOpen={openFolder === folder.key}
              onToggle={() => setOpenFolder(openFolder === folder.key ? null : folder.key)}
            />
          ))}
        </div>

        {/* 열린 폴더 내용 */}
        {openFolder === "legal_doc" && documents.length > 0 && (
          <FolderContents title="법률문서" colorClass="text-gold" borderClass="border-gold/20">
            {documents.map((d) => (
              <DocumentItem
                key={d.id}
                doc={d}
                clientName={caseData.clientName}
                onNavigateToDocument={onNavigateToDocument}
              />
            ))}
          </FolderContents>
        )}

        {openFolder === "recording" && recordings.length > 0 && (
          <FolderContents title="녹음/음성" colorClass="text-amber" borderClass="border-amber/20">
            {recordings.map((r) => (
              <RecordingItem key={r.id} rec={r} />
            ))}
          </FolderContents>
        )}

        {openFolder === "opponent" && opponentDocs.length > 0 && (
          <FolderContents title="상대방 서면" colorClass="text-error" borderClass="border-error/20">
            {opponentDocs.map((d) => (
              <OpponentDocItem key={d.id} doc={d} />
            ))}
          </FolderContents>
        )}

        {openFolder === "stt_transcript" && recordingsWithTranscript.length > 0 && (
          <FolderContents title="STT 대화록" colorClass="text-info" borderClass="border-info/20">
            {recordingsWithTranscript.map((r) => (
              <TranscriptItem key={r.id} rec={r} />
            ))}
          </FolderContents>
        )}
      </div>

      {/* 빠른 실행 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onNavigateToRecord}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
        >
          <Mic className="w-4 h-4" />
          추가 자료 등록
        </button>
        <button
          onClick={() => onSwitchTab("timeline")}
          className="flex items-center gap-2 px-5 py-2.5 border border-amber/30 text-amber rounded-lg hover:border-amber/60 hover:bg-amber/5 transition-colors text-sm"
        >
          <FileWarning className="w-4 h-4" />
          상대방 서면 추가
        </button>
        <button
          onClick={() => onSwitchTab("timeline")}
          className="flex items-center gap-2 px-5 py-2.5 border border-border text-text-dim rounded-lg hover:border-gold/30 hover:text-gold transition-colors text-sm"
        >
          <StickyNote className="w-4 h-4" />
          메모 추가
        </button>
      </div>
    </div>
  );
}

// ─── 서류철 폴더 카드 ──────────────────────────

interface FolderData {
  key: string;
  label: string;
  icon: React.ElementType;
  count: number;
  colorClass: string;
  bgClass: string;
  borderActive: string;
  preview?: string;
}

function FolderCard({
  folder,
  isOpen,
  onToggle,
}: {
  folder: FolderData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = folder.icon;
  const isEmpty = folder.count === 0;

  return (
    <button
      onClick={isEmpty ? undefined : onToggle}
      disabled={isEmpty}
      className={`relative bg-surface border rounded-2xl p-4 backdrop-blur-sm
        flex flex-col items-center text-center gap-2.5 min-h-[140px] justify-center
        transition-all duration-200
        ${isOpen
          ? `${folder.borderActive} shadow-lg shadow-black/20 scale-[1.02]`
          : "border-border hover:border-border-hover"
        }
        ${isEmpty ? "opacity-40 cursor-default" : "cursor-pointer hover:scale-[1.02]"}
      `}
    >
      {/* 갯수 배지 */}
      {folder.count > 0 && (
        <span className={`absolute top-2.5 right-2.5 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${folder.bgClass} ${folder.colorClass}`}>
          {folder.count}
        </span>
      )}

      {/* 폴더 아이콘 */}
      <div className={`w-12 h-12 ${folder.bgClass} rounded-xl flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${folder.colorClass}`} />
      </div>

      {/* 이름 */}
      <p className="text-sm font-medium text-text-primary">{folder.label}</p>

      {/* 미리보기 텍스트 */}
      {folder.preview ? (
        <p className="text-[10px] text-text-dim truncate w-full px-1">{folder.preview}</p>
      ) : isEmpty ? (
        <p className="text-[10px] text-text-dim">비어 있음</p>
      ) : null}

      {/* 열림 표시 */}
      {isOpen && (
        <ChevronUp className={`w-3.5 h-3.5 ${folder.colorClass} absolute bottom-2`} />
      )}
    </button>
  );
}

// ─── 폴더 내용 컨테이너 ─────────────────────────

function FolderContents({
  title,
  colorClass,
  borderClass,
  children,
}: {
  title: string;
  colorClass: string;
  borderClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-3 bg-surface border ${borderClass} rounded-2xl p-4 backdrop-blur-sm`}>
      <h4 className={`text-xs font-semibold ${colorClass} mb-3`}>{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── 폴더 내 아이템 컴포넌트들 ───────────────────

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-success/15 text-success",
  processing: "bg-warning/15 text-warning",
  checkpoint: "bg-info/15 text-info",
  generating: "bg-warning/15 text-warning",
};

function DocumentItem({ doc, clientName, onNavigateToDocument }: {
  doc: LegalDocument;
  clientName?: string;
  onNavigateToDocument?: (doc: LegalDocument) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [exporting, setExporting] = useState(false);
  const statusClass = STATUS_COLORS[doc.status] ?? "bg-surface text-text-dim";
  const statusLabel = doc.status === "completed" ? "완료" : doc.status === "processing" ? "진행중" : doc.status;
  const hasContent = doc.finalDocument?.trim();

  const handleCopy = async () => {
    if (!hasContent) return;
    try {
      await navigator.clipboard.writeText(doc.finalDocument);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 무시 */ }
  };

  return (
    <div className="bg-navy-light rounded-xl overflow-hidden">
      <button
        onClick={() => hasContent && setExpanded(!expanded)}
        className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${hasContent ? "hover:bg-surface-hover cursor-pointer" : "cursor-default"}`}
      >
        <div className="w-8 h-8 bg-gold/10 rounded-lg flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary font-medium truncate">{doc.docType}</p>
          <p className="text-[11px] text-text-dim">
            {doc.createdAt?.toDate?.()
              ? doc.createdAt.toDate().toLocaleDateString("ko-KR")
              : ""}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${statusClass}`}>
          {statusLabel}
        </span>
        {hasContent && (
          expanded
            ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0" />
            : <ChevronDown className="w-4 h-4 text-text-dim shrink-0" />
        )}
      </button>

      {expanded && hasContent && (
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gold font-medium">문서 내용</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-text-dim hover:text-gold transition-colors"
            >
              {copied ? (
                <><Check className="w-3 h-3" /> 복사됨</>
              ) : (
                <><Copy className="w-3 h-3" /> 복사</>
              )}
            </button>
          </div>
          <div className="bg-surface rounded-lg p-3 max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-xs text-text-primary leading-relaxed font-sans">
              {doc.finalDocument}
            </pre>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
            {/* 다운로드 드롭다운 */}
            <div className="relative">
              <button
                onClick={() => setShowDownload(!showDownload)}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[11px] text-text-dim hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40"
              >
                {exporting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {exporting ? "변환 중..." : "다운로드"}
              </button>
              {showDownload && (
                <div className="absolute left-0 bottom-full mb-1 w-36 bg-navy-light border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <button
                    onClick={async () => {
                      setShowDownload(false);
                      setExporting(true);
                      try {
                        const { exportToDocx } = await loadDocxExport();
                        await exportToDocx(doc.finalDocument, {
                          docType: doc.docType,
                          clientName: clientName ?? "문서",
                          date: doc.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
                        });
                      } catch (err) { console.error("DOCX 내보내기 실패:", err); }
                      finally { setExporting(false); }
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    Word (DOCX)
                  </button>
                  <button
                    onClick={async () => {
                      setShowDownload(false);
                      setExporting(true);
                      try {
                        const { exportToHwpx } = await loadHwpxExport();
                        await exportToHwpx(doc.finalDocument, {
                          docType: doc.docType,
                          clientName: clientName ?? "문서",
                          date: doc.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
                        });
                      } catch (err) { console.error("HWPX 내보내기 실패:", err); }
                      finally { setExporting(false); }
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-text-dim hover:bg-surface hover:text-text-primary transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    한글 (HWPX)
                  </button>
                </div>
              )}
            </div>

            {/* AI 수정 버튼 */}
            {onNavigateToDocument && (
              <button
                onClick={() => onNavigateToDocument(doc)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-dim text-gold rounded-lg text-[11px] font-medium hover:bg-gold/20 transition-colors"
              >
                <Bot className="w-3 h-3" />
                AI 수정
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}분 ${s}초`;
}

function RecordingItem({ rec }: { rec: Recording }) {
  const fileInfo = getFileTypeInfo(rec.fileName);
  const isAudio = isAudioFile(rec.fileName);
  const Icon = isAudio ? Mic : FILE_ICON_MAP[fileInfo.category] ?? FileIcon;
  const iconColor = isAudio ? "text-amber" : fileInfo.colorClass;
  const iconBg = isAudio ? "bg-amber/10" : fileInfo.bgClass;

  return (
    <div className="flex items-center gap-3 p-3 bg-navy-light rounded-xl">
      <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate">{rec.fileName}</p>
        <p className="text-[11px] text-text-dim">
          {rec.fileSizeMB.toFixed(1)} MB
          {isAudio && rec.durationSeconds > 0 && ` · ${formatDuration(rec.durationSeconds)}`}
        </p>
      </div>
      {rec.transcript && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/15 text-info shrink-0">
          대화록
        </span>
      )}
      {rec.fileUrl && (
        <a
          href={rec.fileUrl}
          download={rec.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-text-dim hover:text-gold transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function OpponentDocItem({ doc }: { doc: OpponentDoc }) {
  const fileInfo = getFileTypeInfo(doc.fileName);
  const Icon = FILE_ICON_MAP[fileInfo.category] ?? FileWarning;

  return (
    <div className="flex items-center gap-3 p-3 bg-navy-light rounded-xl">
      <div className={`w-8 h-8 ${fileInfo.bgClass} rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${fileInfo.colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate">{doc.docLabel}</p>
        <p className="text-[11px] text-text-dim">
          {doc.fileName} · {doc.fileSizeMB.toFixed(1)} MB
        </p>
      </div>
      {doc.fileUrl && doc.fileUrl !== "#" && (
        <a
          href={doc.fileUrl}
          download={doc.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-text-dim hover:text-gold transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function TranscriptItem({ rec }: { rec: Recording }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const utteranceCount = rec.utterances?.length ?? 0;
  const speakerCount = Object.keys(rec.speakers ?? {}).length;
  const lines = rec.transcript?.split("\n").filter((l) => l.trim()) ?? [];
  const summaryLines = lines.slice(0, 3);

  const handleCopy = async () => {
    if (!rec.transcript) return;
    try {
      await navigator.clipboard.writeText(rec.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 무시 */ }
  };

  return (
    <div className="bg-navy-light rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="w-8 h-8 bg-info/10 rounded-lg flex items-center justify-center shrink-0">
          <MessageSquareText className="w-4 h-4 text-info" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary font-medium truncate">{rec.fileName}</p>
          <p className="text-[11px] text-text-dim">
            {utteranceCount > 0 && `${utteranceCount}턴`}
            {speakerCount > 0 && ` · 화자 ${speakerCount}명`}
            {rec.durationSeconds > 0 && ` · ${formatDuration(rec.durationSeconds)}`}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0" />
          : <ChevronDown className="w-4 h-4 text-text-dim shrink-0" />
        }
      </button>

      {/* 요약 미리보기 (접힌 상태에서 3줄) */}
      {!expanded && summaryLines.length > 0 && (
        <div className="px-3 pb-3 -mt-1">
          <div className="bg-info/5 border border-info/10 rounded-lg px-3 py-2">
            {summaryLines.map((line, i) => (
              <p key={i} className="text-[11px] text-text-dim truncate">{line}</p>
            ))}
            {lines.length > 3 && (
              <p className="text-[10px] text-info/60 mt-1">... 외 {lines.length - 3}줄 더보기</p>
            )}
          </div>
        </div>
      )}

      {/* 전체 대화록 (펼친 상태) */}
      {expanded && rec.transcript && (
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-info font-medium">전체 대화록</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className="flex items-center gap-1 text-[11px] text-text-dim hover:text-gold transition-colors"
            >
              {copied ? (
                <><Check className="w-3 h-3" /> 복사됨</>
              ) : (
                <><Copy className="w-3 h-3" /> 복사</>
              )}
            </button>
          </div>
          <div className="bg-surface rounded-lg p-3 max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-xs text-text-primary leading-relaxed font-sans">
              {rec.transcript}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
