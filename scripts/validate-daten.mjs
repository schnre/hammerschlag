#!/usr/bin/env node
// Prüft public/data/steigerungen.json vor jedem Build: Struktur und keine Personendaten.
import { readFile } from 'node:fs/promises';

const d = JSON.parse(await readFile(new URL('../public/data/steigerungen.json', import.meta.url), 'utf8'));
const fehler = [];
if (!Array.isArray(d.objekte)) fehler.push('objekte fehlt');
const ids = new Set();
for (const o of d.objekte ?? []) {
  if (!o.id) fehler.push('Objekt ohne id');
  if (ids.has(o.id)) fehler.push(`doppelte id ${o.id}`);
  ids.add(o.id);
  if (!o.kanton) console.warn(`Hinweis: ${o.id} ohne Kanton`);
  if (!['EFH', 'MFH', 'ETW', 'Grundstueck', 'Gewerbe', 'Sonstiges'].includes(o.kategorie)) fehler.push(`${o.id}: Kategorie ${o.kategorie}`);
  const text = JSON.stringify(o);
  if (/Geburtsdatum|Heimatort|Staatsbürgerschaft|Date de naissance|Data di nascita/i.test(text)) fehler.push(`${o.id}: enthält Personendaten`);
}
if (fehler.length) { console.error(fehler.join('\n')); process.exit(1); }
console.log(`Daten ok: ${d.objekte.length} Objekte${d.demo ? ' (Demo)' : ''}, Stand ${d.stand}`);
