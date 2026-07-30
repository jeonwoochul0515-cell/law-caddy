// 랜딩페이지와 SEO 서브페이지(워크플로우·에이전트·요금제·FAQ)가 공유하는 콘텐츠 데이터
//
// (2026-07-27) 전면 개정. 실행 에이전트가 4명으로 바뀐 현실을 반영하고,
// 검증 불가한 수치("40시간 절감", "90% 자동화")와 오인 소지 카피를 걷어냈다.
// 문서 종수는 config/constants.ts의 DOC_TYPES 실제 개수(28종)와 일치시킨다.
import {
  Mic,
  Brain,
  FileText,
  MessageSquare,
  Search,
  Shield,
  PenTool,
  TrendingUp,
  Calculator,
  BarChart3,
} from "lucide-react";

export const WORKFLOW_STEPS = [
  {
    label: "녹음 · 문서 첨부",
    icon: <Mic className="w-5 h-5" />,
    detail: "상담을 녹음하고, 계약서·내용증명 등 관련 문서를 함께 첨부합니다",
    time: "상담 30분",
  },
  {
    label: "AI 분석",
    icon: <Brain className="w-5 h-5" />,
    detail: "네 명의 AI가 판례·적법성·쟁점·확인질문을 병렬로 준비합니다",
    time: "약 2분",
  },
  {
    label: "체크포인트 · 문서 생성",
    icon: <FileText className="w-5 h-5" />,
    detail: "확인 질문에 답하면 소장·내용증명 등 서면 초안이 완성됩니다",
    time: "약 5분",
  },
  {
    label: "의뢰인 전달",
    icon: <MessageSquare className="w-5 h-5" />,
    detail: "어려운 법률 용어를 쉬운 말로 바꾼 안내 메시지가 함께 나옵니다",
    time: "즉시",
  },
];

export const AGENTS = [
  {
    icon: <Search className="w-5 h-5" />,
    fullName: "한판서",
    role: "판례 검색",
    desc: "법제처 실시간 검색과 판결문 데이터베이스를 함께 뒤져 유사 판례를 찾고, 유리한 판례와 불리한 판례를 나누어 시사점까지 정리합니다. 확인되지 않은 사건번호는 인용하지 않습니다.",
    color: "text-[#9C7C3C]",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    fullName: "윤율무",
    role: "적법성 · 관할 검증",
    desc: "관할법원, 소멸시효, 소송요건을 건마다 점검합니다. 시효가 임박했거나 요건이 빠졌으면 해결 방법과 함께 경고합니다.",
    color: "text-[#9C7C3C]",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    fullName: "서혜안",
    role: "쟁점 분석",
    desc: "사건의 핵심 쟁점을 짚고 근거 법조문을 매칭합니다. 상대방의 예상 반론과 재반박 논리까지 설계해 서면의 뼈대를 만듭니다.",
    color: "text-[#9C7C3C]",
  },
  {
    icon: <FileText className="w-5 h-5" />,
    fullName: "조필묵",
    role: "문서 작성",
    desc: "소장부터 합의서까지 28종 서식을 실제 법원 양식 그대로 작성합니다. 앞선 세 사람의 분석을 이어받아, 변호사가 검토할 초안을 완성합니다.",
    color: "text-[#9C7C3C]",
  },
];

export const PLATFORM_FEATURES = [
  {
    icon: <PenTool className="w-6 h-6" />,
    title: "수임계약서 자동 생성 · 전자서명",
    desc: "민사·형사 표준 계약서를 자동 생성하고, 링크 하나로 의뢰인 서명까지 받습니다. 서명 시각·IP·기기 정보가 감사 기록으로 남습니다.",
    tag: "계약",
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: "성공보수 네 가지 방식 추적",
    desc: "정률·정액·구간별·형사 조건부(무죄/집행유예/벌금형) 성공보수를 약정부터 입금까지 상태로 관리합니다.",
    tag: "보수",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "착수금 · 분할납부 관리",
    desc: "착수금, 잔금, 분할납부 일정을 사건별로 관리합니다. 연체를 자동으로 감지하고 안내 메시지 초안까지 준비합니다.",
    tag: "수임료",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "인지대 · 송달료 계산과 경비 정리",
    desc: "소가·심급별 인지대와 송달료를 즉시 계산합니다. 감정료·출장비 등 사건비용을 영수증과 함께 정산 관리합니다.",
    tag: "비용",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "월별 손익 · 세무 자료",
    desc: "매출, 경비, 부가세, 미수금이 월별로 집계됩니다. 세무사에게 넘길 자료가 화면 그대로 정리되어 나옵니다.",
    tag: "세무",
  },
];

interface LandingPlan {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted: boolean;
  badge?: string;
  /** true면 아직 판매하지 않는 플랜 — 화면엔 "준비중", 구조화 데이터 Offer에서 제외 */
  comingSoon?: boolean;
}

export const PLANS: LandingPlan[] = [
  {
    name: "Starter",
    price: "49,000",
    period: "/월",
    features: ["녹음 분석 월 5건", "문서 생성 월 3건", "AI 분석 전체", "이메일 지원"],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "89,000",
    period: "/월",
    badge: "추천",
    features: [
      "녹음 · 문서 생성 무제한",
      "28종 법률 문서 서식",
      "AI 분석팀 전체 (판례·적법성·쟁점·작성)",
      "수임계약서 자동 생성 · 전자서명",
      "성공보수 · 분할납부 추적",
      "인지대 계산 · 사건비용 관리",
      "월별 손익 · 세무 자료",
      "의뢰인 단계별 안내 메시지",
    ],
    highlighted: true,
  },
  {
    name: "Team",
    price: "69,000",
    period: "/인 · 월",
    features: ["Pro 전체 기능", "팀 공유 대시보드", "관리자 기능", "3인 이상 · 출시 예정"],
    highlighted: false,
    // 팀 공유·권한 기능이 아직 구현 전이라 판매하지 않는다. 구현 완료 전까지 유지할 것.
    comingSoon: true,
  },
];

export const FAQS = [
  {
    q: "상담 녹음이 법적으로 문제되지 않나요?",
    a: "본인이 참여한 대화를 녹음하는 것은 통신비밀보호법상 적법합니다. Law-Caddy의 적법성 검증이 매 건 함께 확인하고, 의뢰인 고지용 안내 문구도 제공합니다.",
  },
  {
    q: "AI가 작성한 문서를 바로 제출할 수 있나요?",
    a: "아닙니다. 모든 산출물은 변호사의 최종 검토를 전제로 한 초안입니다. Law-Caddy는 변호사의 판단을 대체하지 않고, 초안 준비에 드는 시간을 줄여주는 도구입니다.",
  },
  {
    q: "의뢰인 정보 보안은 어떻게 되나요?",
    a: "모든 데이터는 암호화되어 저장되고 변호사 본인만 접근할 수 있습니다. 전자서명에는 서명 시각·IP·기기 정보가 감사 기록으로 남습니다.",
  },
  {
    q: "어떤 종류의 법률 문서를 만들 수 있나요?",
    a: "소장, 답변서, 준비서면, 내용증명, 고소장, 가압류신청서, 지급명령신청서, 항소장, 합의서, 사건위임계약서 등 28종 서식을 지원합니다. 실제 법원 제출 양식 구조를 따릅니다.",
  },
  {
    q: "기존 회계 프로그램과 무엇이 다른가요?",
    a: "Law-Caddy는 사건 중심입니다. 수임료·예치금·사건비용이 사건별로 연결되고, 월별 손익·부가세·미수금이 자동 집계됩니다. 상담 녹음부터 정산까지 한 흐름으로 이어지는 것이 가장 큰 차이입니다.",
  },
  {
    q: "전자서명 수임계약이 법적으로 유효한가요?",
    a: "전자서명법에 따라 당사자 간 합의된 전자서명은 법적 효력이 있습니다. 서명 시점과 IP·기기 정보가 자동으로 기록되어 분쟁 시 근거가 됩니다.",
  },
];
