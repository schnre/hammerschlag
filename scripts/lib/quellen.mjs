// Zugriff auf öffentliche Quellen: SHAB (Amtsblattportal), geo.admin.ch (Adressen) und das
// eidgenössische Gebäude- und Wohnungsregister (GWR) über die geo.admin-API.

const SHAB = 'https://amtsblattportal.ch/api/v1';
const GEO = 'https://api3.geo.admin.ch/rest/services';
const KOPF = { 'User-Agent': 'hammerschlag/1.0 (oeffentliche Steigerungsuebersicht)', Accept: 'application/json' };

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function hole(url, { text = false, versuche = 3 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: text ? { ...KOPF, Accept: 'application/xml' } : KOPF });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return text ? await res.text() : await res.json();
    } catch (err) {
      if (i >= versuche) throw err;
      await warte(1000 * i * i);
    }
  }
}

function titelText(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.de ?? t.fr ?? t.it ?? t.en ?? Object.values(t)[0] ?? '';
}

// SB01 Betreibungsamtliche und KK08 Konkursamtliche Grundstücksteigerung. SB06 (Verwertung) und
// KK10 (Steigerungen im Konkurs) enthalten vereinzelt Liegenschaften, der Titelfilter sortiert aus.
// Ganze Rubriken SB/KK sind zu gross: die API liefert höchstens 10 000 Treffer (sonst HTTP 400).
export const SUBRUBRIKEN = ['SB01', 'SB06', 'KK08', 'KK10'];

/** Liefert Metadaten der Publikationen in den Subrubriken im Zeitraum (paginiert). */
export async function shabPublikationen(von, bis, subRubriken = SUBRUBRIKEN) {
  const alle = [];
  for (let seite = 0; seite < 200; seite++) {
    const q = new URLSearchParams({
      publicationStates: 'PUBLISHED',
      tenant: 'shab',
      'publicationDate.start': von,
      'publicationDate.end': bis,
      'pageRequest.page': String(seite),
      'pageRequest.size': '100',
    });
    subRubriken.forEach((r) => q.append('subRubrics', r));
    const res = await hole(`${SHAB}/publications?${q}`);
    const liste = res?.content ?? (Array.isArray(res) ? res : []);
    for (const eintrag of liste) {
      const m = eintrag.meta ?? eintrag;
      alle.push({
        id: m.id,
        nummer: m.publicationNumber,
        datum: (m.publicationDate ?? '').slice(0, 10),
        subRubrik: m.subRubric,
        titel: titelText(m.title),
        kantone: m.cantons ?? [],
        sprache: m.language,
      });
    }
    if (liste.length < 100) break;
    if (res?.total != null && (seite + 1) * 100 >= Math.min(res.total, 10000)) break;
    await warte(300);
  }
  return alle;
}

export async function shabXml(id) {
  return hole(`${SHAB}/publications/${id}/xml`, { text: true });
}

/** Adresse oder Gemeinde → Koordinaten (WGS84) und EGID, falls die Adresse exakt gefunden wurde. */
export async function geokodiere(adresse, gemeinde) {
  if (adresse?.strasse && (adresse.plz || adresse.ort)) {
    const q = new URLSearchParams({ searchText: `${adresse.strasse} ${adresse.plz ?? ''} ${adresse.ort ?? ''}`.replace(/\s+/g, ' ').trim(), type: 'locations', origins: 'address', sr: '4326', limit: '1' });
    const r = await hole(`${GEO}/api/SearchServer?${q}`);
    const a = r?.results?.[0]?.attrs;
    if (a?.lat) return { lat: a.lat, lon: a.lon, genau: true, egid: String(a.featureId ?? '').split('_')[0] || undefined };
  }
  const ort = adresse?.ort ?? gemeinde;
  // «La Baroche-Charmoille» → zuerst ganz, dann nur «La Baroche»
  const versuche = ort ? [`${adresse?.plz ?? ''} ${ort}`.trim(), ort.split('-')[0].trim()] : [];
  for (const text of [...new Set(versuche)]) {
    const q = new URLSearchParams({ searchText: text, type: 'locations', origins: 'zipcode,gg25', sr: '4326', limit: '1' });
    const r = await hole(`${GEO}/api/SearchServer?${q}`);
    const a = r?.results?.[0]?.attrs;
    if (a?.lat) return { lat: a.lat, lon: a.lon, genau: false };
  }
  return null;
}

const ENERGIE = {
  7500: 'keine', 7501: 'Luft (Wärmepumpe)', 7510: 'Erdwärme', 7511: 'Erdwärmesonde', 7512: 'Erdregister', 7513: 'Wasser (Wärmepumpe)',
  7520: 'Gas', 7530: 'Heizöl', 7540: 'Holz', 7541: 'Stückholz', 7542: 'Pellets', 7543: 'Holzschnitzel', 7550: 'Abwärme',
  7560: 'Elektrizität (direkt)', 7570: 'Sonne', 7580: 'Fernwärme', 7581: 'Fernwärme', 7582: 'Fernwärme', 7598: 'unbestimmt', 7599: 'andere',
};
const FOSSIL = new Set([7520, 7530, 7560]);

// GWR-Bauperiode (gbaup) → mittleres Baujahr, falls kein genaues Baujahr erfasst ist
const BAUPERIODE = { 8011: 1900, 8012: 1932, 8013: 1953, 8014: 1965, 8015: 1975, 8016: 1983, 8017: 1988, 8018: 1993, 8019: 1998, 8020: 2003, 8021: 2008, 8022: 2013, 8023: 2018 };

// GWR-Gebäudeklasse (gklas) → Kategorie der App
export function kategorieAusKlasse(gklas) {
  const k = Number(gklas);
  if (k === 1110 || k === 1121) return 'EFH';
  if (k === 1122 || k === 1130) return 'MFH';
  if (k === 1242) return 'Sonstiges';
  if (k >= 1211 && k <= 1278) return 'Gewerbe';
  return undefined;
}

const zahl = (v) => (v == null || v === '' ? undefined : Number(v)) || undefined;
const liste = (v) => (Array.isArray(v) ? v : v == null ? [] : String(v).split(/[;,]/)).map(Number).filter((n) => n > 0);

const roh = (v) => (Array.isArray(v) ? v : v == null ? [] : String(v).split(/[;,]/));

/**
 * Welche Wohnung im Gebäude wird versteigert? Vergleicht Stockwerk, Lage (links/rechts/mitte) und
 * Zimmerzahl aus der Publikation mit den Wohnungen im GWR. Liefert die Fläche nur, wenn sie eindeutig ist.
 */
export function passendeWohnung(a, { lage, zimmer } = {}) {
  const stock = roh(a.wstwk).map(Number);
  const bez = roh(a.wbez).map((x) => String(x ?? '').toLowerCase());
  const zim = roh(a.wazim).map(Number);
  const fl = roh(a.warea).map(Number);
  const bj = roh(a.wbauj).map(Number);
  let idx = fl.map((_, i) => i).filter((i) => fl[i] > 0);
  if (!idx.length) return undefined;
  const filter = (f) => { const n = idx.filter(f); if (n.length) idx = n; return n.length > 0; };
  let kriterien = 0;
  if (zimmer) kriterien += filter((i) => zim[i] === Math.floor(zimmer) || zim[i] === Math.ceil(zimmer)) ? 1 : 0;
  if (lage?.stock != null) kriterien += filter((i) => stock[i] === lage.stock) ? 1 : 0;
  if (lage?.seite) kriterien += filter((i) => bez[i].includes(lage.seite)) ? 1 : 0;
  const flaechen = [...new Set(idx.map((i) => fl[i]))];
  if (flaechen.length !== 1 || (kriterien === 0 && fl.length > 1)) return undefined;
  return { wohnflaeche: flaechen[0], baujahr: bj[idx[0]] > 0 ? bj[idx[0]] : undefined };
}

/** Gebäudedaten und Koordinaten aus dem GWR (Baujahr, Geschosse, Wohnungen, Fläche, Heizung). */
export async function gebaeude(egid, kategorie, wohnung = {}) {
  if (!egid) return undefined;
  const r = await hole(`${GEO}/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/${egid}_0?returnGeometry=true&sr=4326&lang=de`);
  const f = r?.feature;
  const a = f?.attributes ?? f?.properties;
  if (!a) return undefined;
  const flaechen = liste(a.warea);
  const zimmer = liste(a.wazim);
  const code = zahl(a.genh1);
  const wBaujahre = liste(a.wbauj);
  const g = {
    egid: String(egid),
    baujahr: zahl(a.gbauj) ?? (wBaujahre.length ? Math.min(...wBaujahre) : undefined),
    geschosse: zahl(a.gastw),
    wohnungen: zahl(a.ganzwhg),
    grundflaeche: zahl(a.garea),
    heizung: code ? ENERGIE[code] ?? String(code) : a.genh1_de ?? undefined,
    fossil: code ? FOSSIL.has(code) : undefined,
    klasse: zahl(a.gklas),
  };
  if (!g.baujahr && BAUPERIODE[a.gbaup]) { g.baujahr = BAUPERIODE[a.gbaup]; g.baujahrUngefaehr = true; }
  if (kategorie !== 'ETW' && flaechen.length) g.wohnflaeche = flaechen.reduce((s, x) => s + x, 0);
  if (kategorie !== 'ETW' && zimmer.length) g.zimmer = zimmer.reduce((s, x) => s + x, 0);
  if (kategorie === 'ETW') {
    const w = passendeWohnung(a, wohnung);
    if (w) g.wohnflaeche = w.wohnflaeche;
  }
  const x = f.geometry?.x ?? f.geometry?.coordinates?.[0] ?? f.bbox?.[0];
  const y = f.geometry?.y ?? f.geometry?.coordinates?.[1] ?? f.bbox?.[1];
  const koordinaten = x > 5 && x < 11 && y > 45 && y < 48 ? { lat: y, lon: x } : undefined;
  return { gebaeude: g, koordinaten, adresse: a.strname_deinr ? { strasse: a.strname_deinr, plz: String(a.dplz4 ?? ''), ort: a.dplzname ?? a.ggdename } : undefined };
}

export { warte };
