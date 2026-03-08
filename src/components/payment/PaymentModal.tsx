import { X, CreditCard, Lock, AlertCircle } from "lucide-react";

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
  if (!isOpen) return null;

  // planId 사용 (향후 결제 연동 시 필요)
  void planId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative w-full max-w-md bg-[#0f1729] border border-border rounded-2xl shadow-2xl">
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

          {/* 카드 등록 영역 (플레이스홀더) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <CreditCard className="w-4 h-4" />
              결제 수단
            </div>

            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-xl text-center">
              <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mb-3">
                <Lock className="w-5 h-5 text-gold" />
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Toss Payments 결제 연동 준비 중
              </p>
              <p className="text-xs text-text-dim">
                안전한 결제를 위해 Toss Payments를 연동하고 있습니다
              </p>
            </div>

            {/* 안내 */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-500/10 border border-blue-500/15 rounded-lg">
              <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300 leading-relaxed">
                결제 시스템이 준비되면 카드 등록 후 자동 결제가 진행됩니다.
                플랜 변경 시 일할 계산이 적용됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border text-text-dim rounded-xl text-sm font-medium hover:border-border-hover hover:text-text-primary transition-colors"
          >
            취소
          </button>
          <div className="relative flex-1 group">
            <button
              disabled
              className="w-full py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              결제하기
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#1a2235] border border-border rounded-lg text-xs text-text-dim whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              결제 시스템 준비 중입니다
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
