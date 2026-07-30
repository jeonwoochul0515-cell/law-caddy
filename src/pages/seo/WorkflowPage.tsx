// 검색 유입용: AI 상담 녹음 분석 워크플로우 소개 페이지
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { WORKFLOW_STEPS } from "../../data/landingContent";

export default function WorkflowPage() {
  return (
    <SeoPageLayout>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#14392b] mb-4">
        상담 녹음 한 번, 문서 완성까지 어떻게 이어질까요?
      </h1>
      <p className="text-[#414846] text-lg leading-relaxed mb-12">
        Law-Caddy는 변호사가 상담을 녹음하는 순간부터 의뢰인에게 문서를 전달하는 순간까지, 하나의 업무 흐름으로 자동화합니다. 실제 진행 단계는 아래와 같습니다.
      </p>
      <ol className="space-y-8">
        {WORKFLOW_STEPS.map((step, i) => (
          <li key={step.label} className="flex gap-5">
            <div className="w-10 h-10 rounded-full bg-[#14392b] text-white flex items-center justify-center flex-shrink-0 font-serif font-bold">
              {i + 1}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1e2a22] mb-1">{step.label}</h2>
              <p className="text-[#414846] leading-relaxed mb-1">{step.detail}</p>
              <span className="text-sm text-[#2e6242] font-medium">소요 시간: {step.time}</span>
            </div>
          </li>
        ))}
      </ol>
    </SeoPageLayout>
  );
}
