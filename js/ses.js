// Harf Düellosu — küçük ses efektleri (dosyasız, WebAudio ile)
let ctx = null;
let acik = true;

try {
  acik = localStorage.getItem("hd.ses") !== "0";
} catch {
  /* varsayılan açık */
}

function baglam() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function nota(frekans, bas, sure, tur = "sine", guc = 0.12) {
  const c = baglam();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tur;
  o.frequency.value = frekans;
  const t = c.currentTime + bas;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(guc, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + sure + 0.02);
}

export const Ses = {
  acikMi: () => acik,
  degistir() {
    acik = !acik;
    try {
      localStorage.setItem("hd.ses", acik ? "1" : "0");
    } catch {
      /* yok say */
    }
    return acik;
  },
  koy() {
    if (acik) nota(660, 0, 0.09, "triangle");
  },
  kelime() {
    if (!acik) return;
    nota(523, 0, 0.12, "triangle");
    nota(659, 0.09, 0.12, "triangle");
    nota(784, 0.18, 0.2, "triangle");
  },
  hata() {
    if (!acik) return;
    nota(196, 0, 0.16, "sawtooth", 0.07);
    nota(147, 0.1, 0.22, "sawtooth", 0.07);
  },
  sira() {
    if (acik) nota(880, 0, 0.07, "sine", 0.06);
  },
  kazan() {
    if (!acik) return;
    [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.12, 0.25, "triangle"));
  },
  kaybet() {
    if (!acik) return;
    [392, 330, 262].forEach((f, i) => nota(f, i * 0.16, 0.3, "sine", 0.09));
  },
};
