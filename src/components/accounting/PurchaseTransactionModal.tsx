// 매입 거래(transactions, type=매입) 등록·수정 모달 — 재무 관리 화면에서 사용
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createTransaction, updateTransaction } from "../../services/firebase/accounting";
import type {
  Transaction,
  ExpenseSubType,
  PaymentMethodType,
  EvidenceType,
} from "../../types/accounting";

interface PurchaseTransactionModalProps {
  ownerId: string;
  /** 수정 모드일 때 기존 거래. 없으면 신규 등록 */
  initial?: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}

const EXPENSE_SUB_TYPES: ExpenseSubType[] = [
  "사무실임대료", "사무용품", "통신비", "도서구입", "교육비", "교통비",
  "접대비", "광고비", "보험료", "회비", "인건비", "외주비", "기타매입",
];

const PAYMENT_METHODS: PaymentMethodType[] = ["계좌이체", "카드", "현금", "수표", "기타"];
const EVIDENCE_TYPES: EvidenceType[] = [
  "세금계산서", "현금영수증", "카드매출전표", "간이영수증", "거래명세서", "없음",
];

/** 매입세액공제가 가능한 증빙 — 그 외에는 부가세를 0으로 안내 */
const VAT_DEDUCTIBLE_EVIDENCE = new Set<EvidenceType>(["세금계산서", "현금영수증", "카드매출전표"]);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputCls =
  "w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/40 transition-colors";
const labelCls = "block text-xs text-text-dim mb-1.5";

export default function PurchaseTransactionModal({ ownerId, initial, onClose, onSaved }: PurchaseTransactionModalProps) {
  const [subType, setSubType] = useState<ExpenseSubType>((initial?.subType as ExpenseSubType) ?? "사무실임대료");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const [supplyAmount, setSupplyAmount] = useState<string>(initial ? String(initial.vat.supplyAmount) : "");
  const [vatAmount, setVatAmount] = useState<string>(initial ? String(initial.vat.vatAmount) : "");
  /** 사용자가 부가세를 직접 고쳤으면 공급가액 변경 시 자동 계산을 멈춘다 */
  const [vatTouched, setVatTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(initial?.paymentMethod ?? "계좌이체");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>(initial?.evidenceType ?? "세금계산서");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplyNum = Number(supplyAmount.replace(/,/g, "")) || 0;
  const vatNum = Number(vatAmount.replace(/,/g, "")) || 0;
  const totalNum = supplyNum + vatNum;

  function handleSupplyChange(v: string) {
    setSupplyAmount(v);
    if (!vatTouched) {
      const n = Number(v.replace(/,/g, "")) || 0;
      setVatAmount(VAT_DEDUCTIBLE_EVIDENCE.has(evidenceType) ? String(Math.round(n * 0.1)) : "0");
    }
  }

  function handleEvidenceChange(next: EvidenceType) {
    setEvidenceType(next);
    if (!vatTouched) {
      setVatAmount(VAT_DEDUCTIBLE_EVIDENCE.has(next) ? String(Math.round(supplyNum * 0.1)) : "0");
    }
  }

  async function handleSubmit() {
    if (!description.trim()) {
      setError("적요를 입력해 주세요.");
      return;
    }
    if (supplyNum <= 0) {
      setError("공급가액을 올바르게 입력해 주세요.");
      return;
    }
    if (!date) {
      setError("거래일을 선택해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const base = {
        subType,
        description: description.trim(),
        ...(clientName.trim() ? { clientName: clientName.trim() } : {}),
        date,
        vat: { supplyAmount: supplyNum, vatAmount: vatNum, totalAmount: totalNum },
        paymentMethod,
        evidenceType,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      };
      if (initial) {
        await updateTransaction(initial.id, base);
      } else {
        await createTransaction({
          ...base,
          ownerId,
          type: "매입",
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
            {initial ? "매입 거래 수정" : "매입 거래 등록"}
          </h3>
          <button onClick={onClose} className="p-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 유형 + 거래처 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>매입 유형</label>
              <select value={subType} onChange={(e) => setSubType(e.target.value as ExpenseSubType)} className={inputCls}>
                {EXPENSE_SUB_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>거래처 (선택)</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="예: ○○빌딩, ○○문구"
                className={inputCls}
              />
            </div>
          </div>

          {/* 적요 + 거래일 */}
          <div>
            <label className={labelCls}>적요</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 복합기 토너 구입"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>거래일</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>

          {/* 금액 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>공급가액 (원)</label>
              <input
                type="number"
                min={0}
                value={supplyAmount}
                onChange={(e) => handleSupplyChange(e.target.value)}
                placeholder="100000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>부가세 (원)</label>
              <input
                type="number"
                min={0}
                value={vatAmount}
                onChange={(e) => {
                  setVatTouched(true);
                  setVatAmount(e.target.value);
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>합계</label>
              <div className="px-3 py-2.5 text-sm font-semibold text-gold bg-navy-light border border-border rounded-xl">
                {totalNum.toLocaleString("ko-KR")}원
              </div>
            </div>
          </div>
          {!VAT_DEDUCTIBLE_EVIDENCE.has(evidenceType) && (
            <p className="text-xs text-warning">
              {evidenceType === "없음" ? "증빙이 없으면" : `${evidenceType}은(는)`} 매입세액공제가 되지 않아 부가세를 0으로 계산했습니다.
            </p>
          )}

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
              <select value={evidenceType} onChange={(e) => handleEvidenceChange(e.target.value as EvidenceType)} className={inputCls}>
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
