#!/usr/bin/env node
// Holt alle Grundstücksteigerungen der letzten N Tage aus dem SHAB, ergänzt Koordinaten und
// Gebäudedaten und schreibt public/data/steigerungen.json.
//
//   node scripts/steigerungen.mjs            → letzte 10 Tage (täglicher Lauf)
//   node scripts/steigerungen.mjs --tage 120 → Bestand aufbauen

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { xmlZuText, parsePublikation, IST_STEIGERUNG, IST_WIDERRUF } from './lib/parse.mjs';
import { shabPublikationen, shabXml, geokodiere, gebaeude, kategorieAusKlasse, warte } from './lib/quellen.mjs';

const DATEI = fileURLToPath(new URL('../public/data/steigerungen.json', import.meta.url));
const arg = (name, std) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : std; };
const TAGE = Number(arg('tage', '10'));
const AUFBEWAHREN_TAGE = 45; // vergangene Steigerungen so lange als «vorbei» behalten

// Erhöhen, wenn der Parser bessere Ergebnisse liefert: bestehende Objekte werden dann neu eingelesen.
const PARSER_VERSION = 3;

const iso = (d) => d.toISOString().slice(0, 10);
const heute = new Date();
const von = new Date(heute.getTime() - TAGE * 864e5);

async function bestand() {
  try {
    const d = JSON.parse(await readFile(DATEI, 'utf8'));
    return d.demo ? { objekte: [], version: PARSER_VERSION } : { objekte: d.objekte, version: d.version ?? 1 }; // Demodaten nicht übernehmen
  } catch { return { objekte: [], version: PARSER_VERSION }; }
}

function amtAusMeta(meta) {
  const eintraege = Object.entries(meta).filter(([k]) => /registrationOffice|publikationsstelle|publishingOffice/i.test(k));
  const name = eintraege.find(([k]) => /displayName/i.test(k))?.[1] ?? eintraege.find(([k]) => /name|organi/i.test(k))?.[1] ?? eintraege[0]?.[1];
  // Strasse, Nr., PLZ, Ort – ohne interne IDs
  const teil = (k) => eintraege.find(([n]) => new RegExp(`registrationOffice\\.${k}$`, 'i').test(n))?.[1];
  const strasse = [teil('street'), teil('streetNumber')].filter(Boolean).join(' ');
  const ort = [teil('swissZipCode'), teil('town')].filter(Boolean).join(' ');
  return { amtName: name, amtAdresse: [strasse, ort].filter(Boolean).join(', ') || undefined };
}

const PARKPLATZ = /autoabstellplatz|parkplatz|einstellplatz|garagenplatz|place de parc|posteggio/i;

/** Publikation laden, parsen und mit Koordinaten und Gebäudedaten anreichern. */
async function verarbeite(p) {
  const xml = await shabXml(p.id);
  if (!xml) return undefined;
  const { text, meta, felder } = xmlZuText(xml);
  const titel = meta['title.de'] ?? p.titel ?? '';
  const o = parsePublikation(text, { ...p, titel, ...amtAusMeta(meta) }, felder);
  if (IST_WIDERRUF(titel)) return { widerruf: o };

  const geo = await geokodiere(o.adresse, o.gemeinde);
  if (geo) { o.lat = geo.lat; o.lon = geo.lon; o.genau = geo.genau; }

  // EGID aus der Publikation ist verlässlicher als die der Adresssuche
  const egid = o.egid?.[0] ?? geo?.egid;
  if (egid && o.kategorie !== 'Grundstueck') {
    try {
      const r = await gebaeude(egid, o.kategorie, { lage: o.lage, zimmer: o.zimmer });
      if (r) {
        o.gebaeude = r.gebaeude;
        if (r.koordinaten && !o.genau) { o.lat = r.koordinaten.lat; o.lon = r.koordinaten.lon; o.genau = true; }
        if (!o.adresse?.strasse && r.adresse) o.adresse = r.adresse;
        const k = kategorieAusKlasse(r.gebaeude.klasse);
        if (o.kategorie === 'Sonstiges' && k && !PARKPLATZ.test(o.beschreibung)) o.kategorie = k;
      }
    } catch (e) { console.warn(`GWR ${egid}: ${e.message}`); }
  }
  return { objekt: o };
}

async function main() {
  console.log(`SHAB: Publikationen ${iso(von)} – ${iso(heute)}`);
  const pubs = await shabPublikationen(iso(von), iso(heute));
  const steigerungen = pubs.filter((p) => IST_STEIGERUNG(p.titel, p.subRubrik));
  console.log(`${pubs.length} Publikationen, davon ${steigerungen.length} Grundstücksteigerungen oder Widerrufe`);

  const { objekte: alt, version } = await bestand();
  const nachId = new Map(alt.map((o) => [o.id, o]));
  const widerrufe = [];
  let neu = 0, erneuert = 0, fehler = 0;

  // Bestehende Objekte neu einlesen, wenn der Parser verbessert wurde
  if (version !== PARSER_VERSION && alt.length) {
    console.log(`Parser-Version ${version} → ${PARSER_VERSION}: ${alt.length} bestehende Objekte werden neu eingelesen`);
    for (const o of alt) {
      try {
        const r = await verarbeite({ id: o.quelle.id, nummer: o.id, datum: o.quelle.datum, kantone: [o.kanton], subRubrik: o.id.slice(0, 4), sprache: o.quelle.sprache });
        if (r?.objekt) { nachId.set(o.id, { ...r.objekt, status: o.status === 'aktiv' ? 'aktiv' : o.status }); erneuert++; }
        await warte(200);
      } catch (e) { fehler++; console.warn(`${o.id}: ${e.message}`); }
    }
  }

  for (const p of steigerungen) {
    if (nachId.has(p.nummer)) continue;
    try {
      const r = await verarbeite(p);
      if (r?.widerruf) { widerrufe.push(r.widerruf); continue; }
      if (!r?.objekt) continue;
      nachId.set(r.objekt.id, r.objekt);
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

  await writeFile(DATEI, JSON.stringify({ stand: new Date().toISOString(), demo: false, version: PARSER_VERSION, objekte }, null, 1) + '\n');
  console.log(`Fertig: ${neu} neu, ${erneuert} neu eingelesen, ${widerrufe.length} Widerrufe, ${fehler} Fehler, ${objekte.length} Objekte gespeichert.`);
  if (fehler > 0 && neu === 0 && erneuert === 0 && steigerungen.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
