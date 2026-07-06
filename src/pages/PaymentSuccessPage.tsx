// 사용자가 결제 최종 요청을 마친 뒤 Toss Payments가 successUrl로 리다이렉트하는 페이지
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { confirmPayment } from "../services/payment";

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"confirming" | "done" | "error">("confirming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) {
      Promise.resolve().then(() => {
        setState("error");
        setError("결제 정보가 올바르지 않습니다.");
      });
      return;
    }

    confirmPayment({ paymentKey, orderId, amount: Number(amount) })
      .then(() => setState("done"))
      .catch((err: unknown) => {
        setState("error");
        setError(err instanceof Error ? err.message : "결제 승인에 실패했습니다.");
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#efeeea] p-8 text-center">
        {state === "confirming" && (
          <>
            <Loader2 className="w-10 h-10 text-[#01261f] animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#1b1c1a] mb-2">결제를 확인하고 있습니다</h1>
            <p className="text-sm text-[#414846]">잠시만 기다려 주세요.</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-[#01261f] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#1b1c1a] mb-2">결제가 완료되었습니다</h1>
            <p className="text-sm text-[#414846] mb-6">플랜이 즉시 적용되었습니다.</p>
            <button
              onClick={() => navigate("/settings")}
              className="w-full py-2.5 rounded-xl bg-[#01261f] text-white font-semibold hover:bg-[#1a3c34] transition-colors"
            >
              설정으로 돌아가기
            </button>
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#1b1c1a] mb-2">결제 승인에 실패했습니다</h1>
            <p className="text-sm text-[#414846] mb-6">{error}</p>
            <Link
              to="/settings"
              className="block w-full py-2.5 rounded-xl border border-[#efeeea] text-[#1b1c1a] font-semibold hover:border-[#735c00]/30 transition-colors"
            >
              설정으로 돌아가기
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
