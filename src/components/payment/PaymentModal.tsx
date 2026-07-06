import { useEffect, useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { loadPaymentWidget, type PaymentWidgetInstance } from "@tosspayments/payment-widget-sdk";
import useAuth from "../../hooks/useAuth";
import { PLANS } from "../../config/constants";
import { createOrderId, getTossClientKey } from "../../services/payment";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  planPrice: string;
}

export default function PaymentModal({
  isOpen,
  onClose,
  planId,
  planName,
  planPrice,
}: PaymentModalProps) {
  const user = useAuth((s) => s.user);
  const [widget, setWidget] = useState<PaymentWidgetInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amount = PLANS.find((p) => p.id === planId)?.amount ?? 0;

  useEffect(() => {
    if (!isOpen || !user || amount <= 0) return;

    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        const paymentWidget = await loadPaymentWidget(getTossClientKey(), user.uid);
        if (cancelled) return;

        paymentWidget.renderPaymentMethods("#toss-payment-methods", amount);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.uid, amount]);

  if (!isOpen) return null;

  const handlePay = async () => {
    if (!widget || !user) return;
    setSubmitting(true);
    setError(null);

    try {
      await widget.requestPayment({
        orderId: createOrderId(planId, user.uid),
        orderName: `Law-Caddy ${planName} 플랜`,
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
          <div className="flex items-center justify-between p-4 bg-gold-dim/50 border border-gold/20 rounded-xl mb-6">
            <div>
              <p className="text-sm text-text-dim">선택한 플랜</p>
              <p className="text-lg font-semibold text-gold">{planName}</p>
            </div>
            <p className="text-xl font-bold text-text-primary">{planPrice}</p>
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
            {submitting ? "결제 요청 중..." : "결제하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
