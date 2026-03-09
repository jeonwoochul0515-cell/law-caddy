// 배포 후 캐시된 HTML이 이전 JS 청크를 요청하면 SW 제거 후 1회만 리로드
window.addEventListener("vite:preloadError", function () {
  var reloaded = sessionStorage.getItem("sw-reload");
  if (reloaded) {
    sessionStorage.removeItem("sw-reload");
    return; // 이미 1회 리로드했으면 중단 (무한 루프 방지)
  }
  sessionStorage.setItem("sw-reload", "1");

  // 서비스 워커 해제 + 캐시 삭제 후 리로드
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      var promises = regs.map(function (r) { return r.unregister(); });
      Promise.all(promises).then(function () {
        if ("caches" in window) {
          caches.keys().then(function (names) {
            names.forEach(function (name) { caches.delete(name); });
            location.reload();
          });
        } else {
          location.reload();
        }
      });
    });
  } else {
    location.reload();
  }
});
