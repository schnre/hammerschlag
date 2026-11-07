// Alles Persönliche (Merkliste, Notizen, eigene Zahlen, Einstellungen) bleibt im Browser.
import type { Datenbestand, Objekt } from './typen';
import { STANDARD_CONFIG, bewerte, type BewertungsConfig, type Eingaben, type Bewertung } from './bewertung';

const K = { merk: 'hs.merk', notiz: 'hs.notiz', eingaben: 'hs.eingaben', config: 'hs.config', filter: 'hs.filter', besuch: 'hs.besuch' };

function lies<T>(k: string, std: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : std; } catch { return std; }
}
function schreib(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ }
}

export interface Filter {
  suche: string;
  kategorien: string[];
  kanton: string;
  art: '' | 'betreibung' | 'konkurs';
  maxPreis?: number;
  nurAktiv: boolean;
  urteil: '' | 'lohnend' | 'pruefen';
  umkreisOrt: string;
  umkreisKoord?: [number, number];
  umkreisKm: number;
  sortierung: 'datum' | 'preis-auf' | 'preis-ab' | 'score' | 'distanz' | 'neu';
  ansicht: 'liste' | 'karte';
}

export const STANDARD_FILTER: Filter = {
  suche: '', kategorien: [], kanton: '', art: '', nurAktiv: true, urteil: '',
  umkreisOrt: '', umkreisKm: 0, sortierung: 'datum', ansicht: 'liste',
};

type ConfigOverrides = Partial<Pick<BewertungsConfig, 'zuschlagFaktor' | 'verkaufskosten' | 'risikoabschlag' | 'schwellen'>> & {
  preis?: Record<string, { ETW?: number; EFH?: number }>;
  renovation?: Partial<BewertungsConfig['renovationProM2']>;
};

export const zustand = {
  daten: { stand: '', demo: true, objekte: [] } as Datenbestand,
  merk: new Set<string>(lies<string[]>(K.merk, [])),
  notizen: lies<Record<string, string>>(K.notiz, {}),
  eingaben: lies<Record<string, Eingaben>>(K.eingaben, {}),
  overrides: lies<ConfigOverrides>(K.config, {}),
  filter: { ...STANDARD_FILTER, ...lies<Partial<Filter>>(K.filter, {}) } as Filter,
  letzterBesuch: lies<string>(K.besuch, ''),
  cache: new Map<string, Bewertung>(),
};

export function config(): BewertungsConfig {
  const o = zustand.overrides;
  const c: BewertungsConfig = JSON.parse(JSON.stringify(STANDARD_CONFIG));
  if (o.zuschlagFaktor != null) c.zuschlagFaktor = o.zuschlagFaktor;
  if (o.verkaufskosten != null) c.verkaufskosten = o.verkaufskosten;
  if (o.risikoabschlag != null) c.risikoabschlag = o.risikoabschlag;
  if (o.schwellen) c.schwellen = { ...c.schwellen, ...o.schwellen };
  if (o.renovation) Object.assign(c.renovationProM2, o.renovation);
  for (const [kt, p] of Object.entries(o.preis ?? {})) {
    if (p.ETW) (c.preisProM2.ETW as Record<string, number>)[kt] = p.ETW;
    if (p.EFH) (c.preisProM2.EFH as Record<string, number>)[kt] = p.EFH;
  }
  return c;
}

export function bewertung(o: Objekt): Bewertung {
  let b = zustand.cache.get(o.id);
  if (!b) { b = bewerte(o, config(), zustand.eingaben[o.id]); zustand.cache.set(o.id, b); }
  return b;
}

export function setzeOverrides(o: ConfigOverrides): void {
  zustand.overrides = o; schreib(K.config, o); zustand.cache.clear();
}

export function setzeEingaben(id: string, e: Eingaben): void {
  const sauber = Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && Number.isFinite(v))) as Eingaben;
  if (Object.keys(sauber).length) zustand.eingaben[id] = sauber; else delete zustand.eingaben[id];
  schreib(K.eingaben, zustand.eingaben); zustand.cache.delete(id);
}

export function toggleMerk(id: string): boolean {
  const an = !zustand.merk.has(id);
  if (an) zustand.merk.add(id); else zustand.merk.delete(id);
  schreib(K.merk, [...zustand.merk]);
  return an;
}

export function setzeNotiz(id: string, text: string): void {
  if (text.trim()) zustand.notizen[id] = text; else delete zustand.notizen[id];
  schreib(K.notiz, zustand.notizen);
}

export function speichereFilter(): void {
  schreib(K.filter, zustand.filter);
}

export function merkeBesuch(): void { schreib(K.besuch, new Date().toISOString().slice(0, 10)); }

/** Neu = seit dem letzten Besuch oder in den letzten 7 Tagen publiziert. */
export function istNeu(o: Objekt): boolean {
  const grenze = zustand.letzterBesuch || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  return o.quelle.datum >= grenze;
}

export function exportiere(): string {
  return JSON.stringify({ merk: [...zustand.merk], notizen: zustand.notizen, eingaben: zustand.eingaben, overrides: zustand.overrides }, null, 1);
}

export function importiere(json: string): void {
  const d = JSON.parse(json);
  zustand.merk = new Set(d.merk ?? []); schreib(K.merk, [...zustand.merk]);
  zustand.notizen = d.notizen ?? {}; schreib(K.notiz, zustand.notizen);
  zustand.eingaben = d.eingaben ?? {}; schreib(K.eingaben, zustand.eingaben);
  setzeOverrides(d.overrides ?? {});
}
