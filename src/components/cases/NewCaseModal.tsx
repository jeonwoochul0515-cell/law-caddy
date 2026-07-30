// 수동 사건 등록 모달 — 상담 플로우 없이 기존 진행 사건을 바로 등록 (이관·수기 등록용)
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createCase } from "../../services/firebase/firestore";
import { CASE_TYPES } from "../../config/constants";
import type { CaseInstance, CaseType } from "../../types/case";

interface NewCaseModalProps {
  ownerId: string;
  onClose: () => void;
  /** 생성 성공 시 새 사건 ID 전달 (목록 새로고침 또는 상세 이동용) */
  onCreated: (caseId: string) => void;
}

const INSTANCES: CaseInstance[] = ["1심", "항소심", "상고심", "기타"];

const inputCls =
  "w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors";
const labelCls = "block text-xs text-text-dim mb-1.5";

export default function NewCaseModal({ ownerId, onClose, onCreated }: NewCaseModalProps) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("민사");
  const [description, setDescription] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [courtName, setCourtName] = useState("");
  const [courtDivision, setCourtDivision] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [instance, setInstance] = useState<"" | CaseInstance>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!clientName.trim()) {
      setError("의뢰인 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const caseId = await createCase({
        ownerId,
        clientName: clientName.trim(),
        caseType,
        description: description.trim(),
        status: "진행중",
        timeline: [],
        ...(clientPhone.trim() ? { clientPhone: clientPhone.replace(/\D/g, "") } : {}),
        ...(caseNumber.trim() ? { caseNumber: caseNumber.trim() } : {}),
        ...(courtName.trim() ? { courtName: courtName.trim() } : {}),
        ...(courtDivision.trim() ? { courtDivision: courtDivision.trim() } : {}),
        ...(opponentName.trim() ? { opponentName: opponentName.trim() } : {}),
        ...(instance ? { instance } : {}),
      });
      onCreated(caseId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사건 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-navy">
          <div>
            <h3 className="font-semibold text-text-primary">새 사건 등록</h3>
            <p className="text-xs text-text-dim mt-0.5">진행 중인 사건을 상담 없이 바로 등록합니다</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>의뢰인 이름 *</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>의뢰인 연락처</label>
              <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="010-1234-5678" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>사건 유형 *</label>
              <select value={caseType} onChange={(e) => setCaseType(e.target.value as CaseType)} className={inputCls}>
                {CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>심급</label>
              <select value={instance} onChange={(e) => setInstance(e.target.value as "" | CaseInstance)} className={inputCls}>
                <option value="">미지정 (소 제기 전 등)</option>
                {INSTANCES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>사건 개요</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="예: 임대차보증금 5,500만원 반환 청구 — 만기 후 미반환, 내용증명 발송 완료"
              className={`${inputCls} resize-y`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>사건번호</label>
              <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="2026가단12345" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>상대방</label>
              <input value={opponentName} onChange={(e) => setOpponentName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>관할법원</label>
              <input value={courtName} onChange={(e) => setCourtName(e.target.value)} placeholder="부산지방법원" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>재판부</label>
              <input value={courtDivision} onChange={(e) => setCourtDivision(e.target.value)} placeholder="민사3단독" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-border sticky bottom-0 bg-navy">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-text-dim border border-border rounded-xl hover:border-border-hover transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
