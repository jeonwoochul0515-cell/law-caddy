import { useState } from "react";
import { Mic, FileText, Calendar, Clock, StickyNote, Plus, X, Heart } from "lucide-react";
import type { TimelineEvent } from "../../types/case";

const TIMELINE_ICONS: Record<TimelineEvent["type"], React.ElementType> = {
  consult: Mic,
  doc: FileText,
  filing: Calendar,
  response: FileText,
  note: StickyNote,
  client_care: Heart,
};

interface TimelineTabProps {
  timeline: TimelineEvent[];
  onAddNote: (label: string, detail: string) => Promise<void>;
}

export default function TimelineTab({ timeline, onAddNote }: TimelineTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [noteLabel, setNoteLabel] = useState("");
  const [noteDetail, setNoteDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 최신순 정렬
  const sorted = [...timeline].reverse();

  const handleSubmit = async () => {
    if (!noteLabel.trim()) return;
    setSubmitting(true);
    try {
      await onAddNote(noteLabel.trim(), noteDetail.trim());
      setNoteLabel("");
      setNoteDetail("");
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 메모 추가 버튼 / 폼 */}
      {showForm ? (
        <div className="bg-surface border border-gold/20 rounded-2xl p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">메모 추가</h4>
            <button
              onClick={() => setShowForm(false)}
              className="text-text-dim hover:text-error transition-colors"
            >
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
              onClick={handleSubmit}
              disabled={!noteLabel.trim() || submitting}
              className="px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "추가 중..." : "추가"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
        >
          <Plus className="w-4 h-4" />
          메모 추가
        </button>
      )}

      {/* 타임라인 리스트 */}
      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-text-dim/30 mx-auto mb-3" />
          <p className="text-text-dim mb-4">아직 타임라인 이벤트가 없습니다.</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
            >
              첫 메모 추가하기
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {sorted.map((event, i) => {
            const Icon = TIMELINE_ICONS[event.type] ?? Clock;
            const dateStr = event.date?.toDate?.()
              ? event.date.toDate().toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "";

            return (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-gold-dim rounded-full flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-gold" />
                  </div>
                  {i < sorted.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-2 mb-2" />
                  )}
                </div>
                <div className="pb-6 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-text-primary font-medium text-sm">{event.label}</p>
                    {dateStr && (
                      <span className="text-[10px] text-text-dim">{dateStr}</span>
                    )}
                  </div>
                  <p className="text-sm text-text-dim">{event.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
