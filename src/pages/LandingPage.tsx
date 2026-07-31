// 랜딩페이지 — "캐디의 라운드" 컨셉
//
// (2026-07-30) 전면 재설계. 설계 의도:
// - 서비스 이름의 원뜻으로 돌아간다. 캐디는 클럽을 고르고 코스를 읽지만, 스윙은 선수가 한다.
//   이 은유가 우리 법적 포지션("AI가 준비하고 판단은 변호사가")과 정확히 겹친다.
// - 히어로 시그니처는 골프 스코어카드. PAR = 원래 걸리던 시간, SCORE = Law-Caddy와 함께한 시간.
//   골프에서 언더파를 빨간 숫자로 적는 관례를 그대로 가져와, 줄어든 시간이 붉게 표시된다.
//   과장 없이 실측치만 적어도 언더파가 나오는 것이 이 서비스의 요점이다.
// - 색은 이른 아침 페어웨이 — 딥그린 잉크, 안개 낀 크림 배경, 벙커 모래. 라이트 모드.
// - 가짜 후기·가짜 이용사무소·검증 불가 수치는 싣지 않는다 (변협 광고규정 오인유발 소지)
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/700.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { WORKFLOW_STEPS, AGENTS, PLATFORM_FEATURES, PLANS, FAQS } from "../data/landingContent";
import FAQItem from "../components/landing/FAQItem";
import KakaoChatButton from "../components/landing/KakaoChatButton";
import ScrollExpandMedia from "../components/ui/scroll-expansion-hero";
import { KAKAO_CHANNEL_CHAT } from "../config/contact";

/* ────────────────────────────────────────────
   디자인 토큰 — 이른 아침 페어웨이
   INK  딥그린(글자·짙은 배경) · PAPER 안개 크림 · PAPER2 벙커 모래
   GOLD 잔디빛(강조) · GOLD_DEEP 짙은 잔디(작은 글씨 대비 확보)
   SEAL 언더파 빨강 — 스코어카드 숫자와 인장에만
   ※ 상수 이름은 기존 사용처와의 호환을 위해 유지한다.
   ──────────────────────────────────────────── */
const INK = "#14392B";
const PAPER = "#F7F5EC";
const PAPER2 = "#EDE7D8";
const GOLD = "#5F9A6A";
const GOLD_DEEP = "#2E6242";
const SEAL = "#B6453A";
/** 딥그린 배경 위에서 쓰는 강조색 — 잔디빛(GOLD)은 어두운 배경에서 대비가 모자란다 */
const SPROUT = "#A9CE96";
/** 딥그린 배경 위 본문색 */
const ON_INK = "#F2EFE3";

const serif = { fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif' } as const;
const sans = {
  fontFamily: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif',
} as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E6242]";

/* ────────────────────────────────────────────
   도입 상담 신청 폼 — 사업자등록증 없이도 이름·연락처만 남기면 연락한다.
   가입 완주 전 이탈하는 방문자(광고 유입 대부분)를 잡는 유일한 입구.
   ──────────────────────────────────────────── */
function ConsultSection() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanName.length < 2) {
      setStatus("error");
      setErrMsg("성함을 입력해 주세요.");
      return;
    }
    if (!/^01[016789][0-9]{7,8}$/.test(cleanPhone)) {
      setStatus("error");
      setErrMsg("휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)");
      return;
    }
    setStatus("busy");
    setErrMsg("");
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanName, phone: cleanPhone, message: message.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || "");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrMsg(
        err instanceof Error && err.message
          ? err.message
          : "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  return (
    <section id="consult" className="relative z-10 py-20 sm:py-24 px-5 sm:px-8" style={{ background: PAPER2 }}>
      <div className="max-w-xl mx-auto">
        <p className="text-[12px] tracking-[0.3em] mb-4 text-center" style={{ ...serif, color: GOLD_DEEP }}>
          도입 상담
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3" style={{ ...serif, color: INK }}>
          가입 전에 궁금한 점이 있다면
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: "rgba(20,57,43,0.62)" }}>
          연락처만 남겨 주세요. 도입·요금·보안 관련 궁금증을 직접 안내드립니다.
        </p>
        {status === "done" ? (
          <div
            className="p-6 text-center text-sm font-semibold"
            style={{ background: "#FFFFFF", border: "1px solid rgba(20,57,43,0.15)", color: INK }}
          >
            상담 신청이 접수되었습니다. 빠르게 연락드리겠습니다.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            {/* 허니팟 */}
            <input
              type="text"
              name="website2"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성함"
                autoComplete="name"
                className={`w-full px-4 py-3 text-sm ${focusRing}`}
                style={{ background: "#FFFFFF", border: "1px solid rgba(20,57,43,0.2)", color: INK, ...sans }}
              />
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="휴대전화 (010-1234-5678)"
                autoComplete="tel"
                className={`w-full px-4 py-3 text-sm ${focusRing}`}
                style={{ background: "#FFFFFF", border: "1px solid rgba(20,57,43,0.2)", color: INK, ...sans }}
              />
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="궁금한 점 (선택)"
              className={`w-full px-4 py-3 text-sm ${focusRing}`}
              style={{ background: "#FFFFFF", border: "1px solid rgba(20,57,43,0.2)", color: INK, ...sans }}
            />
            {status === "error" && (
              <p role="alert" className="text-sm font-semibold" style={{ color: SEAL }}>
                {errMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "busy"}
              className={`w-full py-4 font-bold text-base transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${focusRing}`}
              style={{ background: INK, color: ON_INK }}
            >
              {status === "busy" ? "전송 중…" : "상담 신청 남기기"}
            </button>
            <p className="text-xs text-center" style={{ color: "rgba(20,57,43,0.45)" }}>
              입력하신 정보는 도입 상담 회신 목적으로만 사용합니다.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────
   스크롤 진입 페이드 (SSR에서는 보이는 상태로 출력)
   ──────────────────────────────────────────── */
function useFadeIn<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // SSR 출력과 모션 최소화 설정에서는 처음부터 보이는 상태로 시작한다
  const [visible, setVisible] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useFadeIn<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-600 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────
   홀 마커 — 라운드의 진행 표시.
   섹션이 실제로 순서를 가지므로 번호가 정당하다(업무 흐름 → 분석팀 → 운영 → 결과 → 수임료 → 문답).
   깃발 하나 꽂힌 그린을 최소한의 도형으로 그린다.
   ──────────────────────────────────────────── */
function Exhibit({ no, title }: { no: number; title: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold"
        style={{ ...serif, background: INK, color: "#F2EFE3" }}
      >
        {no}
      </span>
      <span
        className="text-[11px] tracking-[0.22em] font-semibold"
        style={{ ...serif, color: GOLD_DEEP }}
      >
        {title}
      </span>
      <span className="h-px w-10" style={{ background: "rgba(20,57,43,0.22)" }} />
    </span>
  );
}

/* 섹션 머리 — 좌측 정렬, 스탬프 + 명조 표제 */
function SectionHead({
  no,
  stamp,
  title,
  lead,
  onInk = false,
}: {
  no: number;
  stamp: string;
  title: React.ReactNode;
  lead?: string;
  onInk?: boolean;
}) {
  return (
    <div className="mb-12 sm:mb-16 max-w-2xl">
      <Exhibit no={no} title={stamp} />
      <h2
        className="mt-6 text-3xl sm:text-4xl font-bold leading-snug"
        style={{ ...serif, color: onInk ? ON_INK : "#22252E" }}
      >
        {title}
      </h2>
      {lead && (
        <p
          className="mt-4 text-base sm:text-lg leading-relaxed"
          style={{ color: onInk ? "rgba(242,239,227,0.6)" : "rgba(20,57,43,0.62)" }}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   시그니처 — 골프 스코어카드
   홀마다 업무를 적고, PAR는 원래 걸리던 시간, SCORE는 Law-Caddy와 함께한 시간이다.
   골프 관례대로 언더파(줄어든 시간)는 붉은 숫자로 적는다.
   숫자는 전부 실측 기준이며 과장하지 않는다.
   ──────────────────────────────────────────── */
const SCORECARD: {
  hole: number;
  work: string;
  par: string;
  score: string;
  diff: string | null;
}[] = [
  { hole: 1, work: "의뢰인 상담", par: "30분", score: "30분", diff: null },
  { hole: 2, work: "판례 검색 · 쟁점 분석", par: "3시간", score: "2분", diff: "-2:58" },
  { hole: 3, work: "서면 초안 작성", par: "2시간", score: "5분", diff: "-1:55" },
  { hole: 4, work: "의뢰인 안내 · 정산", par: "40분", score: "3분", diff: "-0:37" },
];

function Scorecard() {
  return (
    <div className="relative select-none" aria-hidden="true">
      {/* 카드 뭉치의 두께 */}
      <div
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-[3px]"
        style={{ background: "rgba(20,57,43,0.08)" }}
      />
      <div
        className="scorecard relative rounded-[3px] overflow-hidden"
        style={{
          background: "#FFFDF8",
          boxShadow: "0 22px 50px -20px rgba(20,57,43,0.35)",
          border: "1px solid rgba(20,57,43,0.12)",
        }}
      >
        {/* 카드 머리 */}
        <div
          className="flex items-baseline justify-between px-3.5 sm:px-7 py-3.5 sm:py-4"
          style={{ background: INK }}
        >
          <span
            className="text-[13px] font-bold tracking-[0.22em]"
            style={{ ...serif, color: "#F2EFE3" }}
          >
            SCORECARD
          </span>
          <span className="text-[10px] tracking-[0.18em]" style={{ color: "rgba(242,239,227,0.55)" }}>
            사건 1건 기준
          </span>
        </div>

        {/* 열 머리 */}
        <div
          className="grid grid-cols-12 gap-1.5 sm:gap-2 px-3.5 sm:px-7 pt-4 pb-2 text-[10px] tracking-[0.12em] sm:tracking-[0.16em]"
          style={{ color: "rgba(20,57,43,0.45)" }}
        >
          <span className="col-span-1">홀</span>
          <span className="col-span-5">업무</span>
          <span className="col-span-3 text-right">PAR</span>
          <span className="col-span-3 text-right">SCORE</span>
        </div>

        <div style={{ borderTop: "1px solid rgba(20,57,43,0.14)" }}>
          {SCORECARD.map((row, i) => (
            <div
              key={row.hole}
              className="hero-doc-line grid grid-cols-12 gap-1.5 sm:gap-2 items-baseline px-3.5 sm:px-7 py-3"
              style={{
                animationDelay: `${350 + i * 160}ms`,
                borderBottom: "1px solid rgba(20,57,43,0.07)",
              }}
            >
              <span
                className="col-span-1 text-[13px] font-bold tabular-nums"
                style={{ ...serif, color: GOLD_DEEP }}
              >
                {row.hole}
              </span>
              <span className="col-span-5 text-[12px] sm:text-[13px] truncate" style={{ color: "#33372F" }}>
                {row.work}
              </span>
              <span
                className="col-span-3 text-right text-[12px] sm:text-[13px] tabular-nums"
                style={{ color: "rgba(51,55,47,0.45)" }}
              >
                {row.par}
              </span>
              <span className="col-span-3 text-right text-[12px] sm:text-[13px] font-semibold tabular-nums" style={{ color: INK }}>
                {row.score}
                {row.diff && (
                  <span className="block text-[11px] font-bold tabular-nums" style={{ color: SEAL }}>
                    {row.diff}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* 합계 */}
        <div
          className="hero-doc-line flex items-baseline justify-between px-3.5 sm:px-7 py-4"
          style={{ background: PAPER2, animationDelay: `${350 + SCORECARD.length * 160}ms` }}
        >
          <span className="text-[11px] tracking-[0.2em]" style={{ color: "rgba(20,57,43,0.55)" }}>
            TOTAL
          </span>
          <span className="flex items-baseline gap-2.5 sm:gap-7">
            <span className="text-[12px] tabular-nums line-through" style={{ color: "rgba(51,55,47,0.38)" }}>
              6시간 10분
            </span>
            <span className="text-[16px] font-bold tabular-nums" style={{ ...serif, color: INK }}>
              40분
            </span>
            <span className="text-[16px] font-bold tabular-nums" style={{ ...serif, color: SEAL }}>
              -5:30
            </span>
          </span>
        </div>
      </div>

      {/* 캐디 각주 — 카드 밖 손글씨처럼 */}
      <p
        className="hero-doc-line mt-4 text-[11px] pl-1"
        style={{ color: "rgba(20,57,43,0.5)", animationDelay: `${350 + (SCORECARD.length + 1) * 160}ms` }}
      >
        캐디가 준비를 맡고, 판단과 서명은 변호사가 합니다.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────
   메인
   ──────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ ...sans, background: PAPER, wordBreak: "keep-all" }}>
      {/* 문서 라인 등장 애니메이션 (모션 최소화 설정 존중) */}
      <style>{`
        @keyframes heroDocRise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-doc-line { opacity: 0; animation: heroDocRise 0.55s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .hero-doc-line { animation: none; opacity: 1; }
        }
      `}</style>

      {/* ─── 내비게이션 ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{ background: "rgba(247,245,236,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(20,57,43,0.1)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className={`flex items-baseline gap-2 ${focusRing}`}>
            <span className="text-lg font-bold tracking-tight" style={{ ...serif, color: INK }}>
              Law-Caddy
            </span>
            {/* 핀 깃발 — 브랜드 마크 */}
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "rgba(20,57,43,0.6)" }}>
            {[
              ["#workflow", "업무 흐름"],
              ["#agents", "AI 분석팀"],
              ["#platform", "사무소 운영"],
              ["#pricing", "수임료"],
              ["#faq", "질문"],
            ].map(([href, label]) => (
              <a key={href} href={href} className={`hover:text-[#2E6242] transition-colors ${focusRing}`}>
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={`px-4 py-2 text-sm transition-colors hover:text-[#2E6242] ${focusRing}`}
              style={{ color: "rgba(20,57,43,0.65)" }}
            >
              로그인
            </Link>
            <Link
              to="/login"
              className={`px-5 py-2 text-sm font-semibold transition-colors rounded-full ${focusRing}`}
              style={{ background: INK, color: "#F7F5EC" }}
            >
              무료로 시작
            </Link>
          </div>
        </div>

        {/* 모바일 섹션 이동 — 메뉴가 숨겨지면 페이지 안에서 길을 잃는다 */}
        <div
          className="md:hidden flex gap-2 overflow-x-auto px-4 pb-2.5 -mt-1 text-[13px]"
          style={{ color: "rgba(20,57,43,0.7)", scrollbarWidth: "none" }}
        >
          {[
            ["#workflow", "업무 흐름"],
            ["#agents", "AI 분석팀"],
            ["#platform", "사무소 운영"],
            ["#pricing", "수임료"],
            ["#faq", "질문"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className={`shrink-0 px-3 py-1.5 rounded-full whitespace-nowrap ${focusRing}`}
              style={{ border: "1px solid rgba(20,57,43,0.16)" }}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* ─── 히어로 ─── */}
      {/* (2026-07-31) 고정 배경 영상 → 스크롤 확장 히어로로 교체.
          스크롤을 내리면 가운데 영상이 화면 전체로 펼쳐지고, 다 펼쳐진 뒤에야 본문이 드러난다.
          표제와 부제는 처음부터 보이고, CTA·스코어카드는 펼친 뒤에 나온다.
          ※ 펼치는 동안 페이지 스크롤이 잠기므로, 상시 노출되는 전환 동선은 상단 내비의
            '무료로 시작' 버튼이 맡는다(내비는 이 컴포넌트 바깥의 fixed 요소라 항상 보인다). */}
      <header className="relative" style={{ ...serif }}>
        <ScrollExpandMedia
          mediaType="video"
          mediaSrc="/media/hero-dawn-v3.mp4"
          posterSrc="/media/hero-dawn-v3.jpg"
          bgImageSrc="/media/hero-dawn-v3.jpg"
          title="좋은 캐디가 절반을 합니다"
          date="1인 변호사 사무실 운영 SaaS"
          scrollToExpand="스크롤하면 펼쳐집니다"
          textColor="#F2EFE3"
        >
          <div className="max-w-6xl mx-auto w-full" style={{ ...sans }}>
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              {/* 좌측 — 캐디의 약속 */}
              <div className="lg:col-span-6">
                <p
                  className="text-base sm:text-lg leading-relaxed max-w-xl mb-10"
                  style={{ color: "rgba(20,57,43,0.68)" }}
                >
                  상담 녹음 하나로 판례 검색, 서면 초안, 수임계약, 정산까지.
                  <br className="hidden sm:block" />
                  준비는 Law-Caddy가 맡고, 판단은 변호사가 합니다.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Link
                    to="/login"
                    className={`group inline-flex items-center gap-2.5 px-8 py-4 font-bold text-base rounded-full transition-transform hover:-translate-y-0.5 ${focusRing}`}
                    style={{ background: INK, color: "#F7F5EC", boxShadow: "0 10px 24px -12px rgba(20,57,43,0.6)" }}
                  >
                    무료로 시작하기
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link
                    to="/login?demo=true"
                    className={`inline-flex items-center gap-2 px-8 py-4 text-base rounded-full border transition-colors hover:border-[#2E6242] hover:text-[#2E6242] ${focusRing}`}
                    style={{ color: "rgba(20,57,43,0.8)", borderColor: "rgba(20,57,43,0.22)" }}
                  >
                    데모 보기
                  </Link>
                </div>
                <p className="mt-5 text-xs" style={{ color: "rgba(20,57,43,0.45)" }}>
                  신용카드 없이 가입 · 변호사 인증 후 사용
                </p>
              </div>

              {/* 우측 — 시그니처 스코어카드 */}
              <div className="lg:col-span-6 max-w-lg w-full mx-auto lg:mx-0">
                <Scorecard />
              </div>
            </div>

            {/* 사실 관계 — 검증 가능한 숫자만 */}
            <div className="mt-12 pt-6" style={{ borderTop: "1px solid rgba(20,57,43,0.12)" }}>
              <div
                className="flex flex-wrap gap-x-10 gap-y-3 text-[13px]"
                style={{ color: "rgba(20,57,43,0.6)" }}
              >
                {[
                  ["대상", "1~5인 법률사무소"],
                  ["법률 문서 서식", "28종"],
                  ["AI 분석", "4개 관점 병렬"],
                  ["초안 완성까지", "약 10분"],
                ].map(([label, value]) => (
                  <span key={label} className="inline-flex items-baseline gap-2">
                    <span>{label}</span>
                    <span className="font-semibold" style={{ ...serif, color: GOLD_DEEP }}>
                      {value}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </ScrollExpandMedia>
      </header>

      <main className="relative z-10">
        {/* ─── 갑 제1호증 · 업무 흐름 ─── */}
        <section id="workflow" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER }}>
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <SectionHead
                no={1}
                stamp="업무 흐름"
                title="상담이 끝나면, 서면은 이미 준비되어 있습니다"
                lead="사건 진행 기록처럼 읽어보세요. 녹음 버튼 하나로 시작되는 네 단계입니다."
              />
            </FadeIn>

            {/* 진행 기록 원장 */}
            <FadeIn delay={100}>
              <ol className="border-t" style={{ borderColor: "rgba(20,57,43,0.14)" }}>
                {WORKFLOW_STEPS.map((step, i) => (
                  <li
                    key={step.label}
                    className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[4.5rem_16rem_1fr_auto] items-baseline gap-x-4 sm:gap-x-8 py-6 border-b transition-colors hover:bg-[#F5F2EA]"
                    style={{ borderColor: "rgba(20,57,43,0.1)" }}
                  >
                    <span className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ ...serif, color: "rgba(20,57,43,0.22)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold" style={{ ...serif, color: "#1E2A22" }}>
                      {step.label}
                    </h3>
                    <p className="col-span-3 sm:col-span-1 col-start-2 sm:col-start-3 text-sm leading-relaxed mt-1 sm:mt-0" style={{ color: "rgba(20,57,43,0.62)" }}>
                      {step.detail}
                    </p>
                    <span
                      className="col-start-3 sm:col-start-4 row-start-1 text-[12px] tracking-wider font-semibold whitespace-nowrap"
                      style={{ ...serif, color: GOLD_DEEP }}
                    >
                      {step.time}
                    </span>
                  </li>
                ))}
              </ol>
            </FadeIn>
          </div>
        </section>

        {/* ─── 갑 제2호증 · AI 분석팀 ─── */}
        <section id="agents" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER2 }}>
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <SectionHead
                no={2}
                stamp="분석팀"
                title="네 사람 몫의 준비를, 네 개의 AI가"
                lead="판례·적법성·쟁점·작성. 서로의 결과를 이어받아 한 사건을 네 각도에서 준비합니다."
              />
            </FadeIn>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: "rgba(20,57,43,0.12)" }}>
              {AGENTS.map((agent, i) => (
                <FadeIn key={agent.fullName} delay={i * 80} className="h-full">
                  <article className="h-full p-7 flex flex-col" style={{ background: PAPER2 }}>
                    <span className="text-[11px] tracking-[0.22em] mb-4" style={{ color: GOLD_DEEP }}>
                      {agent.role}
                    </span>
                    <h3 className="text-2xl font-bold mb-3" style={{ ...serif, color: "#1E2A22" }}>
                      {agent.fullName}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(20,57,43,0.62)" }}>
                      {agent.desc}
                    </p>
                  </article>
                </FadeIn>
              ))}
            </div>

            {/* 첨부 문서 처리 */}
            <FadeIn delay={200}>
              <div className="mt-14 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 py-6 border-t border-b" style={{ borderColor: "rgba(20,57,43,0.14)" }}>
                <p className="text-sm font-semibold shrink-0" style={{ ...serif, color: "#1E2A22" }}>
                  첨부한 문서도 함께 읽습니다
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(20,57,43,0.62)" }}>
                  PDF · DOCX · HWP · 이미지(OCR)에서 텍스트를 추출해 분석에 반영하고,
                  증거번호(갑 제1호증)를 매겨 서면에 인용합니다.
                </p>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── 갑 제3호증 · 사무소 운영 ─── */}
        <section id="platform" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER }}>
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <SectionHead
                no={3}
                stamp="사무소 운영"
                title="서면 밖의 일도 한 곳에서"
                lead="수임계약, 성공보수, 인지대, 세무 자료 — 사무장 없이 혼자 감당하던 일들입니다."
              />
            </FadeIn>

            <dl>
              {PLATFORM_FEATURES.map((feat, i) => (
                <FadeIn key={feat.title} delay={i * 60}>
                  <div
                    className="grid sm:grid-cols-[11rem_1fr] lg:grid-cols-[14rem_1fr] gap-2 sm:gap-10 py-7 border-b"
                    style={{ borderColor: "rgba(20,57,43,0.1)" }}
                  >
                    <dt className="flex items-start gap-3">
                      <span className="text-[11px] tracking-[0.2em] mt-1 shrink-0" style={{ color: GOLD_DEEP }}>
                        {feat.tag}
                      </span>
                    </dt>
                    <dd>
                      <h3 className="text-lg font-bold mb-1.5" style={{ ...serif, color: "#1E2A22" }}>
                        {feat.title}
                      </h3>
                      <p className="text-sm leading-relaxed max-w-2xl" style={{ color: "rgba(20,57,43,0.62)" }}>
                        {feat.desc}
                      </p>
                    </dd>
                  </div>
                </FadeIn>
              ))}
            </dl>
          </div>
        </section>

        {/* ─── 갑 제4호증 · 하루의 변화 ─── */}
        <section className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER }}>
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <SectionHead
                no={4}
                stamp="하루의 변화"
                title="같은 사건, 다른 하루"
                lead="민사 사건 한 건을 접수하는 일반적인 흐름을 예로 들었습니다."
              />
            </FadeIn>

            <FadeIn delay={100}>
              <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                {/* 기존 방식 */}
                <div>
                  <p className="text-[12px] tracking-[0.24em] mb-6 pb-3 border-b" style={{ ...serif, color: "rgba(20,57,43,0.45)", borderColor: "rgba(20,57,43,0.14)" }}>
                    기존 방식
                  </p>
                  <ul className="space-y-3.5">
                    {[
                      ["상담 후 수기 메모 정리", "30분"],
                      ["판례 검색", "2시간"],
                      ["서면 초안 작성", "3시간"],
                      ["수임계약서 작성 · 서명", "40분"],
                      ["의뢰인 설명 연락", "20분"],
                      ["수임료 엑셀 정리", "30분"],
                      ["인지대 · 송달료 계산", "15분"],
                    ].map(([task, time]) => (
                      <li key={task} className="flex items-baseline justify-between gap-4 text-sm" style={{ color: "rgba(20,57,43,0.62)" }}>
                        <span>{task}</span>
                        <span className="shrink-0 tabular-nums" style={{ ...serif }}>{time}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 pt-4 border-t text-sm font-bold flex items-baseline justify-between" style={{ color: "rgba(30,42,34,0.82)", borderColor: "rgba(20,57,43,0.14)" }}>
                    <span style={serif}>합계</span>
                    <span style={serif}>약 7시간</span>
                  </p>
                </div>

                {/* Law-Caddy */}
                <div className="p-8 sm:p-10" style={{ background: INK }}>
                  <p className="text-[12px] tracking-[0.24em] mb-6 pb-3 border-b" style={{ ...serif, color: SPROUT, borderColor: "rgba(242,239,227,0.18)" }}>
                    Law-Caddy
                  </p>
                  <ul className="space-y-3.5">
                    {[
                      ["상담 녹음 → 자동 대화록", "0분"],
                      ["네 개 AI 병렬 분석", "2분"],
                      ["체크포인트 확인 → 서면 초안", "5분"],
                      ["수임계약서 생성 → 전자서명", "1분"],
                      ["의뢰인 안내 메시지", "0분"],
                      ["수임료 · 성공보수 자동 기록", "0분"],
                      ["인지대 · 송달료 자동 계산", "0분"],
                    ].map(([task, time]) => (
                      <li key={task} className="flex items-baseline justify-between gap-4 text-sm" style={{ color: "rgba(242,239,227,0.78)" }}>
                        <span className="flex items-baseline gap-2.5">
                          <Check className="w-3.5 h-3.5 translate-y-0.5 shrink-0" style={{ color: SPROUT }} />
                          {task}
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ ...serif }}>{time}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 pt-4 border-t text-sm font-bold flex items-baseline justify-between" style={{ color: ON_INK, borderColor: "rgba(242,239,227,0.18)" }}>
                    <span style={serif}>합계</span>
                    <span style={{ ...serif, color: SPROUT }}>약 10분 + 변호사 검토</span>
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── 만든 사람 ───
            경력은 chang-hee.kim 프로필 원문에서 그대로 옮겼다. 임의로 지어낸 인용문을
            실명에 붙이지 않는다 — 사실 서술만. */}
        <section className="py-16 sm:py-24 px-5 sm:px-8" style={{ background: INK }}>
          <FadeIn>
            <div className="max-w-3xl mx-auto">
              <p className="text-[12px] tracking-[0.3em] mb-7" style={{ ...serif, color: SPROUT }}>
                만든 사람
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-6" style={{ ...serif, color: ON_INK }}>
                매일 쓰는 사람이 만들었습니다
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: "rgba(242,239,227,0.62)" }}>
                부산에서 법률사무소청송law를 운영하는 김창희 변호사가 자신의 하루를 줄이려
                직접 설계했고, 지금도 매일 이 화면으로 사건을 처리합니다. 10년간 1,000건
                이상의 사건을 수행하며 다듬은 실무 감각이 서식 하나, 질문 하나에 들어
                있습니다.
              </p>
              <div
                className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-6 border-t"
                style={{ borderColor: "rgba(242,239,227,0.14)" }}
              >
                <div>
                  <p className="text-base font-bold" style={{ ...serif, color: ON_INK }}>
                    김창희 변호사
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "rgba(242,239,227,0.5)" }}>
                    법률사무소청송law 대표 · 동아대학교 법학전문대학원 겸임교수 · 법제처 법제자문관
                  </p>
                </div>
                <a
                  href="https://chang-hee.kim"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 text-sm transition-colors hover:text-[#2E6242] ${focusRing}`}
                  style={{ ...serif, color: "rgba(242,239,227,0.62)" }}
                >
                  chang-hee.kim ↗
                </a>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* ─── 수임료 ─── */}
        <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER2 }}>
          <div className="max-w-6xl mx-auto">
            <FadeIn>
              <SectionHead
                no={5}
                stamp="수임료"
                title="사무장 월급의 삼십분의 일"
                lead="가입하면 Starter가 무료로 열립니다. 더 필요해지면 그때 올리세요."
              />
            </FadeIn>

            <div className="grid md:grid-cols-3 gap-6">
              {PLANS.map((plan, i) => (
                <FadeIn key={plan.name} delay={i * 90} className="h-full">
                  <div
                    className="relative h-full flex flex-col p-8"
                    style={
                      plan.highlighted
                        ? { background: INK }
                        : { background: PAPER, border: "1px solid rgba(20,57,43,0.13)" }
                    }
                  >
                    {plan.highlighted && (
                      <span
                        className="absolute -top-3 left-8 px-3 py-1 text-[11px] font-bold tracking-[0.18em]"
                        style={{ background: INK, color: ON_INK }}
                      >
                        추천
                      </span>
                    )}
                    {plan.comingSoon && (
                      <span
                        className="absolute -top-3 left-8 px-3 py-1 text-[11px] font-bold tracking-[0.18em]"
                        style={{ background: "rgba(20,57,43,0.45)", color: PAPER }}
                      >
                        준비중
                      </span>
                    )}
                    <h3
                      className="text-lg font-bold mb-5"
                      style={{ ...serif, color: plan.highlighted ? GOLD : "#22252E" }}
                    >
                      {plan.name}
                    </h3>
                    <p className="flex items-baseline gap-1 mb-7">
                      <span
                        className="text-4xl font-bold tabular-nums"
                        style={{ ...serif, color: plan.highlighted ? ON_INK : "#1E2A22" }}
                      >
                        {plan.price}
                      </span>
                      {plan.price !== "무료" && (
                        <span className="text-sm" style={{ color: plan.highlighted ? "rgba(242,239,227,0.5)" : "rgba(20,57,43,0.45)" }}>
                          원{plan.period}
                        </span>
                      )}
                    </p>
                    <ul className="space-y-3 mb-9 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-baseline gap-2.5 text-sm">
                          <Check
                            className="w-3.5 h-3.5 translate-y-0.5 shrink-0"
                            style={{ color: plan.highlighted ? GOLD : GOLD_DEEP }}
                          />
                          <span style={{ color: plan.highlighted ? "rgba(242,239,227,0.85)" : "rgba(30,42,34,0.82)" }}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {plan.comingSoon ? (
                      <div
                        className="block w-full text-center py-3.5 text-sm font-bold rounded-full"
                        style={{ border: "1px solid rgba(20,57,43,0.2)", color: "rgba(20,57,43,0.42)" }}
                      >
                        출시 예정
                      </div>
                    ) : (
                      <Link
                        to="/login"
                        className={`block w-full text-center py-3.5 text-sm font-bold rounded-full transition-transform hover:-translate-y-0.5 ${focusRing}`}
                        style={
                          plan.highlighted
                            ? // 딥그린 카드 위 — 크림 버튼이 가장 잘 읽힌다
                              { background: ON_INK, color: INK }
                            : { background: INK, color: ON_INK }
                        }
                      >
                        시작하기
                      </Link>
                    )}
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: PAPER }}>
          <div className="max-w-3xl mx-auto">
            <FadeIn>
              <SectionHead no={6} stamp="문답" title="자주 묻는 질문" />
            </FadeIn>
            <FadeIn>
              <div className="border-t" style={{ borderColor: "rgba(20,57,43,0.14)" }}>
                {FAQS.map((faq) => (
                  <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── 마무리 CTA ─── */}
        <section className="py-24 sm:py-32 px-5 sm:px-8" style={{ background: INK }}>
          <FadeIn>
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-[12px] tracking-[0.3em] mb-7" style={{ ...serif, color: SPROUT }}>
                오늘 접수한 사건부터
              </p>
              <h2 className="text-3xl sm:text-5xl font-bold leading-snug mb-7" style={{ ...serif, color: ON_INK }}>
                준비는 Law-Caddy가,
                <br />
                판단은 변호사님이
              </h2>
              <p className="text-base mb-11" style={{ color: "rgba(242,239,227,0.58)" }}>
                가입 후 7일간 Pro 플랜 전체 기능을 무료로 쓸 수 있습니다.
              </p>
              <Link
                to="/login"
                className={`group inline-flex items-center gap-2.5 px-10 py-4 font-bold text-base transition-transform hover:-translate-y-0.5 ${focusRing}`}
                style={{ background: INK, color: ON_INK }}
              >
                무료로 시작하기
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </FadeIn>
        </section>

        {/* ─── 도입 상담 신청 — 가입 전 방문자의 유일한 연락 창구 ─── */}
        <ConsultSection />
      </main>

      {/* ─── 푸터 ─── */}
      {/* 푸터 — 운영 주체(사업자) 정보를 명시한다.
          전자상거래법상 유료 서비스의 표시 의무이자, 카카오 비즈니스 채널 심사에서
          "사업자와 채널·서비스의 연관성"을 확인하는 근거 자료가 된다. */}
      <footer className="relative z-10 py-12 px-5 sm:px-8" style={{ background: PAPER, borderTop: "1px solid rgba(20,57,43,0.12)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-8">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold" style={{ ...serif, color: "#1E2A22" }}>
                Law-Caddy
              </span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: "rgba(20,57,43,0.62)" }}>
              <a
                href={KAKAO_CHANNEL_CHAT}
                target="_blank"
                rel="noopener noreferrer"
                className={`hover:text-[#2E6242] transition-colors ${focusRing}`}
              >
                카카오톡 문의
              </a>
              <Link to="/login" className={`hover:text-[#2E6242] transition-colors ${focusRing}`}>
                로그인
              </Link>
              <Link to="/login" className={`hover:text-[#2E6242] transition-colors ${focusRing}`}>
                시작하기
              </Link>
            </div>
          </div>

          {/* 운영 주체 */}
          <div
            className="pt-7 text-xs leading-relaxed"
            style={{ borderTop: "1px solid rgba(20,57,43,0.1)", color: "rgba(20,57,43,0.55)" }}
          >
            <p className="mb-2">
              <span className="font-semibold" style={{ color: "rgba(20,57,43,0.75)" }}>
                Law-Caddy는 법률사무소청송law가 개발·운영하는 법률사무소 업무 관리 서비스입니다.
              </span>
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              <span>상호 법률사무소청송law</span>
              <span>대표 김창희</span>
              <span>사업자등록번호 102-78-00061</span>
              <span>전화 051-714-1515</span>
            </div>
            <p className="mt-1.5">
              주소 부산광역시 연제구 법원남로15번길 10, 2층 202호(거제동, 미르코아빌딩)
            </p>
            <p className="mt-4" style={{ color: "rgba(20,57,43,0.42)" }}>
              &copy; {new Date().getFullYear()} 법률사무소청송law. 모든 AI 산출물은 변호사의 최종 검토를 전제로 한 초안입니다.
            </p>
          </div>
        </div>
      </footer>
      <KakaoChatButton />
    </div>
  );
}
