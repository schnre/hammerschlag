import type { Objekt } from '../typen';
import { KATEGORIEN } from '../typen';
import { URTEIL_TEXT, type Bewertung } from '../bewertung';
import { bewertung, istNeu, zustand } from '../zustand';
import { chf, datum, esc, inTagen, zahlFmt } from '../format';

export function urteilChip(b: Bewertung, gross = false): string {
  const t = b.renditeProzent != null ? `${b.renditeProzent >= 0 ? '+' : ''}${b.renditeProzent.toFixed(0)} %` : '?';
  return `<span class="urteil urteil-${b.urteil}${gross ? ' gross' : ''}" title="${esc(URTEIL_TEXT[b.urteil])}"><b>${t}</b>${gross ? ` ${esc(URTEIL_TEXT[b.urteil])}` : ''}</span>`;
}

export function statusChips(o: Objekt): string {
  const c: string[] = [];
  if (o.status === 'abgesagt') c.push('<span class="chip rot">Abgesagt</span>');
  if (o.status === 'vorbei') c.push('<span class="chip grau">Vorbei</span>');
  if (o.status === 'aktiv' && istNeu(o)) c.push('<span class="chip neu">Neu</span>');
  if (o.art === 'konkurs') c.push('<span class="chip">Konkurs</span>');
  if (zustand.merk.has(o.id)) c.push('<span class="chip merk" aria-label="gemerkt">★</span>');
  return c.join('');
}

export function objektKarte(o: Objekt, distanz?: number): string {
  const b = bewertung(o);
  const g = o.gebaeude;
  const fakten = [
    o.zimmer ? `${String(o.zimmer).replace('.5', '½')} Zi.` : '',
    b.wohnflaeche.wert ? `${zahlFmt(b.wohnflaeche.wert)} m²` : '',
    o.flaecheGrundstueck && o.kategorie !== 'ETW' ? `${zahlFmt(o.flaecheGrundstueck)} m² Land` : '',
    g?.baujahr ? `Bj. ${g.baujahr}` : '',
    distanz != null ? `${distanz.toFixed(0)} km` : '',
  ].filter(Boolean).join(' · ');
  return `<a class="objekt" href="#/objekt/${encodeURIComponent(o.id)}">
    <div class="objekt-kopf">
      <span class="kat kat-${o.kategorie}">${esc(KATEGORIEN[o.kategorie])}</span>
      <span class="kanton">${esc(o.kanton)}</span>
      ${statusChips(o)}
      <span class="rechts">${urteilChip(b)}</span>
    </div>
    <h3>${esc(o.titel)}</h3>
    <p class="fakten">${esc(fakten || o.grundbuch || '')}</p>
    <div class="objekt-fuss">
      <span><small>Schätzung</small><b>${chf(o.schaetzung)}</b></span>
      <span><small>Steigerung</small><b>${datum(o.steigerung?.datum, false)}</b> <small>${esc(inTagen(o.steigerung?.datum))}</small></span>
    </div>
  </a>`;
}

export function leer(text: string, aktion = ''): string {
  return `<div class="leer"><p>${esc(text)}</p>${aktion}</div>`;
}

/** Ort suchen über geo.admin.ch (öffentlich, CORS-fähig). */
export async function ortSuchen(text: string): Promise<{ name: string; koord: [number, number] } | null> {
  const q = new URLSearchParams({ searchText: text, type: 'locations', origins: 'zipcode,gg25,address', sr: '4326', limit: '1' });
  const r = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${q}`);
  if (!r.ok) return null;
  const a = (await r.json())?.results?.[0]?.attrs;
  if (!a?.lat) return null;
  return { name: String(a.label ?? text).replace(/<[^>]+>/g, ''), koord: [a.lat, a.lon] };
}

export function adresseText(o: Objekt): string {
  const a = o.adresse;
  if (!a) return o.grundbuch ?? '';
  return [a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function ics(o: Objekt): string {
  const d = o.steigerung?.datum?.replace(/-/g, '');
  const [h, m] = (o.steigerung?.zeit ?? '14:00').split(':');
  const start = `${d}T${h.padStart(2, '0')}${m}00`;
  const endH = String(Math.min(23, Number(h) + 2)).padStart(2, '0');
  const z = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hammerschlag//DE', 'BEGIN:VEVENT',
    `UID:${o.id}@hammerschlag`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Zurich:${start}`, `DTEND;TZID=Europe/Zurich:${d}T${endH}${m}00`,
    `SUMMARY:${z(`Steigerung: ${o.titel}`)}`,
    `LOCATION:${z(o.steigerung?.ort ?? '')}`,
    `DESCRIPTION:${z(`${o.amt.name}\nSchätzung: ${chf(o.schaetzung)}\nSHAB ${o.quelle.nummer}\n${o.quelle.url}`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export function herunterladen(name: string, inhalt: string, typ: string): void {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(objekte: Objekt[]): string {
  const kopf = ['SHAB-Nr', 'Status', 'Kategorie', 'Titel', 'Kanton', 'Adresse', 'Grundbuch', 'Grundstück-Nr', 'Schätzung CHF', 'Steigerung', 'Zeit', 'Ort Steigerung', 'Wohnfläche m²', 'Baujahr', 'Renovation CHF', 'Marktwert CHF', 'Rendite %', 'Urteil', 'Amt', 'E-Mail Amt', 'SHAB-Link'];
  const zeilen = objekte.map((o) => {
    const b = bewertung(o);
    return [o.quelle.nummer, o.status, KATEGORIEN[o.kategorie], o.titel, o.kanton, adresseText(o), o.grundbuch, o.grundstueckNr.join(' / '), o.schaetzung, o.steigerung?.datum, o.steigerung?.zeit, o.steigerung?.ort, b.wohnflaeche.wert, b.baujahr.wert, b.renovation.wert, b.marktwert.wert, b.renditeProzent?.toFixed(1), b.urteil, o.amt.name, o.amt.email, o.quelle.url];
  });
  return '﻿' + [kopf, ...zeilen].map((z) => z.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export function aktualisiereMerkZahl(): void {
  const el = document.getElementById('merk-zahl');
  if (el) el.textContent = zustand.merk.size ? String(zustand.merk.size) : '';
}
