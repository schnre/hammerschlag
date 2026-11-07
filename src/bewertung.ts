import type { Objekt } from './typen';
import standard from '../config/bewertung.json';

export type BewertungsConfig = typeof standard;
export const STANDARD_CONFIG: BewertungsConfig = standard;

/** Werte, die man pro Objekt im Rechner überschreiben kann. */
export interface Eingaben {
  gebot?: number;
  wohnflaeche?: number;
  baujahr?: number;
  preisProM2?: number;
  renovation?: number;
  mieteJahr?: number;
}

export type Quelle = 'Eingabe' | 'Publikation' | 'Gebäuderegister' | 'Schätzung' | 'Annahme';

export interface Posten<T = number> {
  wert: T;
  quelle: Quelle;
}

export type Urteil = 'lohnend' | 'pruefen' | 'eher-nicht' | 'unklar';

export interface Bewertung {
  gebot: Posten;
  nebenkosten: number;
  wohnflaeche: Posten<number | undefined>;
  baujahr: Posten<number | undefined>;
  preisProM2: Posten<number | undefined>;
  renovation: Posten;
  marktwert: Posten<number | undefined>;
  investition: number;
  verkaufskosten: number;
  risikoabschlag: number;
  gewinn?: number;
  renditeProzent?: number;
  mieteJahr?: Posten<number | undefined>;
  bruttoRendite?: number;
  score: number;
  urteil: Urteil;
  datenqualitaet: number;
  hinweise: string[];
}

export function baujahrKlasse(baujahr?: number): 'bis1949' | '1950bis1979' | '1980bis1999' | '2000bis2014' | 'ab2015' | 'unbekannt' {
  if (!baujahr) return 'unbekannt';
  if (baujahr < 1950) return 'bis1949';
  if (baujahr < 1980) return '1950bis1979';
  if (baujahr < 2000) return '1980bis1999';
  if (baujahr < 2015) return '2000bis2014';
  return 'ab2015';
}

function preisFuer(o: Objekt, c: BewertungsConfig): number | undefined {
  const p = c.preisProM2 as unknown as Record<string, Record<string, number> | number>;
  const kanton = o.kanton;
  const etw = (p.ETW as Record<string, number>)[kanton];
  const efh = (p.EFH as Record<string, number>)[kanton];
  switch (o.kategorie) {
    case 'ETW': return etw;
    case 'EFH': return efh;
    case 'MFH': return efh ? Math.round(efh * c.preisProM2.MFH_FAKTOR) : undefined;
    case 'Gewerbe': return efh ? Math.round(efh * c.preisProM2.GEWERBE_FAKTOR) : undefined;
    default: return undefined;
  }
}

export function handaenderungssatz(kanton: string, c: BewertungsConfig): number {
  const h = c.nebenkosten.handaenderung as Record<string, number>;
  return h[kanton] ?? h['*'] ?? 0;
}

/**
 * Vorbewertung: lohnt es sich, das Objekt zu ersteigern, zu renovieren und
 * (gedanklich) zum Marktwert wieder zu verkaufen? Alles Schätzungen –
 * die Quelle jedes Werts wird mitgeliefert, damit die App sie anzeigen kann.
 */
export function bewerte(o: Objekt, c: BewertungsConfig = STANDARD_CONFIG, e: Eingaben = {}): Bewertung {
  const hinweise: string[] = [];
  let bekannt = 0;
  const g = o.gebaeude;

  // Gebot
  const gebot: Posten = e.gebot != null
    ? { wert: e.gebot, quelle: 'Eingabe' }
    : { wert: Math.round((o.schaetzung ?? 0) * c.zuschlagFaktor), quelle: o.schaetzung ? 'Publikation' : 'Annahme' };
  if (o.schaetzung) bekannt++;
  else hinweise.push('Keine betreibungsamtliche Schätzung gefunden – Gebot bitte selbst eintragen.');

  // Wohnfläche
  let wohnflaeche: Posten<number | undefined>;
  if (e.wohnflaeche != null) wohnflaeche = { wert: e.wohnflaeche, quelle: 'Eingabe' };
  else if (g?.wohnflaeche) { wohnflaeche = { wert: g.wohnflaeche, quelle: 'Gebäuderegister' }; bekannt++; }
  else if (g?.grundflaeche && g.geschosse && o.kategorie !== 'ETW') {
    wohnflaeche = { wert: Math.round(g.grundflaeche * g.geschosse * c.wohnflaecheAusGebaeudeFaktor), quelle: 'Schätzung' };
    hinweise.push('Wohnfläche aus Gebäudegrundfläche × Geschosse geschätzt.');
  } else wohnflaeche = { wert: undefined, quelle: 'Annahme' };

  // Baujahr
  let baujahr: Posten<number | undefined>;
  if (e.baujahr != null) baujahr = { wert: e.baujahr, quelle: 'Eingabe' };
  else if (g?.baujahr) { baujahr = { wert: g.baujahr, quelle: 'Gebäuderegister' }; bekannt++; }
  else baujahr = { wert: undefined, quelle: 'Annahme' };

  // Marktpreis pro m²
  const pAuto = preisFuer(o, c);
  const preisProM2: Posten<number | undefined> = e.preisProM2 != null
    ? { wert: e.preisProM2, quelle: 'Eingabe' }
    : { wert: pAuto, quelle: 'Annahme' };

  // Renovation
  let renovation: Posten;
  if (e.renovation != null) renovation = { wert: e.renovation, quelle: 'Eingabe' };
  else if (wohnflaeche.wert) {
    const r = c.renovationProM2;
    let proM2 = Number(r[baujahrKlasse(baujahr.wert)]);
    if (g?.fossil && (baujahr.wert ?? 0) < 2015) proM2 += r.fossileHeizungZuschlag;
    renovation = { wert: Math.round(wohnflaeche.wert * proM2 / 1000) * 1000, quelle: 'Schätzung' };
  } else renovation = { wert: 0, quelle: 'Annahme' };
  if (o.kategorie === 'Grundstueck' || o.kategorie === 'Sonstiges') renovation = { wert: e.renovation ?? 0, quelle: e.renovation != null ? 'Eingabe' : 'Annahme' };

  // Nebenkosten beim Erwerb
  const nebenkosten = Math.round(gebot.wert * (handaenderungssatz(o.kanton, c) + c.nebenkosten.grundbuchUndSteigerung));

  // Marktwert nach Renovation
  let marktwert: Posten<number | undefined> = { wert: undefined, quelle: 'Annahme' };
  if (wohnflaeche.wert && preisProM2.wert) {
    marktwert = { wert: Math.round(wohnflaeche.wert * preisProM2.wert / 1000) * 1000, quelle: 'Schätzung' };
  }

  const investition = gebot.wert + nebenkosten + renovation.wert;
  const verkaufskosten = marktwert.wert ? Math.round(marktwert.wert * c.verkaufskosten) : 0;
  const risikoabschlag = Math.round(renovation.wert * c.risikoabschlag + gebot.wert * c.risikoabschlag / 2);

  let gewinn: number | undefined;
  let renditeProzent: number | undefined;
  if (marktwert.wert && investition > 0) {
    gewinn = marktwert.wert - investition - verkaufskosten - risikoabschlag;
    renditeProzent = (gewinn / investition) * 100;
  }

  // Mietrendite (für Halten statt Verkaufen)
  let mieteJahr: Posten<number | undefined> | undefined;
  let bruttoRendite: number | undefined;
  const mProM2 = (c.mieteProM2Jahr as unknown as Record<string, number>)[o.kanton];
  if (e.mieteJahr != null) mieteJahr = { wert: e.mieteJahr, quelle: 'Eingabe' };
  else if (wohnflaeche.wert && mProM2 && o.kategorie !== 'Grundstueck') mieteJahr = { wert: Math.round(wohnflaeche.wert * mProM2 / 100) * 100, quelle: 'Schätzung' };
  if (mieteJahr?.wert && investition > 0) bruttoRendite = (mieteJahr.wert / investition) * 100;

  if (o.kategorie === 'Grundstueck') hinweise.push('Bei Grundstücken hängt der Wert stark von Bauzone und Ausnützung ab – Zonenplan und ÖREB-Kataster prüfen.');
  if (!wohnflaeche.wert && o.kategorie !== 'Grundstueck') hinweise.push('Wohnfläche unbekannt – im Rechner eintragen (steht meist im Gutachten).');
  if (o.status === 'abgesagt') hinweise.push('Diese Steigerung wurde widerrufen.');

  const datenqualitaet = Math.round((bekannt / 3) * 100);

  let urteil: Urteil = 'unklar';
  let score = 50;
  if (renditeProzent != null) {
    // 0 % → 40 Punkte, +20 % → 90, −20 % → 0
    score = Math.max(0, Math.min(100, Math.round(40 + renditeProzent * 2.5)));
    urteil = renditeProzent >= c.schwellen.lohnend ? 'lohnend'
      : renditeProzent >= c.schwellen.pruefen ? 'pruefen' : 'eher-nicht';
  }

  return {
    gebot, nebenkosten, wohnflaeche, baujahr, preisProM2, renovation, marktwert,
    investition, verkaufskosten, risikoabschlag, gewinn, renditeProzent,
    mieteJahr, bruttoRendite, score, urteil, datenqualitaet, hinweise,
  };
}

export const URTEIL_TEXT: Record<Urteil, string> = {
  lohnend: 'Lohnt sich voraussichtlich',
  pruefen: 'Genauer prüfen',
  'eher-nicht': 'Lohnt sich eher nicht',
  unklar: 'Zu wenig Daten',
};
