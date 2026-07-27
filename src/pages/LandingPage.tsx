// 랜딩페이지 — "페이지 전체가 한 부의 소장(訴狀)" 컨셉
//
// (2026-07-27) 전면 재설계. 설계 의도:
// - 히어로는 구호가 아니라 산출물: 실제 법원 서식으로 조판한 소장이 눈앞에서 완성된다
// - 각 섹션은 실무의 증거 스탬프(갑 제N호증)로 번호를 매긴다 — 페이지의 주장
//   ("변호사의 시간을 청구한다")을 증거가 하나씩 입증하는 구조
// - 색은 앱과 동일한 잉크 네이비 + 금색. 도장 주홍(#B3372B)은 스탬프와 인영에만 쓴다
// - 가짜 후기·가짜 이용사무소·검증 불가 수치는 싣지 않는다 (변협 광고규정 오인유발 소지)
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/700.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { WORKFLOW_STEPS, AGENTS, PLATFORM_FEATURES, PLANS, FAQS } from "../data/landingContent";
import FAQItem from "../components/landing/FAQItem";

/* ────────────────────────────────────────────
   디자인 토큰
   ──────────────────────────────────────────── */
const INK = "#0D1526";
const PAPER = "#FBFAF6";
const PAPER2 = "#F1EEE6";
const GOLD = "#C8A961";
const GOLD_DEEP = "#8F7434";
const SEAL = "#B3372B";

const serif = { fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif' } as const;
const sans = {
  fontFamily: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif',
} as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8A961]";

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
   증거 스탬프 — 실무의 "갑 제N호증" 인장
   ──────────────────────────────────────────── */
function Exhibit({ no, title }: { no: number; title: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-2 border px-3 py-1.5 text-[11px] tracking-[0.14em] select-none"
      style={{
        ...serif,
        color: SEAL,
        borderColor: "rgba(179,55,43,0.55)",
        transform: "rotate(-1.2deg)",
      }}
    >
      갑 제{no}호증
      <span className="tracking-[0.04em]" style={{ color: "rgba(179,55,43,0.75)" }}>
        {title}
      </span>
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
        style={{ ...serif, color: onInk ? "#EFEAE0" : "#22252E" }}
      >
        {title}
      </h2>
      {lead && (
        <p
          className="mt-4 text-base sm:text-lg leading-relaxed"
          style={{ color: onInk ? "rgba(239,234,224,0.6)" : "#676A72" }}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   히어로 소장 — 실제 법원 서식으로 조판한 산출물 실물
   ──────────────────────────────────────────── */
function HeroDocument() {
  const lines: { text: React.ReactNode; className?: string }[] = [
    {
      text: "소　　　장",
      className: "text-center text-[19px] font-bold tracking-[0.5em] mb-5 mt-1",
    },
    { text: "원 고  김 ○ ○", className: "font-semibold" },
    { text: "부산광역시 연제구 법원남로 ○○", className: "pl-[4.4em] text-[11px] opacity-70" },
    { text: "피 고  박 ○ ○", className: "font-semibold mt-1.5" },
    {
      text: "임대차보증금 반환 청구의 소",
      className: "text-center font-semibold mt-4 mb-3 tracking-wider",
    },
    { text: "청 구 취 지", className: "text-center tracking-[0.3em] font-semibold mt-2 mb-2" },
    {
      text: "1. 피고는 원고에게 금 55,000,000원 및 이에 대하여 2026. 3. 15.부터 다 갚는 날까지 연 12%의 비율로 계산한 돈을 지급하라.",
    },
    { text: "2. 소송비용은 피고가 부담한다." },
    { text: "3. 제1항은 가집행할 수 있다.", className: "mb-3" },
    { text: "청 구 원 인", className: "text-center tracking-[0.3em] font-semibold mb-2" },
    {
      text: "1. 원고는 2024. 3. 15. 피고와 부산 연제구 소재 아파트에 관하여 임대차보증금 55,000,000원의 임대차계약을 체결하고 …",
      className: "opacity-80",
    },
    { text: "2026. 7. 27.", className: "text-center mt-4 text-[11px]" },
    {
      text: "원고 소송대리인 변호사 ○ ○ ○ (인)",
      className: "text-center text-[11px]",
    },
    { text: "부산지방법원 귀중", className: "text-center font-semibold tracking-[0.2em] mt-2" },
  ];

  return (
    <div className="relative select-none" aria-hidden="true">
      {/* 뒷장 — 서류 뭉치의 두께 */}
      <div
        className="absolute inset-0 translate-x-2.5 translate-y-2.5 rounded-[2px]"
        style={{ background: "rgba(252,251,247,0.16)" }}
      />
      <div
        className="relative rounded-[2px] px-7 sm:px-9 py-8 shadow-2xl"
        style={{
          ...serif,
          background: "#FCFBF7",
          color: "#2A2C33",
          transform: "rotate(0.6deg)",
          boxShadow: "0 24px 60px -18px rgba(0,0,0,0.55)",
        }}
      >
        {/* AI 초안 표식 */}
        <div
          className="absolute -top-3 right-6 px-2.5 py-1 text-[10px] tracking-[0.16em] font-semibold"
          style={{ ...sans, background: INK, color: GOLD, letterSpacing: "0.14em" }}
        >
          AI 초안 · 변호사 검토 전
        </div>

        <div className="text-[12px] leading-[1.75]">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`hero-doc-line ${line.className ?? ""}`}
              style={{ animationDelay: `${300 + i * 130}ms` }}
            >
              {line.text}
            </p>
          ))}
        </div>

        {/* 인영 — 도장 주홍은 여기와 스탬프에만 */}
        <div
          className="hero-doc-line absolute bottom-[54px] right-9 w-11 h-11 rounded-full border-2 flex items-center justify-center text-[13px] font-bold"
          style={{
            ...serif,
            color: SEAL,
            borderColor: SEAL,
            transform: "rotate(-8deg)",
            opacity: 0.85,
            animationDelay: `${300 + lines.length * 130}ms`,
          }}
        >
          초안
        </div>
      </div>
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
        style={{ background: "rgba(13,21,38,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(200,169,97,0.18)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className={`flex items-baseline gap-2 ${focusRing}`}>
            <span className="text-lg font-bold tracking-tight" style={{ ...serif, color: "#EFEAE0" }}>
              Law-Caddy
            </span>
            <span className="w-1 h-1 rounded-full" style={{ background: GOLD }} />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "rgba(239,234,224,0.6)" }}>
            {[
              ["#workflow", "업무 흐름"],
              ["#agents", "AI 분석팀"],
              ["#platform", "사무소 운영"],
              ["#pricing", "수임료"],
              ["#faq", "질문"],
            ].map(([href, label]) => (
              <a key={href} href={href} className={`hover:text-[#C8A961] transition-colors ${focusRing}`}>
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={`px-4 py-2 text-sm transition-colors hover:text-[#C8A961] ${focusRing}`}
              style={{ color: "rgba(239,234,224,0.7)" }}
            >
              로그인
            </Link>
            <Link
              to="/login"
              className={`px-5 py-2 text-sm font-semibold transition-colors ${focusRing}`}
              style={{ background: GOLD, color: INK }}
            >
              무료로 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── 히어로 ─── */}
      <header className="relative pt-16" style={{ background: INK }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-20 sm:pb-28 grid lg:grid-cols-12 gap-14 lg:gap-10 items-center">
          {/* 좌측 — 청구취지 */}
          <div className="lg:col-span-7">
            <p
              className="text-[12px] tracking-[0.3em] mb-7"
              style={{ ...serif, color: GOLD }}
            >
              법률사무소 업무 자동화
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.6rem] font-bold leading-[1.25] mb-7"
              style={{ ...serif, color: "#EFEAE0" }}
            >
              변호사의 시간을
              <br />
              청구합니다
            </h1>
            <p className="text-base sm:text-lg leading-relaxed max-w-xl mb-10" style={{ color: "rgba(239,234,224,0.62)" }}>
              상담 녹음 하나로 판례 검색, 쟁점 분석, 서면 초안, 수임계약, 정산까지.
              반복 업무는 Law-Caddy가 먼저 준비하고, 판단은 변호사가 합니다.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link
                to="/login"
                className={`group inline-flex items-center gap-2.5 px-8 py-4 font-bold text-base transition-transform hover:-translate-y-0.5 ${focusRing}`}
                style={{ background: GOLD, color: INK }}
              >
                무료로 시작하기
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/login?demo=true"
                className={`inline-flex items-center gap-2 px-8 py-4 text-base border transition-colors hover:border-[#C8A961] hover:text-[#C8A961] ${focusRing}`}
                style={{ color: "rgba(239,234,224,0.8)", borderColor: "rgba(239,234,224,0.25)" }}
              >
                데모 보기
              </Link>
            </div>
            <p className="mt-5 text-xs" style={{ color: "rgba(239,234,224,0.35)" }}>
              신용카드 없이 가입 · 변호사 인증 후 사용
            </p>
          </div>

          {/* 우측 — 산출물 실물 */}
          <div className="lg:col-span-5 max-w-md w-full mx-auto lg:mx-0">
            <HeroDocument />
          </div>
        </div>

        {/* 사실 관계 — 검증 가능한 숫자만 */}
        <div style={{ borderTop: "1px solid rgba(239,234,224,0.12)" }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-wrap gap-x-10 gap-y-3 text-[13px]" style={{ color: "rgba(239,234,224,0.55)" }}>
            {[
              ["법률 문서 서식", "28종"],
              ["AI 분석", "4개 관점 병렬"],
              ["분석 소요", "약 2분"],
              ["초안 완성까지", "약 10분"],
            ].map(([label, value]) => (
              <span key={label} className="inline-flex items-baseline gap-2">
                <span>{label}</span>
                <span className="font-semibold" style={{ ...serif, color: GOLD }}>
                  {value}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <main>
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
              <ol className="border-t" style={{ borderColor: "rgba(20,24,35,0.14)" }}>
                {WORKFLOW_STEPS.map((step, i) => (
                  <li
                    key={step.label}
                    className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[4.5rem_16rem_1fr_auto] items-baseline gap-x-4 sm:gap-x-8 py-6 border-b transition-colors hover:bg-[#F5F2EA]"
                    style={{ borderColor: "rgba(20,24,35,0.1)" }}
                  >
                    <span className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ ...serif, color: "rgba(20,24,35,0.22)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold" style={{ ...serif, color: "#22252E" }}>
                      {step.label}
                    </h3>
                    <p className="col-span-3 sm:col-span-1 col-start-2 sm:col-start-3 text-sm leading-relaxed mt-1 sm:mt-0" style={{ color: "#676A72" }}>
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

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: "rgba(20,24,35,0.12)" }}>
              {AGENTS.map((agent, i) => (
                <FadeIn key={agent.fullName} delay={i * 80} className="h-full">
                  <article className="h-full p-7 flex flex-col" style={{ background: PAPER2 }}>
                    <span className="text-[11px] tracking-[0.22em] mb-4" style={{ color: GOLD_DEEP }}>
                      {agent.role}
                    </span>
                    <h3 className="text-2xl font-bold mb-3" style={{ ...serif, color: "#22252E" }}>
                      {agent.fullName}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#676A72" }}>
                      {agent.desc}
                    </p>
                  </article>
                </FadeIn>
              ))}
            </div>

            {/* 첨부 문서 처리 */}
            <FadeIn delay={200}>
              <div className="mt-14 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 py-6 border-t border-b" style={{ borderColor: "rgba(20,24,35,0.14)" }}>
                <p className="text-sm font-semibold shrink-0" style={{ ...serif, color: "#22252E" }}>
                  첨부한 문서도 함께 읽습니다
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "#676A72" }}>
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
                    style={{ borderColor: "rgba(20,24,35,0.1)" }}
                  >
                    <dt className="flex items-start gap-3">
                      <span className="text-[11px] tracking-[0.2em] mt-1 shrink-0" style={{ color: GOLD_DEEP }}>
                        {feat.tag}
                      </span>
                    </dt>
                    <dd>
                      <h3 className="text-lg font-bold mb-1.5" style={{ ...serif, color: "#22252E" }}>
                        {feat.title}
                      </h3>
                      <p className="text-sm leading-relaxed max-w-2xl" style={{ color: "#676A72" }}>
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
                  <p className="text-[12px] tracking-[0.24em] mb-6 pb-3 border-b" style={{ ...serif, color: "#9A9CA3", borderColor: "rgba(20,24,35,0.14)" }}>
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
                      <li key={task} className="flex items-baseline justify-between gap-4 text-sm" style={{ color: "#676A72" }}>
                        <span>{task}</span>
                        <span className="shrink-0 tabular-nums" style={{ ...serif }}>{time}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 pt-4 border-t text-sm font-bold flex items-baseline justify-between" style={{ color: "#44464e", borderColor: "rgba(20,24,35,0.14)" }}>
                    <span style={serif}>합계</span>
                    <span style={serif}>약 7시간</span>
                  </p>
                </div>

                {/* Law-Caddy */}
                <div className="p-8 sm:p-10" style={{ background: INK }}>
                  <p className="text-[12px] tracking-[0.24em] mb-6 pb-3 border-b" style={{ ...serif, color: GOLD, borderColor: "rgba(239,234,224,0.15)" }}>
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
                      <li key={task} className="flex items-baseline justify-between gap-4 text-sm" style={{ color: "rgba(239,234,224,0.78)" }}>
                        <span className="flex items-baseline gap-2.5">
                          <Check className="w-3.5 h-3.5 translate-y-0.5 shrink-0" style={{ color: GOLD }} />
                          {task}
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ ...serif }}>{time}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 pt-4 border-t text-sm font-bold flex items-baseline justify-between" style={{ color: "#EFEAE0", borderColor: "rgba(239,234,224,0.15)" }}>
                    <span style={serif}>합계</span>
                    <span style={{ ...serif, color: GOLD }}>약 10분 + 변호사 검토</span>
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── 만든 사람 ─── */}
        <section className="py-16 sm:py-20 px-5 sm:px-8" style={{ background: INK }}>
          <FadeIn>
            <div className="max-w-3xl mx-auto">
              <p className="text-xl sm:text-2xl leading-relaxed font-semibold" style={{ ...serif, color: "#EFEAE0" }}>
                &ldquo;사무실을 운영하는 변호사가, 자신의 하루를 줄이려고 직접 만들었습니다.
                지금도 매일 이 화면으로 사건을 처리합니다.&rdquo;
              </p>
              <p className="mt-5 text-sm" style={{ color: "rgba(239,234,224,0.45)" }}>
                Law-Caddy는 현직 변호사가 설계하고 실무에서 다듬은 도구입니다.
              </p>
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
                lead="규모에 맞게 시작하고, 언제든 바꿀 수 있습니다."
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
                        : { background: PAPER, border: "1px solid rgba(20,24,35,0.12)" }
                    }
                  >
                    {plan.highlighted && (
                      <span
                        className="absolute -top-3 left-8 px-3 py-1 text-[11px] font-bold tracking-[0.18em]"
                        style={{ background: GOLD, color: INK }}
                      >
                        추천
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
                        style={{ ...serif, color: plan.highlighted ? "#EFEAE0" : "#22252E" }}
                      >
                        {plan.price}
                      </span>
                      <span className="text-sm" style={{ color: plan.highlighted ? "rgba(239,234,224,0.5)" : "#9A9CA3" }}>
                        원{plan.period}
                      </span>
                    </p>
                    <ul className="space-y-3 mb-9 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-baseline gap-2.5 text-sm">
                          <Check
                            className="w-3.5 h-3.5 translate-y-0.5 shrink-0"
                            style={{ color: plan.highlighted ? GOLD : GOLD_DEEP }}
                          />
                          <span style={{ color: plan.highlighted ? "rgba(239,234,224,0.85)" : "#44464e" }}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/login"
                      className={`block w-full text-center py-3.5 text-sm font-bold transition-colors ${focusRing}`}
                      style={
                        plan.highlighted
                          ? { background: GOLD, color: INK }
                          : { border: "1px solid rgba(20,24,35,0.25)", color: "#22252E" }
                      }
                    >
                      시작하기
                    </Link>
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
              <div className="border-t" style={{ borderColor: "rgba(20,24,35,0.14)" }}>
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
              <p className="text-[12px] tracking-[0.3em] mb-7" style={{ ...serif, color: GOLD }}>
                오늘 접수한 사건부터
              </p>
              <h2 className="text-3xl sm:text-5xl font-bold leading-snug mb-7" style={{ ...serif, color: "#EFEAE0" }}>
                준비는 Law-Caddy가,
                <br />
                판단은 변호사님이
              </h2>
              <p className="text-base mb-11" style={{ color: "rgba(239,234,224,0.55)" }}>
                가입 후 7일간 Pro 플랜 전체 기능을 무료로 쓸 수 있습니다.
              </p>
              <Link
                to="/login"
                className={`group inline-flex items-center gap-2.5 px-10 py-4 font-bold text-base transition-transform hover:-translate-y-0.5 ${focusRing}`}
                style={{ background: GOLD, color: INK }}
              >
                무료로 시작하기
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </FadeIn>
        </section>
      </main>

      {/* ─── 푸터 ─── */}
      <footer className="py-10 px-5 sm:px-8" style={{ background: PAPER, borderTop: "1px solid rgba(20,24,35,0.12)" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <p className="text-sm font-bold" style={{ ...serif, color: "#22252E" }}>
              Law-Caddy
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#9A9CA3" }}>
              &copy; 2026 Law-Caddy. 모든 AI 산출물은 변호사의 최종 검토를 전제로 한 초안입니다.
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: "#676A72" }}>
            <Link to="/login" className={`hover:text-[#8F7434] transition-colors ${focusRing}`}>
              로그인
            </Link>
            <Link to="/login" className={`hover:text-[#8F7434] transition-colors ${focusRing}`}>
              시작하기
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
