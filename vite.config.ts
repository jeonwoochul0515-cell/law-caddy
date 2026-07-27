import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: {
      // (2026-07-27) 클라이언트 빌드만 파일명 접두사를 app-으로 변경.
      // 특정 브라우저에서 기존 해시 파일명(assets/index-*.js)에 대한 스크립트 로드가
      // 지속 실패하는 사례가 있었다(오염된 캐시 항목 또는 확장프로그램 필터로 추정,
      // fetch는 정상·쿼리 부착 시 통과). URL 자체를 바꾸면 어느 쪽이든 우회된다.
      // SSR 빌드는 prerender.mjs가 dist-ssr/entry-server.js를 찾으므로 기본 이름 유지.
      output: isSsrBuild
        ? undefined
        : {
            entryFileNames: "assets/app-[hash].js",
            chunkFileNames: "assets/app-[name]-[hash].js",
            assetFileNames: "assets/app-[name]-[hash][extname]",
          },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 새 배포 감지 시 대기 없이 즉시 활성화 (구버전 청크 캐시로 인한 로드 오류 최소화)
      registerType: "autoUpdate",
      // CSP가 inline script를 막으므로 별도 파일(/registerSW.js)로 등록
      injectRegister: "script",
      manifest: {
        name: "Law-Caddy — 변호사 AI 상담 어시스턴트",
        short_name: "Law-Caddy",
        description:
          "상담 녹음 하나로 판례 검색·법률 문서 작성·수임계약·성공보수 관리까지",
        lang: "ko",
        start_url: "/",
        display: "standalone",
        theme_color: "#01261f",
        background_color: "#faf9f5",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API 요청은 절대 SPA 폴백/캐시로 처리하지 않음
        navigateFallbackDenylist: [/^\/api\//],
        // 결제·인증 등 외부 리소스는 런타임 캐싱하지 않음 (precache만 사용)
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ""),
      },
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
}));
