/* Offline support. Network first (so syllabus updates reach students), cache as fallback. */
var CACHE = "poridhi-v3";
var SHELL = [
  "./", "index.html", "admin.html", "styles.css", "core.js", "store.js", "app.js", "admin.js",
  "syllabus.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
      })
  );
});
