// 검색 유입용 서브페이지(워크플로우·에이전트·자동화·요금제·FAQ)가 공유하는 레이아웃
//
// (2026-07-31) 랜딩과 톤을 맞췄다. 이전에는 저울 아이콘 로고·둥근 사각 버튼·산세리프라
// 랜딩(각진 크림 지면 + 명조 표제 + 핀 깃발 점)과 다른 서비스처럼 보였다.
// 색·서체·모서리 규칙은 LandingPage.tsx와 동일하게 유지할 것.
// (2026-09-11) 푸터에 운영 주체(상호·사업자번호·주소·전화)를 랜딩과 똑같이 넣었다.
//   검색으로 바로 들어오는 페이지라 운영자가 누구인지 보여야 한다(전자상거래법 표시 의무).
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/700.css";
import KakaoChatButton from "./KakaoChatButton";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";

const INK = "#14392b";
const PAPER = "#f7f5ec";
const SAND = "#ede7d8";
const serif = { fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif' } as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6242]";

export default function SeoPageLayout({
  children,
  maxWidthClass = "max-w-3xl",
}: {
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="min-h-screen" style={{ background: PAPER, wordBreak: "keep-all" }}>
      <nav
        className="sticky top-0 z-40"
        style={{
          background: "rgba(247,245,236,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(20,57,43,0.1)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* 로고는 랜딩과 동일 — 이름 + 핀 깃발 점 */}
          <Link to="/" className={`flex items-baseline gap-2 ${focusRing}`}>
            <span className="text-lg font-bold tracking-tight" style={{ ...serif, color: INK }}>
              Law-Caddy
            </span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#5f9a6a" }} />
          </Link>
          <Link
            to="/login"
            className={`inline-flex items-center min-h-11 px-5 text-sm rounded-full font-semibold transition-colors ${focusRing}`}
            style={{ background: INK, color: "#f2efe3" }}
          >
            지금 시작하기
          </Link>
        </div>
      </nav>

      <main className={`${maxWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20`}>
        {children}
      </main>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 text-center">
        <Link
          to="/"
          className={`inline-flex items-center gap-2 min-h-11 font-semibold transition-opacity hover:opacity-70 ${focusRing}`}
          style={{ ...serif, color: INK }}
        >
          Law-Caddy 전체 소개 보기
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <footer
        className="py-10 px-4 sm:px-6 lg:px-8"
        style={{ borderTop: `1px solid ${SAND}`, background: PAPER }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <span className="text-sm" style={{ color: "rgba(20,57,43,0.7)" }}>
              준비는 Law-Caddy가, 판단은 변호사가 합니다.
            </span>
            <div className="flex items-center gap-5 text-sm" style={{ color: "rgba(20,57,43,0.62)" }}>
              <a
                href={KAKAO_CHANNEL_CHAT}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center min-h-11 transition-opacity hover:opacity-70 ${focusRing}`}
              >
                카카오톡 문의
              </a>
              <Link
                to="/login"
                className={`inline-flex items-center min-h-11 transition-opacity hover:opacity-70 ${focusRing}`}
              >
                로그인
              </Link>
            </div>
          </div>

          {/* 운영 주체 — 랜딩 푸터와 같은 내용 */}
          <div
            className="pt-6 text-xs leading-relaxed"
            style={{ borderTop: "1px solid rgba(20,57,43,0.1)", color: "rgba(20,57,43,0.55)" }}
          >
            <p className="mb-2 font-semibold" style={{ color: "rgba(20,57,43,0.75)" }}>
              Law-Caddy는 법률사무소 청송law가 개발·운영하는 법률사무소 업무 관리 서비스입니다.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              <span>상호 법률사무소 청송law</span>
              <span>대표 김창희</span>
              <span>사업자등록번호 102-78-00061</span>
              <span>전화 051-714-1515</span>
            </div>
            <p className="mt-1.5">
              주소 부산광역시 연제구 법원남로15번길 10, 2층 202호(거제동, 미르코아빌딩)
            </p>
            <p className="mt-4" style={{ color: "rgba(20,57,43,0.42)" }}>
              &copy; {new Date().getFullYear()} 법률사무소 청송law. 모든 AI 산출물은 변호사의 최종 검토를 전제로 한 초안입니다.
            </p>
          </div>
        </div>
      </footer>
      <KakaoChatButton />
    </div>
  );
}
