// 검색 유입용: 4개 AI 에이전트 소개 페이지
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { AGENTS } from "../../data/landingContent";

export default function AiAgentsPage() {
  return (
    <SeoPageLayout maxWidthClass="max-w-5xl">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#14392b] mb-4">
        판례 검색부터 문서 검토까지, AI는 어떤 일을 할까요?
      </h1>
      <p className="text-[#414846] text-lg leading-relaxed mb-12 max-w-3xl">
        Law-Caddy는 판례 검색, 적법성·관할 검증, 쟁점 분석, 문서 작성을 네 개의 전문 AI가 병렬로 나누어 맡습니다. 각 에이전트가 실제로 하는 일을 소개합니다.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {AGENTS.map((agent) => (
          <div
            key={agent.fullName}
            className="flex items-start gap-4 p-6 rounded-xl bg-white border border-[#ede7d8]"
          >
            <div
              className={`w-10 h-10 rounded-lg bg-[#f7f5ec] flex items-center justify-center flex-shrink-0 ${agent.color}`}
            >
              {agent.icon}
            </div>
            <div>
              <h2 className="font-semibold text-[#1e2a22] mb-1">
                {agent.fullName}{" "}
                <span className="text-[#414846] font-normal text-sm">· {agent.role}</span>
              </h2>
              <p className="text-sm text-[#414846] leading-relaxed">{agent.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </SeoPageLayout>
  );
}
