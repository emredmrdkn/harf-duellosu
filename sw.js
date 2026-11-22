// Bulmaca — servis çalışanı: oyunu çevrimdışı da açılabilir kılar.
// Dosyalar değiştiğinde SURUM'u artırın; eski önbellek kendiliğinden silinir.
const KOK = self.registration.scope;
const ONBELLEK_ON_EK = "hd:" + KOK + ":";
const SURUM = ONBELLEK_ON_EK + "1.3.4";
const ANA_SAYFA = new URL("index.html", KOK).href;
const DOSYALAR = [
  "./",
  "index.html",
  "css/stil.css",
  "js/uygulama.js",
  "js/motor.js",
  "js/bot.js",
  "js/cevrimici.js",
  "js/oyun-ag.js",
  "js/ses.js",
  "js/bulmacalar.js",
  "manifest.webmanifest",
  "ikonlar/favicon.svg",
  "ikonlar/icon-192.png",
  "ikonlar/icon-512.png",
  "ikonlar/maskable-192.png",
  "ikonlar/maskable-512.png",
  "ikonlar/apple-touch-icon.png",
  "ekranlar/oyun.jpg",
  "ekranlar/ana.jpg",
  "ekranlar/davet.jpg",
].map((dosya) => new URL(dosya, KOK).href);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith(ONBELLEK_ON_EK) && a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  const url = new URL(istek.url);
  if (istek.method !== "GET" || url.origin !== location.origin || !url.href.startsWith(KOK)) return;

  if (istek.mode === "navigate") {
    // Sayfa: önce ağ (güncel sürüm), olmazsa önbellek
    e.respondWith(
      fetch(istek)
        .then((yanit) => {
          const kopya = yanit.clone();
          if (yanit.ok) caches.open(SURUM).then((c) => c.put(ANA_SAYFA, kopya));
          return yanit;
        })
        .catch(() => caches.match(ANA_SAYFA))
    );
    return;
  }

  // Diğer dosyalar: önbellekten hemen ver, arkada güncelle
  e.respondWith(
    caches.open(SURUM).then(async (c) => {
      const onbellek = await c.match(istek, { ignoreSearch: true });
      const ag = fetch(istek)
        .then((yanit) => {
          if (yanit.ok) c.put(istek, yanit.clone());
          return yanit;
        })
        .catch(() => onbellek);
      return onbellek || ag;
    })
  );
});
