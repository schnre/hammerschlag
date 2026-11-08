// Erkennt Gerätetyp und (soweit möglich) das Modell und passt die Grundschrift an.
//
// iPhones verraten ihr Modell nicht im User-Agent. Bildschirmgrösse in Punkten und Pixeldichte
// zusammen ergeben aber die Modellfamilie. Android-Chrome liefert das Modell über
// navigator.userAgentData. Die Skalierung richtet sich nach der gemessenen Bildschirmbreite,
// das Modell dient der Anzeige und für Sonderfälle.

export type Typ = 'handy' | 'tablet' | 'desktop';
export type Skala = 'auto' | 'klein' | 'normal' | 'gross' | 'sehr-gross';

export interface Geraet {
  typ: Typ;
  os: 'ios' | 'android' | 'andere';
  modell?: string;
  /** kurze und lange Bildschirmseite in CSS-Pixeln */
  kurz: number;
  lang: number;
  dpr: number;
  /** Grundschrift in px nach automatischer Anpassung (ohne eigene Einstellung) */
  basis: number;
}

// [kurze Seite, lange Seite, Pixeldichte] → Modellfamilie
const IPHONES: [number, number, number, string][] = [
  [320, 568, 2, 'iPhone SE (1. Gen.) / 5s'],
  [375, 667, 2, 'iPhone SE (2./3. Gen.) / 6–8'],
  [414, 736, 3, 'iPhone 6–8 Plus'],
  [375, 812, 3, 'iPhone X / XS / 11 Pro / 12 mini / 13 mini'],
  [414, 896, 2, 'iPhone XR / 11'],
  [414, 896, 3, 'iPhone XS Max / 11 Pro Max'],
  [390, 844, 3, 'iPhone 12 / 13 / 14 / 16e'],
  [428, 926, 3, 'iPhone 12/13 Pro Max / 14 Plus'],
  [393, 852, 3, 'iPhone 14 Pro / 15 / 15 Pro / 16'],
  [430, 932, 3, 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus'],
  [402, 874, 3, 'iPhone 16 Pro / 17 / 17 Pro'],
  [420, 912, 3, 'iPhone Air'],
  [440, 956, 3, 'iPhone 16 Pro Max / 17 Pro Max'],
];

const FAKTOR: Record<Skala, number> = { auto: 1, klein: 0.92, normal: 1, gross: 1.1, 'sehr-gross': 1.22 };
const SCHLUESSEL = 'hs.skala';

function iphoneModell(kurz: number, lang: number, dpr: number): string | undefined {
  return IPHONES.find(([k, l, d]) => k === kurz && l === lang && d === Math.round(dpr))?.[3];
}

export function erkenne(): Geraet {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  // iPadOS meldet sich als Mac, hat aber Touch
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
  const android = /Android/.test(ua);
  const kurz = Math.min(screen.width, screen.height);
  const lang = Math.max(screen.width, screen.height);
  const dpr = window.devicePixelRatio || 1;

  let typ: Typ = 'desktop';
  if (touch && (ios || android || kurz < 900)) typ = kurz < 600 ? 'handy' : 'tablet';
  // Desktop-Browser in einem schmalen Fenster verhält sich wie ein Handy, bleibt aber «desktop»

  let modell: string | undefined;
  if (ios && /iPhone/.test(ua)) modell = iphoneModell(kurz, lang, dpr) ?? 'iPhone';
  else if (ios) modell = 'iPad';
  else if (android) {
    // Ältere Browser schreiben das Modell noch in den User-Agent («Android 13; SM-S911B»)
    const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
    if (m && m[1] !== 'K') modell = m[1].trim();
  }

  // Grundschrift: kleine Handys etwas kleiner, damit Karten nicht zu hoch werden;
  // grosse Handys und Tablets etwas grösser, damit alles gut lesbar und antippbar ist.
  let basis = 15;
  if (typ === 'handy') basis = kurz < 360 ? 14 : kurz < 390 ? 15 : kurz < 420 ? 15.5 : 16;
  else if (typ === 'tablet') basis = 16;

  return { typ, os: ios ? 'ios' : android ? 'android' : 'andere', modell, kurz, lang, dpr, basis };
}

export let geraet: Geraet = erkenne();

export function skala(): Skala {
  try { return (localStorage.getItem(SCHLUESSEL) as Skala) || 'auto'; } catch { return 'auto'; }
}

export function setzeSkala(s: Skala): void {
  try { if (s === 'auto') localStorage.removeItem(SCHLUESSEL); else localStorage.setItem(SCHLUESSEL, s); } catch { /* privater Modus */ }
  wende();
}

/** Attribute und Grundschrift auf <html> setzen. */
export function wende(): void {
  const neu = erkenne();
  geraet = { ...neu, modell: geraet.modell ?? neu.modell }; // nachgeladenes Android-Modell behalten
  const h = document.documentElement;
  h.dataset.geraet = geraet.typ;
  h.dataset.os = geraet.os;
  h.style.fontSize = `${(geraet.basis * FAKTOR[skala()]).toFixed(2)}px`;
}

/** Android-Chrome: echtes Modell nachladen (z. B. «Pixel 8» oder «SM-S921B»). */
async function modellNachladen(): Promise<void> {
  const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ model?: string }> } }).userAgentData;
  if (!uad || geraet.os !== 'android') return;
  try {
    const { model } = await uad.getHighEntropyValues(['model']);
    if (model) geraet = { ...geraet, modell: model };
  } catch { /* nicht verfügbar */ }
}

/** Bildschirmtastatur offen? Dann die untere Navigation ausblenden. */
function beobachteTastatur(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const pruefe = () => document.documentElement.classList.toggle('tastatur-offen', vv.height < window.innerHeight * 0.75);
  vv.addEventListener('resize', pruefe);
}

export function starteGeraet(): void {
  wende();
  void modellNachladen();
  beobachteTastatur();
  let t: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(wende, 150); });
}

export function geraetText(): string {
  const g = geraet;
  const typ = { handy: 'Handy', tablet: 'Tablet', desktop: 'Computer' }[g.typ];
  return `${g.modell ?? typ} · ${g.kurz}×${g.lang} pt · ${g.dpr.toFixed(g.dpr % 1 ? 1 : 0)}× Pixeldichte`;
}
