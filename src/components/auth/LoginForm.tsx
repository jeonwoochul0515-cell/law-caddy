import { useState } from "react";

interface LoginFormProps {
  onGoogleLogin: () => Promise<void>;
  error?: string;
}

export default function LoginForm({ onGoogleLogin, error }: LoginFormProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await onGoogleLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5ec] px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl italic font-serif text-[#14392b] mb-2">
            Law-Caddy
          </h1>
          <p className="text-[#414846] font-[Manrope]">
            변호사 AI 상담 어시스턴트
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white border border-[#14392b]/8 rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-[#1e2a22] mb-2">
            로그인
          </h2>
          <p className="text-sm text-[#414846] mb-6">
            구글 계정으로 간편하게 시작하세요
          </p>

          {error && (
            <div className="bg-[#ba1a1a]/8 border border-[#ba1a1a]/20 rounded-lg p-3 mb-4 text-[#ba1a1a] text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-[#ede7d8] text-[#1e2a22] font-medium rounded-lg hover:bg-[#e5e4e0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#14392b]/8"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-[#414846]/30 border-t-[#414846] rounded-full animate-spin" />
                로그인 중...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google 계정으로 로그인
              </>
            )}
          </button>

          <div className="mt-6 pt-6 border-t border-[#14392b]/8">
            <p className="text-xs text-[#414846] text-center leading-relaxed">
              첫 로그인 시 사업자등록증 인증이 필요합니다.<br />
              변호사업이 등록된 사업자만 이용 가능합니다.
            </p>
          </div>
        </div>

        {/* 하단 브랜딩 */}
        <p className="text-center text-xs text-[#2e6242] mt-6 tracking-wide">
          Premium Legal AI Assistant
        </p>
      </div>
    </div>
  );
}
