import { CheckCircle2, XCircle, FileSignature, Banknote, Trophy, CreditCard, Wallet, Building2, ReceiptText, ScrollText } from "lucide-react";
import { useState } from "react";
import type { ContractPayment, PaymentMethod } from "../../types/case";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: "카드", label: "카드", icon: CreditCard },
  { value: "현금", label: "현금", icon: Wallet },
  { value: "계좌이체", label: "계좌이체", icon: Building2 },
];

interface ContractPaymentSectionProps {
  data: ContractPayment;
  onUpdate: (data: ContractPayment) => Promise<void>;
  onCreateContract?: () => void;
}

export default function ContractPaymentSection({ data, onUpdate, onCreateContract }: ContractPaymentSectionProps) {
  const [editingSuccessFee, setEditingSuccessFee] = useState(false);
  const [successFeeInput, setSuccessFeeInput] = useState(
    data.successFeeType === "fixed"
      ? String(data.successFeeAmount ?? "")
      : String(data.successFeePercent ?? ""),
  );
  const [editingRetainer, setEditingRetainer] = useState(false);
  const [retainerInput, setRetainerInput] = useState(String(data.retainerAmount ?? ""));

  const toggle = (field: "contractSigned" | "retainerPaid" | "successFeeAgreed") => {
    const updated = { ...data, [field]: !data[field] };
    if (field === "successFeeAgreed" && !updated.successFeeAgreed) {
      updated.successFeeAmount = undefined;
    }
    if (field === "retainerPaid" && !updated.retainerPaid) {
      updated.retainerAmount = undefined;
      updated.retainerDate = undefined;
      updated.retainerMethod = undefined;
      updated.receiptIssued = undefined;
    }
    onUpdate(updated);
  };

  const feeType = data.successFeeType ?? "percent"; // 기본값: %

  const handleSuccessFeeSubmit = () => {
    const val = parseFloat(successFeeInput.replace(/[^0-9.]/g, ""));
    if (!isNaN(val) && val > 0) {
      if (feeType === "percent") {
        onUpdate({ ...data, successFeePercent: val, successFeeType: "percent" });
      } else {
        onUpdate({ ...data, successFeeAmount: val, successFeeType: "fixed" });
      }
    }
    setEditingSuccessFee(false);
  };

  const handleFeeTypeChange = (type: "percent" | "fixed") => {
    onUpdate({ ...data, successFeeType: type, successFeePercent: undefined, successFeeAmount: undefined });
    setSuccessFeeInput("");
    setEditingSuccessFee(true);
  };

  const handleRetainerSubmit = () => {
    const amount = parseInt(retainerInput.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(amount) && amount > 0) {
      onUpdate({ ...data, retainerAmount: amount });
    }
    setEditingRetainer(false);
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">계약 · 수임료 현황</h3>
        {onCreateContract && (
          <button
            onClick={onCreateContract}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-[11px] hover:opacity-90 transition-opacity"
          >
            <ScrollText className="w-3.5 h-3.5" />
            수임계약서 작성
          </button>
        )}
      </div>
      <div className="space-y-3">

        {/* 계약 체결 */}
        <button
          onClick={() => toggle("contractSigned")}
          className="w-full flex items-center justify-between p-3 bg-navy-light rounded-lg hover:bg-navy-light/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileSignature className={`w-4 h-4 ${data.contractSigned ? "text-success" : "text-text-dim"}`} />
            <span className="text-sm text-text-primary">계약 체결</span>
          </div>
          {data.contractSigned ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <XCircle className="w-5 h-5 text-text-dim/40" />
          )}
        </button>

        {/* 착수금 입금 */}
        <div>
          <button
            onClick={() => toggle("retainerPaid")}
            className="w-full flex items-center justify-between p-3 bg-navy-light rounded-lg hover:bg-navy-light/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Banknote className={`w-4 h-4 ${data.retainerPaid ? "text-success" : "text-text-dim"}`} />
              <span className="text-sm text-text-primary">착수금 입금</span>
            </div>
            {data.retainerPaid ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <XCircle className="w-5 h-5 text-text-dim/40" />
            )}
          </button>

          {/* 착수금 상세 정보 */}
          {data.retainerPaid && (
            <div className="mt-2 ml-3 p-3 bg-navy-light/50 rounded-lg space-y-3 border border-border/50">
              {/* 금액 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">금액</span>
                {editingRetainer ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={retainerInput}
                      onChange={(e) => setRetainerInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRetainerSubmit()}
                      placeholder="금액"
                      className="w-28 px-2 py-1 bg-surface border border-border rounded text-xs text-text-primary text-right focus:border-gold focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-text-dim">원</span>
                    <button onClick={handleRetainerSubmit} className="px-1.5 py-0.5 text-[11px] text-gold hover:text-gold-bright">확인</button>
                    <button onClick={() => setEditingRetainer(false)} className="px-1.5 py-0.5 text-[11px] text-text-dim">취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setRetainerInput(String(data.retainerAmount ?? "")); setEditingRetainer(true); }}
                    className="text-xs text-text-primary hover:text-gold transition-colors"
                  >
                    {data.retainerAmount ? `${data.retainerAmount.toLocaleString()}원` : "금액 입력"}
                  </button>
                )}
              </div>

              {/* 입금일 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">입금일</span>
                <input
                  type="date"
                  value={data.retainerDate ?? ""}
                  onChange={(e) => onUpdate({ ...data, retainerDate: e.target.value || undefined })}
                  className="px-2 py-1 bg-surface border border-border rounded text-xs text-text-primary focus:border-gold focus:outline-none"
                />
              </div>

              {/* 결제 수단 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">결제 수단</span>
                <div className="flex gap-1">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        const updated = { ...data, retainerMethod: m.value };
                        if (m.value !== "현금") {
                          updated.receiptIssued = undefined;
                        }
                        onUpdate(updated);
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                        data.retainerMethod === m.value
                          ? "border-gold/40 bg-gold-dim text-gold"
                          : "border-border text-text-dim hover:border-border-hover"
                      }`}
                    >
                      <m.icon className="w-3 h-3" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 계산서 발행 여부 (현금일 때만) */}
              {data.retainerMethod === "현금" && (
                <button
                  onClick={() => onUpdate({ ...data, receiptIssued: !data.receiptIssued })}
                  className="w-full flex items-center justify-between p-2 bg-surface rounded-lg hover:bg-surface/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ReceiptText className={`w-3.5 h-3.5 ${data.receiptIssued ? "text-success" : "text-warning"}`} />
                    <span className="text-xs text-text-primary">계산서 발행</span>
                  </div>
                  {data.receiptIssued ? (
                    <span className="text-[11px] text-success font-medium">발행완료</span>
                  ) : (
                    <span className="text-[11px] text-warning font-medium">미발행</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 성공보수 약정 */}
        <div>
          <button
            onClick={() => toggle("successFeeAgreed")}
            className="w-full flex items-center justify-between p-3 bg-navy-light rounded-lg hover:bg-navy-light/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trophy className={`w-4 h-4 ${data.successFeeAgreed ? "text-gold" : "text-text-dim"}`} />
              <span className="text-sm text-text-primary">성공보수 약정</span>
            </div>
            {data.successFeeAgreed ? (
              <CheckCircle2 className="w-5 h-5 text-gold" />
            ) : (
              <XCircle className="w-5 h-5 text-text-dim/40" />
            )}
          </button>

          {data.successFeeAgreed && (
            <div className="mt-2 ml-3 p-3 bg-navy-light/50 rounded-lg space-y-3 border border-border/50">
              {/* 유형 선택: % / 정액 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">유형</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleFeeTypeChange("percent")}
                    className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                      feeType === "percent"
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border text-text-dim hover:border-border-hover"
                    }`}
                  >
                    % 비율
                  </button>
                  <button
                    onClick={() => handleFeeTypeChange("fixed")}
                    className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                      feeType === "fixed"
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border text-text-dim hover:border-border-hover"
                    }`}
                  >
                    정액
                  </button>
                </div>
              </div>

              {/* 금액/비율 입력 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">
                  {feeType === "percent" ? "비율" : "금액"}
                </span>
                {editingSuccessFee ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={successFeeInput}
                      onChange={(e) => setSuccessFeeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSuccessFeeSubmit()}
                      placeholder={feeType === "percent" ? "예: 10" : "금액"}
                      className="w-28 px-2 py-1 bg-surface border border-border rounded text-xs text-text-primary text-right focus:border-gold focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-text-dim">{feeType === "percent" ? "%" : "원"}</span>
                    <button onClick={handleSuccessFeeSubmit} className="px-1.5 py-0.5 text-[11px] text-gold hover:text-gold-bright">확인</button>
                    <button onClick={() => setEditingSuccessFee(false)} className="px-1.5 py-0.5 text-[11px] text-text-dim">취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSuccessFeeInput(
                        feeType === "percent"
                          ? String(data.successFeePercent ?? "")
                          : String(data.successFeeAmount ?? ""),
                      );
                      setEditingSuccessFee(true);
                    }}
                    className="text-xs text-text-primary hover:text-gold transition-colors"
                  >
                    {feeType === "percent"
                      ? (data.successFeePercent ? `${data.successFeePercent}%` : "비율 입력")
                      : (data.successFeeAmount ? `${data.successFeeAmount.toLocaleString()}원` : "금액 입력")
                    }
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
