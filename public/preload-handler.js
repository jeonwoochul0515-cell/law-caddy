// 배포 후 캐시된 HTML이 이전 JS 청크를 요청하면 1회만 리로드
(function () {
  window.addEventListener("vite:preloadError", function () {
    var reloaded = sessionStorage.getItem("preload-reload");
    if (reloaded) {
      sessionStorage.removeItem("preload-reload");
      return;
    }
    sessionStorage.setItem("preload-reload", "1");
    location.reload();
  });
})();
