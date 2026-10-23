// Funciona sem internet: guarda só os ficheiros da própria app (nunca dados — esses ficam cifrados no IndexedDB)
const C = "superavite-v5", FILES = ["./", "index.html", "app.js", "cifra.js", "style.css", "manifest.json", "icon-192.png", "favicon.svg", "fonts/fonts.css", "fonts/manrope-latin-400-700.woff2", "fonts/manrope-latin-ext-400-700.woff2", "fonts/cormorant-latin-600.woff2", "fonts/cormorant-latin-ext-600.woff2"];
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener("fetch", e => e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request))));
