// 없는 주소로 들어왔을 때 보여 주는 화면
//
// (2026-09-19) 이전에는 App.tsx의 `*` 라우트가 말없이 홈으로 튕겼다. 주소를
// 잘못 눌렀는지, 페이지가 없어진 건지, 로그인이 필요한 건지 알 길이 없었다.
// 이제 무슨 일이 있었는지 말하고 갈 곳을 준다.
//
// 상태 코드는 200이다. Cloudflare Pages의 SPA fallback(`/* /index.html 200`)이
// 모든 경로를 index.html로 내려주기 때문이다. 크롤러에는 App.tsx의 SeoDefaults가
// seoRoutes.json에 없는 경로를 noindex로 내보내므로 색인되지 않는다.
// 정적 자산 요청이 빗나갔을 때 쓰이는 dist/404.html은 이 화면을 프리렌더한 것이다.
import { Link } from "react-router-dom";
import SeoPageLayout from "../components/landing/SeoPageLayout";

const INK = "#14392b";
const serif = { fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif' } as const;

export default function NotFoundPage() {
  return (
    <SeoPageLayout maxWidthClass="max-w-xl">
      <h1 className="text-2xl sm:text-3xl font-bold" style={{ ...serif, color: INK }}>
        찾으시는 페이지가 없습니다
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(20,57,43,0.78)" }}>
        주소가 바뀌었거나 잘못 입력되었을 수 있습니다. 사건·문서 화면은 로그인한 뒤에 열립니다.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/"
          className="inline-flex items-center min-h-11 px-5 text-sm rounded-full font-semibold"
          style={{ background: INK, color: "#f2efe3" }}
        >
          처음 화면으로
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center min-h-11 px-5 text-sm rounded-full font-semibold"
          style={{ border: `1px solid ${INK}`, color: INK }}
        >
          로그인
        </Link>
      </div>
    </SeoPageLayout>
  );
}
