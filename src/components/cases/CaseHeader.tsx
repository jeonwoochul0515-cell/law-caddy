import { Calendar } from "lucide-react";
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
}

export default function CaseHeader({ caseData, onStatusChange }: CaseHeaderProps) {
  const typeColor = CASE_TYPE_COLORS[caseData.caseType] ?? CASE_TYPE_COLORS["기타"];
  const createdDate = caseData.createdAt?.toDate?.()
    ? caseData.createdAt.toDate().toLocaleDateString("ko-KR")
    : "";

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold text-text-primary">{caseData.clientName}</h2>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
            {caseData.caseType}
          </span>
        </div>
        <select
          value={caseData.status}
          onChange={(e) => onStatusChange(e.target.value as "진행중" | "완료" | "보류")}
          className={`appearance-none bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer focus:border-gold/40 focus:outline-none ${STATUS_COLORS[caseData.status] ?? ""}`}
        >
          <option value="진행중">진행중</option>
          <option value="완료">완료</option>
          <option value="보류">보류</option>
        </select>
      </div>

      <p className="text-sm text-text-primary leading-relaxed mb-3">{caseData.description}</p>

      {createdDate && (
        <div className="flex items-center gap-1.5 text-xs text-text-dim">
          <Calendar className="w-3.5 h-3.5" />
          <span>등록일: {createdDate}</span>
        </div>
      )}
    </div>
  );
}
