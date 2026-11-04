/* 注册 Service Worker：让站点可安装到主屏幕、断网也能读 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
