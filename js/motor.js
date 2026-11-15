// Harf Düellosu — oyun motoru (arayüzden bağımsız, saf işlevler)
//
// Kurallar:
//  - Her oyuncunun ıstakasında en çok 5 harf bulunur. Harfler, bulmacanın
//    henüz açılmamış karelerinin harflerinden oluşan torbadan çekilir.
//  - Sırası gelen oyuncu harflerini karelere dizer ve "Oyna" der.
//  - Her doğru harf +1; yanlış harf ıstakaya döner ve -1 puandır.
//  - Bir kelimenin son harfini koyan +2 kelime primi alır.
//  - Tek turda 5 harfin hepsini doğru koyan +3 "beşli" primi alır.

export const ISTAKA_BOYU = 5;
export const ACILIS_HARFI = 3;
export const KELIME_PRIMI = 2;
export const BESLI_PRIMI = 3;
export const YANLIS_CEZASI = 1;
export const IPUCU_HAKKI = 2;
export const PAS_SINIRI = 6;

// Bulmaca verisini (g: satırlar, ip: ipuçları) oyun için hazırlar.
export function bulmacaHazirla(b) {
  const h = b.g.length;
  const w = b.g[0].length;
  const harf = new Array(w * h).fill(null);
  for (let r = 0; r < h; r++) {
    const satir = Array.from(b.g[r]);
    for (let c = 0; c < w; c++) {
      if (satir[c] !== "#") harf[r * w + c] = satir[c];
    }
  }
  const kelimeler = [];
  const hucreKelime = new Map();
  const ipucuHucre = new Map();
  for (const [r, c, yon, metin, emoji] of b.ip) {
    const hucreler = [];
    let rr = r + (yon === "a" ? 1 : 0);
    let cc = c + (yon === "s" ? 1 : 0);
    while (rr < h && cc < w && harf[rr * w + cc] !== null) {
      hucreler.push(rr * w + cc);
      if (yon === "a") rr++;
      else cc++;
    }
    const k = {
      id: kelimeler.length,
      yon,
      ip: r * w + c,
      hucreler,
      metin,
      emoji: emoji || "",
      tek: hucreler.length === 1,
    };
    kelimeler.push(k);
    for (const i of hucreler) {
      if (!hucreKelime.has(i)) hucreKelime.set(i, []);
      hucreKelime.get(i).push(k.id);
    }
    if (!ipucuHucre.has(k.ip)) ipucuHucre.set(k.ip, []);
    ipucuHucre.get(k.ip).push(k.id);
  }
  // ipucu hücresinde önce "sağa", sonra "aşağı" gelsin
  for (const liste of ipucuHucre.values()) {
    liste.sort((x, y) => (kelimeler[x].yon === "s" ? 0 : 1) - (kelimeler[y].yon === "s" ? 0 : 1));
  }
  return { id: b.id, w, h, harf, kelimeler, hucreKelime, ipucuHucre };
}

function karistir(dizi, rnd) {
  for (let i = dizi.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [dizi[i], dizi[j]] = [dizi[j], dizi[i]];
  }
  return dizi;
}

function kopya(d) {
  return {
    ...d,
    istaka: [d.istaka[0].slice(), d.istaka[1].slice()],
    puan: d.puan.slice(),
    ipucu: d.ipucu.slice(),
    torba: d.torba.slice(),
    olay: d.olay ? { ...d.olay } : null,
  };
}

export function yeniDurum(B, baslayan = 0, rnd = Math.random) {
  const harfHucreleri = [];
  for (let i = 0; i < B.harf.length; i++) if (B.harf[i] !== null) harfHucreleri.push(i);
  const acik = new Set(karistir(harfHucreleri.slice(), rnd).slice(0, ACILIS_HARFI));
  let sahip = "";
  const torba = [];
  for (let i = 0; i < B.harf.length; i++) {
    if (B.harf[i] === null) sahip += "#";
    else if (acik.has(i)) sahip += "x";
    else {
      sahip += ".";
      torba.push(B.harf[i]);
    }
  }
  karistir(torba, rnd);
  const d = {
    b: B.id,
    sahip,
    torba,
    istaka: [[], []],
    puan: [0, 0],
    sira: baslayan,
    turKonan: 0,
    pas: 0,
    ipucu: [IPUCU_HAKKI, IPUCU_HAKKI],
    bitti: false,
    tur: 1,
    olay: { n: 0, tip: "basla", o: baslayan },
  };
  cek(d, 0);
  cek(d, 1);
  return d;
}

function cek(d, o) {
  while (d.istaka[o].length < ISTAKA_BOYU && d.torba.length > 0) {
    d.istaka[o].push(d.torba.shift());
  }
}

function olayYaz(d, olay) {
  d.olay = { n: (d.olay ? d.olay.n : 0) + 1, ...olay };
}

export function kelimeTamam(d, B, k) {
  return k.hucreler.every((i) => d.sahip[i] !== ".");
}

export function bosHucreVar(d) {
  return d.sahip.includes(".");
}

function siraDevret(d, o) {
  if (d.turKonan === 0) d.pas += 1;
  else d.pas = 0;
  cek(d, o);
  d.turKonan = 0;
  d.tur += 1;
  const diger = 1 - o;
  // Rakibin elinde harf kalmadıysa sıra yine aynı oyuncuda kalır
  d.sira = d.istaka[diger].length > 0 ? diger : o;
  if (d.pas >= PAS_SINIRI) bitir(d, true);
}

function bitir(d, tikandi) {
  d.bitti = true;
  d.tikandi = !!tikandi;
  if (tikandi) d.sahip = d.sahip.replace(/\./g, "x");
}

export function kazanan(d) {
  if (d.puan[0] === d.puan[1]) return -1;
  return d.puan[0] > d.puan[1] ? 0 : 1;
}

// Turu oynar: hamleler = [{ h: harf, i: kare }, ...] (boş dizi = pas).
// Doğru harfler tahtada kalır, yanlışlar ıstakaya döner. Tur her durumda biter.
// Dönen: { d: yeni durum, s: sonuç } ya da null (geçersiz hamle)
export function oyna(d0, B, o, hamleler) {
  if (d0.bitti || d0.sira !== o) return null;
  if (!Array.isArray(hamleler) || hamleler.length > ISTAKA_BOYU) return null;
  const el = d0.istaka[o].slice();
  const kareler = new Set();
  for (const m of hamleler) {
    if (d0.sahip[m.i] !== "." || kareler.has(m.i)) return null;
    kareler.add(m.i);
    const yer = el.indexOf(m.h);
    if (yer < 0) return null;
    el.splice(yer, 1);
  }
  const d = kopya(d0);
  const konan = [];
  let dogruSay = 0;
  let kazanc = 0;
  for (const m of hamleler) {
    if (B.harf[m.i] === m.h) {
      d.istaka[o].splice(d.istaka[o].indexOf(m.h), 1);
      d.sahip = d.sahip.slice(0, m.i) + String(o) + d.sahip.slice(m.i + 1);
      dogruSay += 1;
      kazanc += 1;
      konan.push({ i: m.i, h: m.h, d: 1 });
    } else {
      kazanc -= YANLIS_CEZASI;
      konan.push({ i: m.i, h: m.h, d: 0 });
    }
  }
  const tamam = [];
  for (const m of konan) {
    if (!m.d) continue;
    for (const kid of B.hucreKelime.get(m.i) || []) {
      const k = B.kelimeler[kid];
      if (!k.tek && !tamam.includes(kid) && kelimeTamam(d, B, k)) {
        tamam.push(kid);
        kazanc += KELIME_PRIMI;
      }
    }
  }
  const besli = dogruSay === ISTAKA_BOYU;
  if (besli) kazanc += BESLI_PRIMI;
  const onceki = d.puan[o];
  d.puan[o] = Math.max(0, onceki + kazanc);
  d.turKonan = dogruSay;
  if (!bosHucreVar(d)) bitir(d, false);
  else siraDevret(d, o);
  d.turKonan = 0;
  const s = { konan, tamam, kazanc: d.puan[o] - onceki, besli, dogruSay, yanlisSay: konan.length - dogruSay, oyunBitti: d.bitti };
  olayYaz(d, { tip: hamleler.length ? "oyna" : "pas", o, konan, kelime: tamam, kazanc: s.kazanc, besli });
  return { d, s };
}

// Istakadaki harfleri torbaya atıp yenilerini çeker; tur biter.
export function degistir(d0, B, o, rnd = Math.random) {
  if (d0.bitti || d0.sira !== o) return null;
  if (d0.torba.length === 0) return null;
  const d = kopya(d0);
  d.torba.push(...d.istaka[o]);
  d.istaka[o] = [];
  karistir(d.torba, rnd);
  siraDevret(d, o);
  olayYaz(d, { tip: "degistir", o });
  return { d, s: { turBitti: true, oyunBitti: d.bitti } };
}

// Oyuncunun koyabileceği (harf, kare) çiftleri
export function gecerliHamleler(d, B, o) {
  const eldeki = new Set(d.istaka[o]);
  const out = [];
  for (let i = 0; i < d.sahip.length; i++) {
    if (d.sahip[i] === "." && eldeki.has(B.harf[i])) out.push({ i, h: B.harf[i] });
  }
  return out;
}

// Bir karenin "kolaylığı": bağlı kelimelerin açılmış harf oranı (0..1)
export function acilmaOrani(d, B, idx) {
  let en = 0;
  for (const kid of B.hucreKelime.get(idx) || []) {
    const k = B.kelimeler[kid];
    if (k.hucreler.length < 2) continue;
    const acik = k.hucreler.filter((i) => d.sahip[i] !== ".").length;
    en = Math.max(en, acik / (k.hucreler.length - 1));
  }
  return Math.min(1, en);
}

// İpucu hakkı kullanır: eldeki harflerden birinin doğru yerini verir.
// kullanilan: bu turda tahtaya dizilmiş harfler, dolu: dizili kareler
export function ipucuKullan(d0, B, o, kullanilan = [], dolu = new Set()) {
  if (d0.bitti || d0.sira !== o || d0.ipucu[o] <= 0) return null;
  const el = d0.istaka[o].slice();
  for (const h of kullanilan) {
    const y = el.indexOf(h);
    if (y >= 0) el.splice(y, 1);
  }
  const eldeki = new Set(el);
  const hamleler = [];
  for (let i = 0; i < d0.sahip.length; i++) {
    if (d0.sahip[i] === "." && !dolu.has(i) && eldeki.has(B.harf[i])) hamleler.push({ i, h: B.harf[i] });
  }
  if (hamleler.length === 0) return null;
  hamleler.sort((a, b) => acilmaOrani(d0, B, b.i) - acilmaOrani(d0, B, a.i));
  const d = kopya(d0);
  d.ipucu[o] -= 1;
  return { d, s: hamleler[0] };
}

// Tutarlılık denetimi (testler için): ıstakalar + torba = açılmamış kareler
export function tutarliMi(d, B) {
  const gereken = [];
  for (let i = 0; i < d.sahip.length; i++) if (d.sahip[i] === ".") gereken.push(B.harf[i]);
  const eldeki = [...d.torba, ...d.istaka[0], ...d.istaka[1]];
  if (d.bitti && d.tikandi) return true;
  return gereken.sort().join("") === eldeki.sort().join("");
}
