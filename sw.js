// 離線快取：先上網拿最新版，拿不到就用上次存下來的
const CACHE = 'piggy-v3';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/art.js', 'js/physics.js', 'js/sound.js', 'js/store.js', 'js/allocate.js',
  'js/parent.js', 'js/icons.js', 'js/zhuyin.js', 'js/util.js',
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
