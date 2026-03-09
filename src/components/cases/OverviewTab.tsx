import { FileText, Mic, Clock, Calendar, StickyNote, FileWarning, Heart } from "lucide-react";
import type { Case, TimelineEvent, OpponentDoc, ContractPayment, CostItem } from "../../types/case";
import type { LegalDocument } from "../../types/document";
import type { Recording } from "../../types/recording";
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
}

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
}: OverviewTabProps) {
  const timeline = caseData.timeline ?? [];
  const createdDate = caseData.createdAt?.toDate?.()
    ? caseData.createdAt.toDate().toLocaleDateString("ko-KR")
    : "-";

  const recentTimeline = [...timeline].reverse().slice(0, 3);
  const recentDocs = documents.slice(0, 2);
  const recentRecs = recordings.slice(0, 2);

  const statusColors: Record<string, string> = {
    completed: "bg-success/15 text-success",
    processing: "bg-warning/15 text-warning",
    checkpoint: "bg-info/15 text-info",
    generating: "bg-warning/15 text-warning",
  };

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
          { label: "녹음", value: recordings.length, icon: Mic, color: "text-amber" },
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

      {/* 최근 문서 & 녹음 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 최근 문서 */}
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">최근 문서</h3>
            {documents.length > 2 && (
              <button
                onClick={() => onSwitchTab("timeline")}
                className="text-xs text-gold hover:text-gold-bright transition-colors"
              >
                전체 보기
              </button>
            )}
          </div>
          {recentDocs.length === 0 ? (
            <p className="text-sm text-text-dim py-2 text-center">생성된 문서가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3 bg-navy-light rounded-lg">
                  <FileText className="w-4 h-4 text-gold shrink-0" />
                  <span className="text-sm text-text-primary flex-1 truncate">{d.docType}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[d.status] ?? "bg-surface text-text-dim"}`}>
                    {d.status === "completed" ? "완료" : d.status === "processing" ? "진행중" : d.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 녹음 */}
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">최근 녹음</h3>
            {recordings.length > 2 && (
              <button
                onClick={() => onSwitchTab("timeline")}
                className="text-xs text-gold hover:text-gold-bright transition-colors"
              >
                전체 보기
              </button>
            )}
          </div>
          {recentRecs.length === 0 ? (
            <p className="text-sm text-text-dim py-2 text-center">녹음 파일이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recentRecs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 bg-navy-light rounded-lg">
                  <Mic className="w-4 h-4 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{r.fileName}</p>
                    <p className="text-xs text-text-dim">{(r.fileSizeMB ?? 0).toFixed(1)} MB</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상대방 서면 */}
      <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">상대방 서면</h3>
          {opponentDocs.length > 0 && (
            <button
              onClick={() => onSwitchTab("timeline")}
              className="text-xs text-gold hover:text-gold-bright transition-colors"
            >
              전체 보기
            </button>
          )}
        </div>
        {opponentDocs.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-text-dim mb-3">등록된 상대방 서면이 없습니다.</p>
            <button
              onClick={() => onSwitchTab("timeline")}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              상대방 서면 등록하기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {opponentDocs.slice(0, 3).map((d) => {
              const dateStr = d.createdAt?.toDate?.()
                ? d.createdAt.toDate().toLocaleDateString("ko-KR")
                : "";
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 bg-navy-light rounded-lg">
                  <FileWarning className="w-4 h-4 text-error shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{d.docLabel}</p>
                    {dateStr && <p className="text-xs text-text-dim">{dateStr}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 빠른 실행 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onNavigateToRecord}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
        >
          <Mic className="w-4 h-4" />
          추가 상담 녹음
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
