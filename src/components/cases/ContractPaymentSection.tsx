import { CheckCircle2, XCircle, FileSignature, Banknote, Trophy } from "lucide-react";
import { useState } from "react";
import type { ContractPayment } from "../../types/case";

interface ContractPaymentSectionProps {
  data: ContractPayment;
  onUpdate: (data: ContractPayment) => Promise<void>;
}

export default function ContractPaymentSection({ data, onUpdate }: ContractPaymentSectionProps) {
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState(String(data.successFeeAmount ?? ""));

  const toggle = (field: keyof ContractPayment) => {
    if (field === "successFeeAmount") return;
    const updated = { ...data, [field]: !data[field] };
    // 성공보수 약정 해제 시 금액도 초기화
    if (field === "successFeeAgreed" && !updated.successFeeAgreed) {
      updated.successFeeAmount = undefined;
    }
    onUpdate(updated);
  };

  const handleFeeSubmit = () => {
    const amount = parseInt(feeInput.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(amount) && amount > 0) {
      onUpdate({ ...data, successFeeAmount: amount });
    }
    setEditingFee(false);
  };

  const rows = [
    {
      label: "계약 체결",
      value: data.contractSigned,
      field: "contractSigned" as const,
      icon: FileSignature,
      activeColor: "text-success",
    },
    {
      label: "착수금 입금",
      value: data.retainerPaid,
      field: "retainerPaid" as const,
      icon: Banknote,
      activeColor: "text-success",
    },
    {
      label: "성공보수 약정",
      value: data.successFeeAgreed,
      field: "successFeeAgreed" as const,
      icon: Trophy,
      activeColor: "text-gold",
    },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-text-primary mb-4">계약 · 수임료 현황</h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.field}>
            <button
              onClick={() => toggle(row.field)}
              className="w-full flex items-center justify-between p-3 bg-navy-light rounded-lg hover:bg-navy-light/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <row.icon className={`w-4 h-4 ${row.value ? row.activeColor : "text-text-dim"}`} />
                <span className="text-sm text-text-primary">{row.label}</span>
              </div>
              {row.value ? (
                <CheckCircle2 className={`w-5 h-5 ${row.activeColor}`} />
              ) : (
                <XCircle className="w-5 h-5 text-text-dim/40" />
              )}
            </button>

            {/* 성공보수 금액 입력 */}
            {row.field === "successFeeAgreed" && data.successFeeAgreed && (
              <div className="mt-2 ml-7 flex items-center gap-2">
                {editingFee ? (
                  <>
                    <input
                      type="text"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFeeSubmit()}
                      placeholder="금액 입력"
                      className="w-40 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-text-dim">원</span>
                    <button
                      onClick={handleFeeSubmit}
                      className="px-2 py-1 text-xs text-gold hover:text-gold-bright transition-colors"
                    >
                      확인
                    </button>
                    <button
                      onClick={() => setEditingFee(false)}
                      className="px-2 py-1 text-xs text-text-dim hover:text-text-primary transition-colors"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setFeeInput(String(data.successFeeAmount ?? ""));
                      setEditingFee(true);
                    }}
                    className="text-xs text-text-dim hover:text-gold transition-colors"
                  >
                    {data.successFeeAmount
                      ? `성공보수: ${data.successFeeAmount.toLocaleString()}원`
                      : "금액 설정하기"}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
