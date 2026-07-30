// 사용자가 결제를 취소하거나 실패했을 때 Toss Payments가 failUrl로 리다이렉트하는 페이지
import { useSearchParams, Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";

export default function PaymentFailPage() {
  const [searchParams] = useSearchParams();
  const message = searchParams.get("message") ?? "결제가 취소되었거나 실패했습니다.";

  return (
    <div className="min-h-screen bg-[#f7f5ec] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#ede7d8] p-8 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-[#1e2a22] mb-2">결제가 완료되지 않았습니다</h1>
        <p className="text-sm text-[#414846] mb-6">{message}</p>
        <Link
          to="/settings"
          className="block w-full py-2.5 rounded-xl bg-[#14392b] text-white font-semibold hover:bg-[#24513c] transition-colors"
        >
          설정으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
