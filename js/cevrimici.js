// Harf Düellosu — statik yayında şifreli canlı oda.
// Kurucu sürümü ve hamleleri doğrular; oyuncu anahtarları cihazda üretilir.
import * as M from "./motor.js";
import { BULMACALAR } from "./bulmacalar.js";

const ALFABE = "ABCDEFGHJKLMNPRSTUVYZ23456789";
const ANAHTAR = "hd.oda.";
const EV_KAYDI = "hd.relay.host.";
const MISAFIR_ADAY = "hd.relay.guest.";
const OMUR = 3 * 24 * 3600 * 1000;
const SURE = 28000;
const bulmacalar = new Map(BULMACALAR.map(b => [b.id, M.bulmacaHazirla(b)]));
const misafirAdaylar = new Map();
let oturum = null;

export class OdaHatasi extends Error {
  constructor(mesaj, kod = 0, govde = {}) {
    super(mesaj);
    this.kod = kod;
    this.govde = govde && typeof govde === "object" && !Array.isArray(govde) ? govde : {};
    this.cakisma = !!this.govde.cakisma;
  }
}

const kopya = value => JSON.parse(JSON.stringify(value));
const tam = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const kodGecerli = kod => typeof kod === "string" && kod.length === 5 && [...kod].every(c => ALFABE.includes(c));
const odaKimligi = kod => "harf-duellosu-relay-v1-" + kod;
function rastgele(n, alfabe = "0123456789abcdef") {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, b => alfabe[b % alfabe.length]).join("");
}
function adTemizle(ad) {
  return (typeof ad === "string" ? ad : "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) || "Oyuncu";
}
function sirali(value) {
  if (Array.isArray(value)) return value.map(sirali);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, sirali(value[k])]));
  return value;
}
function ayni(a, b) { return JSON.stringify(sirali(a)) === JSON.stringify(sirali(b)); }
function normal(d) { return { ...d, tikandi: !!d.tikandi }; }

// Ağdan gelen veri arayüze ya da motora girmeden önce denetlenir.
function durumGecerli(d) {
  try {
    if (!d || typeof d !== "object" || Array.isArray(d) || JSON.stringify(d).length > 12000) return false;
    const izin = ["b", "sahip", "torba", "istaka", "puan", "sira", "turKonan", "pas", "ipucu", "bitti", "tur", "olay", "tikandi"];
    if (Object.keys(d).some(k => !izin.includes(k))) return false;
    const B = bulmacalar.get(d.b);
    if (!B || typeof d.sahip !== "string" || d.sahip.length !== B.harf.length) return false;
    for (let i = 0; i < B.harf.length; i++) {
      if (B.harf[i] === null ? d.sahip[i] !== "#" : !".01x".includes(d.sahip[i])) return false;
    }
    const harfler = v => Array.isArray(v) && v.length <= B.harf.length && v.every(h => typeof h === "string" && /^[A-ZÇĞİÖŞÜ]$/.test(h));
    if (!harfler(d.torba) || !Array.isArray(d.istaka) || d.istaka.length !== 2 || !d.istaka.every(v => harfler(v) && v.length <= 5)) return false;
    if (!Array.isArray(d.puan) || d.puan.length !== 2 || !d.puan.every(n => tam(n, 0, 10000))) return false;
    if (!Array.isArray(d.ipucu) || d.ipucu.length !== 2 || !d.ipucu.every(n => tam(n, 0, M.IPUCU_HAKKI))) return false;
    if (!tam(d.sira, 0, 1) || !tam(d.tur, 1, 10000) || !tam(d.pas, 0, M.PAS_SINIRI) || d.turKonan !== 0 || typeof d.bitti !== "boolean") return false;
    if (d.tikandi !== undefined && typeof d.tikandi !== "boolean") return false;
    if (!d.bitti && !d.sahip.includes(".")) return false;
    const e = d.olay;
    if (!e || typeof e !== "object" || !tam(e.n, 0, 10000) || !tam(e.o, 0, 1) || !["basla", "oyna", "pas", "degistir"].includes(e.tip)) return false;
    if (Object.keys(e).some(k => !["n", "tip", "o", "konan", "kelime", "kazanc", "besli"].includes(k))) return false;
    if (e.tip === "oyna" || e.tip === "pas") {
      if (!Array.isArray(e.konan) || e.konan.length > 5 || !e.konan.every(m => m && tam(m.i, 0, B.harf.length - 1) && B.harf[m.i] !== null && typeof m.h === "string" && /^[A-ZÇĞİÖŞÜ]$/.test(m.h) && (m.d === 0 || m.d === 1) && Object.keys(m).every(k => ["i", "h", "d"].includes(k)))) return false;
      if (!Array.isArray(e.kelime) || !e.kelime.every(n => tam(n, 0, B.kelimeler.length - 1)) || !tam(e.kazanc, -5, 10000) || typeof e.besli !== "boolean") return false;
      if ((e.tip === "pas") !== (e.konan.length === 0)) return false;
    }
    return M.tutarliMi(d, B);
  } catch { return false; }
}

function baslangicGecerli(d) {
  return durumGecerli(d) && !d.bitti && !d.tikandi && d.tur === 1 && d.pas === 0 &&
    d.puan.every(n => n === 0) && d.ipucu.every(n => n === M.IPUCU_HAKKI) &&
    d.olay.tip === "basla" && d.olay.n === 0 && d.olay.o === d.sira &&
    !/[01]/.test(d.sahip) && [...d.sahip].filter(c => c === "x").length === M.ACILIS_HARFI;
}

function gecisGecerli(eski, yeni, oyuncu) {
  if (!durumGecerli(yeni)) return false;
  if (eski.bitti) {
    const kazanan = M.kazanan(eski);
    const baslayan = kazanan === -1 ? 1 - eski.olay.o : 1 - kazanan;
    return baslangicGecerli(yeni) && yeni.sira === baslayan;
  }
  if (eski.sira !== oyuncu || eski.b !== yeni.b || yeni.ipucu[1 - oyuncu] !== eski.ipucu[1 - oyuncu] || yeni.ipucu[oyuncu] > eski.ipucu[oyuncu]) return false;
  const B = bulmacalar.get(eski.b);
  const taban = { ...kopya(eski), ipucu: yeni.ipucu.slice() };
  let beklenen;
  if (yeni.olay.tip === "oyna" || yeni.olay.tip === "pas") {
    beklenen = M.oyna(taban, B, oyuncu, yeni.olay.konan.map(m => ({ i: m.i, h: m.h })));
  } else if (yeni.olay.tip === "degistir") {
    beklenen = M.degistir(taban, B, oyuncu, () => 0.5);
    if (beklenen) {
      // Karıştırmanın her olası sırası geçerlidir; diğer oyuncunun eli değişemez.
      beklenen.d.torba = yeni.torba.slice();
      beklenen.d.istaka[oyuncu] = yeni.istaka[oyuncu].slice();
      const toplam = taban.torba.length + taban.istaka[oyuncu].length;
      if (yeni.istaka[oyuncu].length !== Math.min(5, toplam)) return false;
    }
  }
  return !!beklenen && ayni(normal(beklenen.d), normal(yeni));
}

function disaAc(k) { return kopya({ v: k.v, ts: k.ts, oyuncular: k.oyuncular.map(o => o.ad), durum: k.durum }); }
function kaydiSakla(s) {
  try { localStorage.setItem(EV_KAYDI + s.kod, JSON.stringify(s.k)); } catch { /* oturum açıkken oyun sürer */ }
}
function evKaydi(kod, anahtar) {
  try {
    const k = JSON.parse(localStorage.getItem(EV_KAYDI + kod) || "null");
    if (!k || k.oyuncular?.[0]?.anahtar !== anahtar || Date.now() - k.ts > OMUR || !durumGecerli(k.durum)) return null;
    if (!tam(k.v, 1, 100000) || !Array.isArray(k.oyuncular) || k.oyuncular.length < 1 || k.oyuncular.length > 2 || !k.oyuncular.every(o => typeof o.ad === "string" && /^[a-f0-9]{40}$/.test(o.anahtar))) return null;
    return k;
  } catch { return null; }
}

let varlik = null;
try {
  if (typeof BroadcastChannel !== "undefined") {
    varlik = new BroadcastChannel("hd-relay-presence-v1");
    varlik.addEventListener("message", e => {
      if (e.data?.tip === "soru" && oturum?.ev && oturum.kod === e.data.kod && !oturum.kapali) varlik.postMessage({ tip: "yanit", id: e.data.id });
    });
  }
} catch { /* eski tarayıcı */ }
async function baskaSekme(kod) {
  if (!varlik) return false;
  const id = rastgele(24);
  return new Promise(resolve => {
    const yanit = e => { if (e.data?.tip === "yanit" && e.data.id === id) bitir(true); };
    const zaman = setTimeout(() => bitir(false), 180);
    function bitir(v) { clearTimeout(zaman); varlik.removeEventListener("message", yanit); resolve(v); }
    varlik.addEventListener("message", yanit);
    varlik.postMessage({ tip: "soru", kod, id });
  });
}

function durdur() {
  const s = oturum;
  if (!s) return;
  s.kapali = true;
  clearTimeout(s.yeniden);
  for (const p of s.bekleyen?.values() || []) { clearTimeout(p.zaman); p.red(new OdaHatasi("Oda bağlantısı değişti", 0)); }
  s.peer?.destroy();
  oturum = null;
}
function peerAc(s, id) {
  if (typeof globalThis.Peer !== "function" || !crypto.subtle) throw new OdaHatasi("Canlı oyun için oyunu HTTPS bağlantısıyla aç", 0);
  s.peer = id ? new globalThis.Peer(id, { debug: 0 }) : new globalThis.Peer({ debug: 0 });
  return new Promise((resolve, reject) => {
    const zaman = setTimeout(() => reject(new OdaHatasi("İnternete ulaşılamadı, yeniden dene", 0)), SURE);
    s.peer.on("open", () => { clearTimeout(zaman); resolve(); });
    s.peer.on("error", () => { clearTimeout(zaman); reject(new OdaHatasi("İnternete ulaşılamadı, yeniden dene", 0)); });
  });
}

function evIsle(s, g) {
  const k = s.k;
  if (g.a === "katil") {
    let oyuncu = k.oyuncular.findIndex(o => g.anahtar && o.anahtar === g.anahtar);
    if (oyuncu < 0) {
      if (k.oyuncular.length >= 2) throw new OdaHatasi("Oda dolu", 409);
      oyuncu = 1;
      k.oyuncular.push({ ad: adTemizle(g.ad), anahtar: typeof g.anahtar === "string" && /^[a-f0-9]{40}$/.test(g.anahtar) ? g.anahtar : rastgele(40) });
      k.ts = Date.now();
      kaydiSakla(s);
    }
    return { kod: s.kod, oyuncu, anahtar: k.oyuncular[oyuncu].anahtar, ...disaAc(k) };
  }
  if (g.a === "getir") return g.v === k.v && g.n === k.oyuncular.length ? { v: k.v, ayni: true } : disaAc(k);
  if (g.a !== "yaz") throw new OdaHatasi("Bilinmeyen işlem", 400);
  if (!tam(g.oyuncu, 0, 1) || !k.oyuncular[g.oyuncu] || k.oyuncular[g.oyuncu].anahtar !== g.anahtar) throw new OdaHatasi("Yetkisiz", 403);
  if (g.v !== k.v) {
    if (ayni(g.durum, k.durum)) return { v: k.v };
    throw new OdaHatasi("Sürüm çakışması", 409, { cakisma: true, ...disaAc(k) });
  }
  if (k.oyuncular.length !== 2 || !gecisGecerli(k.durum, g.durum, g.oyuncu)) throw new OdaHatasi("Geçersiz hamle; oyun yeniden eşitleniyor", 409, { cakisma: true, ...disaAc(k) });
  k.durum = kopya(g.durum);
  k.v++;
  k.ts = Date.now();
  kaydiSakla(s);
  return { v: k.v };
}

async function evAc(kod, k) {
  durdur();
  const s = { ev: true, kod, k, kapali: false, cevaplar: new Map() };
  oturum = s;
  const acildi = peerAc(s, odaKimligi(kod));
  s.peer.on("connection", c => {
    c.on("data", g => {
      if (s.kapali || !g || typeof g !== "object" || g.hd !== 1 || g.tip !== "istek" || typeof g.id !== "string" || !/^[a-f0-9]{24}$/.test(g.id)) return;
      try { if (JSON.stringify(g).length > 14500) return; } catch { return; }
      let yanit = s.cevaplar.get(g.id);
      if (!yanit) {
        try { yanit = { hd: 1, tip: "yanit", id: g.id, ok: true, veri: evIsle(s, g) }; }
        catch (e) { yanit = { hd: 1, tip: "yanit", id: g.id, ok: false, hata: e.message, kod: e.kod || 400, govde: e.govde || {} }; }
        s.cevaplar.set(g.id, yanit);
        if (s.cevaplar.size > 100) s.cevaplar.delete(s.cevaplar.keys().next().value);
      }
      c.send(yanit);
    });
  });
  try { await acildi; kaydiSakla(s); return s; }
  catch (e) { if (oturum === s) durdur(); throw e; }
}

function misafirBagla(s) {
  if (s.kapali || s.baglanti?.open) return;
  const c = s.peer.connect(odaKimligi(s.kod));
  s.baglanti = c;
  c.on("open", () => {
    if (s.kapali || s.baglanti !== c) return;
    for (const p of s.bekleyen.values()) c.send(p.g);
  });
  c.on("data", r => {
    if (s.kapali || s.baglanti !== c || !r || r.hd !== 1 || r.tip !== "yanit") return;
    const p = s.bekleyen.get(r.id);
    if (!p) return;
    s.bekleyen.delete(r.id);
    clearTimeout(p.zaman);
    if (!r.ok) { p.red(new OdaHatasi(typeof r.hata === "string" ? r.hata : "Oda işlemi tamamlanamadı", r.kod, r.govde)); return; }
    const v = r.veri;
    const tamDurum = v && durumGecerli(v.durum) && Number.isFinite(v.ts) &&
      Array.isArray(v.oyuncular) && v.oyuncular.length >= 1 && v.oyuncular.length <= 2 &&
      v.oyuncular.every(ad => typeof ad === "string" && ad.length <= 16);
    const katilim = p.g.a !== "katil" || (tamDurum && v.kod === s.kod && tam(v.oyuncu, 0, 1) &&
      v.oyuncu < v.oyuncular.length && typeof v.anahtar === "string" && /^[a-f0-9]{40}$/.test(v.anahtar));
    const yoklama = p.g.a !== "getir" || v?.ayni === true || tamDurum;
    if (!v || !tam(v.v, 1, 100000) || !katilim || !yoklama || (v.durum && !tamDurum)) {
      p.red(new OdaHatasi("Geçersiz oda yanıtı", 0)); return;
    }
    p.coz(kopya(v));
  });
  c.on("close", () => {
    if (s.kapali || s.baglanti !== c) return;
    if (c.closeReason === "superseded") {
      for (const p of s.bekleyen.values()) { clearTimeout(p.zaman); p.red(new OdaHatasi("Oda başka bir sekmede açık; oyuna oradan devam et", 409)); }
      s.bekleyen.clear();
      return;
    }
    clearTimeout(s.yeniden);
    s.yeniden = setTimeout(() => misafirBagla(s), 900);
  });
}

async function misafirAc(kod) {
  if (oturum?.kod === kod && !oturum.kapali) return oturum;
  durdur();
  const s = { ev: false, kod, kapali: false, bekleyen: new Map() };
  oturum = s;
  try { await peerAc(s); misafirBagla(s); return s; }
  catch (e) { if (oturum === s) durdur(); throw e; }
}
async function istek(s, g) {
  if (s.ev) return kopya(evIsle(s, g));
  return new Promise((coz, red) => {
    const id = rastgele(24);
    const p = { coz, red, g: { hd: 1, tip: "istek", id, ...g } };
    p.zaman = setTimeout(() => { s.bekleyen.delete(id); red(new OdaHatasi("Oda sahibinin oyuna dönmesi bekleniyor. İkiniz de oyun sekmesini açık tutun.", 0)); }, SURE);
    s.bekleyen.set(id, p);
    if (s.baglanti?.open) s.baglanti.send(p.g);
    else if (!s.baglanti || s.baglanti._closed) misafirBagla(s);
  });
}
function oturumAl(kod) {
  if (!oturum || oturum.kapali || oturum.kod !== kod) throw new OdaHatasi("Önce odaya katıl", 0);
  return oturum;
}

export const Oda = {
  async kur(ad, durum) {
    if (!baslangicGecerli(durum)) throw new OdaHatasi("Başlangıç durumu geçersiz", 400);
    const kod = rastgele(5, ALFABE);
    const k = { v: 1, ts: Date.now(), oyuncular: [{ ad: adTemizle(ad), anahtar: rastgele(40) }], durum: kopya(durum) };
    const s = await evAc(kod, k);
    return { kod, oyuncu: 0, anahtar: k.oyuncular[0].anahtar, ...disaAc(s.k) };
  },
  async katil(kod, ad, anahtar) {
    kod = String(kod || "").toUpperCase().trim();
    if (!kodGecerli(kod)) throw new OdaHatasi("Geçersiz oda kodu", 400);
    if (oturum?.ev && oturum.kod === kod) return istek(oturum, { a: "katil", ad, anahtar });
    const k = anahtar && evKaydi(kod, anahtar);
    if (k) {
      if (await baskaSekme(kod)) throw new OdaHatasi("Oda başka bir sekmede açık; oyuna oradan devam et", 409);
      const s = await evAc(kod, k);
      return { kod, oyuncu: 0, anahtar, ...disaAc(s.k) };
    }
    // Yanıt WhatsApp'a geçişte kaybolsa bile aynı aday anahtarla aynı yere dönülür.
    let aday = anahtar || misafirAdaylar.get(kod);
    if (typeof aday !== "string" || !/^[a-f0-9]{40}$/.test(aday)) {
      try { aday = localStorage.getItem(MISAFIR_ADAY + kod); } catch { /* depolama kapalı */ }
      if (typeof aday !== "string" || !/^[a-f0-9]{40}$/.test(aday)) aday = rastgele(40);
      try { localStorage.setItem(MISAFIR_ADAY + kod, aday); } catch { /* açık oturum sürer */ }
    }
    misafirAdaylar.set(kod, aday);
    const yanit = await istek(await misafirAc(kod), { a: "katil", ad, anahtar: aday });
    odaKaydet(kod, { oyuncu: yanit.oyuncu, anahtar: yanit.anahtar });
    return yanit;
  },
  yaz(kod, oyuncu, anahtar, v, durum) { return istek(oturumAl(kod), { a: "yaz", oyuncu, anahtar, v, durum }); },
  getir(kod, v, n) { return istek(oturumAl(kod), { a: "getir", v, n }); },
  kapat: durdur,
};

// Gizli oyuncu anahtarları paylaşım bağlantısına ya da genel oda durumuna eklenmez.
export function odaKaydet(kod, bilgi) {
  try { localStorage.setItem(ANAHTAR + kod, JSON.stringify(bilgi)); localStorage.setItem("hd.sonOda", kod); } catch { /* depolama kapalı */ }
}
export function odaOku(kod) {
  try { return JSON.parse(localStorage.getItem(ANAHTAR + kod) || "null"); } catch { return null; }
}
export function sonOda() { try { return localStorage.getItem("hd.sonOda") || ""; } catch { return ""; } }
export function sonOdaSil() { try { localStorage.removeItem("hd.sonOda"); } catch { /* yok say */ } }
export function davetBaglantisi(kod) {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("oda", kod);
  return u.toString();
}
export function whatsappBaglantisi(kod, ad) {
  return "https://wa.me/?text=" + encodeURIComponent(`${ad} seni Harf Düellosu'na çağırıyor! Bulmacada kapışalım: ${davetBaglantisi(kod)}`);
}
