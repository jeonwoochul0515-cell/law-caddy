// /api/* 프록시 호출 시 사용할 베이스 URL. 로컬 개발(vite dev)에서는 배포된
// Functions로 직접 호출하고, 실제 배포 도메인(law-caddy.com/pages.dev)에서는
// 같은 오리진의 상대경로를 사용한다.
const DEPLOYED_HOSTNAMES = ["law-caddy.com", "law-caddy.pages.dev"];

export const API_BASE =
  typeof window !== "undefined" && !DEPLOYED_HOSTNAMES.includes(window.location.hostname)
    ? "https://law-caddy.pages.dev"
    : "";
