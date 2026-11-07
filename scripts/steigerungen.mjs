#!/usr/bin/env node
// Holt alle Grundstücksteigerungen der letzten N Tage aus dem SHAB, ergänzt Koordinaten und
// Gebäudedaten und schreibt public/data/steigerungen.json.
//
//   node scripts/steigerungen.mjs            → letzte 10 Tage (täglicher Lauf)
//   node scripts/steigerungen.mjs --tage 120 → Bestand aufbauen

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { xmlZuText, parsePublikation, IST_STEIGERUNG, IST_WIDERRUF } from './lib/parse.mjs';
import { shabPublikationen, shabXml, geokodiere, gebaeude, warte } from './lib/quellen.mjs';

const DATEI = fileURLToPath(new URL('../public/data/steigerungen.json', import.meta.url));
const arg = (name, std) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : std; };
const TAGE = Number(arg('tage', '10'));
const AUFBEWAHREN_TAGE = 45; // vergangene Steigerungen so lange als «vorbei» behalten

const iso = (d) => d.toISOString().slice(0, 10);
const heute = new Date();
const von = new Date(heute.getTime() - TAGE * 864e5);

async function bestand() {
  try {
    const d = JSON.parse(await readFile(DATEI, 'utf8'));
    return d.demo ? [] : d.objekte; // Demodaten nicht übernehmen
  } catch { return []; }
}

function amtAusMeta(meta) {
  const eintraege = Object.entries(meta).filter(([k]) => /registrationOffice|publikationsstelle|publishingOffice/i.test(k));
  const name = eintraege.find(([k]) => /displayName|name|organi/i.test(k))?.[1] ?? eintraege[0]?.[1];
  const rest = eintraege.filter(([, v]) => v !== name).map(([, v]) => v);
  return { amtName: name, amtAdresse: rest.join(', ') || undefined };
}

async function main() {
  console.log(`SHAB: Publikationen ${iso(von)} – ${iso(heute)}`);
  const pubs = await shabPublikationen(iso(von), iso(heute));
  const steigerungen = pubs.filter((p) => IST_STEIGERUNG(p.titel, p.subRubrik));
  console.log(`${pubs.length} SB/KK-Publikationen, davon ${steigerungen.length} Grundstücksteigerungen oder Widerrufe`);

  const alt = await bestand();
  const nachId = new Map(alt.map((o) => [o.id, o]));
  const widerrufe = [];
  let neu = 0, fehler = 0;

  for (const p of steigerungen) {
    if (nachId.has(p.nummer)) continue;
    try {
      const xml = await shabXml(p.id);
      if (!xml) continue;
      const { text, meta } = xmlZuText(xml);
      const o = parsePublikation(text, { ...p, ...amtAusMeta(meta) });
      if (IST_WIDERRUF(p.titel)) { widerrufe.push(o); continue; }

      const geo = await geokodiere(o.adresse, o.gemeinde);
      if (geo) { o.lat = geo.lat; o.lon = geo.lon; o.genau = geo.genau; }
      if (geo?.egid && o.kategorie !== 'Grundstueck') {
        try { o.gebaeude = await gebaeude(geo.egid, o.kategorie); } catch (e) { console.warn(`GWR ${geo.egid}: ${e.message}`); }
      }
      nachId.set(o.id, o);
      neu++;
      await warte(250);
    } catch (e) {
      fehler++;
      console.warn(`${p.nummer}: ${e.message}`);
    }
  }

  // Widerrufe: gleiches Amt und gleiche Grundstücknummer → abgesagt
  for (const w of widerrufe) {
    for (const o of nachId.values()) {
      const gleichesGrundstueck = w.grundstueckNr.some((n) => o.grundstueckNr.includes(n)) && (w.grundbuch ?? '') === (o.grundbuch ?? '');
      const gleicheEgrid = w.egrid.some((e) => o.egrid.includes(e));
      if (gleicheEgrid || gleichesGrundstueck) o.status = 'abgesagt';
    }
  }

  // Vergangene Steigerungen markieren bzw. entfernen
  const grenze = iso(new Date(heute.getTime() - AUFBEWAHREN_TAGE * 864e5));
  const objekte = [...nachId.values()]
    .map((o) => (o.status === 'aktiv' && o.steigerung?.datum && o.steigerung.datum < iso(heute) ? { ...o, status: 'vorbei' } : o))
    .filter((o) => !o.steigerung?.datum || o.steigerung.datum >= grenze)
    .sort((a, b) => (a.steigerung?.datum ?? '9').localeCompare(b.steigerung?.datum ?? '9'));

  await writeFile(DATEI, JSON.stringify({ stand: new Date().toISOString(), demo: false, objekte }, null, 1) + '\n');
  console.log(`Fertig: ${neu} neu, ${widerrufe.length} Widerrufe, ${fehler} Fehler, ${objekte.length} Objekte gespeichert.`);
  if (fehler > 0 && neu === 0 && steigerungen.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
