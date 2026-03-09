import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "LAW-CADDY - 변호사 AI 어시스턴트",
        short_name: "LAW-CADDY",
        description: "변호사 상담 녹음 AI 분석 플랫폼",
        theme_color: "#0B1120",
        background_color: "#0B1120",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // HTML/JS/CSS는 항상 네트워크 우선 — 배포 즉시 반영
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // JS/CSS → 네트워크 우선, 실패 시 캐시 폴백
            urlPattern: /\.(?:js|css)$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            // 이미지/폰트 → 캐시 우선 (변경 거의 없음)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|woff2?)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-fonts",
              expiration: { maxEntries: 60, maxAgeSeconds: 2592000 },
            },
          },
          {
            // Firestore API → 네트워크 우선
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: "NetworkFirst",
            options: {
              cacheName: "firestore-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
        // precache에서 HTML 제외 — HTML은 항상 네트워크에서 가져옴
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
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
});
