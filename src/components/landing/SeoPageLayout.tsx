// 검색 유입용 서브페이지(워크플로우·에이전트·자동화·요금제·FAQ)가 공유하는 심플 레이아웃
import { Link } from "react-router-dom";
import { Scale, ArrowRight } from "lucide-react";

export default function SeoPageLayout({
  children,
  maxWidthClass = "max-w-3xl",
}: {
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <nav className="border-b border-[#efeeea] bg-[#faf9f5]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-[#01261f]" />
            <span className="text-xl font-serif italic font-bold tracking-tight text-[#01261f]">
              Law-Caddy
            </span>
          </Link>
          <Link
            to="/login"
            className="px-5 py-2 text-sm rounded-lg bg-[#01261f] text-white font-semibold hover:bg-[#1a3c34] transition-colors"
          >
            무료 체험
          </Link>
        </div>
      </nav>

      <main className={`${maxWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20`}>
        {children}
      </main>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[#01261f] font-semibold hover:text-[#735c00] transition-colors"
        >
          Law-Caddy 전체 소개 보기
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#735c00]/40" />
            <span className="text-sm text-[#414846]">
              &copy; 2025 Law-Caddy. AI가 분석하고, 변호사가 결정합니다.
            </span>
          </div>
          <Link to="/login" className="text-sm text-[#414846] hover:text-[#01261f] transition-colors">
            로그인
          </Link>
        </div>
      </footer>
    </div>
  );
}
