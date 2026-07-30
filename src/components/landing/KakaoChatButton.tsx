// 카카오톡 1:1 문의 플로팅 버튼 — 공개 페이지(랜딩·SEO)에서 사용
// 가입 전 방문자가 남길 수 있는 가장 가벼운 접점. 상담 신청 폼보다 문턱이 낮다.
import { useEffect, useState } from "react";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";

export default function KakaoChatButton() {
  // 첫 화면에서 바로 튀어나오지 않도록 살짝 늦게 등장시킨다
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <a
      href={KAKAO_CHANNEL_CHAT}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="카카오톡으로 1:1 문의하기"
      className={`fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-40 inline-flex items-center gap-2.5 rounded-full pl-4 pr-5 py-3 text-sm font-bold shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6242] ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
      style={{ background: "#FEE500", color: "#14392b" }}
    >
      {/* 카카오톡 말풍선 */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3C6.99 3 3 6.2 3 10.14c0 2.52 1.68 4.73 4.2 5.99-.18.64-.66 2.35-.76 2.72-.12.46.17.45.36.33.15-.1 2.35-1.6 3.3-2.25.62.09 1.25.14 1.9.14 5.01 0 9-3.2 9-7.14S17.01 3 12 3Z" />
      </svg>
      1:1 문의
    </a>
  );
}
