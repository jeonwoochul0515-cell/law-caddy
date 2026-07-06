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

  const appHtml = render(routePath);
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<script src="\/preload-handler\.js">/,
    `<div id="root">${appHtml}</div>\n    <script src="/preload-handler.js">`
  );

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
