// 로그인 화면 — 구글 로그인 버튼, 오류 안내, 거절된 회원의 사유·문의 연락처 표시
import { useState } from "react";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";

/** 문의 대표번호 (법률사무소 청송law) */
export const SUPPORT_PHONE = "1660-4452";

/** 거절(이용 중지)된 회원에게 보여 줄 정보 */
export interface RejectedInfo {
  name: string;
  reason?: string;
}

interface LoginFormProps {
  onGoogleLogin: () => Promise<void>;
  error?: string;
  /** 거절된 회원이 로그인해 있으면 사유·연락처·다시 신청 버튼을 보여 준다 */
  rejected?: RejectedInfo | null;
  onReapply?: () => void;
  onLogout?: () => void;
}

/** 카카오톡 채널 + 대표번호 문의 줄 — 로그인·대기·프로필 화면에서 공통으로 쓴다 */
export function SupportLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-[rgba(20,57,43,0.7)] leading-relaxed ${className}`}>
      궁금한 점은{" "}
      <a
        href={KAKAO_CHANNEL_CHAT}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[#2e6242] font-medium"
      >
        카카오톡 1:1 문의
      </a>
      {" "}또는 전화{" "}
      <a href={`tel:${SUPPORT_PHONE}`} className="underline text-[#2e6242] font-medium">
        {SUPPORT_PHONE}
      </a>
      (평일 9시~18시)로 연락 주세요.
    </p>
  );
}

export default function LoginForm({ onGoogleLogin, error, rejected, onReapply, onLogout }: LoginFormProps) {
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
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5ec] px-4 py-8">
      <div className="w-full max-w-md">
        {/* 로고 — 랜딩과 동일한 이름 + 핀 깃발 점 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight font-serif text-[#14392b]">
              Law-Caddy
            </span>
            <span className="w-2 h-2 rounded-full bg-[#5f9a6a]" />
          </div>
          <p className="text-sm text-[rgba(20,57,43,0.6)]">
            1~5인 법률사무소 운영 도우미
          </p>
        </div>

        {/* 거절된 회원 안내 — 구글 버튼을 다시 누르지 않아도 바로 보인다 */}
        {rejected ? (
          <div className="bg-white/70 border border-[rgba(20,57,43,0.12)] p-8 mb-4">
            <h2 className="text-xl font-semibold font-serif text-[#14392b] mb-2">
              가입이 승인되지 않았습니다
            </h2>
            <p className="text-sm text-[rgba(20,57,43,0.75)] leading-relaxed mb-4">
              {rejected.name ? `${rejected.name}님, ` : ""}
              제출하신 내용으로는 이용을 열어 드리지 못했습니다.
            </p>
            <div className="bg-[#f7f5ec] border border-[rgba(20,57,43,0.12)] rounded-lg p-4 mb-4">
              <p className="text-xs text-[rgba(20,57,43,0.55)] mb-1">사유</p>
              <p className="text-sm text-[#14392b] whitespace-pre-wrap">
                {rejected.reason?.trim() || "사유가 기록되어 있지 않습니다. 아래 문의 채널로 물어봐 주시면 바로 안내드립니다."}
              </p>
            </div>
            <SupportLinks className="mb-5" />
            <div className="space-y-2">
              {onReapply && (
                <button
                  type="button"
                  onClick={onReapply}
                  className="w-full min-h-[44px] py-3 bg-[#14392b] text-[#f2efe3] font-semibold rounded-full hover:opacity-90 transition-opacity"
                >
                  서류를 고쳐 다시 신청하기
                </button>
              )}
              <a
                href={KAKAO_CHANNEL_CHAT}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full min-h-[44px] py-3 text-center border border-[rgba(20,57,43,0.2)] rounded-full text-sm text-[#14392b] hover:bg-[#f7f5ec] transition-colors"
              >
                카카오톡으로 사유 문의하기
              </a>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full min-h-[44px] py-3 text-sm text-[rgba(20,57,43,0.6)] hover:text-[#14392b] transition-colors"
                >
                  다른 구글 계정으로 로그인
                </button>
              )}
            </div>
            <p className="text-xs text-[rgba(20,57,43,0.5)] mt-4 leading-relaxed">
              계정과 제출한 서류를 지우고 싶으시면{" "}
              <a href={KAKAO_CHANNEL_CHAT} target="_blank" rel="noopener noreferrer" className="underline">
                카카오톡으로 탈퇴 요청
              </a>
              을 남겨 주세요. 확인 후 지워 드립니다.
            </p>
          </div>
        ) : (
          <div className="bg-white/70 border border-[rgba(20,57,43,0.12)] p-8">
            <h2 className="text-xl font-semibold font-serif text-[#14392b] mb-2">
              시작하기
            </h2>
            <p className="text-sm text-[rgba(20,57,43,0.62)] mb-6">
              구글 계정으로 로그인하면 Starter(무료)가 바로 열립니다.
            </p>

            {error && (
              <div
                role="alert"
                className="bg-[#ba1a1a]/8 border border-[#ba1a1a]/20 p-3 mb-4 text-[#ba1a1a] text-sm leading-relaxed"
              >
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full min-h-[48px] flex items-center justify-center gap-3 py-3.5 bg-[#14392b] text-[#f2efe3] font-semibold rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-[#f2efe3]/30 border-t-[#f2efe3] rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google 계정으로 로그인
                </>
              )}
            </button>

            <div className="mt-6 pt-6 border-t border-[rgba(20,57,43,0.12)] space-y-3">
              <p className="text-sm text-[rgba(20,57,43,0.65)] text-center leading-relaxed">
                로그인은 구글 계정으로만 합니다. 따로 만드는 비밀번호는 없습니다.
                <br />
                구글 비밀번호를 잊으셨다면{" "}
                <a
                  href="https://accounts.google.com/signin/recovery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-[#2e6242]"
                >
                  구글 계정 찾기
                </a>
                에서 되찾을 수 있습니다.
              </p>
              <p className="text-sm text-[rgba(20,57,43,0.65)] text-center leading-relaxed">
                첫 로그인 때 사업자등록증을 올리면 바로 시작됩니다.
                <br />
                법무법인·합동사무소 소속이라 사업자등록증이 없어도 신청할 수 있습니다(영업일 1일 안에 확인).
              </p>
              <SupportLinks className="text-center" />
            </div>
          </div>
        )}

        {/* 하단 — 랜딩의 약속을 그대로 반복 */}
        <p className="text-center text-xs text-[rgba(20,57,43,0.5)] mt-6">
          준비는 Law-Caddy가 맡고, 판단은 변호사가 합니다.
        </p>
      </div>
    </div>
  );
}
