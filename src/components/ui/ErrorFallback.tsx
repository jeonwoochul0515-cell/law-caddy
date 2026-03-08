import { Link } from "react-router-dom";

interface ErrorFallbackProps {
  error: unknown;
  resetError: () => void;
}

/** Sentry ErrorBoundary용 에러 폴백 UI */
export default function ErrorFallback({
  error,
  resetError,
}: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div role="alert" className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center">
        <div className="text-4xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-xl font-bold text-gold mb-2">
          오류가 발생했습니다
        </h1>
        <p className="text-text-dim text-sm mb-6">
          예기치 않은 문제가 발생했습니다. 다시 시도하거나 홈으로 이동해 주세요.
        </p>

        <div className="bg-navy/60 border border-border rounded-lg p-4 mb-6 text-left">
          <p className="text-text-dim text-xs font-mono break-all">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={resetError}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-gold to-[#E8D5A0] text-navy font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            다시 시도
          </button>
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm hover:bg-surface transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
