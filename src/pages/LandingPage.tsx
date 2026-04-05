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
  Wallet,
  PenTool,
  BarChart3,
  Building2,
  CreditCard,
  Calculator,
  Play,
  Users,
  TrendingUp,
  Sparkles,
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
    <div className="border-b border-[#efeeea]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-[#1b1c1a] font-medium pr-4 group-hover:text-[#735c00] transition-colors">
          {q}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-[#414846] flex-shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-[#735c00]" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-60 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-[#414846] leading-relaxed text-sm">{a}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   타이핑 애니메이션 훅
   ──────────────────────────────────────────── */
function useTypewriter(words: string[], typingSpeed = 100, pauseTime = 2000) {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];

    const timer = setTimeout(
      () => {
        if (!isDeleting) {
          setText(currentWord.substring(0, text.length + 1));
          if (text.length + 1 === currentWord.length) {
            setTimeout(() => setIsDeleting(true), pauseTime);
          }
        } else {
          setText(currentWord.substring(0, text.length - 1));
          if (text.length === 0) {
            setIsDeleting(false);
            setWordIndex((prev) => (prev + 1) % words.length);
          }
        }
      },
      isDeleting ? typingSpeed / 2 : typingSpeed
    );

    return () => clearTimeout(timer);
  }, [text, isDeleting, wordIndex, words, typingSpeed, pauseTime]);

  return text;
}

/* ────────────────────────────────────────────
   워크플로우 스텝 애니메이션
   ──────────────────────────────────────────── */
function WorkflowDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const { ref, visible } = useFadeIn<HTMLDivElement>();

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(timer);
  }, [visible]);

  const steps = [
    {
      label: "상담 녹음",
      icon: <Mic className="w-5 h-5" />,
      detail: "변호사-의뢰인 대화를 녹음합니다",
      time: "30분 상담",
    },
    {
      label: "AI 분석",
      icon: <Brain className="w-5 h-5" />,
      detail: "6개 에이전트가 동시에 분석합니다",
      time: "약 2분",
    },
    {
      label: "문서 생성",
      icon: <FileText className="w-5 h-5" />,
      detail: "소장, 내용증명 등 법률 문서 초안 완성",
      time: "약 3분",
    },
    {
      label: "의뢰인 전달",
      icon: <MessageSquare className="w-5 h-5" />,
      detail: "쉬운 말로 바꾼 메시지가 자동 생성됩니다",
      time: "즉시",
    },
  ];

  return (
    <div ref={ref} className="relative">
      {/* Progress line */}
      <div className="absolute top-6 left-0 right-0 h-0.5 bg-[#efeeea] hidden md:block">
        <div
          className="h-full bg-gradient-to-r from-[#01261f] to-[#735c00] transition-all duration-1000 ease-out"
          style={{ width: `${(activeStep / 3) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {steps.map((step, i) => (
          <div
            key={step.label}
            className={`relative text-center transition-all duration-500 ${
              i <= activeStep ? "opacity-100" : "opacity-40"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center transition-all duration-500 ${
                i === activeStep
                  ? "bg-[#01261f] text-white scale-110 shadow-lg shadow-[#01261f]/20"
                  : i < activeStep
                    ? "bg-[#01261f] text-white"
                    : "bg-[#efeeea] text-[#414846]"
              }`}
            >
              {i < activeStep ? (
                <Check className="w-5 h-5" />
              ) : (
                step.icon
              )}
            </div>
            <h4 className="font-semibold text-[#1b1c1a] text-sm mb-1">
              {step.label}
            </h4>
            <p className="text-xs text-[#414846] leading-relaxed mb-1 hidden sm:block">
              {step.detail}
            </p>
            <span
              className={`text-xs font-medium ${
                i === activeStep ? "text-[#735c00]" : "text-[#414846]/60"
              }`}
            >
              {step.time}
            </span>
          </div>
        ))}
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
    fullName: "한판서",
    role: "판례 검색 에이전트",
    desc: "30년 경력의 판례 전문가. 대법원·하급심 유사 판례 3~5건을 즉시 찾아내고 유리·불리 시사점까지 분석합니다.",
    color: "text-[#1a3c34]",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    fullName: "윤율무",
    role: "적법성 검증 에이전트",
    desc: "변호사윤리위원회 출신 감사관. 통비법·변호사법·개보법 준수 여부를 매 건마다 빈틈없이 검증합니다.",
    color: "text-[#1a3c34]",
  },
  {
    icon: <Mic className="w-5 h-5" />,
    fullName: "정소리",
    role: "음성 변환 에이전트",
    desc: "법정 속기사 출신 청각 전문가. 상담 녹음에서 변호사·의뢰인을 자동 구분하고 법률 전문용어까지 정확하게 받아적습니다.",
    color: "text-[#735c00]",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    fullName: "서혜안",
    role: "쟁점 분석 에이전트",
    desc: "로스쿨 교수 출신 전략가. 핵심 쟁점 3가지를 꿰뚫어보고 관련 법조문·판례를 매칭하여 승소 전략을 제시합니다.",
    color: "text-[#01261f]",
  },
  {
    icon: <FileText className="w-5 h-5" />,
    fullName: "조필묵",
    role: "문서 작성 에이전트",
    desc: "대형 로펌 15년차 문서 장인. 소장부터 합의서까지 36종 법률 문서를 판사를 설득하는 완성도로 작성합니다.",
    color: "text-[#735c00]",
  },
  {
    icon: <Award className="w-5 h-5" />,
    fullName: "최감수",
    role: "검토·감수 에이전트",
    desc: "대법원 재판연구관 출신. 형식·정확성·논리·설득력·완성도 5점 척도 평가와 수정 제안으로 문서 품질을 끌어올립니다.",
    color: "text-[#1a3c34]",
  },
];

const PLATFORM_FEATURES = [
  {
    icon: <PenTool className="w-6 h-6" />,
    title: "수임계약서 자동 생성 & 전자서명",
    desc: "민사 14조·형사 16조 표준 계약서를 자동 생성. 링크 하나로 의뢰인 서명까지. 24시간 토큰 + IP·기기 감사추적 자동 기록.",
    tag: "계약서",
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: "성공보수 4가지 모드 관리",
    desc: "정률형·정액형·구간별·형사 조건부(무죄/집행유예/벌금형) 성공보수를 미확정→청구→입금까지 전 과정 추적.",
    tag: "성공보수",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "착수금·분할납부 자동 추적",
    desc: "착수금, 잔금, 분할납부 일정을 사건별로 관리. 연체일 자동 감지 + AI가 독촉 메시지까지 작성합니다.",
    tag: "수임료",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "소송비용 자동 계산 & 12종 경비 관리",
    desc: "소가·심급별 인지대·송달료를 즉시 계산. 감정료·출장비·공증비 등 12종 사건비용을 영수증과 함께 정산 추적.",
    tag: "비용관리",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    icon: <CreditCard className="w-6 h-6" />,
    title: "은행·카드 자동 연동 & AI 매칭",
    desc: "CODEF로 입출금·카드 내역을 자동 수집. 신뢰도 85% 이상이면 사건별 매출·경비에 자동 분류됩니다.",
    tag: "AI 매칭",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "월별 손익 & 세무 리포트",
    desc: "매출·경비·부가세·미수금을 월별로 자동 집계. 세무사에게 제출할 자료가 클릭 한 번으로 완성됩니다.",
    tag: "세무",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "49,000",
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
    price: "89,000",
    period: "/월",
    badge: "Most Popular",
    features: [
      "무제한 녹음 & 36종 문서 생성",
      "6명 AI 에이전트 전체",
      "수임계약서 자동 생성 & 전자서명",
      "성공보수 4모드 + 분할납부 추적",
      "소송비용 자동 계산 & 경비 관리",
      "은행·카드 AI 자동 매칭",
      "의뢰인 4단계 케어 메시지",
      "우선 지원",
    ],
    highlighted: true,
  },
  {
    name: "Team",
    price: "69,000",
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
    a: "AI가 생성한 초안은 변호사의 최종 검토와 수정을 거쳐야 합니다. LAW-CADDY는 변호사의 판단을 대체하는 것이 아니라, 반복 업무를 자동화하여 시간을 돌려드리는 어시스턴트입니다.",
  },
  {
    q: "의뢰인 정보 보안은 어떻게 되나요?",
    a: "모든 데이터는 암호화되어 저장되며, 변호사 본인만 접근할 수 있습니다. Firebase 보안 규칙으로 엄격하게 관리되고, 전자서명 시 IP·기기 정보가 감사 로그로 기록됩니다.",
  },
  {
    q: "어떤 종류의 법률 문서를 생성할 수 있나요?",
    a: "소장, 답변서, 준비서면, 내용증명, 가압류·가처분신청서, 지급명령신청서, 이의신청서, 조정신청서, 고소장, 고발장, 항소장, 합의서, 상담 요약 리포트 등 14가지 유형을 지원합니다.",
  },
  {
    q: "기존 사무실 회계 프로그램과 뭐가 다른가요?",
    a: "LAW-CADDY는 '사건 중심' 회계입니다. 수임료·예치금·소송비용이 사건별로 자동 연결되고, 은행·카드 내역을 AI가 자동 분류합니다. 세무사에게 보낼 자료도 클릭 한 번이면 됩니다.",
  },
  {
    q: "전자서명 수임계약이 법적으로 유효한가요?",
    a: "전자서명법에 따라 당사자 간 합의된 전자서명은 법적 효력이 있습니다. 서명 시점, IP 주소, 기기 정보 등 감사 추적이 자동으로 기록됩니다.",
  },
];

/* ────────────────────────────────────────────
   메인 컴포넌트
   ──────────────────────────────────────────── */
export default function LandingPage() {
  const typewriterText = useTypewriter(
    ["판례 검색", "문서 작성", "계약서 생성", "성공보수 관리", "소송비용 계산", "의뢰인 ���어"],
    80,
    1800
  );

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      {/* ─── Navigation ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#efeeea] bg-[#faf9f5]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-[#01261f]" />
            <span className="text-xl font-serif italic font-bold tracking-tight text-[#01261f]">
              Law-Caddy
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-[#414846]">
            <a href="#workflow" className="hover:text-[#01261f] transition-colors">
              워크플로우
            </a>
            <a href="#agents" className="hover:text-[#01261f] transition-colors">
              AI 에이전트
            </a>
            <a href="#platform" className="hover:text-[#01261f] transition-colors">
              업무 자동화
            </a>
            <a href="#pricing" className="hover:text-[#01261f] transition-colors">
              요금제
            </a>
            <a href="#faq" className="hover:text-[#01261f] transition-colors">
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-[#414846] hover:text-[#01261f] transition-colors"
            >
              로그인
            </Link>
            <Link
              to="/login"
              className="px-5 py-2 text-sm rounded-lg bg-[#01261f] text-white font-semibold hover:bg-[#1a3c34] transition-colors"
            >
              무료 체험
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="bg-[#01261f] pt-20 pb-28 sm:pt-28 sm:pb-36 px-4 sm:px-6 lg:px-8">
          {/* Background effects */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-[#1a3c34]/40 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#735c00]/5 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            {/* Badge */}
            <FadeIn>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fed65b] animate-pulse" />
                <span className="text-xs tracking-widest uppercase text-[#fed65b] font-medium">
                  변호사 업무의 모든 것, 하나로
                </span>
              </div>
            </FadeIn>

            {/* Headline */}
            <FadeIn delay={100}>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-7xl font-bold mb-6 leading-tight">
                <span className="text-white">상담부터 정산까지</span>
                <br />
                <span className="text-[#fed65b]">
                  하나의 캐디로
                </span>
              </h1>
            </FadeIn>

            {/* Typewriter subheadline */}
            <FadeIn delay={200}>
              <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-3 leading-relaxed">
                상담 녹음 하나로{" "}
                <span className="text-[#fed65b] font-semibold">
                  {typewriterText}
                  <span className="animate-pulse">|</span>
                </span>
                까지.
              </p>
              <p className="text-sm text-white/40 max-w-xl mx-auto mb-10 leading-relaxed">
                한판서, 윤율무, 정소리, 서혜안, 조필묵, 최감수 — 6명의 AI 전문가가
                <br className="hidden sm:block" />
                판례 검색부터 계약서 작성, 성공보수 관리, 의뢰인 케어까지 함께합니다.
              </p>
            </FadeIn>

            {/* CTA */}
            <FadeIn delay={300}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/login"
                  className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-[#fed65b] text-[#01261f] font-bold text-lg hover:bg-[#ffe88a] transition-all hover:scale-[1.02] shadow-lg shadow-black/20"
                >
                  무료로 시작하기
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/login?demo=true"
                  className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/20 hover:border-white/40 text-white hover:text-[#fed65b] transition-all text-lg"
                >
                  <Play className="w-4 h-4" />
                  데모 체험
                </Link>
              </div>
              <p className="mt-4 text-xs text-white/30">
                신용카드 불필요 · 1분 가입 · 변호사 인증 후 즉시 사용
              </p>
            </FadeIn>
          </div>
        </div>

        {/* Floating stats bar */}
        <div className="relative -mt-12 px-4 sm:px-6 lg:px-8 z-10">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 bg-white rounded-2xl shadow-xl shadow-[#01261f]/5 border border-[#efeeea] p-6 md:p-0 md:divide-x md:divide-[#efeeea]">
                {[
                  { value: 14, suffix: "종", label: "지원 문서 유형" },
                  { value: 6, suffix: "개", label: "병렬 AI 에이전트" },
                  { value: 40, suffix: "시간", label: "월 평균 절감" },
                  { value: 80, suffix: "%", label: "문서 작성 시간 절감" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center md:py-6 md:px-4">
                    <div className="text-2xl sm:text-3xl font-bold font-serif text-[#01261f] mb-1">
                      <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                    </div>
                    <div className="text-xs text-[#414846]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Social Proof Bar ─── */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 bg-[#faf9f5]">
        <FadeIn>
          <p className="text-center text-sm text-[#414846]/60 mb-6 tracking-wider uppercase">
            전국 변호사들이 신뢰하는 법률 AI
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 max-w-3xl mx-auto">
            {[
              "서울 민사 전문",
              "부산 종합 로펌",
              "대전 1인 사무소",
              "인천 형사 전문",
              "광주 가사 전문",
            ].map((firm) => (
              <div
                key={firm}
                className="flex items-center gap-2 text-[#414846]/40"
              >
                <Building2 className="w-4 h-4" />
                <span className="text-sm font-medium">{firm}</span>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ─── Pain Points → Quick Hook ─── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white border-t border-[#efeeea]">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                변호사님, 하루가 부족하시죠?
              </h2>
              <p className="text-[#414846] text-lg max-w-2xl mx-auto">
                상담, 판례 검색, 문서 작성, 계약서, 성공보수, 인지대 계산, 경비 정리...
                <br />
                <span className="font-semibold text-[#01261f]">그 8시간을 10분으로 줄여드립니다.</span>
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: <Clock className="w-6 h-6" />,
                pain: "반복되는 문서 작업",
                solution: "AI가 초안을 작성하고, 변호사님은 검토만",
                metric: "문서 작성 시간 80% 절감",
              },
              {
                icon: <Search className="w-6 h-6" />,
                pain: "끝없는 판례·법조문 검색",
                solution: "유사 판례 3~5건을 2분 안에 분석·요약",
                metric: "판례 검색 시간 90% 절감",
              },
              {
                icon: <Wallet className="w-6 h-6" />,
                pain: "계약서·수임료·경비 따로따로",
                solution: "계약 → 수임료 → 성공보수 → 경비 → 세무까지 한 곳에서",
                metric: "행정 업무 90% 자동화",
              },
            ].map((item, i) => (
              <FadeIn key={item.pain} delay={i * 100}>
                <div className="group p-7 rounded-2xl bg-[#faf9f5] border border-[#efeeea] hover:border-[#735c00]/20 hover:shadow-lg transition-all h-full">
                  <div className="w-12 h-12 rounded-xl bg-[#01261f]/10 flex items-center justify-center mb-5 text-[#01261f] group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <p className="text-[#414846] text-sm mb-2 line-through decoration-[#414846]/30">
                    {item.pain}
                  </p>
                  <h3 className="text-lg font-semibold text-[#1b1c1a] mb-3">
                    {item.solution}
                  </h3>
                  <p className="text-sm text-[#735c00] font-medium">{item.metric}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Interactive Workflow Demo ─── */}
      <section
        id="workflow"
        className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]"
      >
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#01261f]/5 text-[#01261f] text-xs font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                실시간 워크플로우
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                녹음 한 번이면, 나머지는 캐디가
              </h2>
              <p className="text-[#414846] text-lg">
                페어웨이를 벗어나지 않는 정확한 업무 흐름
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={200}>
            <div className="bg-white rounded-2xl border border-[#efeeea] p-8 sm:p-12 shadow-sm">
              <WorkflowDemo />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── 6 Agents ─── */}
      <section
        id="agents"
        className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-white"
      >
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#01261f]/5 text-[#01261f] text-xs font-medium mb-4">
                <Users className="w-3.5 h-3.5" />
                AI 에이전트 팀
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                6명의 전문 AI가 동시에 일합니다
              </h2>
              <p className="text-[#414846] text-lg max-w-2xl mx-auto">
                마치 숙련된 캐디가 코스를 읽듯,
                <br className="hidden sm:block" />
                각 에이전트가 전문 영역을 병렬로 분석합니다.
              </p>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((agent, i) => (
              <FadeIn key={agent.name} delay={i * 80}>
                <div className="group flex items-start gap-4 p-6 rounded-xl bg-[#faf9f5] border border-[#efeeea] hover:border-[#735c00]/20 hover:shadow-md transition-all h-full">
                  <div
                    className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 ${agent.color} group-hover:scale-110 transition-transform shadow-sm`}
                  >
                    {agent.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#1b1c1a] mb-1">
                      {agent.fullName}{" "}
                      <span className="text-[#414846] font-normal text-sm">
                        · {agent.role}
                      </span>
                    </h4>
                    <p className="text-sm text-[#414846] leading-relaxed">
                      {agent.desc}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Platform Features (NEW - 사무소 관리) ─── */}
      <section
        id="platform"
        className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]"
      >
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#735c00]/10 text-[#735c00] text-xs font-medium mb-4">
                <TrendingUp className="w-3.5 h-3.5" />
                변호사 업무의 모든 것
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                계약부터 정산까지, 빠짐없이.
              </h2>
              <p className="text-[#414846] text-lg max-w-2xl mx-auto">
                수임계약서 자동 생성, 성공보수 추적, 소송비용 계산, 은행 연동 —
                <br className="hidden sm:block" />
                변호사님의 업무 전 과정을 하나의 플랫폼에서.
              </p>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PLATFORM_FEATURES.map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 80}>
                <div className="group p-7 rounded-2xl bg-white border border-[#efeeea] hover:border-[#735c00]/20 hover:shadow-lg transition-all h-full">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-[#01261f]/5 flex items-center justify-center text-[#01261f] group-hover:bg-[#01261f]/10 transition-colors">
                      {feat.icon}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-[#735c00] font-semibold bg-[#735c00]/5 px-2.5 py-1 rounded-full">
                      {feat.tag}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1b1c1a] mb-2">
                    {feat.title}
                  </h3>
                  <p className="text-sm text-[#414846] leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Before / After ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-white">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                홀인원 같은 변화
              </h2>
              <p className="text-[#414846] text-lg">
                하루 일과가 이렇게 달라집니다.
              </p>
            </div>
          </FadeIn>

          <FadeIn>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Before */}
              <div className="p-8 rounded-2xl bg-[#faf9f5] border border-[#efeeea]">
                <div className="text-sm font-medium text-red-600 mb-6 uppercase tracking-wider">
                  Before
                </div>
                <ul className="space-y-4">
                  {[
                    "상담 후 수기 메모 정리 — 30분",
                    "판례 검색 — 2시간",
                    "문서 초안 작성 — 3시간",
                    "수임계약서 작성 & 서명 받기 — 40분",
                    "의뢰인에게 설명 메시지 — 20분",
                    "수임료·성공보수 엑셀 정리 — 30분",
                    "인지대·송달료 계산 — 15분",
                    "총 소요: 약 8시간",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-[#414846] text-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* After */}
              <div className="p-8 rounded-2xl bg-[#01261f] border border-[#1a3c34]">
                <div className="text-sm font-medium text-[#fed65b] mb-6 uppercase tracking-wider">
                  After — with LAW-CADDY
                </div>
                <ul className="space-y-4">
                  {[
                    "상담 녹음 → 자동 대화록 — 0분",
                    "6명 에이전트 병렬 분석 — 2분",
                    "체크포인트 확인 후 문서 생성 — 5분",
                    "수임계약서 자동 생성 → 전자서명 — 1분",
                    "성공보수·분할납부 자동 추적 — 0분",
                    "인지대·송달료·경비 자동 계산 — 0분",
                    "의뢰인 케어 메시지 자동 생성 — 0분",
                    "총 소요: 약 10분",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-white text-sm"
                    >
                      <Check className="w-4 h-4 text-[#fed65b] mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200}>
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#efeeea] border border-[#efeeea]">
                <Zap className="w-5 h-5 text-[#735c00]" />
                <span className="text-[#1b1c1a] font-semibold">
                  8시간 → 10분.
                </span>
                <span className="text-[#414846]">
                  나머지 시간은 변호사님의 것입니다.
                </span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                변호사님들의 이야기
              </h2>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  "상담 직후 내용증명 초안에 수임계약서까지 한 번에 나옵니다. 전자서명으로 바로 계약 완료. 의뢰인이 '이렇게 빠른 건 처음'이라고 하세요.",
                name: "김○○ 변호사",
                firm: "서울 민사 전문",
                years: "경력 8년",
              },
              {
                quote:
                  "성공보수 관리가 엑셀 없이 되니까 정말 편합니다. 분할납부 연체도 자동 알림이 오고, 인지대 계산도 한 번에. 한판서 님이 찾아주는 판례도 정확해요.",
                name: "이○○ 변호사",
                firm: "부산 종합 법률사무소",
                years: "경력 5년",
              },
              {
                quote:
                  "혼자 운영하는데 조필묵 님이 문서 초안 잡아주고, 최감수 님이 검토해주니 대형 로펌 뺨치는 퀄리티가 나옵니다. 카드 경비도 자동 분류되니 세무사 보낼 자료가 바로 나와요.",
                name: "박○○ 변호사",
                firm: "대전 1인 사무소",
                years: "경력 3년",
              },
            ].map((t, i) => (
              <FadeIn key={t.name} delay={i * 100}>
                <div className="p-8 rounded-2xl bg-white border border-[#efeeea] h-full flex flex-col">
                  <span className="text-3xl text-[#735c00]/30 font-serif leading-none mb-4">
                    &ldquo;
                  </span>
                  <p className="text-[#1b1c1a] text-sm leading-relaxed flex-1 mb-6">
                    {t.quote}
                  </p>
                  <div className="border-t border-[#efeeea] pt-4">
                    <div className="font-medium text-[#1b1c1a] text-sm">
                      {t.name}
                    </div>
                    <div className="text-[#414846] text-xs mt-0.5">
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
      <section
        id="pricing"
        className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-white"
      >
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                사무소 규모에 맞는 플랜
              </h2>
              <p className="text-[#414846] text-lg">
                사무장 월급보다 저렴한 비용으로, 변호사 업무 전체��� 자동화하세요.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <FadeIn key={plan.name} delay={i * 100}>
                <div
                  className={`relative p-8 rounded-2xl border transition-all h-full flex flex-col ${
                    plan.highlighted
                      ? "bg-[#01261f] border-[#1a3c34] shadow-xl shadow-[#01261f]/10"
                      : "bg-[#faf9f5] border-[#efeeea] hover:border-[#735c00]/20"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#fed65b] text-[#01261f] text-xs font-bold whitespace-nowrap">
                      추천
                    </div>
                  )}

                  <h3
                    className={`text-xl font-bold mb-2 ${
                      plan.highlighted ? "text-[#fed65b]" : "text-[#1b1c1a]"
                    }`}
                  >
                    {plan.name}
                  </h3>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className={`text-sm ${plan.highlighted ? "text-white/60" : "text-[#414846]"}`}>
                      &#8361;
                    </span>
                    <span
                      className={`text-4xl font-bold ${
                        plan.highlighted ? "text-white" : "text-[#01261f]"
                      }`}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`text-sm ${
                        plan.highlighted ? "text-white/60" : "text-[#414846]"
                      }`}
                    >
                      {plan.period}
                    </span>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-3 text-sm"
                      >
                        <Check
                          className={`w-4 h-4 flex-shrink-0 ${
                            plan.highlighted
                              ? "text-[#fed65b]"
                              : "text-[#01261f]"
                          }`}
                        />
                        <span
                          className={
                            plan.highlighted
                              ? "text-white/90"
                              : "text-[#1b1c1a]"
                          }
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/login"
                    className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                      plan.highlighted
                        ? "bg-[#fed65b] text-[#01261f] hover:bg-[#ffe88a]"
                        : "border border-[#efeeea] hover:border-[#735c00]/30 text-[#1b1c1a] hover:text-[#735c00]"
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
      <section
        id="faq"
        className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]"
      >
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#01261f] mb-4">
                자주 묻는 질문
              </h2>
            </div>
          </FadeIn>

          <FadeIn>
            <div className="rounded-2xl bg-white border border-[#efeeea] p-6 sm:p-8">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-[#01261f]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#1a3c34]/50 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#735c00]/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <FadeIn>
            <p className="text-sm text-[#fed65b]/60 tracking-wider uppercase mb-6">
              Your Game, Our Caddy
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              상담부터 정산까지,
              <br />
              <span className="text-[#fed65b]">변호사 업무의 모든 것을 하나로</span>
            </h2>
            <p className="text-white/60 text-lg mb-4 max-w-xl mx-auto">
              6명의 AI 전문가가 분석하고, 관리하고, 변호사가 결정합니다.
            </p>
            <p className="text-white/30 text-sm mb-10">
              지금 가입하면 7일간 Pro 플랜을 무료로 체험할 수 있습니다.
            </p>
            <Link
              to="/login"
              className="group inline-flex items-center gap-2.5 px-10 py-4 rounded-xl bg-[#fed65b] text-[#01261f] font-bold text-lg hover:bg-[#ffe88a] transition-all hover:scale-[1.02] shadow-lg shadow-black/20"
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-[#efeeea] bg-[#faf9f5]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#735c00]/40" />
            <span className="text-sm text-[#414846]">
              &copy; 2025 Law-Caddy. AI가 분석하고, 변호사가 결정합니다.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#414846]">
            <Link
              to="/login"
              className="hover:text-[#01261f] transition-colors"
            >
              로그인
            </Link>
            <Link
              to="/login"
              className="hover:text-[#01261f] transition-colors"
            >
              시작하기
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
