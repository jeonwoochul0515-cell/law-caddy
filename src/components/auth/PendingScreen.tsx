import { Clock, LogOut } from "lucide-react";

interface PendingScreenProps {
  userName: string;
  onLogout: () => void;
}

export default function PendingScreen({ userName, onLogout }: PendingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f5] px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-[#efeeea] border border-[#01261f]/8 rounded-2xl p-8 backdrop-blur-sm">
          <div className="w-16 h-16 bg-[#735c00]/8 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-[#735c00]" />
          </div>

          <h2 className="text-xl font-semibold text-[#1b1c1a] mb-3">
            승인 대기 중
          </h2>

          <p className="text-[#414846] mb-6 leading-relaxed">
            <span className="text-[#735c00] font-medium">{userName}</span> 변호사님, 회원가입이 완료되었습니다.
            <br />
            관리자 승인 후 서비스를 이용하실 수 있습니다.
          </p>

          <div className="bg-[#faf9f5]-light border border-[#01261f]/8 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-[#414846] mb-2">승인 절차 안내</p>
            <ul className="text-sm text-[#1b1c1a] space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-[#735c00] mt-0.5">1.</span>
                대한변호사협회 등록번호 확인
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#735c00] mt-0.5">2.</span>
                관리자 수동 승인 (1~2 영업일)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#735c00] mt-0.5">3.</span>
                승인 완료 후 자동 활성화
              </li>
            </ul>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 mx-auto px-4 py-2 border border-[#01261f]/8 rounded-lg text-[#414846] hover:border-[#735c00] hover:text-[#735c00] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
