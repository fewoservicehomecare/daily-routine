// Daily Routine – service worker. Network-first (bypassing the HTTP cache), cache fallback for offline.
var C = "dr-v3";
var FILES = ["./", "index.html", "app.js?v=3", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES.map(function (u) { return new Request(u, { cache: "reload" }); })); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var q = e.request;
  if (q.method !== "GET" || new URL(q.url).origin !== self.location.origin) { return; }
  e.respondWith(fetch(q, { cache: "no-cache" }).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(q, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(q).then(function (m) { return m || caches.match(q, { ignoreSearch: true }); })
      .then(function (m) { return m || (q.mode === "navigate" ? caches.match("./") : undefined); });
  }));
});
