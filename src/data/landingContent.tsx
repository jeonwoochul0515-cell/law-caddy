// 랜딩페이지와 SEO 서브페이지(워크플로우·에이전트·요금제·FAQ)가 공유하는 콘텐츠 데이터
import {
  Mic,
  Brain,
  FileText,
  MessageSquare,
  Search,
  Shield,
  Award,
  PenTool,
  TrendingUp,
  Calculator,
  BarChart3,
} from "lucide-react";

export const WORKFLOW_STEPS = [
  {
    label: "녹음 & 문서 첨부",
    icon: <Mic className="w-5 h-5" />,
    detail: "상담을 녹음하고, 관련 문서를 첨부합니다",
    time: "30분 상담",
  },
  {
    label: "AI 분석",
    icon: <Brain className="w-5 h-5" />,
    detail: "6명의 에이전트가 첨부 문서까지 분석합니다",
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

export const AGENTS = [
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
    icon: <Search className="w-5 h-5" />,
    fullName: "오사서",
    role: "RAG 판례 검색 에이전트",
    desc: "AI 법률 데이터베이스 전문 연구원. 실제 판결문 DB를 시맨틱 검색으로 탐색하며, 사실관계가 유사한 판례를 패턴 분석으로 발굴합니다.",
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

export const PLATFORM_FEATURES = [
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
    title: "월별 손익 & 세무 리포트",
    desc: "매출·경비·부가세·미수금을 월별로 자동 집계. 세무사에게 제출할 자료가 클릭 한 번으로 완성됩니다.",
    tag: "세무",
  },
];

export const PLANS = [
  {
    name: "Starter",
    price: "49,000",
    period: "/월",
    features: ["5건 녹음/월", "3건 문서/월", "기본 AI 분석", "이메일 지원"],
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
      "월별 손익 & 세무 리포트",
      "의뢰인 4단계 케어 메시지",
      "우선 지원",
    ],
    highlighted: true,
  },
  {
    name: "Team",
    price: "69,000",
    period: "/인",
    features: ["Pro 전체 기능", "팀 공유 대시보드", "관리자 기능", "3인 이상", "전담 매니저"],
    highlighted: false,
  },
];

export const FAQS = [
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
    a: "LAW-CADDY는 '사건 중심' 회계입니다. 수임료·예치금·소송비용이 사건별로 자동 연결되고, 월별 손익·부가세·미수금이 자동 집계됩니다. 세무사에게 보낼 자료도 클릭 한 번이면 됩니다.",
  },
  {
    q: "전자서명 수임계약이 법적으로 유효한가요?",
    a: "전자서명법에 따라 당사자 간 합의된 전자서명은 법적 효력이 있습니다. 서명 시점, IP 주소, 기기 정보 등 감사 추적이 자동으로 기록됩니다.",
  },
];
