// 플랜 만료 임박(7일 이내)·만료 시 상단에 띄우는 안내 배너
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { notifyPlanExpiry } from "../../services/notify";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = "plan-expiry-banner-dismissed";

export default function PlanExpiryBanner() {
  const user = useAuth((s) => s.user);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const expiresAtMs = user?.planExpiresAt?.toDate?.().getTime();
  // 마운트 시점 기준 판정 (페이지 이동마다 리마운트되므로 충분히 최신)
  const [now] = useState(() => Date.now());
  const isExpired = !!expiresAtMs && expiresAtMs <= now;
  const isImminent = !!expiresAtMs && !isExpired && expiresAtMs - now <= WINDOW_MS;

  // 임박 상태면 문자 알림 요청 (발송 조건·중복 방지는 서버가 판정)
  useEffect(() => {
    if (isImminent) {
      notifyPlanExpiry();
    }
  }, [isImminent]);

  if (dismissed || (!isExpired && !isImminent)) return null;

  const dateLabel = new Date(expiresAtMs!).toLocaleDateString("ko-KR");
  const daysLeft = Math.ceil((expiresAtMs! - now) / 86_400_000);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={`flex items-center gap-3 px-6 py-2.5 text-sm ${
        isExpired
          ? "bg-red-500/10 text-red-300 border-b border-red-500/20"
          : "bg-amber-500/10 text-amber-300 border-b border-amber-500/20"
      }`}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <p className="flex-1 min-w-0">
        {isExpired ? (
          <>플랜 이용 기간이 만료되어 무료 플랜으로 전환되었습니다.</>
        ) : (
          <>
            플랜이 <span className="font-semibold">{dateLabel}</span>에 만료됩니다 (D-
            {daysLeft}). 만료 후엔 무료 플랜으로 전환됩니다.
          </>
        )}{" "}
        <Link to="/settings" className="underline font-medium hover:opacity-80">
          연장 결제하기
        </Link>
      </p>
      <button
        onClick={handleDismiss}
        aria-label="배너 닫기"
        className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
