import { useState } from "react";
import { Plus, X, Check, Receipt } from "lucide-react";
import type { CostItem } from "../../types/case";

const PRESETS = ["송달료", "인지대", "감정료", "증인여비", "번역료", "등록면허세"];

interface CostsSectionProps {
  costs: CostItem[];
  onAdd: (item: Omit<CostItem, "id">) => Promise<void>;
  onUpdate: (id: string, data: Partial<CostItem>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export default function CostsSection({ costs, onAdd, onUpdate, onRemove }: CostsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const totalAmount = costs.reduce((sum, c) => sum + c.amount, 0);
  const paidAmount = costs.reduce((sum, c) => c.paid ? sum + c.amount : sum, 0);
  const unpaidAmount = totalAmount - paidAmount;

  const handleAdd = async () => {
    const parsedAmount = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (!desc.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    await onAdd({
      description: desc.trim(),
      amount: parsedAmount,
      paid: false,
      date: new Date().toISOString().slice(0, 10),
    });
    setDesc("");
    setAmount("");
    setAdding(false);
  };


  return (
    <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold text-text-primary">부가비용 관리</h3>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gold hover:text-gold-bright border border-gold/20 rounded-lg hover:border-gold/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          추가
        </button>
      </div>

      {/* 요약 */}
      {costs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-navy-light rounded-lg p-3 text-center">
            <p className="text-xs text-text-dim mb-1">총액</p>
            <p className="text-sm font-semibold text-text-primary">{totalAmount.toLocaleString()}원</p>
          </div>
          <div className="bg-navy-light rounded-lg p-3 text-center">
            <p className="text-xs text-text-dim mb-1">납부완료</p>
            <p className="text-sm font-semibold text-success">{paidAmount.toLocaleString()}원</p>
          </div>
          <div className="bg-navy-light rounded-lg p-3 text-center">
            <p className="text-xs text-text-dim mb-1">미납</p>
            <p className="text-sm font-semibold text-error">{unpaidAmount.toLocaleString()}원</p>
          </div>
        </div>
      )}

      {/* 빠른 추가 프리셋 */}
      {adding && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setDesc(p)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  desc === p
                    ? "border-gold/40 bg-gold-dim text-gold"
                    : "border-border text-text-dim hover:border-border-hover"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="비용 항목"
              className="flex-1 px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              autoFocus
            />
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="금액 (원)"
              className="w-32 px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!desc.trim() || !amount.trim()}
              className="px-3 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors disabled:opacity-40"
            >
              추가
            </button>
            <button
              onClick={() => { setAdding(false); setDesc(""); setAmount(""); }}
              className="px-2 py-2 text-text-dim hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 비용 항목 목록 */}
      {costs.length === 0 ? (
        <p className="text-sm text-text-dim text-center py-4">
          등록된 부가비용이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {costs.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-navy-light rounded-lg group"
            >
              {/* 납부 토글 */}
              <button
                onClick={() => onUpdate(item.id, { paid: !item.paid })}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  item.paid
                    ? "border-success bg-success/20"
                    : "border-text-dim/30 hover:border-gold/50"
                }`}
              >
                {item.paid && <Check className="w-3 h-3 text-success" />}
              </button>

              {/* 내용 */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.paid ? "text-text-dim line-through" : "text-text-primary"}`}>
                  {item.description}
                </p>
                <p className="text-xs text-text-dim">{item.date}</p>
              </div>

              {/* 금액 */}
              <span className={`text-sm font-medium shrink-0 ${item.paid ? "text-success" : "text-text-primary"}`}>
                {item.amount.toLocaleString()}원
              </span>

              {/* 삭제 */}
              {confirmingId === item.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { onRemove(item.id); setConfirmingId(null); }}
                    className="px-2 py-0.5 text-xs text-error border border-error/30 rounded hover:bg-error/10 transition-colors"
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="px-2 py-0.5 text-xs text-text-dim border border-border rounded hover:border-border-hover transition-colors"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-error transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
