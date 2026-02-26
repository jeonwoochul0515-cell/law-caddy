import type { CaseType, DocType, AgentId } from "../types/agent";

export const CASE_TYPES: CaseType[] = [
  "민사", "형사", "가사", "행정", "노동", "부동산", "채권·채무", "손해배상", "기타",
];

export const DOC_TYPES: DocType[] = [
  "내용증명", "소장", "답변서", "준비서면", "의견서", "합의서", "고소장", "지급명령신청서", "상담 요약 리포트",
];

export const AGENTS: { id: AgentId; name: string; icon: string; role: string }[] = [
  { id: "precedent", name: "판례 검색", icon: "📚", role: "유사 판례 3~5건 검색 + 시사점 분석" },
  { id: "legal", name: "적법성 검증", icon: "⚖️", role: "통비법·변호사법·개보법 준수 확인" },
  { id: "stt", name: "음성 변환", icon: "🎙️", role: "RTZR STT + 화자 구분 대화록 생성" },
  { id: "analysis", name: "쟁점 분석", icon: "🧠", role: "핵심 쟁점 3가지 + 법조문 매칭" },
  { id: "docgen", name: "문서 작성", icon: "📄", role: "체크포인트 확인 → 법률 문서 초안" },
  { id: "review", name: "검토·감수", icon: "✅", role: "5점 척도 평가 + 수정 제안 5가지" },
];

export const PLANS = [
  { id: "starter" as const, name: "Starter", price: "₩49,000/월", features: "5건 녹음/월, 3건 문서/월" },
  { id: "pro" as const, name: "Pro", price: "₩89,000/월", features: "무제한 녹음, 6개 에이전트, 무제한 문서" },
  { id: "team" as const, name: "Team", price: "₩69,000/인", features: "Pro + 팀 공유 + 관리자 (3인 이상)" },
];
