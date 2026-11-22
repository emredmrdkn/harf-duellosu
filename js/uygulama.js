// Bulmaca — arayüz denetçisi
import { BULMACALAR } from "./bulmacalar.js";
import * as M from "./motor.js";
import { SEVIYELER, botKarari } from "./bot.js";
import { Oda, OYUN_ADI, odaKaydet, odaOku, sonOda, sonOdaSil, davetBaglantisi, davetMetni, whatsappBaglantisi } from "./cevrimici.js";
import { Ses } from "./ses.js";

const $ = (s) => document.querySelector(s);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const Kayit = {
  oku(k, vars = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? vars : JSON.parse(v);
    } catch {
      return vars;
    }
  },
  yaz(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* depolama yoksa oyun yine çalışır */
    }
  },
  sil(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* yok say */
    }
  },
};

const U = {
  ad: Kayit.oku("hd.ad", ""),
  seviye: Kayit.oku("hd.seviye", "orta"),
  mod: null, // "bot" | "cevrim"
  B: null,
  d: null,
  ben: 0,
  adlar: ["Sen", "Rakip"],
  simgeler: ["", ""],
  gorunen: "",
  gecici: new Map(), // kare -> yuva
  bekleyen: new Map(), // canlandırma sırasında doğrulanmayı bekleyen kareler -> harf
  bekleyenYuva: new Set(), // doğrulanmayı bekleyen harflerin ıstaka yuvaları
  yuvalar: [null, null, null, null, null],
  secili: null,
  aktif: null,
  yon: "s",
  silahli: null,
  kilit: false,
  oyunNo: 0,
  botCalisiyor: false,
  cevrim: null,
  hucreEl: [],
  pasOnay: 0,
  sonucNo: -1,
  kurulum: null, // beforeinstallprompt olayı
};

// ---------------------------------------------------------------- yardımcılar

function ekranGoster(ad) {
  for (const e of document.querySelectorAll(".ekran")) e.hidden = e.id !== "ekran-" + ad;
  // Telefonun "geri" tuşu uygulamadan çıkmak yerine ana menüye dönsün
  if (ad !== "ana" && !(history.state && history.state.hd)) history.pushState({ hd: 1 }, "");
  if (ad === "oyun") uyanikTut();
  else uyanikBirak();
}

// Oyun sırasında ekran kararmasın (destekleyen tarayıcılarda)
let uyanikKilit = null;
async function uyanikTut() {
  try {
    if (!uyanikKilit && "wakeLock" in navigator && !document.hidden) {
      uyanikKilit = await navigator.wakeLock.request("screen");
      uyanikKilit.addEventListener("release", () => (uyanikKilit = null));
    }
  } catch {
    /* izin verilmediyse sorun değil */
  }
}
function uyanikBirak() {
  try {
    if (uyanikKilit) uyanikKilit.release();
  } catch {
    /* yok say */
  }
  uyanikKilit = null;
}

function bildir(metin, tur = "") {
  const kap = $("#bildirim");
  // Oyun ekranında bildirim, durum şeridinin tam üstünde bant olarak görünür
  if (!$("#ekran-oyun").hidden) {
    const r = $("#durum-serit").getBoundingClientRect();
    kap.style.top = Math.round(r.top - 3) + "px";
    kap.classList.add("serit");
    kap.innerHTML = "";
  } else {
    kap.style.top = "";
    kap.classList.remove("serit");
  }
  const b = document.createElement("div");
  b.className = "balon " + tur;
  b.textContent = metin;
  kap.appendChild(b);
  setTimeout(() => b.remove(), 2500);
}

function titret(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* desteklenmiyor */
  }
}

function benimAdim() {
  return U.ad || "Sen";
}

function benimSiram() {
  return U.d && !U.d.bitti && U.d.sira === U.ben;
}

function bulmacaBul(id) {
  return BULMACALAR.find((b) => b.id === id) || BULMACALAR[0];
}

function bulmacaSec() {
  let oynanan = Kayit.oku("hd.oynanan", []);
  let adaylar = BULMACALAR.filter((b) => !oynanan.includes(b.id));
  if (adaylar.length === 0) {
    oynanan = [];
    adaylar = BULMACALAR;
  }
  const b = adaylar[Math.floor(Math.random() * adaylar.length)];
  oynanan.push(b.id);
  Kayit.yaz("hd.oynanan", oynanan);
  return b;
}

// ---------------------------------------------------------------- katman (alt yaprak)

let katmanKapat = null;

function katmanAc(html, { kapatilabilir = true } = {}) {
  const y = $("#yaprak");
  y.innerHTML = html;
  $("#katman").hidden = false;
  return new Promise((coz) => {
    katmanKapat = (deger) => {
      $("#katman").hidden = true;
      y.innerHTML = "";
      katmanKapat = null;
      coz(deger);
    };
    $("#katman").onclick = (e) => {
      if (e.target.id === "katman" && kapatilabilir) katmanKapat(null);
    };
    y.onclick = (e) => {
      const d = e.target.closest("[data-deger]");
      if (d) katmanKapat(d.dataset.deger);
    };
  });
}

function kacis(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function adSor() {
  const p = katmanAc(`
    <h2>Adın ne olsun?</h2>
    <p>Rakibin seni bu adla görecek.</p>
    <form id="ad-form">
      <input type="text" id="ad-girdi" maxlength="14" autocomplete="off" enterkeyhint="done" placeholder="Adın" value="${kacis(U.ad)}">
      <div class="dugmeler"><button class="dugme birincil genis" type="submit">Tamam</button></div>
    </form>`);
  const girdi = $("#ad-girdi");
  setTimeout(() => girdi.focus(), 50);
  $("#ad-form").onsubmit = (e) => {
    e.preventDefault();
    const ad = girdi.value.replace(/[<>]/g, "").trim().slice(0, 14);
    if (ad) {
      U.ad = ad;
      Kayit.yaz("hd.ad", ad);
    }
    katmanKapat("tamam");
  };
  await p;
  anaCiz();
  return U.ad;
}

function nasilGoster() {
  return katmanAc(`
    <h2>Nasıl oynanır?</h2>
    <ul class="kurallar">
      <li><span class="rozet m">5</span><span>Elinde en çok <b>5 harf</b> olur. Sıran gelince harflerini bulmacadaki doğru karelere diz ve <b>Oyna</b>'ya bas.</span></li>
      <li><span class="rozet t">+1</span><span>Her <b>doğru harf</b> 1 puan kazandırır ve tahtada kalır.</span></li>
      <li><span class="rozet k">−1</span><span><b>Yanlış harf</b> eline geri döner ve 1 puan götürür. Emin değilsen koyma.</span></li>
      <li><span class="rozet">+2</span><span>Bir <b>kelimenin son harfini</b> koyan 2 puan prim alır.</span></li>
      <li><span class="rozet">+3</span><span>Tek turda <b>5 harfin hepsini</b> doğru koyarsan "beşli" primi kazanırsın.</span></li>
      <li><span class="rozet m">?</span><span>Bir kareye ya da ipucuna dokununca soru aşağıda büyür. <b>İpucu</b> düğmesi bir harfinin yerini gösterir (oyun başına 2 hak).</span></li>
    </ul>
    <p>Bulmaca dolunca oyun biter; puanı yüksek olan kazanır.</p>
    <div class="dugmeler"><button class="dugme birincil genis" data-deger="tamam" type="button">Anladım</button></div>`);
}

// ---------------------------------------------------------------- ana ekran

function anaCiz() {
  $("#ad-metin").textContent = U.ad || "Adını yaz";
  $("#ad-harf").textContent = (U.ad || "?").slice(0, 1).toLocaleUpperCase("tr");
  for (const b of document.querySelectorAll(".seviye")) {
    b.setAttribute("aria-checked", b.dataset.seviye === U.seviye ? "true" : "false");
  }
  const kayit = Kayit.oku("hd.kayit");
  $("#btn-devam").hidden = !(kayit && kayit.d && !kayit.d.bitti);
  const kod = sonOda();
  $("#btn-odaya-don").hidden = !(kod && odaOku(kod));
  const ist = Kayit.oku("hd.istatistik", { oyun: 0, galibiyet: 0, enYuksek: 0 });
  $("#istatistik").textContent = ist.oyun ? `${ist.oyun} oyun · ${ist.galibiyet} galibiyet · en yüksek ${ist.enYuksek} puan` : "";
  $("#istatistik").hidden = !ist.oyun;
  $("#btn-yukle").hidden = kuruluMu();
}

// ---------------------------------------------------------------- telefona kurulum

// Oyun ana ekrandan, uygulama gibi mi açılmış?
function kuruluMu() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  } catch {
    return false;
  }
}

function cihazTuru() {
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|TikTok|; wv\)/i.test(ua)) return "gomulu";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "masaustu";
}

async function telefonaKur() {
  // Tarayıcı hazır kurulum penceresi sunuyorsa doğrudan onu aç
  if (U.kurulum) {
    const olay = U.kurulum;
    U.kurulum = null;
    try {
      olay.prompt();
      const s = await olay.userChoice;
      if (s && s.outcome === "accepted") bildir("Kuruluyor… Birazdan ana ekranında", "iyi");
    } catch {
      /* kullanıcı pencereyi kapattı */
    }
    anaCiz();
    return;
  }
  // Sunmuyorsa cihaza göre yol göster
  const tur = cihazTuru();
  const govde = {
    android: `
      <p>Tarayıcın kurulum penceresini kendiliğinden açmadı. Elle kurmak çok kolay:</p>
      <ol class="adimlar">
        <li><span>Chrome'un sağ üstündeki <b>⋮</b> menüsüne dokun.</span></li>
        <li><span><b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>'yi seç.</span></li>
        <li><span><b>Yükle</b>'ye bas. Simge ana ekranına gelir.</span></li>
      </ol>
      <p>Menüde “${OYUN_ADI}’yı aç” yazıyorsa oyun zaten kurulu demektir.</p>`,
    ios: `
      <p>iPhone ve iPad'de kurulum Safari'den yapılır:</p>
      <ol class="adimlar">
        <li><span>Bu sayfayı <b>Safari</b>'de aç.</span></li>
        <li><span>Alttaki <b>Paylaş</b> düğmesine dokun.</span></li>
        <li><span><b>Ana Ekrana Ekle</b>'yi seç ve <b>Ekle</b>'ye bas.</span></li>
      </ol>`,
    gomulu: `
      <p>Bu sayfa başka bir uygulamanın içinde açılmış; buradan kurulum yapılamıyor.</p>
      <ol class="adimlar">
        <li><span>Sağ üstteki menüden <b>Tarayıcıda aç</b> ya da <b>Chrome'da aç</b>'ı seç.</span></li>
        <li><span>Açılan sayfada yeniden <b>Telefona kur</b>'a dokun.</span></li>
      </ol>`,
    masaustu: `
      <p>Bilgisayarda:</p>
      <ol class="adimlar">
        <li><span>Adres çubuğunun sağındaki <b>yükle</b> simgesine tıkla (Chrome ya da Edge).</span></li>
        <li><span><b>Yükle</b>'ye bas.</span></li>
      </ol>
      <p>Telefona kurmak için bu adresi telefonda Chrome ile aç ve aynı düğmeye dokun.</p>`,
  }[tur];
  const secim = await katmanAc(`
    <h2>Telefona kur</h2>
    ${govde}
    <div class="dugmeler">
      ${tur === "gomulu" ? '<button class="dugme ikincil genis" data-deger="kopyala" type="button">Bağlantıyı kopyala</button>' : ""}
      <button class="dugme birincil genis" data-deger="tamam" type="button">Tamam</button>
    </div>`);
  if (secim === "kopyala") panoyaYaz(siteAdresi());
}

function siteAdresi() {
  const adres = new URL(location.href);
  adres.search = "";
  adres.hash = "";
  return adres.toString();
}

function panoyaYaz(metin) {
  const tamam = () => bildir("Bağlantı kopyalandı", "iyi");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(metin).then(tamam, () => bildir(metin));
  else bildir(metin);
}

// Oyunun kendisini (oda değil) paylaşır
function oyunuPaylas() {
  const metin = `${OYUN_ADI} oynayalım mı? Telefonuna da kurabilirsin.`;
  if (navigator.share) {
    navigator.share({ title: OYUN_ADI, text: metin, url: siteAdresi() }).catch(() => {});
  } else {
    window.open("https://wa.me/?text=" + encodeURIComponent(metin + " " + siteAdresi()), "_blank", "noopener");
  }
}

function anaEkranaDon() {
  U.oyunNo++;
  U.mod = null;
  cevrimDurdur();
  document.title = OYUN_ADI;
  anaCiz();
  ekranGoster("ana");
  if (history.state && history.state.hd) history.back();
  else if (location.search) history.replaceState(null, "", location.pathname);
}

// ---------------------------------------------------------------- oyun kurma

function oyunYukle(mod, bulmaca, durum, ben, adlar, simgeler) {
  U.oyunNo++;
  U.mod = mod;
  U.B = M.bulmacaHazirla(bulmaca);
  U.d = durum;
  U.ben = ben;
  U.adlar = adlar;
  U.simgeler = simgeler;
  U.gorunen = durum.sahip;
  U.gecici.clear();
  U.bekleyen.clear();
  U.bekleyenYuva.clear();
  U.yuvalar = [null, null, null, null, null];
  U.secili = null;
  U.aktif = null;
  U.silahli = null;
  U.kilit = false;
  U.botCalisiyor = false;
  U.pasOnay = 0;
  yuvaEsitle();
  tahtaKur();
  hepsiniCiz();
  ekranGoster("oyun");
}

function botOyunuBaslat() {
  const b = bulmacaSec();
  const B = M.bulmacaHazirla(b);
  const d = M.yeniDurum(B, Math.random() < 0.5 ? 0 : 1);
  const sv = SEVIYELER[U.seviye];
  oyunYukle("bot", b, d, 0, [benimAdim(), sv.ad], ["", sv.simge]);
  kaydet();
  bildir(d.sira === 0 ? "İlk hamle senin" : `${sv.ad} başlıyor`);
  ilkSeferOgret();
  sonrakiniTetikle();
}

// İlk oyunda kuralları bir kez gösterir
function ilkSeferOgret() {
  if (Kayit.oku("hd.ogretildi")) return;
  Kayit.yaz("hd.ogretildi", 1);
  nasilGoster();
}

function kayittanDevam() {
  const k = Kayit.oku("hd.kayit");
  if (!k || !k.d) return;
  U.seviye = k.seviye || "orta";
  const sv = SEVIYELER[U.seviye];
  oyunYukle("bot", bulmacaBul(k.d.b), k.d, 0, [benimAdim(), sv.ad], ["", sv.simge]);
  sonrakiniTetikle();
}

function kaydet() {
  if (U.mod === "bot") Kayit.yaz("hd.kayit", { d: U.d, seviye: U.seviye });
}

// ---------------------------------------------------------------- tahta

const KOSE_SVG = `<svg viewBox="0 0 120 96" aria-hidden="true"><g transform="rotate(-10 42 50)"><rect x="12" y="20" width="60" height="60" rx="13" fill="#EF5B4C"/></g><g transform="rotate(9 80 48)"><rect x="50" y="16" width="60" height="60" rx="13" fill="#1FA39A"/></g></svg>`;

// İpucu yazısının hücreye sığacağı punto sınıfı (0 = en büyük)
function yaziBoyu(metin, cift) {
  const enUzun = Math.max(...metin.split(/[\s;,]+/).map((w) => w.length));
  const kelimeye = enUzun <= 8 ? 0 : enUzun <= 9 ? 1 : enUzun <= 11 ? 2 : 3;
  const n = metin.length;
  const toplama = cift ? (n <= 9 ? 1 : n <= 20 ? 2 : 3) : n <= 18 ? 0 : n <= 26 ? 1 : 2;
  return Math.max(kelimeye, toplama);
}

function tahtaKur() {
  const B = U.B;
  const t = $("#tahta");
  t.style.setProperty("--sutun", B.w);
  t.style.setProperty("--satir", B.h);
  t.innerHTML = "";
  U.hucreEl = [];
  for (let i = 0; i < B.harf.length; i++) {
    let el;
    if (B.harf[i] !== null) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "hucre harf";
      el.dataset.i = i;
      el._tn = document.createTextNode("");
      el.appendChild(el._tn);
    } else if (i === 0) {
      el = document.createElement("div");
      el.className = "hucre kose";
      el.innerHTML = KOSE_SVG;
    } else {
      el = document.createElement("div");
      el.className = "hucre ipucu";
      const ks = B.ipucuHucre.get(i) || [];
      if (ks.length > 1) el.classList.add("cift");
      for (const kid of ks) {
        const k = B.kelimeler[kid];
        const ip = document.createElement("div");
        ip.className = "ip " + k.yon;
        ip.dataset.k = kid;
        if (k.emoji) {
          const s = document.createElement("span");
          s.className = "emo";
          s.textContent = k.emoji;
          ip.appendChild(s);
        } else {
          const y = document.createElement("span");
          y.className = "yazi";
          y.textContent = k.metin;
          ip.appendChild(y);
          ip.classList.add("u" + yaziBoyu(k.metin, ks.length > 1));
        }
        el.appendChild(ip);
      }
    }
    t.appendChild(el);
    U.hucreEl.push(el);
  }
}

function tahtaGuncelle() {
  const B = U.B;
  const aktif = U.aktif !== null ? new Set(B.kelimeler[U.aktif].hucreler) : new Set();
  for (let i = 0; i < B.harf.length; i++) {
    const el = U.hucreEl[i];
    if (B.harf[i] === null) continue;
    const s = U.gorunen[i];
    let harf = "";
    let sinif = "";
    if (U.bekleyen.has(i)) {
      harf = U.bekleyen.get(i);
      sinif = "gecici";
    } else if (U.gecici.has(i)) {
      harf = U.yuvalar[U.gecici.get(i)] || "";
      sinif = "gecici";
    } else if (s !== ".") {
      harf = B.harf[i];
      sinif = s === "x" ? "sx" : Number(s) === U.ben ? "s0" : "s1";
    }
    if (el._tn.nodeValue !== harf) el._tn.nodeValue = harf;
    for (const c of ["s0", "s1", "sx", "gecici"]) el.classList.toggle(c, c === sinif);
    el.classList.toggle("bos", harf === "");
    el.classList.toggle("kelimede", aktif.has(i));
    el.classList.toggle("secili", i === U.secili);
  }
  for (const ip of $("#tahta").querySelectorAll(".ip")) {
    ip.classList.toggle("aktif", Number(ip.dataset.k) === U.aktif);
  }
}

function hucreCanlandir(i, sinif, sure = 600) {
  const el = U.hucreEl[i];
  el.classList.remove(sinif);
  void el.offsetWidth;
  el.classList.add(sinif);
  setTimeout(() => el.classList.remove(sinif), sure);
}

function artiGoster(i, metin) {
  const el = U.hucreEl[i];
  const a = document.createElement("span");
  a.className = "arti";
  a.textContent = metin;
  el.classList.add("ustte");
  el.appendChild(a);
  setTimeout(() => {
    a.remove();
    el.classList.remove("ustte");
  }, 900);
}

// ---------------------------------------------------------------- seçim

function kareBosMu(i) {
  return U.gorunen[i] === "." && !U.gecici.has(i) && !U.bekleyen.has(i);
}

function kareSec(i, { degistir = true } = {}) {
  const B = U.B;
  const ks = B.hucreKelime.get(i) || [];
  let secim;
  if (U.secili === i && ks.length > 1 && degistir) {
    secim = ks.find((k) => k !== U.aktif);
  } else if (ks.includes(U.aktif)) {
    secim = U.aktif;
  } else {
    secim =
      ks.find((k) => B.kelimeler[k].yon === U.yon && !B.kelimeler[k].tek) ??
      ks.find((k) => !B.kelimeler[k].tek) ??
      ks[0];
  }
  U.secili = i;
  U.aktif = secim ?? null;
  if (secim !== undefined && secim !== null) U.yon = B.kelimeler[secim].yon;
}

function kelimeSec(kid) {
  const k = U.B.kelimeler[kid];
  U.aktif = kid;
  U.yon = k.yon;
  U.secili = k.hucreler.find((i) => kareBosMu(i)) ?? k.hucreler[0];
}

// İmleci etkin kelimede sıradaki boş kareye taşır
function imlecIlerle() {
  if (U.aktif === null || U.secili === null) return;
  const hs = U.B.kelimeler[U.aktif].hucreler;
  const yer = hs.indexOf(U.secili);
  const sonraki = hs.slice(yer + 1).find((i) => kareBosMu(i)) ?? hs.find((i) => kareBosMu(i));
  if (sonraki !== undefined) U.secili = sonraki;
}

// ---------------------------------------------------------------- ıstaka

function yuvaEsitle() {
  const hedef = U.d.istaka[U.ben].slice();
  for (let n = 0; n < U.yuvalar.length; n++) {
    const h = U.yuvalar[n];
    if (h === null) continue;
    const y = hedef.indexOf(h);
    if (y >= 0) hedef.splice(y, 1);
    else U.yuvalar[n] = null;
  }
  const yeni = [];
  for (let n = 0; n < U.yuvalar.length && hedef.length > 0; n++) {
    if (U.yuvalar[n] === null) {
      U.yuvalar[n] = hedef.shift();
      yeni.push(n);
    }
  }
  return yeni;
}

function yuvaKullanimda(n) {
  if (U.bekleyenYuva.has(n)) return true;
  for (const y of U.gecici.values()) if (y === n) return true;
  return false;
}

function istakaCiz(yeniYuvalar = []) {
  const el = $("#istaka");
  el.innerHTML = "";
  el.classList.toggle("pasif", !U.d || U.d.bitti);
  for (let n = 0; n < U.yuvalar.length; n++) {
    const yuva = document.createElement("div");
    yuva.className = "yuva";
    const h = U.yuvalar[n];
    if (h !== null && !yuvaKullanimda(n)) {
      const tas = document.createElement("button");
      tas.type = "button";
      tas.className = "tas";
      tas.dataset.n = n;
      tas.textContent = h;
      tas.setAttribute("aria-label", h + " harfi");
      if (U.silahli === n) tas.classList.add("silahli");
      if (yeniYuvalar.includes(n)) tas.classList.add("gir");
      yuva.appendChild(tas);
    }
    el.appendChild(yuva);
  }
}

function geciciKoy(n, i) {
  if (U.yuvalar[n] === null || yuvaKullanimda(n)) return false;
  if (U.gorunen[i] !== "." || U.bekleyen.has(i)) return false;
  U.gecici.delete(i);
  U.gecici.set(i, n);
  U.silahli = null;
  U.pasOnay = 0;
  Ses.koy();
  return true;
}

function geciciTemizle() {
  U.gecici.clear();
  U.silahli = null;
}

// Rakip hamlesinden sonra: dolan karelerdeki dizili harfleri ele geri al
function geciciAyikla() {
  for (const [i, n] of [...U.gecici]) {
    if (U.d.sahip[i] !== "." || U.yuvalar[n] === null) U.gecici.delete(i);
  }
}

// ---------------------------------------------------------------- çizim

function skorCiz(artan = -1) {
  const d = U.d;
  const sol = U.ben;
  const sag = 1 - U.ben;
  $("#ad-0").textContent = U.adlar[sol];
  $("#ad-1").textContent = U.adlar[sag];
  for (const [kutu, o] of [[0, sol], [1, sag]]) {
    const av = $("#avatar-" + kutu);
    if (U.simgeler[o]) {
      av.textContent = U.simgeler[o];
      av.classList.add("emoji");
    } else {
      av.textContent = (U.adlar[o] || "?").slice(0, 1).toLocaleUpperCase("tr");
      av.classList.remove("emoji");
    }
    const p = $("#puan-" + kutu);
    if (p.textContent !== String(d.puan[o])) {
      p.textContent = d.puan[o];
      if (o === artan) {
        p.classList.remove("artti");
        void p.offsetWidth;
        p.classList.add("artti");
      }
    }
    $("#oyuncu-" + kutu).classList.toggle("sirada", !d.bitti && d.sira === o);
  }
  $("#torba-say").textContent = d.torba.length;
}

function durumSeritCiz(ozel) {
  const el = $("#durum-serit");
  el.classList.remove("ben", "rakip");
  if (ozel) {
    el.textContent = ozel;
    return;
  }
  const d = U.d;
  document.title = !d.bitti && d.sira === U.ben && U.mod === "cevrim" ? `● Sıra sende — ${OYUN_ADI}` : OYUN_ADI;
  if (d.bitti) {
    el.textContent = "Oyun bitti";
  } else if (d.sira === U.ben) {
    el.classList.add("ben");
    el.textContent = U.gecici.size ? "Harflerini diz, hazır olunca Oyna'ya bas" : "Sıra sende — harflerini karelere diz";
  } else {
    el.classList.add("rakip");
    el.textContent = U.mod === "bot" ? `${U.adlar[1 - U.ben]} düşünüyor…` : `${U.adlar[1 - U.ben]} oynuyor… İstersen harflerini şimdiden diz`;
  }
}

function ipucuCubuguCiz() {
  const el = $("#ipucu-cubugu");
  if (U.aktif === null) {
    el.className = "ipucu-cubugu bos-mesaj";
    el.textContent = "Soruyu görmek için bir kareye ya da ipucuna dokun";
    return;
  }
  const k = U.B.kelimeler[U.aktif];
  el.className = "ipucu-cubugu";
  el.innerHTML = "";
  const yon = document.createElement("span");
  yon.className = "yon";
  yon.textContent = k.yon === "s" ? "→" : "↓";
  const metin = document.createElement("div");
  metin.className = "metin";
  if (k.emoji) {
    const e = document.createElement("span");
    e.className = "emo";
    e.textContent = k.emoji;
    metin.appendChild(e);
    const s = document.createElement("small");
    s.textContent = `Resimdeki ne? · ${k.hucreler.length} harf`;
    metin.appendChild(s);
  } else {
    metin.appendChild(document.createTextNode(k.metin));
    const s = document.createElement("small");
    s.textContent = k.tek ? "tek harf" : `${k.hucreler.length} harf`;
    metin.appendChild(s);
  }
  const kalip = document.createElement("div");
  kalip.className = "kalip" + (k.hucreler.length > 6 ? " uzun" : "");
  for (const i of k.hucreler) {
    const c = document.createElement("i");
    const acik = U.gorunen[i] !== ".";
    c.textContent = acik ? U.B.harf[i] : U.gecici.has(i) ? U.yuvalar[U.gecici.get(i)] : "";
    if (!acik) c.className = "bos";
    kalip.appendChild(c);
  }
  el.append(yon, metin, kalip);
}

function eylemCiz() {
  const d = U.d;
  const tur = $("#btn-tur");
  const benim = benimSiram() && !U.kilit;
  tur.classList.remove("bitir");
  if (d.bitti) {
    tur.disabled = false;
    tur.textContent = U.mod === "bot" ? "Yeni oyun" : "Rövanş";
    tur.classList.add("bitir");
  } else if (U.gecici.size > 0) {
    tur.disabled = !benim;
    tur.textContent = `Oyna · ${U.gecici.size} harf`;
    tur.classList.add("bitir");
  } else {
    tur.disabled = !benim;
    tur.textContent = U.pasOnay && Date.now() < U.pasOnay ? "Pas geçilsin mi?" : "Pas";
  }
  $("#btn-degistir").disabled = !benim || d.torba.length === 0;
  $("#btn-ipucu").disabled = !benim || d.ipucu[U.ben] <= 0;
  $("#ipucu-say").textContent = d.ipucu[U.ben];
  $("#btn-ses").classList.toggle("kapali", !Ses.acikMi());
}

function hepsiniCiz(yeniYuvalar) {
  tahtaGuncelle();
  istakaCiz(yeniYuvalar);
  skorCiz();
  durumSeritCiz();
  ipucuCubuguCiz();
  eylemCiz();
}

// ---------------------------------------------------------------- hamleler

async function turOyna() {
  if (!benimSiram() || U.kilit) return;
  if (U.gecici.size === 0) {
    if (!(U.pasOnay && Date.now() < U.pasOnay)) {
      U.pasOnay = Date.now() + 2600;
      eylemCiz();
      setTimeout(() => {
        if (U.pasOnay && Date.now() >= U.pasOnay) {
          U.pasOnay = 0;
          if (U.d && !U.kilit) eylemCiz();
        }
      }, 2700);
      return;
    }
  }
  U.pasOnay = 0;
  const hamleler = [...U.gecici].map(([i, n]) => ({ i, h: U.yuvalar[n] }));
  const r = M.oyna(U.d, U.B, U.ben, hamleler);
  if (!r) {
    geciciTemizle();
    hepsiniCiz();
    return;
  }
  await durumIlerlet(r.d, "yerel");
}

async function harfDegistir() {
  if (!benimSiram() || U.kilit) return;
  const onay = await katmanAc(`
    <h2>Harfleri değiştir</h2>
    <p>Elindeki harfler torbaya döner, yenilerini çekersin. Bu turda harf koyamazsın ve sıra rakibe geçer.</p>
    <div class="dugmeler">
      <button class="dugme birincil genis" data-deger="evet" type="button">Değiştir ve sırayı ver</button>
      <button class="dugme ikincil genis" data-deger="hayir" type="button">Vazgeç</button>
    </div>`);
  if (onay !== "evet" || !benimSiram() || U.kilit) return;
  geciciTemizle();
  const r = M.degistir(U.d, U.B, U.ben);
  if (r) await durumIlerlet(r.d, "yerel");
}

function ipucuAl() {
  if (!benimSiram() || U.kilit) return;
  const kullanilan = [...U.gecici.values()].map((n) => U.yuvalar[n]);
  const r = M.ipucuKullan(U.d, U.B, U.ben, kullanilan, new Set(U.gecici.keys()));
  if (!r) {
    bildir("Elindeki boştaki harfler için gösterecek yer kalmadı");
    return;
  }
  U.d = r.d;
  kaydet();
  const n = U.yuvalar.findIndex((h, y) => h === r.s.h && !yuvaKullanimda(y));
  if (n >= 0 && geciciKoy(n, r.s.i)) {
    kareSec(r.s.i, { degistir: false });
    hepsiniCiz();
    hucreCanlandir(r.s.i, "goster", 2400);
    bildir(`İpucu: ${r.s.h} harfi buraya`, "iyi");
  } else {
    hepsiniCiz();
  }
}

// Yeni durumu canlandırarak uygular. kaynak: "yerel" | "bot" | "uzak"
async function durumIlerlet(yeni, kaynak) {
  const no = U.oyunNo;
  const eski = U.d;
  U.d = yeni;
  U.kilit = true;
  kaydet();
  if (kaynak === "yerel" && U.mod === "cevrim") gonder();
  const olay = yeni.olay || {};
  const benYaptim = olay.o === U.ben;

  const kareYuva = new Map(U.gecici);
  if (benYaptim) {
    // dizili harfler doğrulanana dek tahtada bekler
    U.bekleyen = new Map((olay.konan || []).map((m) => [m.i, m.h]));
    U.bekleyenYuva = new Set((olay.konan || []).map((m) => kareYuva.get(m.i)).filter((n) => n !== undefined));
    U.gecici.clear();
    U.silahli = null;
  } else {
    geciciAyikla();
  }
  U.gorunen = eski.sahip;
  tahtaGuncelle();
  istakaCiz();
  eylemCiz();
  durumSeritCiz(benYaptim ? "Harflerin denetleniyor…" : null);

  if (olay.tip === "oyna") {
    for (const m of olay.konan) {
      await bekle(benYaptim ? 380 : 520);
      if (no !== U.oyunNo) return;
      U.bekleyen.delete(m.i);
      if (m.d) {
        U.gorunen = U.gorunen.slice(0, m.i) + String(olay.o) + U.gorunen.slice(m.i + 1);
        tahtaGuncelle();
        hucreCanlandir(m.i, "yeni", 400);
        artiGoster(m.i, "+1");
        Ses.koy();
      } else {
        tahtaGuncelle();
        U.hucreEl[m.i]._tn.nodeValue = m.h;
        hucreCanlandir(m.i, "yanlis", 520);
        artiGoster(m.i, "−1");
        Ses.hata();
        if (benYaptim) titret(120);
        await bekle(520);
        if (no !== U.oyunNo) return;
        tahtaGuncelle();
        if (benYaptim && kareYuva.has(m.i)) {
          // yanlış harf ele geri döner
          U.bekleyenYuva.delete(kareYuva.get(m.i));
          istakaCiz([kareYuva.get(m.i)]);
        }
      }
    }
    const dogru = olay.konan.filter((m) => m.d).length;
    const yanlis = olay.konan.length - dogru;
    const kelimeSay = (olay.kelime || []).length;
    if (kelimeSay) {
      await bekle(250);
      if (no !== U.oyunNo) return;
      for (const kid of olay.kelime) {
        for (const i of U.B.kelimeler[kid].hucreler) hucreCanlandir(i, "parla", 900);
      }
      Ses.kelime();
    }
    const puanYazi = (olay.kazanc > 0 ? "+" : olay.kazanc < 0 ? "−" : "") + Math.abs(olay.kazanc) + " puan";
    const kim = benYaptim ? "" : `${U.adlar[olay.o]}: `;
    if (olay.besli) bildir(`${kim}Beşli! ${puanYazi}`, "altin");
    else if (kelimeSay) bildir(`${kim}${kelimeSay > 1 ? kelimeSay + " kelime" : "Kelime"} tamam! ${puanYazi}`, "altin");
    else if (dogru === 0 && yanlis > 0) bildir(benYaptim ? `Tutmadı (${puanYazi})` : `${U.adlar[olay.o]} tutturamadı`, benYaptim ? "kotu" : "");
    else bildir(`${kim}${puanYazi}`, benYaptim ? "iyi" : "");
  } else if (olay.tip === "pas") {
    bildir(benYaptim ? "Pas geçtin" : `${U.adlar[olay.o]} pas geçti`);
    await bekle(350);
  } else if (olay.tip === "degistir") {
    bildir(benYaptim ? "Harflerin yenilendi" : `${U.adlar[olay.o]} harflerini değiştirdi`);
    await bekle(350);
  }
  if (no !== U.oyunNo) return;

  U.bekleyen.clear();
  U.bekleyenYuva.clear();
  U.gorunen = yeni.sahip;
  const yeniYuvalar = yuvaEsitle();
  geciciAyikla();
  if (U.secili !== null && !kareBosMu(U.secili)) imlecIlerle();
  U.kilit = false;
  tahtaGuncelle();
  istakaCiz(yeniYuvalar);
  skorCiz(olay.o);
  durumSeritCiz();
  ipucuCubuguCiz();
  eylemCiz();

  if (yeni.bitti) {
    if (yeni.tikandi) bildir("Oyun tıkandı — kalan harfler açıldı");
    await bekle(900);
    if (no === U.oyunNo) sonucGoster();
    return;
  }
  if (!benYaptim && yeni.sira === U.ben) {
    Ses.sira();
    titret(40);
  }
  sonrakiniTetikle();
}

function sonrakiniTetikle() {
  if (U.mod === "bot" && U.d && !U.d.bitti && U.d.sira !== U.ben && !U.botCalisiyor) botOyna(U.oyunNo);
}

async function botOyna(no) {
  U.botCalisiyor = true;
  try {
    await bekle(1100 + Math.random() * 1100);
    while (U.kilit && no === U.oyunNo) await bekle(120);
    if (no !== U.oyunNo || U.mod !== "bot" || U.d.bitti || U.d.sira === U.ben) return;
    const o = 1 - U.ben;
    const k = botKarari(U.d, U.B, o, U.seviye);
    const r = (k.tip === "degistir" && M.degistir(U.d, U.B, o)) || M.oyna(U.d, U.B, o, k.hamleler || []);
    U.botCalisiyor = false;
    if (r) await durumIlerlet(r.d, "bot");
  } finally {
    U.botCalisiyor = false;
  }
}

// ---------------------------------------------------------------- sonuç

async function sonucGoster({ say = true } = {}) {
  const d = U.d;
  const kz = M.kazanan(d);
  const ben = U.ben;
  const durum = kz === -1 ? "berabere" : kz === ben ? "kazandin" : "kaybettin";
  if (say && U.sonucNo !== U.oyunNo) {
    U.sonucNo = U.oyunNo;
    const ist = Kayit.oku("hd.istatistik", { oyun: 0, galibiyet: 0, enYuksek: 0 });
    ist.oyun += 1;
    if (durum === "kazandin") ist.galibiyet += 1;
    ist.enYuksek = Math.max(ist.enYuksek, d.puan[ben]);
    Kayit.yaz("hd.istatistik", ist);
    if (U.mod === "bot") Kayit.sil("hd.kayit");
    if (durum === "kazandin") Ses.kazan();
    else if (durum === "kaybettin") Ses.kaybet();
  }
  const baslik = { kazandin: "Kazandın!", kaybettin: "Bu sefer olmadı", berabere: "Berabere!" }[durum];
  const simge = { kazandin: "🏆", kaybettin: "🙃", berabere: "🤝" }[durum];
  const secim = await katmanAc(`
    <div class="sonuc">
      <div class="buyuk">${simge}</div>
      <h2>${baslik}</h2>
      <div class="sonuc-skor">
        <div class="taraf ${kz === ben ? "kazanan" : ""}"><b>${d.puan[ben]}</b><span>${kacis(U.adlar[ben])}</span></div>
        <div class="ayrac">–</div>
        <div class="taraf ${kz === 1 - ben ? "kazanan" : ""}"><b>${d.puan[1 - ben]}</b><span>${kacis(U.adlar[1 - ben])}</span></div>
      </div>
      <div class="dugmeler">
        <button class="dugme birincil genis" data-deger="yeni" type="button">${U.mod === "bot" ? "Yeni oyun" : "Rövanş"}</button>
        <button class="dugme ikincil genis" data-deger="tahta" type="button">Tahtaya bak</button>
        <button class="dugme ikincil genis" data-deger="ana" type="button">Ana menü</button>
      </div>
    </div>`);
  if (secim === "yeni") yeniOyunIste();
  else if (secim === "ana") anaEkranaDon();
}

function yeniOyunIste() {
  if (U.mod === "bot") botOyunuBaslat();
  else if (U.mod === "cevrim") rovans();
}

// ---------------------------------------------------------------- arkadaşla canlı oyun

function cevrimDurdur() {
  if (U.cevrim) {
    clearTimeout(U.cevrim.zamanlayici);
    U.cevrim.durdu = true;
  }
  U.cevrim = null;
}

function lobiCiz(kod, mesaj) {
  $("#lobi-kod").textContent = kod || "·····";
  $("#lobi-durum").textContent = mesaj;
  const hazir = !!kod;
  for (const id of ["#btn-whatsapp", "#btn-paylas", "#btn-kopyala"]) $(id).hidden = !hazir;
  $("#btn-paylas").hidden = !hazir || !navigator.share;
  if (hazir) $("#btn-whatsapp").href = whatsappBaglantisi(kod, benimAdim());
}

async function odaKur() {
  if (!U.ad) {
    await adSor();
    if (!U.ad) return;
  }
  cevrimDurdur();
  U.oyunNo++;
  ekranGoster("lobi");
  lobiCiz("", "Oda kuruluyor…");
  const b = bulmacaSec();
  const d = M.yeniDurum(M.bulmacaHazirla(b), Math.random() < 0.5 ? 0 : 1);
  let r;
  try {
    r = await Oda.kur(U.ad, d);
  } catch (e) {
    lobiCiz("", sunucuHataMetni(e));
    return;
  }
  odaKaydet(r.kod, { oyuncu: 0, anahtar: r.anahtar });
  U.cevrim = { kod: r.kod, oyuncu: 0, anahtar: r.anahtar, v: r.v, hataSay: 0 };
  lobiCiz(r.kod, "Bağlantıyı arkadaşına gönder. O dokununca oyun başlar. İkiniz de oyun sekmesini açık tutun.");
  lobiYokla(U.cevrim);
}

function sunucuHataMetni(e) {
  if (e && e.kod === 0) return e.message || "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip yeniden dene.";
  if (e && e.sunucuYok) {
    return "Canlı oyun bağlantısı kurulamadı. Oyunu yenileyip yeniden dene.";
  }
  return (e && e.message) || "Bir şeyler ters gitti, yeniden dene.";
}

async function lobiYokla(c) {
  if (c.durdu || U.cevrim !== c) return;
  try {
    const r = await Oda.getir(c.kod, c.oyuncu, c.anahtar, c.v, 1);
    if (c.durdu || U.cevrim !== c) return;
    if (!r.ayni && r.oyuncular && r.oyuncular.length === 2) {
      cevrimOyunuAc(c, r);
      return;
    }
  } catch {
    /* geçici hata: yeniden denenecek */
  }
  c.zamanlayici = setTimeout(() => lobiYokla(c), document.hidden ? 4000 : 2000);
}

function cevrimOyunuAc(c, r) {
  c.v = r.v;
  U.cevrim = c;
  oyunYukle("cevrim", bulmacaBul(r.durum.b), r.durum, c.oyuncu, [r.oyuncular[0], r.oyuncular[1] || "Rakip"], ["", ""]);
  bildir(r.durum.bitti ? "Oyun bitmiş" : r.durum.sira === c.oyuncu ? "Sıra sende" : `Sıra ${U.adlar[1 - c.oyuncu]} oyuncusunda`);
  if (!r.durum.bitti) ilkSeferOgret();
  clearTimeout(c.zamanlayici);
  c.zamanlayici = setTimeout(() => yokla(c), 1200);
  if (r.durum.bitti) sonucGoster({ say: false });
}

async function odayaBaglan(kod) {
  kod = String(kod || "").toUpperCase().trim();
  if (!kod) return;
  const eski = odaOku(kod);
  if (!eski && !U.ad) {
    await adSor();
    if (!U.ad) {
      anaEkranaDon();
      return;
    }
  }
  cevrimDurdur();
  U.oyunNo++;
  ekranGoster("lobi");
  lobiCiz("", "Odaya bağlanılıyor…");
  $("#lobi-kod").textContent = kod;
  let r;
  try {
    r = await Oda.katil(kod, benimAdim(), eski ? eski.anahtar : undefined);
  } catch (e) {
    if (e.kod === 404 || e.kod === 409 || e.kod === 400) sonOdaSil();
    const secim = await katmanAc(`
      <h2>Odaya girilemedi</h2>
      <p>${kacis(sunucuHataMetni(e))}</p>
      <div class="dugmeler"><button class="dugme birincil genis" data-deger="ana" type="button">Ana menü</button></div>`);
    void secim;
    anaEkranaDon();
    return;
  }
  odaKaydet(kod, { oyuncu: r.oyuncu, anahtar: r.anahtar });
  const c = { kod, oyuncu: r.oyuncu, anahtar: r.anahtar, v: r.v, hataSay: 0 };
  U.cevrim = c;
  if (r.oyuncular.length < 2) {
    lobiCiz(kod, "Bağlantıyı arkadaşına gönder. O dokununca oyun başlar.");
    lobiYokla(c);
  } else {
    cevrimOyunuAc(c, r);
  }
}

// Hamleyi sunucuya yazar; başarısız olursa yoklama döngüsü yeniden dener.
async function gonder() {
  const c = U.cevrim;
  if (!c) return;
  c.bekleyenDurum = U.d;
  if (c.yaziyor) return;
  c.yaziyor = true;
  try {
    while (c.bekleyenDurum && !c.durdu) {
      const durum = c.bekleyenDurum;
      try {
        const r = await Oda.yaz(c.kod, c.oyuncu, c.anahtar, c.v, durum);
        c.v = r.v;
        c.hataSay = 0;
        if (c.bekleyenDurum === durum) c.bekleyenDurum = null;
      } catch (e) {
        if (e.cakisma) {
          // sunucudaki durum daha yeni: onu benimse
          c.bekleyenDurum = null;
          c.v = -1;
          break;
        }
        c.hataSay++;
        if (c.hataSay === 3) bildir("Bağlantı zayıf, hamlen yeniden gönderiliyor…", "kotu");
        await bekle(Math.min(6000, 900 * c.hataSay));
      }
    }
  } finally {
    c.yaziyor = false;
  }
}

async function yokla(c) {
  if (c.durdu || U.cevrim !== c) return;
  let gecikme = U.d && U.d.sira === U.ben && !U.d.bitti ? 4000 : 1500;
  if (document.hidden) gecikme = 6000;
  try {
    if (!c.yaziyor && !c.bekleyenDurum && !U.kilit) {
      const r = await Oda.getir(c.kod, c.oyuncu, c.anahtar, c.v, 2);
      c.hataSay = 0;
      if (c.durdu || U.cevrim !== c) return;
      if (!r.ayni && r.v > c.v && !c.yaziyor && !c.bekleyenDurum && !U.kilit && r.durum) {
        c.v = r.v;
        if (r.oyuncular && r.oyuncular.length === 2) U.adlar = [r.oyuncular[0], r.oyuncular[1]];
        await uzakDurum(r.durum);
      }
    }
  } catch (e) {
    c.hataSay++;
    if (c.hataSay >= 3) durumSeritCiz("Bağlantı bekleniyor…");
  }
  if (c.durdu || U.cevrim !== c) return;
  c.zamanlayici = setTimeout(() => yokla(c), gecikme);
}

async function uzakDurum(d) {
  const yeniOyun = d.b !== U.d.b || (d.olay && d.olay.tip === "basla" && (U.d.bitti || d.tur < U.d.tur));
  if (yeniOyun) {
    if (katmanKapat) katmanKapat(null);
    const c = U.cevrim;
    oyunYukle("cevrim", bulmacaBul(d.b), d, U.ben, U.adlar, ["", ""]);
    U.cevrim = c;
    bildir("Yeni oyun başladı!", "iyi");
    return;
  }
  if (JSON.stringify(d) === JSON.stringify(U.d)) return;
  await durumIlerlet(d, "uzak");
}

function rovans() {
  const c = U.cevrim;
  if (!c) return;
  const b = bulmacaSec();
  // kaybeden başlar; beraberlikte sıra değişir
  const kz = M.kazanan(U.d);
  const baslayan = kz === -1 ? 1 - (U.d.olay ? U.d.olay.o : 0) : 1 - kz;
  const d = M.yeniDurum(M.bulmacaHazirla(b), baslayan);
  oyunYukle("cevrim", b, d, U.ben, U.adlar, ["", ""]);
  U.cevrim = c;
  gonder();
  bildir("Rövanş başladı!", "iyi");
}

// ---------------------------------------------------------------- olaylar

function tahtaDokun(e) {
  if (U.kilit || !U.d) return;
  const ip = e.target.closest(".ip");
  if (ip) {
    kelimeSec(Number(ip.dataset.k));
    hepsiniCiz();
    return;
  }
  const h = e.target.closest(".hucre.harf");
  if (!h) return;
  const i = Number(h.dataset.i);
  if (U.gecici.has(i)) {
    // dizili harfi ele geri al
    U.gecici.delete(i);
    kareSec(i, { degistir: false });
    hepsiniCiz();
    return;
  }
  if (U.silahli !== null && kareBosMu(i) && !U.d.bitti) {
    if (geciciKoy(U.silahli, i)) {
      kareSec(i, { degistir: false });
      imlecIlerle();
    }
    hepsiniCiz();
    return;
  }
  kareSec(i);
  hepsiniCiz();
}

function tasDokun(n) {
  if (U.kilit || !U.d || U.d.bitti) return;
  if (U.secili !== null && kareBosMu(U.secili)) {
    if (geciciKoy(n, U.secili)) imlecIlerle();
    hepsiniCiz();
    return;
  }
  U.silahli = U.silahli === n ? null : n;
  hepsiniCiz();
}

// Taşı sürükleyip bırakma (dokunma ve fare)
const surukle = { n: null, basX: 0, basY: 0, aktif: false, tasEl: null };

function istakaBas(e) {
  const tas = e.target.closest(".tas");
  if (!tas || U.kilit || !U.d || U.d.bitti) return;
  surukle.n = Number(tas.dataset.n);
  surukle.basX = e.clientX;
  surukle.basY = e.clientY;
  surukle.aktif = false;
  surukle.tasEl = tas;
}

function istakaOynat(e) {
  if (surukle.n === null) return;
  const dx = e.clientX - surukle.basX;
  const dy = e.clientY - surukle.basY;
  const hayalet = $("#suruklenen");
  if (!surukle.aktif && Math.hypot(dx, dy) > 9) {
    surukle.aktif = true;
    hayalet.textContent = U.yuvalar[surukle.n];
    hayalet.hidden = false;
    surukle.tasEl.classList.add("gizli");
  }
  if (surukle.aktif) {
    hayalet.style.left = e.clientX + "px";
    hayalet.style.top = e.clientY + "px";
    e.preventDefault();
  }
}

function istakaBirak(e) {
  if (surukle.n === null) return;
  const n = surukle.n;
  const aktifti = surukle.aktif;
  surukle.n = null;
  surukle.aktif = false;
  $("#suruklenen").hidden = true;
  if (surukle.tasEl) surukle.tasEl.classList.remove("gizli");
  if (e.type === "pointercancel") return;
  if (!aktifti) {
    tasDokun(n);
    return;
  }
  const hedef = document.elementFromPoint(e.clientX, e.clientY - 20);
  const h = hedef && hedef.closest ? hedef.closest(".hucre.harf") : null;
  if (h) {
    const i = Number(h.dataset.i);
    if (kareBosMu(i) && geciciKoy(n, i)) kareSec(i, { degistir: false });
  }
  hepsiniCiz();
}

function baglantiKopyala() {
  const url = davetBaglantisi(U.cevrim.kod);
  const tamam = () => bildir("Bağlantı kopyalandı", "iyi");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(tamam, () => bildir(url));
  } else {
    bildir(url);
  }
}

function olaylariBagla() {
  $("#btn-ad").onclick = adSor;
  $("#seviyeler").onclick = (e) => {
    const b = e.target.closest(".seviye");
    if (!b) return;
    U.seviye = b.dataset.seviye;
    Kayit.yaz("hd.seviye", U.seviye);
    anaCiz();
  };
  $("#btn-bot").onclick = botOyunuBaslat;
  $("#btn-devam").onclick = kayittanDevam;
  $("#btn-arkadas").onclick = odaKur;
  $("#btn-odaya-don").onclick = () => odayaBaglan(sonOda());
  $("#btn-nasil").onclick = nasilGoster;
  $("#btn-yardim").onclick = nasilGoster;
  $("#btn-yukle").onclick = telefonaKur;
  $("#btn-oyunu-paylas").onclick = oyunuPaylas;
  $("#btn-geri").onclick = anaEkranaDon;
  $("#btn-lobi-geri").onclick = anaEkranaDon;
  $("#btn-ses").onclick = () => {
    Ses.degistir();
    eylemCiz();
  };
  $("#btn-tur").onclick = () => {
    if (U.d && U.d.bitti) yeniOyunIste();
    else turOyna();
  };
  $("#btn-degistir").onclick = harfDegistir;
  $("#btn-ipucu").onclick = ipucuAl;
  $("#tahta").addEventListener("click", tahtaDokun);
  const ist = $("#istaka");
  ist.addEventListener("pointerdown", istakaBas);
  window.addEventListener("pointermove", istakaOynat, { passive: false });
  window.addEventListener("pointerup", istakaBirak);
  window.addEventListener("pointercancel", istakaBirak);
  $("#btn-paylas").onclick = () => {
    if (!U.cevrim) return;
    navigator
      .share({ title: OYUN_ADI, text: davetMetni(benimAdim()), url: davetBaglantisi(U.cevrim.kod) })
      .catch(() => {});
  };
  $("#btn-kopyala").onclick = baglantiKopyala;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    U.kurulum = e;
    anaCiz();
  });
  window.addEventListener("appinstalled", () => {
    U.kurulum = null;
    if (katmanKapat) katmanKapat(null);
    bildir("Kuruldu! Ana ekranındaki simgeden açabilirsin", "iyi");
    anaCiz();
  });
  window.addEventListener("popstate", () => {
    if (katmanKapat) {
      // açık pencere varsa önce o kapanır
      katmanKapat(null);
      if (!$("#ekran-ana").hidden) return;
      history.pushState({ hd: 1 }, "");
      return;
    }
    if ($("#ekran-ana").hidden) anaEkranaDon();
    else if (location.search) history.replaceState(null, "", location.pathname);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("#ekran-oyun").hidden) uyanikTut();
    const c = U.cevrim;
    if (!document.hidden && c && U.mod === "cevrim") {
      clearTimeout(c.zamanlayici);
      yokla(c);
    }
  });
}

function basla() {
  olaylariBagla();
  anaCiz();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || new URLSearchParams(location.search).has("sw"))) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  const kod = new URLSearchParams(location.search).get("oda");
  if (kod) odayaBaglan(kod);
}

basla();

// Otomatik sınamalar için küçük bir pencere
window.__hd = { U, M };
