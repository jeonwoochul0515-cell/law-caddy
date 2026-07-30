// 검색 유입용: 요금제 안내 페이지
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { PLANS } from "../../data/landingContent";

export default function PricingPage() {
  return (
    <SeoPageLayout maxWidthClass="max-w-5xl">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#14392b] mb-4">
        Law-Caddy 요금제, 사무소 규모별로 얼마일까요?
      </h1>
      <p className="text-[#414846] text-lg leading-relaxed mb-12 max-w-3xl">
        사무장 월급보다 저렴한 비용으로, 변호사 업무 전체를 자동화하세요. 사무소 규모에 맞는 3가지 플랜을 제공합니다.
      </p>
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative p-8 rounded-2xl border flex flex-col ${
              plan.highlighted ? "bg-[#14392b] border-[#24513c]" : "bg-white border-[#ede7d8]"
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#a9ce96] text-[#14392b] text-xs font-bold whitespace-nowrap">
                추천
              </div>
            )}
            {plan.comingSoon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#9a9ca3] text-white text-xs font-bold whitespace-nowrap">
                준비중
              </div>
            )}
            <h2 className={`text-xl font-bold mb-2 ${plan.highlighted ? "text-[#a9ce96]" : "text-[#1e2a22]"}`}>
              {plan.name}
            </h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className={`text-sm ${plan.highlighted ? "text-white/60" : "text-[#414846]"}`}>
                &#8361;
              </span>
              <span className={`text-4xl font-bold ${plan.highlighted ? "text-white" : "text-[#14392b]"}`}>
                {plan.price}
              </span>
              <span className={`text-sm ${plan.highlighted ? "text-white/60" : "text-[#414846]"}`}>
                {plan.period}
              </span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check
                    className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-[#a9ce96]" : "text-[#14392b]"}`}
                  />
                  <span className={plan.highlighted ? "text-white/90" : "text-[#1e2a22]"}>{feature}</span>
                </li>
              ))}
            </ul>
            {plan.comingSoon ? (
              <div className="block w-full text-center py-3 rounded-xl font-semibold border border-[#ede7d8] text-[#9a9ca3]">
                출시 예정
              </div>
            ) : (
              <Link
                to="/login"
                className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-[#a9ce96] text-[#14392b] hover:bg-[#c2dcb2]"
                    : "border border-[#ede7d8] hover:border-[#2e6242]/30 text-[#1e2a22] hover:text-[#2e6242]"
                }`}
              >
                시작하기
              </Link>
            )}
          </div>
        ))}
      </div>
    </SeoPageLayout>
  );
}
