// 사무소 경비(office_expenses) 등록·수정 모달 — 재무 관리 화면에서 사용
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createOfficeExpense, updateOfficeExpense } from "../../services/firebase/accounting";
import type {
  OfficeExpense,
  OfficeExpenseCategory,
  PayrollCategory,
  CostType,
  PaymentMethodType,
  EvidenceType,
} from "../../types/accounting";

interface OfficeExpenseModalProps {
  ownerId: string;
  /** 수정 모드일 때 기존 경비. 없으면 신규 등록 */
  initial?: OfficeExpense | null;
  onClose: () => void;
  /** 저장 성공 후 호출 (목록 새로고침용) */
  onSaved: () => void;
}

const OFFICE_CATEGORIES: OfficeExpenseCategory[] = [
  "임대료", "관리비", "공과금_전기", "공과금_수도", "공과금_가스",
  "통신비_인터넷", "통신비_전화", "사무용품", "도서구입", "소프트웨어",
  "장비_구입", "장비_유지보수", "보험료", "변호사회비", "교육_연수비",
  "광고_마케팅", "접대비", "차량유지비", "기타",
];

const PAYROLL_CATEGORIES: PayrollCategory[] = [
  "급여", "상여금", "퇴직금", "4대보험_사업자부담", "일용직", "프리랜서_외주",
];

/** 카테고리별 고정비/변동비 기본값 (사용자가 변경 가능) */
const FIXED_COST_CATEGORIES = new Set<string>([
  "임대료", "관리비", "통신비_인터넷", "통신비_전화", "소프트웨어",
  "보험료", "변호사회비", "급여", "4대보험_사업자부담",
]);

const PAYMENT_METHODS: PaymentMethodType[] = ["계좌이체", "카드", "현금", "수표", "기타"];
const EVIDENCE_TYPES: EvidenceType[] = [
  "세금계산서", "현금영수증", "카드매출전표", "간이영수증", "거래명세서", "없음",
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputCls =
  "w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40 transition-colors";
const labelCls = "block text-xs text-text-dim mb-1.5";

export default function OfficeExpenseModal({ ownerId, initial, onClose, onSaved }: OfficeExpenseModalProps) {
  const [category, setCategory] = useState<OfficeExpenseCategory | PayrollCategory>(initial?.category ?? "임대료");
  const [costType, setCostType] = useState<CostType>(initial?.costType ?? "고정비");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState<string>(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const [recurring, setRecurring] = useState(initial?.recurring ?? false);
  const [recurringDay, setRecurringDay] = useState<string>(
    initial?.recurringDay ? String(initial.recurringDay) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(initial?.paymentMethod ?? "계좌이체");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>(initial?.evidenceType ?? "세금계산서");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCategoryChange(next: OfficeExpenseCategory | PayrollCategory) {
    setCategory(next);
    setCostType(FIXED_COST_CATEGORIES.has(next) ? "고정비" : "변동비");
  }

  async function handleSubmit() {
    const amountNum = Number(amount.replace(/,/g, ""));
    if (!description.trim()) {
      setError("적요를 입력해 주세요.");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setError("금액을 올바르게 입력해 주세요.");
      return;
    }
    if (!date) {
      setError("발생일을 선택해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const base = {
        category,
        costType,
        description: description.trim(),
        amount: amountNum,
        date,
        yearMonth: date.slice(0, 7),
        recurring,
        ...(recurring && recurringDay ? { recurringDay: Number(recurringDay) } : {}),
        paymentMethod,
        evidenceType,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      };
      if (initial) {
        await updateOfficeExpense(initial.id, base);
      } else {
        await createOfficeExpense({
          ...base,
          ownerId,
          attachments: [],
          confirmed: false,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-navy">
          <h3 className="font-semibold text-text-primary">
            {initial ? "사무소 경비 수정" : "사무소 경비 등록"}
          </h3>
          <button onClick={onClose} className="p-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 카테고리 + 고정/변동 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>카테고리</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as OfficeExpenseCategory | PayrollCategory)}
                className={inputCls}
              >
                <optgroup label="사무소 경비">
                  {OFFICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </optgroup>
                <optgroup label="인건비">
                  {PAYROLL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className={labelCls}>비용 성격</label>
              <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)} className={inputCls}>
                <option value="고정비">고정비 (매월 발생)</option>
                <option value="변동비">변동비</option>
              </select>
            </div>
          </div>

          {/* 적요 */}
          <div>
            <label className={labelCls}>적요</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 7월 사무실 임대료, 직원 급여 등"
              className={inputCls}
            />
          </div>

          {/* 금액 + 발생일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>금액 (원)</label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>발생일</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 반복 경비 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="w-4 h-4 accent-[#C8A961]"
              />
              매월 반복되는 경비
            </label>
            {recurring && (
              <div className="flex items-center gap-1.5 text-sm text-text-dim">
                매월
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={recurringDay}
                  onChange={(e) => setRecurringDay(e.target.value)}
                  className="w-16 bg-navy-light border border-border rounded-lg px-2 py-1 text-sm text-text-primary text-center focus:outline-none focus:border-gold/40"
                />
                일
              </div>
            )}
          </div>

          {/* 결제 수단 + 증빙 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>결제 수단</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)} className={inputCls}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>증빙 유형</label>
              <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as EvidenceType)} className={inputCls}>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className={labelCls}>메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="참고 사항"
              className={inputCls}
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        {/* 푸터 */}
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
            {initial ? "수정 저장" : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
