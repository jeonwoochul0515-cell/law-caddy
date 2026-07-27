// 빌드 시점에 공개 SEO 페이지들을 정적 HTML로 미리 렌더링하는 SSR 진입점 (앱의 인증 로직과 무관)
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import LandingPage from "./pages/LandingPage";
import WorkflowPage from "./pages/seo/WorkflowPage";
import AiAgentsPage from "./pages/seo/AiAgentsPage";
import AutomationPage from "./pages/seo/AutomationPage";
import PricingPage from "./pages/seo/PricingPage";
import FaqPage from "./pages/seo/FaqPage";
import { WORKFLOW_STEPS, FAQS, PLANS } from "./data/landingContent";

const PAGES: Record<string, React.ComponentType> = {
  "/": LandingPage,
  "/workflow": WorkflowPage,
  "/ai-agents": AiAgentsPage,
  "/automation": AutomationPage,
  "/pricing": PricingPage,
  "/faq": FaqPage,
};

export const PUBLIC_ROUTES = Object.keys(PAGES);

export function render(url: string) {
  const Page = PAGES[url];
  if (!Page) throw new Error(`entry-server: no page registered for ${url}`);
  return renderToStaticMarkup(
    <StaticRouter location={url}>
      <Page />
    </StaticRouter>
  );
}

// 라우트별 구조화 데이터. 화면에 실제 존재하는 공유 데이터(landingContent)에서만 생성해 문구 어긋남을 방지한다.
export function getRouteJsonLd(url: string): object[] {
  if (url === "/workflow") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Law-Caddy로 상담부터 문서 생성까지 진행하는 방법",
        description:
          "상담 녹음 한 번으로 AI 분석부터 법률 문서 초안, 의뢰인 안내 메시지까지 자동으로 완성되는 과정.",
        totalTime: "PT5M",
        step: WORKFLOW_STEPS.map((s) => ({
          "@type": "HowToStep",
          name: s.label,
          text: `${s.detail} (${s.time})`,
        })),
      },
    ];
  }

  if (url === "/faq") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ];
  }

  if (url === "/" || url === "/pricing") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Law-Caddy",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "변호사 상담 녹음 → AI가 판례 검색·적법성 검증·쟁점 분석·문서 작성을 병렬 수행하고, 수임계약서 전자서명·성공보수 추적·소송비용 계산까지 지원하는 법률사무소 업무 자동화 플랫폼.",
        offers: PLANS.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: p.price.replace(/,/g, ""),
          priceCurrency: "KRW",
        })),
      },
    ];
  }

  return [];
}
