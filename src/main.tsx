import { initSentry } from "./config/sentry";

// Sentry 초기화 (React 렌더링 전)
initSentry();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 서비스 워커 강제 갱신 — 새 배포 즉시 반영
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.update();
    }
  });
}
