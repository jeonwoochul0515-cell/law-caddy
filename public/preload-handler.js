// 배포 후 캐시된 HTML이 이전 JS 청크를 요청하면 자동 리로드
window.addEventListener("vite:preloadError", function () {
  location.reload();
});
