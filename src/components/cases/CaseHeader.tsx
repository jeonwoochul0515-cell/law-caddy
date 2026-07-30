import { useState } from "react";
import { Calendar, Trash2, AlertTriangle, Loader2, Pencil, X, Scale, Phone } from "lucide-react";
import type { Case, CaseInstance, CaseType } from "../../types/case";

const CASE_TYPES: CaseType[] = ["민사", "형사", "가사", "행정", "노동", "부동산", "채권·채무", "손해배상", "기타"];
const INSTANCES: CaseInstance[] = ["1심", "항소심", "상고심", "기타"];

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
  onUpdateInfo: (
    data: Partial<
      Pick<
        Case,
        "clientName" | "clientPhone" | "caseType" | "description" | "caseNumber" | "courtName" | "courtDivision" | "opponentName" | "instance"
      >
    >,
  ) => Promise<void>;
}

export default function CaseHeader({ caseData, onStatusChange, onDelete, onUpdateInfo }: CaseHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // 수정 폼 상태 — 모달을 열 때 현재 값으로 초기화
  const [form, setForm] = useState({
    clientName: "",
    clientPhone: "",
    caseType: "민사" as CaseType,
    description: "",
    caseNumber: "",
    courtName: "",
    courtDivision: "",
    opponentName: "",
    instance: "" as "" | CaseInstance,
  });

  function openEdit() {
    setForm({
      clientName: caseData.clientName,
      clientPhone: caseData.clientPhone ?? "",
      caseType: caseData.caseType,
      description: caseData.description,
      caseNumber: caseData.caseNumber ?? "",
      courtName: caseData.courtName ?? "",
      courtDivision: caseData.courtDivision ?? "",
      opponentName: caseData.opponentName ?? "",
      instance: caseData.instance ?? "",
    });
    setEditError(null);
    setEditing(true);
  }

  async function handleSaveInfo() {
    if (!form.clientName.trim()) {
      setEditError("의뢰인 이름은 비울 수 없습니다.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await onUpdateInfo({
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.replace(/\D/g, ""),
        caseType: form.caseType,
        description: form.description.trim(),
        caseNumber: form.caseNumber.trim(),
        courtName: form.courtName.trim(),
        courtDivision: form.courtDivision.trim(),
        opponentName: form.opponentName.trim(),
        ...(form.instance ? { instance: form.instance } : {}),
      });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

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
            onClick={openEdit}
            className="p-1.5 text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim"
            title="사건 정보 수정"
          >
            <Pencil className="w-4 h-4" />
          </button>
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

      {/* 사건 실체 정보 (있는 것만 표시) */}
      {(caseData.caseNumber || caseData.courtName || caseData.opponentName || caseData.instance || caseData.clientPhone) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-2 text-xs text-text-dim">
          {(caseData.courtName || caseData.caseNumber) && (
            <span className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              {[caseData.courtName, caseData.courtDivision, caseData.caseNumber].filter(Boolean).join(" ")}
              {caseData.instance && ` (${caseData.instance})`}
            </span>
          )}
          {caseData.opponentName && <span>상대방: {caseData.opponentName}</span>}
          {caseData.clientPhone && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {caseData.clientPhone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3")}
            </span>
          )}
        </div>
      )}

      {createdDate && (
        <div className="flex items-center gap-1.5 text-xs text-text-dim">
          <Calendar className="w-3.5 h-3.5" />
          <span>등록일: {createdDate}</span>
        </div>
      )}

      {/* 사건 정보 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-navy border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-navy">
              <h3 className="font-semibold text-text-primary">사건 정보 수정</h3>
              <button onClick={() => setEditing(false)} className="p-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">의뢰인 이름 *</label>
                  <input
                    value={form.clientName}
                    onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">의뢰인 연락처</label>
                  <input
                    type="tel"
                    value={form.clientPhone}
                    onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                    placeholder="010-1234-5678"
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">사건 유형</label>
                  <select
                    value={form.caseType}
                    onChange={(e) => setForm((f) => ({ ...f, caseType: e.target.value as CaseType }))}
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40"
                  >
                    {CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">심급</label>
                  <select
                    value={form.instance}
                    onChange={(e) => setForm((f) => ({ ...f, instance: e.target.value as "" | CaseInstance }))}
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40"
                  >
                    <option value="">미지정</option>
                    {INSTANCES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">사건번호</label>
                  <input
                    value={form.caseNumber}
                    onChange={(e) => setForm((f) => ({ ...f, caseNumber: e.target.value }))}
                    placeholder="2026가단12345"
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">상대방</label>
                  <input
                    value={form.opponentName}
                    onChange={(e) => setForm((f) => ({ ...f, opponentName: e.target.value }))}
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">관할법원</label>
                  <input
                    value={form.courtName}
                    onChange={(e) => setForm((f) => ({ ...f, courtName: e.target.value }))}
                    placeholder="부산지방법원"
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">재판부</label>
                  <input
                    value={form.courtDivision}
                    onChange={(e) => setForm((f) => ({ ...f, courtDivision: e.target.value }))}
                    placeholder="민사3단독"
                    className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-dim mb-1.5">사건 개요</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40 resize-y"
                />
              </div>
              {editError && <p className="text-sm text-error">{editError}</p>}
            </div>
            <div className="flex gap-2 justify-end px-6 py-4 border-t border-border sticky bottom-0 bg-navy">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-text-dim border border-border rounded-xl hover:border-border-hover transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveInfo}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                저장
              </button>
            </div>
          </div>
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
