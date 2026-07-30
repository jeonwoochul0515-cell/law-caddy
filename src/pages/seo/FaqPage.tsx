// 검색 유입용: 자주 묻는 질문 페이지
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { FAQS } from "../../data/landingContent";
import FAQItem from "../../components/landing/FAQItem";

export default function FaqPage() {
  return (
    <SeoPageLayout>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#14392b] mb-4">자주 묻는 질문</h1>
      <p className="text-[#414846] text-lg leading-relaxed mb-12">
        상담 녹음의 적법성부터 전자서명 효력까지, Law-Caddy 이용 전 변호사님들이 가장 많이 묻는 질문에 답합니다.
      </p>
      <div className="rounded-2xl bg-white border border-[#ede7d8] p-6 sm:p-8">
        {FAQS.map((faq) => (
          <FAQItem key={faq.q} q={faq.q} a={faq.a} />
        ))}
      </div>
    </SeoPageLayout>
  );
}
