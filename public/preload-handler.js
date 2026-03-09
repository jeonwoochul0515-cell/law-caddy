// 기존 서비스 워커 완전 제거 + 캐시 클리어 (1회 실행 후 자동 정리)
(function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      if (regs.length === 0) return;
      regs.forEach(function (r) { r.unregister(); });
      if ("caches" in window) {
        caches.keys().then(function (names) {
          names.forEach(function (name) { caches.delete(name); });
        });
      }
    });
  }
})();
