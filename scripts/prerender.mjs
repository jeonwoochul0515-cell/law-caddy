// 빌드된 공개 SEO 페이지들의 SSR 결과물을 dist/의 각 라우트 정적 HTML에 주입하는 스크립트
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { render, getRouteJsonLd, PUBLIC_ROUTES } = await import(
  pathToFileURL(path.join(root, "dist-ssr/entry-server.js")).href
);
const seoRoutes = JSON.parse(readFileSync(path.join(root, "src/data/seoRoutes.json"), "utf-8"));

const template = readFileSync(path.join(root, "dist/index.html"), "utf-8");

for (const routePath of PUBLIC_ROUTES) {
  const meta = seoRoutes[routePath];
  if (!meta) throw new Error(`prerender: seoRoutes.json에 ${routePath} 항목이 없습니다.`);

  // Cloudflare Pages는 서브페이지(디렉토리 인덱스)를 끝 슬래시 URL로 308 리다이렉트하므로 canonical도 맞춘다
  const canonicalUrl = `https://law-caddy.com${routePath === "/" ? "/" : `${routePath}/`}`;
  const jsonLdBlocks = getRouteJsonLd(routePath)
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join("\n    ");

  const seoHead = `<title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    ${jsonLdBlocks}`;

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace("<!--ROUTE_SEO-->", seoHead);

  if (html.includes("<!--ROUTE_SEO-->")) {
    throw new Error("prerender: <!--ROUTE_SEO--> 자리표시자를 치환하지 못했습니다.");
  }

  // root 안의 크롤러용 폴백을 SSR 결과로 교체한다.
  //
  // (2026-07-31) 이전에는 `</div>` 뒤에 오는 <script src="/preload-handler.js">를
  // 기준으로 정규식을 걸었는데, 그런 스크립트 태그는 index.html에 존재하지 않는다
  // (Vite가 진입 스크립트를 <head>로 올려서 root 뒤에는 </body>만 남는다).
  // 정규식이 한 번도 맞지 않아 프리렌더가 아무것도 하지 않으면서 성공으로 보고했다.
  // 태그 위치에 의존하지 않도록 root 시작 ~ </body> 직전의 마지막 </div>로 범위를 잡고,
  // 못 찾으면 조용히 넘어가지 말고 빌드를 세운다.
  const appHtml = render(routePath);
  const rootOpen = '<div id="root">';
  const startIdx = html.indexOf(rootOpen);
  const bodyEndIdx = html.indexOf("</body>");
  if (startIdx === -1 || bodyEndIdx === -1) {
    throw new Error('prerender: index.html에서 <div id="root"> 또는 </body>를 찾지 못했습니다.');
  }
  const endIdx = html.lastIndexOf("</div>", bodyEndIdx);
  if (endIdx <= startIdx) {
    throw new Error("prerender: root를 닫는 </div>를 찾지 못했습니다.");
  }
  html =
    html.slice(0, startIdx) +
    `${rootOpen}${appHtml}</div>` +
    html.slice(endIdx + "</div>".length);

  if (!html.includes(appHtml)) {
    throw new Error(`prerender: ${routePath} SSR 결과가 HTML에 주입되지 않았습니다.`);
  }

  const outPath =
    routePath === "/"
      ? path.join(root, "dist/index.html")
      : path.join(root, "dist", routePath.replace(/^\//, ""), "index.html");

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`[prerender] ${routePath} → ${path.relative(root, outPath)}`);
}

rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
console.log("[prerender] 전체 공개 페이지 SSR 완료");
