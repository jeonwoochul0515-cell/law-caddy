import { useEffect, useRef, useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { loadPaymentWidget, type PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";
import useAuth from "../../hooks/useAuth";
import { PLANS } from "../../config/constants";
import {
  createOrderId,
  getTossClientKey,
  YEARLY_MULTIPLIER,
  type BillingPeriod,
} from "../../services/payment";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
}

/** 결제수단 위젯 핸들 (기간 전환 시 금액 갱신용) */
type MethodsWidget = ReturnType<PaymentWidgetInstance["renderPaymentMethods"]>;

export default function PaymentModal({
  isOpen,
  onClose,
  planId,
  planName,
}: PaymentModalProps) {
  const user = useAuth((s) => s.user);
  const [widget, setWidget] = useState<PaymentWidgetInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("m");
  const methodsWidgetRef = useRef<MethodsWidget | null>(null);

  const monthlyAmount = PLANS.find((p) => p.id === planId)?.amount ?? 0;
  const yearlyAmount = monthlyAmount * YEARLY_MULTIPLIER;
  const amount = period === "y" ? yearlyAmount : monthlyAmount;

  useEffect(() => {
    if (!isOpen || !user || monthlyAmount <= 0) return;

    let cancelled = false;
    setReady(false);
    setError(null);
    setPeriod("m");

    (async () => {
      try {
        const paymentWidget = await loadPaymentWidget(getTossClientKey(), user.uid);
        if (cancelled) return;

        methodsWidgetRef.current = paymentWidget.renderPaymentMethods(
          "#toss-payment-methods",
          monthlyAmount,
        );
        paymentWidget.renderAgreement("#toss-agreement");
        setWidget(paymentWidget);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "결제위젯을 불러오지 못했습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
      methodsWidgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.uid, monthlyAmount]);

  if (!isOpen) return null;

  const handlePeriodChange = (next: BillingPeriod) => {
    setPeriod(next);
    const nextAmount = next === "y" ? yearlyAmount : monthlyAmount;
    methodsWidgetRef.current?.updateAmount(nextAmount);
  };

  const handlePay = async () => {
    if (!widget || !user) return;
    setSubmitting(true);
    setError(null);

    try {
      await widget.requestPayment({
        orderId: createOrderId(planId, period, user.uid),
        orderName: `Law-Caddy ${planName} 플랜 (${period === "y" ? "연결제 12개월" : "월결제 1개월"})`,
        customerEmail: user.email,
        customerName: user.name,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 요청 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative w-full max-w-md bg-[#0f1729] border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h3 id="payment-modal-title" className="text-lg font-semibold text-text-primary">플랜 변경</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-text-dim hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 선택한 플랜 요약 */}
        <div className="px-6 py-5">
          {/* 월/연 결제 선택 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => handlePeriodChange("m")}
              className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${
                period === "m"
                  ? "border-gold/60 bg-gold-dim/50 text-gold"
                  : "border-border text-text-dim hover:border-border-hover"
              }`}
            >
              월결제
              <span className="block mt-0.5 text-xs font-normal">
                ₩{monthlyAmount.toLocaleString()}/월
              </span>
            </button>
            <button
              onClick={() => handlePeriodChange("y")}
              className={`relative py-3 rounded-xl border text-sm font-semibold transition-colors ${
                period === "y"
                  ? "border-gold/60 bg-gold-dim/50 text-gold"
                  : "border-border text-text-dim hover:border-border-hover"
              }`}
            >
              <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded bg-gold text-navy text-[10px] font-bold">
                2개월 무료
              </span>
              연결제
              <span className="block mt-0.5 text-xs font-normal">
                ₩{yearlyAmount.toLocaleString()}/년
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gold-dim/50 border border-gold/20 rounded-xl mb-6">
            <div>
              <p className="text-sm text-text-dim">선택한 플랜</p>
              <p className="text-lg font-semibold text-gold">
                {planName} · {period === "y" ? "연결제 (12개월)" : "월결제 (1개월)"}
              </p>
              {period === "y" && (
                <p className="text-xs text-text-dim mt-0.5">
                  10개월 요금으로 12개월 이용 (월 환산 ₩{Math.round(yearlyAmount / 12).toLocaleString()})
                </p>
              )}
            </div>
            <p className="text-xl font-bold text-text-primary">₩{amount.toLocaleString()}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 mb-4 bg-red-500/10 border border-red-500/15 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-relaxed">{error}</p>
            </div>
          )}

          <div id="toss-payment-methods" />
          <div id="toss-agreement" className="mt-4" />

          {!ready && !error && (
            <div className="flex items-center justify-center py-10 text-sm text-text-dim">
              결제 수단을 불러오는 중...
            </div>
          )}

          <p className="mt-3 text-[11px] text-text-dim leading-relaxed">
            자동 갱신이 아닙니다. 이용 기간이 끝나면 결제가 반복되지 않으며, 연장하려면 다시
            결제하시면 됩니다.
          </p>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border text-text-dim rounded-xl text-sm font-medium hover:border-border-hover hover:text-text-primary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handlePay}
            disabled={!ready || submitting}
            className="flex-1 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "결제 요청 중..." : `₩${amount.toLocaleString()} 결제하기`}
          </button>
        </div>
      </div>
    </div>
  );
}
