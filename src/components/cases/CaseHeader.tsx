import { useState } from "react";
import { Calendar, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import type { Case } from "../../types/case";

const CASE_TYPE_COLORS: Record<string, string> = {
  "민사": "bg-info/15 text-info border-info/30",
  "형사": "bg-error/15 text-error border-error/30",
  "가사": "bg-success/15 text-success border-success/30",
  "행정": "bg-amber/15 text-amber border-amber/30",
  "노동": "bg-blue/15 text-blue border-blue/30",
  "부동산": "bg-gold/15 text-gold border-gold/30",
  "채권·채무": "bg-info/15 text-info border-info/30",
  "손해배상": "bg-error/15 text-error border-error/30",
  "기타": "bg-surface text-text-dim border-border",
};

const STATUS_COLORS: Record<string, string> = {
  "진행중": "text-success",
  "완료": "text-text-dim",
  "보류": "text-warning",
};

interface CaseHeaderProps {
  caseData: Case;
  onStatusChange: (status: "진행중" | "완료" | "보류") => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function CaseHeader({ caseData, onStatusChange, onDelete }: CaseHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeColor = CASE_TYPE_COLORS[caseData.caseType] ?? CASE_TYPE_COLORS["기타"];
  const createdDate = caseData.createdAt?.toDate?.()
    ? caseData.createdAt.toDate().toLocaleDateString("ko-KR")
    : "";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold text-text-primary">{caseData.clientName}</h2>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
            {caseData.caseType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={caseData.status}
            onChange={(e) => onStatusChange(e.target.value as "진행중" | "완료" | "보류")}
            className={`appearance-none bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer focus:border-gold/40 focus:outline-none ${STATUS_COLORS[caseData.status] ?? ""}`}
          >
            <option value="진행중">진행중</option>
            <option value="완료">완료</option>
            <option value="보류">보류</option>
          </select>
          <button
            onClick={() => setConfirming(true)}
            className="p-1.5 text-text-dim hover:text-error transition-colors rounded-lg hover:bg-error/10"
            title="사건 삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-sm text-text-primary leading-relaxed mb-3">{caseData.description}</p>

      {createdDate && (
        <div className="flex items-center gap-1.5 text-xs text-text-dim">
          <Calendar className="w-3.5 h-3.5" />
          <span>등록일: {createdDate}</span>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-navy border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-error/15 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div>
                <h3 className="text-text-primary font-semibold">사건 삭제</h3>
                <p className="text-xs text-text-dim">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <p className="text-sm text-text-dim mb-6">
              <strong className="text-text-primary">{caseData.clientName}</strong> 사건을 삭제하시겠습니까?
              관련 녹음, 문서, 상대방 서면 기록은 별도로 보관됩니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-text-dim border border-border rounded-lg hover:border-border-hover transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-error rounded-lg hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
