// Harf Düellosu — bot rakip
import { gecerliHamleler, acilmaOrani, ISTAKA_BOYU } from "./motor.js";

// dagilim[n]: botun bir turda n harfi "bilme" olasılığı; hata: yanlış bir tahmin ekleme olasılığı
export const SEVIYELER = {
  kolay: { ad: "Acemi Baykuş", simge: "🦉", dagilim: [0.15, 0.45, 0.3, 0.1], hata: 0.25 },
  orta: { ad: "Kurnaz Tilki", simge: "🦊", dagilim: [0.05, 0.3, 0.35, 0.2, 0.1], hata: 0.14 },
  zor: { ad: "Bilge Kaplumbağa", simge: "🐢", dagilim: [0, 0.12, 0.3, 0.3, 0.18, 0.1], hata: 0.06 },
};

function agirlikliSec(dagilim, rnd) {
  let x = rnd();
  for (let i = 0; i < dagilim.length; i++) {
    x -= dagilim[i];
    if (x <= 0) return i;
  }
  return dagilim.length - 1;
}

// Botun bu turdaki kararı: { tip: "oyna", hamleler: [{h, i}] } ya da { tip: "degistir" }
export function botKarari(d, B, o, seviye, rnd = Math.random) {
  const s = SEVIYELER[seviye] || SEVIYELER.orta;
  let hedef = agirlikliSec(s.dagilim, rnd);
  // Oyun tıkanmasın: art arda boş turlar olduysa en az bir harf koy
  if (hedef === 0 && d.pas >= 2) hedef = 1;
  hedef = Math.min(hedef, d.istaka[o].length, ISTAKA_BOYU);

  // Harfleri çoğu açılmış kelimelere koymayı yeğler (insan gibi)
  const adaylar = gecerliHamleler(d, B, o)
    .map((m) => ({ m, p: acilmaOrani(d, B, m.i) + rnd() * 0.6 }))
    .sort((a, b) => b.p - a.p);
  const el = d.istaka[o].slice();
  const dolu = new Set();
  const hamleler = [];
  for (const { m } of adaylar) {
    if (hamleler.length >= hedef) break;
    const yer = el.indexOf(m.h);
    if (yer < 0 || dolu.has(m.i)) continue;
    el.splice(yer, 1);
    dolu.add(m.i);
    hamleler.push({ h: m.h, i: m.i });
  }

  if (el.length > 0 && rnd() < s.hata) {
    const h = el[Math.floor(rnd() * el.length)];
    const yanlislar = [];
    for (let i = 0; i < d.sahip.length; i++) {
      if (d.sahip[i] === "." && !dolu.has(i) && B.harf[i] !== h) yanlislar.push(i);
    }
    if (yanlislar.length > 0) {
      const i = yanlislar[Math.floor(rnd() * yanlislar.length)];
      hamleler.splice(Math.floor(rnd() * (hamleler.length + 1)), 0, { h, i });
    }
  }

  if (hamleler.length === 0 && d.torba.length >= ISTAKA_BOYU && rnd() < 0.3) return { tip: "degistir" };
  return { tip: "oyna", hamleler };
}
