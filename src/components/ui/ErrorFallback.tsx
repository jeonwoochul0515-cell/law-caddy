// 화면이 통째로 멈췄을 때 뜨는 마지막 화면 (Sentry ErrorBoundary 폴백)
//
// (2026-09-19) 예전에는 영어 원문을 12px 고정폭으로 그대로 보여 줬다.
// "TypeError: undefined is not a function" 같은 문장이다. 김 변호사는 읽지도
// 못하고 전화로 설명하지도 못한다. 지금은 한국어 안내를 먼저 보여 주고,
// 원문은 문의할 때 쓰도록 접어 두고 복사 버튼을 붙인다.
import { useState } from "react";
import { Link } from "react-router-dom";
import { friendlyError, rawErrorText } from "../../utils/friendlyError";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";

interface ErrorFallbackProps {
  error: unknown;
  resetError: () => void;
}

export default function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const raw = rawErrorText(error);

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드를 못 쓰면 아래 원문을 직접 선택해 복사하면 된다 */
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ec] flex items-center justify-center px-4">
      <div
        role="alert"
        className="max-w-md w-full bg-[#ede7d8] border border-[#14392b]/8 rounded-2xl p-8 text-center"
      >
        <div className="text-4xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-xl font-bold text-[#2e6242] mb-2">화면을 열지 못했습니다</h1>
        <p className="text-[#414846] text-sm mb-2 leading-relaxed">
          {friendlyError(error, "예기치 않은 문제가 생겼습니다.")}
        </p>
        <p className="text-[#414846]/70 text-xs mb-6 leading-relaxed">
          작업하던 내용은 대부분 저장되어 있습니다. 「다시 시도」를 눌러 보고, 그래도 같은 화면이
          나오면 아래 내용을 복사해 문의해 주세요.
        </p>

        <div className="flex gap-3 justify-center mb-5">
          <button
            onClick={resetError}
            className="px-5 py-2.5 rounded-lg bg-[#14392b] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            다시 시도
          </button>
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-lg border border-[#14392b]/8 text-[#1e2a22] text-sm hover:bg-[#ede7d8] transition-colors"
          >
            홈으로
          </Link>
        </div>

        <div className="border-t border-[#14392b]/8 pt-4 text-left">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs text-[#2e6242] underline min-h-11"
            >
              {showRaw ? "기술 정보 접기" : "문의용 기술 정보 보기"}
            </button>
            <div className="flex items-center gap-3">
              <button onClick={copyRaw} className="text-xs text-[#2e6242] underline min-h-11">
                {copied ? "복사됨" : "복사"}
              </button>
              <a
                href={KAKAO_CHANNEL_CHAT}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2e6242] underline min-h-11 inline-flex items-center"
              >
                문의하기
              </a>
            </div>
          </div>

          {showRaw && (
            <p className="mt-2 text-[#414846] text-xs font-mono break-all bg-[#f7f5ec]/60 border border-[#14392b]/8 rounded-lg p-3">
              {raw || "(내용 없음)"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
