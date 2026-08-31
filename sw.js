/* PartFinder PWA Service Worker —— 预缓存全量资源，改版自动失效。 */
var CACHE = 'partfinder-pwa-202608311608';
var ASSETS = ["atelier.html", "index.html", "manifest.webmanifest", "css/base.css", "css/components.css", "css/tokens.css", "css/views.css", "data/competitor.json", "data/competitor.v23.bak.json", "data/neutral_models.json", "data/products.json", "js/app.js", "js/contract.js", "js/customer.js", "js/data.js", "js/search.js", "js/core/icons.js", "js/core/store.js", "js/core/util.js", "js/ui/modal.js", "js/ui/primitives.js", "js/views/chrome.js", "js/views/config.js", "js/views/customers.js", "js/views/detail.js", "js/views/results.js", "js/views/rival.js", "js/views/saved.js"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (resp) {
      if (resp && resp.ok && new URL(e.request.url).origin === self.location.origin) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
