// 플로팅 버그리포트 버튼 + 모달
// 베타 테스터가 버그를 신고하면 Firestore 저장 + 카카오톡 채널 채팅으로 전송

import { useState } from "react";
import { MessageCircleWarning, X, Send, Copy, Check } from "lucide-react";
import useAuth from "../../hooks/useAuth";

const KAKAO_CHANNEL_CHAT = "https://pf.kakao.com/_zkzIX/chat";

export default function BugReportButton() {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const collectInfo = () => {
    const info = [
      `[LAW-CADDY 버그 리포트]`,
      `페이지: ${window.location.pathname}`,
      `시간: ${new Date().toLocaleString("ko-KR")}`,
      `사용자: ${user?.name || "미확인"} (${user?.email || ""})`,
      `브라우저: ${navigator.userAgent.slice(0, 80)}`,
      `화면: ${window.innerWidth}x${window.innerHeight}`,
      `---`,
      description,
    ].join("\n");
    return info;
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    setSending(true);

    try {
      // Firestore에 저장
      const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("../../config/firebase");
      if (db) {
        await addDoc(collection(db, "bug_reports"), {
          description: description.trim(),
          page: window.location.pathname,
          userAgent: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          reporterUid: user?.uid || null,
          reporterName: user?.name || null,
          reporterEmail: user?.email || null,
          createdAt: serverTimestamp(),
          status: "open",
        });
        // 관리자에게 문자 알림 (fire-and-forget — 실패해도 저장·전송 플로우 유지)
        const { notifyBugReport } = await import("../../services/notify");
        notifyBugReport({
          page: window.location.pathname,
          reporterName: user?.name || undefined,
          snippet: description.trim(),
        });
      }
    } catch {
      // Firestore 저장 실패해도 카카오톡 전송은 진행
    }

    // 클립보드에 복사
    try {
      await navigator.clipboard.writeText(collectInfo());
      setCopied(true);
    } catch {
      // 복사 실패 무시
    }

    setSending(false);
    setSent(true);
  };

  const handleOpenKakao = () => {
    window.open(KAKAO_CHANNEL_CHAT, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(collectInfo());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 실패
    }
  };

  const handleClose = () => {
    setOpen(false);
    setDescription("");
    setSent(false);
    setCopied(false);
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-[#01261f] text-[#faf9f5] rounded-full shadow-lg hover:bg-[#1a3c34] transition-colors flex items-center justify-center group"
        aria-label="버그 리포트"
      >
        <MessageCircleWarning size={20} />
      </button>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* 배경 */}
          <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

          {/* 모달 카드 */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#01261f]/8 overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#01261f]/8">
              <div>
                <h3 className="text-base font-semibold text-[#1b1c1a]">버그 리포트</h3>
                <p className="text-xs text-[#414846]">베타 테스트 피드백</p>
              </div>
              <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#efeeea] transition-colors text-[#414846]">
                <X size={18} />
              </button>
            </div>

            {!sent ? (
              <>
                {/* 자동 수집 정보 */}
                <div className="px-5 pt-4">
                  <div className="bg-[#efeeea] rounded-lg p-3 text-xs text-[#414846] space-y-1">
                    <div className="flex justify-between">
                      <span>페이지</span>
                      <span className="text-[#1b1c1a] font-mono">{window.location.pathname}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>사용자</span>
                      <span className="text-[#1b1c1a]">{user?.name || "미확인"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>화면</span>
                      <span className="text-[#1b1c1a] font-mono">{window.innerWidth}x{window.innerHeight}</span>
                    </div>
                  </div>
                </div>

                {/* 설명 입력 */}
                <div className="px-5 py-4">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="어떤 문제가 발생했나요? 자세히 적어주세요..."
                    rows={4}
                    className="w-full px-4 py-3 bg-white border border-[#01261f]/8 rounded-lg text-[#1b1c1a] text-sm placeholder-[#414846]/50 focus:border-[#735c00] focus:outline-none transition-colors resize-none"
                    autoFocus
                  />
                </div>

                {/* 전송 버튼 */}
                <div className="px-5 pb-5">
                  <button
                    onClick={handleSave}
                    disabled={!description.trim() || sending}
                    className="w-full py-3 bg-[#01261f] text-[#faf9f5] font-semibold rounded-lg hover:bg-[#1a3c34] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <span className="w-4 h-4 border-2 border-[#faf9f5]/30 border-t-[#faf9f5] rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send size={16} />
                        리포트 저장 + 카카오톡 전송 준비
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* 전송 완료 */
              <div className="px-5 py-6 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 bg-[#2d6a4f]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Check size={24} className="text-[#2d6a4f]" />
                  </div>
                  <p className="text-[#1b1c1a] font-semibold mb-1">리포트가 저장되었습니다</p>
                  <p className="text-xs text-[#414846]">
                    아래 버튼으로 카카오톡 채널에 내용을 전달해 주세요
                  </p>
                </div>

                {/* 클립보드 복사 */}
                <button
                  onClick={handleCopy}
                  className="w-full py-2.5 border border-[#01261f]/8 rounded-lg text-sm text-[#414846] hover:bg-[#efeeea] transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-[#2d6a4f]" />
                      <span className="text-[#2d6a4f]">클립보드에 복사됨</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      리포트 내용 복사
                    </>
                  )}
                </button>

                {/* 카카오톡 채널 채팅 열기 */}
                <button
                  onClick={handleOpenKakao}
                  className="w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-semibold rounded-lg hover:bg-[#FDD835] transition-colors flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                    <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.725 1.842 5.112 4.604 6.46-.144.522-.926 3.361-.964 3.574 0 0-.02.164.078.228.098.063.213.03.213.03.281-.04 3.257-2.127 3.77-2.48A13.2 13.2 0 0 0 12 18.382c5.523 0 10-3.463 10-7.691C22 6.463 17.523 3 12 3z"/>
                  </svg>
                  카카오톡으로 전송하기
                </button>

                <p className="text-[10px] text-[#414846]/60 text-center">
                  카카오톡 채팅이 열리면 복사된 내용을 붙여넣기(Ctrl+V) 해주세요
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
