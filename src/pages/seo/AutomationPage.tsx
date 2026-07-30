// 검색 유입용: 변호사 업무 자동화 기능 소개 페이지
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { PLATFORM_FEATURES } from "../../data/landingContent";

export default function AutomationPage() {
  return (
    <SeoPageLayout maxWidthClass="max-w-5xl">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#14392b] mb-4">
        수임계약서부터 성공보수 정산까지, 어떻게 자동화될까요?
      </h1>
      <p className="text-[#414846] text-lg leading-relaxed mb-12 max-w-3xl">
        Law-Caddy는 수임계약서 작성부터 성공보수·소송비용 정산까지, 변호사 사무소 운영에 필요한 반복 업무를 자동화합니다.
      </p>
      <div className="grid sm:grid-cols-2 gap-5">
        {PLATFORM_FEATURES.map((feat) => (
          <div key={feat.title} className="p-6 rounded-2xl bg-white border border-[#ede7d8]">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#14392b]/5 flex items-center justify-center text-[#14392b]">
                {feat.icon}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#2e6242] font-semibold bg-[#2e6242]/5 px-2.5 py-1 rounded-full">
                {feat.tag}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[#1e2a22] mb-2">{feat.title}</h2>
            <p className="text-sm text-[#414846] leading-relaxed">{feat.desc}</p>
          </div>
        ))}
      </div>
    </SeoPageLayout>
  );
}
