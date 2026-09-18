// 승인 대기 화면 — 예상 기간·문의 연락처·상태 다시 확인 버튼·탈퇴 요청 링크
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";
import { SupportLinks } from "./LoginForm";

interface PendingScreenProps {
  userName: string;
  /** 사업자등록증 없이 접수한 소속 변호사인지 — 안내 문구가 다르다 */
  noBusinessLicense?: boolean;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  /** 다시 확인한 결과 안내 ("아직 확인 중입니다" 등) */
  refreshMessage?: string;
}

export default function PendingScreen({
  userName,
  noBusinessLicense,
  onLogout,
  onRefresh,
  refreshing,
  refreshMessage,
}: PendingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5ec] px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="bg-[#ede7d8] border border-[#14392b]/8 rounded-2xl p-8 backdrop-blur-sm">
          <div className="w-16 h-16 bg-[#2e6242]/8 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-[#2e6242]" />
          </div>

          <h2 className="text-xl font-semibold text-[#1e2a22] mb-3">
            확인 중입니다
          </h2>

          <p className="text-[#414846] mb-6 leading-relaxed">
            <span className="text-[#2e6242] font-medium">{userName || "회원"}</span>님, 신청이 접수되었습니다.
            <br />
            {noBusinessLicense
              ? "사업자등록증 없이 접수되어 변호사 등록번호로 확인합니다."
              : "사업자등록증에서 변호사업이 자동으로 읽히지 않아 사람이 직접 확인합니다."}
          </p>

          <div className="bg-[#f7f5ec] border border-[#14392b]/8 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-[#414846] mb-2">이렇게 진행됩니다</p>
            <ul className="text-sm text-[#1e2a22] space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-[#2e6242] mt-0.5">1.</span>
                법률사무소 청송law 담당자가 제출 서류와 대한변호사협회 등록번호를 대조합니다.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#2e6242] mt-0.5">2.</span>
                영업일 기준 1일 안에 확인합니다. 늦어지면 카카오톡으로 물어봐 주세요.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#2e6242] mt-0.5">3.</span>
                승인되면 등록하신 휴대폰으로 문자가 갑니다. 아래 버튼으로 바로 확인할 수도 있습니다.
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 mb-2 bg-[#14392b] text-[#f7f5ec] font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "확인하는 중..." : "승인됐는지 다시 확인"}
          </button>
          {refreshMessage && (
            <p className="text-sm text-[#414846] mb-4" role="status">{refreshMessage}</p>
          )}

          <SupportLinks className="mb-5 text-left" />

          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={KAKAO_CHANNEL_CHAT}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[44px] flex items-center justify-center px-4 py-2.5 border border-[#14392b]/15 rounded-lg text-sm text-[#414846] hover:border-[#2e6242] hover:text-[#2e6242] transition-colors"
            >
              카카오톡으로 문의
            </a>
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 border border-[#14392b]/15 rounded-lg text-sm text-[#414846] hover:border-[#2e6242] hover:text-[#2e6242] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>

          <p className="text-xs text-[#414846]/70 mt-5 leading-relaxed">
            신청을 취소하고 계정·서류를 지우고 싶으시면{" "}
            <a href={KAKAO_CHANNEL_CHAT} target="_blank" rel="noopener noreferrer" className="underline">
              카카오톡으로 탈퇴 요청
            </a>
            을 남겨 주세요. 확인 후 지워 드립니다.
          </p>
        </div>
      </div>
    </div>
  );
}
