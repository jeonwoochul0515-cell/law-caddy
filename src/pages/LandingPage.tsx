import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Brain,
  FileText,
  Check,
  ArrowRight,
  Scale,
  Clock,
  Shield,
  Zap,
  ChevronDown,
  Search,
  MessageSquare,
  Award,
} from "lucide-react";

/* ────────────────────────────────────────────
   Intersection Observer 기반 fade-in 훅
   ──────────────────────────────────────────── */
function useFadeIn<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

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
      { threshold: 0.15 }
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
      className={`transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────
   애니메이션 카운터
   ──────────────────────────────────────────── */
function AnimatedCounter({
  end,
  suffix = "",
  prefix = "",
  duration = 2000,
}: {
  end: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useFadeIn<HTMLSpanElement>();

  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ────────────────────────────────────────────
   FAQ 아코디언
   ──────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-text-primary font-medium pr-4 group-hover:text-gold transition-colors">
          {q}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-text-dim flex-shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-gold" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-40 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-text-dim leading-relaxed text-sm">{a}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   데이터
   ──────────────────────────────────────────── */
const AGENTS = [
  {
    icon: <Search className="w-5 h-5" />,
    name: "판례 검색",
    desc: "유사 판례 3~5건을 즉시 검색하고 시사점을 분석합니다",
    color: "text-blue",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    name: "적법성 검증",
    desc: "통비법·변호사법·개보법 준수 여부를 자동 확인합니다",
    color: "text-success",
  },
  {
    icon: <Mic className="w-5 h-5" />,
    name: "음성 변환",
    desc: "RTZR STT로 화자를 구분한 정확한 대화록을 생성합니다",
    color: "text-warning",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    name: "쟁점 분석",
    desc: "핵심 쟁점 3가지를 도출하고 관련 법조문을 매칭합니다",
    color: "text-error",
  },
  {
    icon: <FileText className="w-5 h-5" />,
    name: "문서 작성",
    desc: "체크포인트 확인 후 실무 양식에 맞는 초안을 작성합니다",
    color: "text-gold",
  },
  {
    icon: <Award className="w-5 h-5" />,
    name: "검토·감수",
    desc: "5점 척도로 품질을 평가하고 수정 사항 5가지를 제안합니다",
    color: "text-info",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "₩49,000",
    period: "/월",
    features: [
      "5건 녹음/월",
      "3건 문서/월",
      "기본 AI 분석",
      "이메일 지원",
    ],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "₩89,000",
    period: "/월",
    badge: "Most Popular",
    features: [
      "무제한 녹음",
      "6개 에이전트 전체",
      "무제한 문서 생성",
      "의뢰인 메시지 자동 생성",
      "케이스 관리",
      "우선 지원",
    ],
    highlighted: true,
  },
  {
    name: "Team",
    price: "₩69,000",
    period: "/인",
    features: [
      "Pro 전체 기능",
      "팀 공유 대시보드",
      "관리자 기능",
      "3인 이상",
      "전담 매니저",
    ],
    highlighted: false,
  },
];

const FAQS = [
  {
    q: "상담 녹음이 법적으로 문제되지 않나요?",
    a: "대면 상담에서 본인이 참여한 대화를 녹음하는 것은 통신비밀보호법상 적법합니다. LAW-CADDY의 적법성 검증 에이전트가 매 건마다 자동으로 확인해드립니다.",
  },
  {
    q: "AI가 작성한 문서를 바로 제출할 수 있나요?",
    a: "AI가 생성한 초안은 변호사의 최종 검토와 수정을 거쳐야 합니다. LAW-CADDY는 변호사의 판단을 대체하는 것이 아니라 업무 효율을 높여주는 어시스턴트입니다.",
  },
  {
    q: "의뢰인 정보 보안은 어떻게 되나요?",
    a: "모든 데이터는 암호화되어 저장되며, 변호사 본인만 접근할 수 있습니다. Firebase 보안 규칙으로 엄격하게 관리됩니다.",
  },
  {
    q: "어떤 종류의 법률 문서를 생성할 수 있나요?",
    a: "내용증명, 소장, 답변서, 준비서면, 의견서, 합의서, 고소장, 지급명령신청서, 상담 요약 리포트 등 9가지 유형을 지원합니다.",
  },
];

/* ────────────────────────────────────────────
   메인 컴포넌트
   ──────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy">
      {/* ─── Navigation ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-navy/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-gold" />
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-gold to-gold-bright bg-clip-text text-transparent">
              LAW-CADDY
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-text-dim hover:text-text-primary transition-colors"
            >
              로그인
            </Link>
            <Link
              to="/register"
              className="px-5 py-2 text-sm rounded-lg bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold hover:opacity-90 transition-opacity"
            >
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gold/[0.04] rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-gold/[0.02] rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Exclusive badge */}
          <FadeIn>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-dim border border-gold/20 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              <span className="text-xs tracking-widest uppercase text-gold font-medium">
                변호사 전용 AI 어시스턴트
              </span>
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={100}>
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold mb-6 leading-tight">
              <span className="text-text-primary">최고의 플레이에는</span>
              <br />
              <span className="bg-gradient-to-r from-gold via-gold-bright to-gold bg-clip-text text-transparent">
                최고의 캐디가
              </span>
              <br />
              <span className="text-text-primary">필요합니다</span>
            </h1>
          </FadeIn>

          {/* Subheadline */}
          <FadeIn delay={200}>
            <p className="text-lg sm:text-xl text-text-dim max-w-2xl mx-auto mb-4 leading-relaxed">
              상담 녹음 하나로, 판례 검색부터 문서 작성까지.
              <br className="hidden sm:block" />
              변호사님의 시간을 돌려드립니다.
            </p>
            <p className="text-sm text-gold/60 tracking-wider uppercase mb-10">
              Your Legal Caddy — Always by Your Side
            </p>
          </FadeIn>

          {/* CTA */}
          <FadeIn delay={300}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gradient-to-r from-gold to-gold-bright text-navy font-bold text-lg hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-gold/20"
              >
                무료로 시작하기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/login?demo=true"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-border hover:border-gold/30 text-text-primary hover:text-gold transition-all text-lg"
              >
                데모 체험
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Trust Bar ─── */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-border/50">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: 1200, suffix: "+", label: "분석 완료 건수" },
            { value: 340, suffix: "+", label: "등록 변호사" },
            { value: 40, suffix: "시간", label: "월 평균 절감 시간" },
            { value: 9, suffix: "종", label: "지원 문서 유형" },
          ].map((stat) => (
            <FadeIn key={stat.label}>
              <div>
                <div className="text-3xl sm:text-4xl font-bold text-gold mb-1">
                  <AnimatedCounter
                    end={stat.value}
                    suffix={stat.suffix}
                  />
                </div>
                <div className="text-sm text-text-dim">{stat.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ─── Pain → Solution ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                변호사님, 이런 경험 있으신가요?
              </h2>
              <p className="text-text-dim text-lg max-w-2xl mx-auto">
                상담은 30분인데, 문서 작성에 3시간.
                <br />
                판례 검색에 또 2시간. 그 시간, 돌려받으세요.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Clock className="w-6 h-6" />,
                pain: "반복되는 문서 작업",
                solution: "AI가 초안을 작성하고, 변호사님은 검토만",
                metric: "문서 작성 시간 80% 절감",
              },
              {
                icon: <Search className="w-6 h-6" />,
                pain: "끝없는 판례 검색",
                solution: "유사 판례 3~5건을 즉시 분석·요약",
                metric: "판례 검색 시간 90% 절감",
              },
              {
                icon: <MessageSquare className="w-6 h-6" />,
                pain: "의뢰인 커뮤니케이션",
                solution: "전문 용어를 쉬운 말로 바꾼 메시지 자동 생성",
                metric: "의뢰인 만족도 향상",
              },
            ].map((item, i) => (
              <FadeIn key={item.pain} delay={i * 100}>
                <div className="group p-8 rounded-2xl bg-surface border border-border hover:border-gold/20 transition-all h-full">
                  <div className="w-12 h-12 rounded-xl bg-gold-dim flex items-center justify-center mb-6 text-gold group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <p className="text-text-dim text-sm mb-2 line-through decoration-text-dim/30">
                    {item.pain}
                  </p>
                  <h3 className="text-lg font-semibold text-text-primary mb-3">
                    {item.solution}
                  </h3>
                  <p className="text-sm text-gold font-medium">{item.metric}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                3단계, 그게 전부입니다
              </h2>
              <p className="text-text-dim text-lg">
                페어웨이를 벗어나지 않는 정확한 업무 흐름
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "녹음 & 업로드",
                desc: "상담을 녹음하거나 파일을 업로드하세요. 화자 구분은 AI가 자동으로 처리합니다.",
                icon: <Mic className="w-7 h-7" />,
              },
              {
                step: "02",
                title: "6개 에이전트 분석",
                desc: "판례 검색, 적법성 검증, 쟁점 분석 등 6개 AI가 동시에 작업을 시작합니다.",
                icon: <Brain className="w-7 h-7" />,
              },
              {
                step: "03",
                title: "문서 생성 & 전달",
                desc: "체크포인트 확인 후 법률 문서 초안이 완성됩니다. 의뢰인 메시지까지 자동 생성.",
                icon: <FileText className="w-7 h-7" />,
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 150}>
                <div className="relative text-center">
                  {/* Step number */}
                  <div className="text-6xl font-black text-gold/[0.08] absolute -top-4 left-1/2 -translate-x-1/2 select-none">
                    {item.step}
                  </div>
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gold-dim border border-gold/20 flex items-center justify-center mx-auto mb-6 text-gold">
                      {item.icon}
                    </div>
                    <h3 className="text-xl font-bold text-text-primary mb-3">
                      {item.title}
                    </h3>
                    <p className="text-text-dim leading-relaxed text-sm">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 6 Agents ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                6명의 전문 AI가 동시에 일합니다
              </h2>
              <p className="text-text-dim text-lg max-w-2xl mx-auto">
                마치 숙련된 캐디가 코스를 읽듯,
                <br className="hidden sm:block" />
                각 에이전트가 전문 영역을 병렬로 분석합니다.
              </p>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((agent, i) => (
              <FadeIn key={agent.name} delay={i * 80}>
                <div className="group flex items-start gap-4 p-6 rounded-xl bg-surface border border-border hover:border-gold/20 transition-all h-full">
                  <div
                    className={`w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0 ${agent.color} group-hover:scale-110 transition-transform`}
                  >
                    {agent.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary mb-1">
                      {agent.name}
                    </h4>
                    <p className="text-sm text-text-dim leading-relaxed">
                      {agent.desc}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Before / After ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                홀인원 같은 변화
              </h2>
              <p className="text-text-dim text-lg">
                LAW-CADDY 도입 전과 후를 비교해보세요.
              </p>
            </div>
          </FadeIn>

          <FadeIn>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Before */}
              <div className="p-8 rounded-2xl bg-surface border border-border">
                <div className="text-sm font-medium text-error mb-6 uppercase tracking-wider">
                  Before
                </div>
                <ul className="space-y-4">
                  {[
                    "상담 후 수기 메모 정리 — 30분",
                    "판례 검색 — 2시간",
                    "문서 초안 작성 — 3시간",
                    "의뢰인에게 설명 메시지 — 20분",
                    "총 소요: 약 6시간",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-text-dim text-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-error/60 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* After */}
              <div className="p-8 rounded-2xl bg-gold-dim border border-gold/20">
                <div className="text-sm font-medium text-gold mb-6 uppercase tracking-wider">
                  After — with LAW-CADDY
                </div>
                <ul className="space-y-4">
                  {[
                    "상담 녹음 → 자동 대화록 — 0분",
                    "6개 에이전트 병렬 분석 — 2분",
                    "체크포인트 확인 후 문서 생성 — 5분",
                    "의뢰인 메시지 자동 생성 — 0분",
                    "총 소요: 약 10분",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-text-primary text-sm"
                    >
                      <Check className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200}>
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-surface border border-border">
                <Zap className="w-5 h-5 text-gold" />
                <span className="text-text-primary font-semibold">
                  6시간 → 10분.
                </span>
                <span className="text-text-dim">
                  나머지 시간은 변호사님의 것입니다.
                </span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                변호사님들의 이야기
              </h2>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  "상담 직후 바로 내용증명 초안이 나옵니다. 의뢰인도 빠른 대응에 놀라십니다.",
                name: "김○○ 변호사",
                firm: "서울 민사 전문",
                years: "경력 8년",
              },
              {
                quote:
                  "판례 검색에 쓰던 시간이 거의 사라졌습니다. 그 시간에 상담을 하나 더 합니다.",
                name: "이○○ 변호사",
                firm: "부산 종합 법률사무소",
                years: "경력 5년",
              },
              {
                quote:
                  "혼자 운영하는 사무실이라 모든 걸 혼자 해야 했는데, 이제 든든한 팀이 생긴 느낌입니다.",
                name: "박○○ 변호사",
                firm: "대전 1인 사무소",
                years: "경력 3년",
              },
            ].map((t, i) => (
              <FadeIn key={t.name} delay={i * 100}>
                <div className="p-8 rounded-2xl bg-surface border border-border h-full flex flex-col">
                  {/* Quote marks */}
                  <span className="text-3xl text-gold/30 font-serif leading-none mb-4">
                    &ldquo;
                  </span>
                  <p className="text-text-primary text-sm leading-relaxed flex-1 mb-6">
                    {t.quote}
                  </p>
                  <div className="border-t border-border pt-4">
                    <div className="font-medium text-text-primary text-sm">
                      {t.name}
                    </div>
                    <div className="text-text-dim text-xs mt-0.5">
                      {t.firm} · {t.years}
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                요금제
              </h2>
              <p className="text-text-dim text-lg">
                사무소 규모에 맞는 플랜을 선택하세요.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <FadeIn key={plan.name} delay={i * 100}>
                <div
                  className={`relative p-8 rounded-2xl border transition-all h-full flex flex-col ${
                    plan.highlighted
                      ? "bg-gold-dim border-gold/30 shadow-xl shadow-gold/10"
                      : "bg-surface border-border hover:border-border-hover"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-gold to-gold-bright text-navy text-xs font-bold whitespace-nowrap">
                      추천
                    </div>
                  )}

                  <h3
                    className={`text-xl font-bold mb-2 ${
                      plan.highlighted ? "text-gold" : "text-text-primary"
                    }`}
                  >
                    {plan.name}
                  </h3>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span
                      className={`text-4xl font-bold ${
                        plan.highlighted
                          ? "text-gold-bright"
                          : "text-text-primary"
                      }`}
                    >
                      {plan.price}
                    </span>
                    <span className="text-text-dim text-sm">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-3 text-sm"
                      >
                        <Check
                          className={`w-4 h-4 flex-shrink-0 ${
                            plan.highlighted ? "text-gold" : "text-success"
                          }`}
                        />
                        <span className="text-text-primary">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-gold to-gold-bright text-navy hover:opacity-90"
                        : "border border-border hover:border-gold/30 text-text-primary hover:text-gold"
                    }`}
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
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                자주 묻는 질문
              </h2>
            </div>
          </FadeIn>

          <FadeIn>
            <div className="rounded-2xl bg-surface border border-border p-6 sm:p-8">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 border-t border-border/50 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gold/[0.04] rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <FadeIn>
            <p className="text-sm text-gold/60 tracking-wider uppercase mb-6">
              Your Game, Our Caddy
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-text-primary mb-6 leading-tight">
              변호사님의 실력에
              <br />
              <span className="bg-gradient-to-r from-gold to-gold-bright bg-clip-text text-transparent">
                최고의 캐디를 더하세요
              </span>
            </h2>
            <p className="text-text-dim text-lg mb-10">
              AI가 분석하고, 변호사가 결정합니다.
            </p>
            <Link
              to="/register"
              className="group inline-flex items-center gap-2.5 px-10 py-4 rounded-xl bg-gradient-to-r from-gold to-gold-bright text-navy font-bold text-lg hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-gold/20"
            >
              지금 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-gold/40" />
            <span className="text-sm text-text-dim">
              &copy; 2025 LAW-CADDY. AI가 분석하고, 변호사가 결정합니다.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-dim">
            <Link
              to="/login"
              className="hover:text-text-primary transition-colors"
            >
              로그인
            </Link>
            <Link
              to="/register"
              className="hover:text-text-primary transition-colors"
            >
              회원가입
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
