/* 离线缓存：内容用网络优先（保证更新即时），静态资源用缓存优先（省流量、离线可读） */
const CACHE = "wb-study-v1";

const CORE = [
  "./",
  "index.html",
  "book.html",
  "about.html",
  "manifest.json",
  "assets/css/style.css",
  "assets/js/app.js",
  "assets/js/reader.js",
  "assets/js/pwa.js",
  "assets/vendor/epub.min.js",
  "data/books.json",
  "data/site.json",
  "media/icon.svg",
  "media/covers/bukit-tales.svg",
  "media/covers/essays.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 逐个缓存，某个文件缺失不影响整体
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isContent = req.mode === "navigate" || url.pathname.endsWith(".json");

  if (isContent) {
    // 网络优先，断网时用缓存
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // 静态资源与电子书：缓存优先
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })
  );
});
