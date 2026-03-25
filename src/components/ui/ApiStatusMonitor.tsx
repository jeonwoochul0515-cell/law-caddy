// API 장애 알림 — 실제 API 호출 실패 시 표시
// 전역 이벤트 기반: callClaude 등에서 에러 발생 시 이벤트를 발행

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export default function ApiStatusMonitor() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setError(detail);
    };

    window.addEventListener("api-error", handler);
    return () => window.removeEventListener("api-error", handler);
  }, []);

  if (!error) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm bg-[#ba1a1a]/10 border border-[#ba1a1a]/20 rounded-xl p-4 shadow-lg backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-[#ba1a1a] shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#ba1a1a] mb-1">API 오류 발생</p>
          <p className="text-xs text-[#414846] mb-2">{error}</p>
          <p className="text-xs text-[#414846]">
            버그 리포트 버튼으로 관리자에게 알려주세요.
          </p>
        </div>
        <button onClick={() => setError(null)} className="text-[#414846] hover:text-[#1b1c1a]">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// reportApiError는 별도 파일로 분리하여 사용
// window.dispatchEvent(new CustomEvent("api-error", { detail: message }))
