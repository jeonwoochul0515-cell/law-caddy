// 검색 유입용 서브페이지(워크플로우·에이전트·자동화·요금제·FAQ)가 공유하는 레이아웃
//
// (2026-07-31) 랜딩과 톤을 맞췄다. 이전에는 저울 아이콘 로고·둥근 사각 버튼·산세리프라
// 랜딩(각진 크림 지면 + 명조 표제 + 핀 깃발 점)과 다른 서비스처럼 보였다.
// 색·서체·모서리 규칙은 LandingPage.tsx와 동일하게 유지할 것.
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/700.css";
import KakaoChatButton from "./KakaoChatButton";

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
            className={`px-5 py-2 text-sm rounded-full font-semibold transition-colors ${focusRing}`}
            style={{ background: INK, color: "#f2efe3" }}
          >
            무료로 시작
          </Link>
        </div>
      </nav>

      <main className={`${maxWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20`}>
        {children}
      </main>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 text-center">
        <Link
          to="/"
          className={`inline-flex items-center gap-2 font-semibold transition-opacity hover:opacity-70 ${focusRing}`}
          style={{ ...serif, color: INK }}
        >
          Law-Caddy 전체 소개 보기
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <footer
        className="py-8 px-4 sm:px-6 lg:px-8"
        style={{ borderTop: `1px solid ${SAND}`, background: PAPER }}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm" style={{ color: "rgba(20,57,43,0.55)" }}>
            &copy; {new Date().getFullYear()} Law-Caddy · 준비는 Law-Caddy가, 판단은 변호사가 합니다.
          </span>
          <Link
            to="/login"
            className={`text-sm transition-opacity hover:opacity-70 ${focusRing}`}
            style={{ color: "rgba(20,57,43,0.55)" }}
          >
            로그인
          </Link>
        </div>
      </footer>
      <KakaoChatButton />
    </div>
  );
}
