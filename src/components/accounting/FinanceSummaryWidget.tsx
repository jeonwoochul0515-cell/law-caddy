import { useNavigate } from "react-router-dom";
import { DollarSign, AlertCircle, Receipt, Landmark, ArrowRight } from "lucide-react";

interface FinanceSummaryWidgetProps {
  revenue: number;
  outstanding: number;
  expenses: number;
  deposits: number;
  loading: boolean;
}

/** 금액 포맷: 1234567 → "1,234,567" */
function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

export default function FinanceSummaryWidget({
  revenue,
  outstanding,
  expenses,
  deposits,
  loading,
}: FinanceSummaryWidgetProps) {
  const navigate = useNavigate();

  const cards = [
    {
      label: "매출",
      value: revenue,
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "미수금",
      value: outstanding,
      icon: AlertCircle,
      color: outstanding > 0 ? "text-error" : "text-text-dim",
      bgColor: outstanding > 0 ? "bg-error/10" : "bg-surface",
    },
    {
      label: "지출",
      value: expenses,
      icon: Receipt,
      color: "text-text-dim",
      bgColor: "bg-surface",
    },
    {
      label: "예수금",
      value: deposits,
      icon: Landmark,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <h3 className="font-semibold text-text-primary">이번 달 재무 요약</h3>
        <button
          onClick={() => navigate("/finance")}
          className="flex items-center gap-1 text-sm text-gold hover:text-gold-bright transition-colors"
        >
          상세 보기
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4 미니 카드 그리드 */}
      <div className="grid grid-cols-2 gap-3 p-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-navy-light/50 border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-7 h-7 ${card.bgColor} rounded-lg flex items-center justify-center`}
              >
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <span className="text-xs text-text-dim">{card.label}</span>
            </div>
            <p className={`text-lg font-bold ${card.color}`}>
              {loading ? (
                <span className="text-text-dim">-</span>
              ) : (
                <>
                  {formatAmount(card.value)}
                  <span className="text-xs font-normal ml-0.5">원</span>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
