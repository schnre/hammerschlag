import type L from 'leaflet';
import { KANTONE, KATEGORIEN, type Kategorie, type Objekt } from '../typen';
import { bewertung, istNeu, zustand, speichereFilter, STANDARD_FILTER, type Filter } from '../zustand';
import { distanzKm, esc } from '../format';
import { objektKarte, leer, ortSuchen, csv, herunterladen } from './teile';
import { neueKarte, zeigeObjekte } from './karte';

export function filtere(objekte: Objekt[], f: Filter): { o: Objekt; km?: number }[] {
  const q = f.suche.trim().toLowerCase();
  let r = objekte.map((o) => ({ o, km: f.umkreisKoord && o.lat != null ? distanzKm(f.umkreisKoord, [o.lat, o.lon!]) : undefined }));
  r = r.filter(({ o, km }) => {
    if (f.nurAktiv && o.status !== 'aktiv') return false;
    if (f.kategorien.length && !f.kategorien.includes(o.kategorie)) return false;
    if (f.kanton && o.kanton !== f.kanton) return false;
    if (f.art && o.art !== f.art) return false;
    if (f.maxPreis && (o.schaetzung ?? 0) > f.maxPreis) return false;
    if (f.urteil && bewertung(o).urteil !== f.urteil && !(f.urteil === 'pruefen' && bewertung(o).urteil === 'lohnend')) return false;
    if (f.umkreisKoord && f.umkreisKm > 0 && (km == null || km > f.umkreisKm)) return false;
    if (q) {
      const t = [o.titel, o.grundbuch, o.adresse?.strasse, o.adresse?.plz, o.adresse?.ort, o.beschreibung, o.amt.name, o.quelle.nummer].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => t.includes(w))) return false;
    }
    return true;
  });
  const d = (o: Objekt) => o.steigerung?.datum ?? '9999';
  const sort: Record<Filter['sortierung'], (a: { o: Objekt; km?: number }, b: { o: Objekt; km?: number }) => number> = {
    datum: (a, b) => d(a.o).localeCompare(d(b.o)),
    'preis-auf': (a, b) => (a.o.schaetzung ?? 9e12) - (b.o.schaetzung ?? 9e12),
    'preis-ab': (a, b) => (b.o.schaetzung ?? 0) - (a.o.schaetzung ?? 0),
    score: (a, b) => bewertung(b.o).score - bewertung(a.o).score,
    distanz: (a, b) => (a.km ?? 1e9) - (b.km ?? 1e9),
    neu: (a, b) => b.o.quelle.datum.localeCompare(a.o.quelle.datum) || Number(istNeu(b.o)) - Number(istNeu(a.o)),
  };
  return r.sort(sort[f.sortierung]);
}

let karte: L.Map | undefined;

export function objekte(app: HTMLElement): void {
  const f = zustand.filter;
  app.innerHTML = `
    <div class="objekte-layout">
      <aside class="filter" id="filter">
        <div class="filter-kopf"><h2>Filter</h2><button class="link" id="zuruecksetzen">Zurücksetzen</button></div>
        <label class="feld"><span>Suche</span><input type="search" id="suche" placeholder="Ort, PLZ, Strasse, Stichwort" value="${esc(f.suche)}"></label>
        <fieldset class="feld"><legend>Kategorie</legend><div class="chips">
          ${(Object.keys(KATEGORIEN) as Kategorie[]).map((k) => `<label class="chip-check"><input type="checkbox" name="kat" value="${k}" ${f.kategorien.includes(k) ? 'checked' : ''}><span>${esc(KATEGORIEN[k])}</span></label>`).join('')}
        </div></fieldset>
        <div class="feld-reihe">
          <label class="feld"><span>Kanton</span><select id="kanton"><option value="">Alle</option>${KANTONE.map((k) => `<option ${f.kanton === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label class="feld"><span>Verfahren</span><select id="art"><option value="">Alle</option><option value="betreibung" ${f.art === 'betreibung' ? 'selected' : ''}>Betreibung</option><option value="konkurs" ${f.art === 'konkurs' ? 'selected' : ''}>Konkurs</option></select></label>
        </div>
        <fieldset class="feld"><legend>Umkreissuche</legend>
          <div class="feld-reihe">
            <input id="umkreis-ort" placeholder="PLZ oder Ort" value="${esc(f.umkreisOrt)}" autocomplete="postal-code">
            <select id="umkreis-km">${[0, 10, 20, 30, 50, 100].map((k) => `<option value="${k}" ${f.umkreisKm === k ? 'selected' : ''}>${k ? `${k} km` : 'kein Umkreis'}</option>`).join('')}</select>
          </div>
          <small id="umkreis-info" class="still">${f.umkreisKoord ? `Mittelpunkt: ${esc(f.umkreisOrt)}` : ''}</small>
        </fieldset>
        <div class="feld-reihe">
          <label class="feld"><span>Schätzung bis</span><select id="max-preis">${[0, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000].map((p) => `<option value="${p}" ${(f.maxPreis ?? 0) === p ? 'selected' : ''}>${p ? `CHF ${(p / 1000).toLocaleString('de-CH')}k` : 'beliebig'}</option>`).join('')}</select></label>
          <label class="feld"><span>Bewertung</span><select id="urteil"><option value="">alle</option><option value="lohnend" ${f.urteil === 'lohnend' ? 'selected' : ''}>lohnt sich</option><option value="pruefen" ${f.urteil === 'pruefen' ? 'selected' : ''}>mind. prüfenswert</option></select></label>
        </div>
        <label class="schalter"><input type="checkbox" id="nur-aktiv" ${f.nurAktiv ? 'checked' : ''}><span>Nur offene Steigerungen</span></label>
      </aside>

      <section class="ergebnis">
        <div class="werkzeug">
          <button class="knopf klein nur-mobil" id="filter-auf">Filter</button>
          <span id="treffer" class="treffer"></span>
          <select id="sortierung" aria-label="Sortierung">
            <option value="datum">Steigerungsdatum</option><option value="neu">Neueste zuerst</option><option value="score">Beste Bewertung</option>
            <option value="preis-auf">Schätzung aufsteigend</option><option value="preis-ab">Schätzung absteigend</option><option value="distanz">Distanz</option>
          </select>
          <div class="segment" role="tablist">
            <button data-ansicht="liste" role="tab">Liste</button><button data-ansicht="karte" role="tab">Karte</button>
          </div>
          <button class="knopf klein" id="csv" title="Als CSV für Excel exportieren">CSV</button>
        </div>
        <div id="ergebnis-liste" class="liste raster"></div>
        <div id="ergebnis-karte" class="karte gross" hidden></div>
      </section>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector<T>(s)!;
  ($('#sortierung') as HTMLSelectElement).value = f.sortierung;

  const zeichne = () => {
    const r = filtere(zustand.daten.objekte, zustand.filter);
    $('#treffer').textContent = `${r.length} ${r.length === 1 ? 'Objekt' : 'Objekte'}`;
    app.querySelectorAll<HTMLButtonElement>('[data-ansicht]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ansicht === zustand.filter.ansicht)));
    const liste = $('#ergebnis-liste'), kEl = $('#ergebnis-karte');
    liste.hidden = zustand.filter.ansicht !== 'liste';
    kEl.hidden = zustand.filter.ansicht !== 'karte';
    if (zustand.filter.ansicht === 'liste') {
      liste.innerHTML = r.map(({ o, km }) => objektKarte(o, km)).join('') || leer('Keine Objekte für diese Filter.', '<button class="knopf" id="leer-reset">Filter zurücksetzen</button>');
      liste.querySelector('#leer-reset')?.addEventListener('click', reset);
    } else {
      if (!karte || !kEl.contains(karte.getContainer())) karte = neueKarte(kEl);
      setTimeout(() => karte!.invalidateSize(), 0);
      const fu = zustand.filter;
      zeigeObjekte(karte, r.map((x) => x.o), fu.umkreisKoord && fu.umkreisKm ? { koord: fu.umkreisKoord, km: fu.umkreisKm } : undefined);
    }
    speichereFilter();
  };

  const setze = (p: Partial<Filter>) => { Object.assign(zustand.filter, p); zeichne(); };
  const reset = () => { zustand.filter = { ...STANDARD_FILTER, ansicht: zustand.filter.ansicht }; speichereFilter(); objekte(app); };

  let t: number | undefined;
  $('#suche').addEventListener('input', (e) => { clearTimeout(t); t = window.setTimeout(() => setze({ suche: (e.target as HTMLInputElement).value }), 150); });
  app.querySelectorAll<HTMLInputElement>('input[name=kat]').forEach((c) => c.addEventListener('change', () =>
    setze({ kategorien: [...app.querySelectorAll<HTMLInputElement>('input[name=kat]:checked')].map((x) => x.value) })));
  $('#kanton').addEventListener('change', (e) => setze({ kanton: (e.target as HTMLSelectElement).value }));
  $('#art').addEventListener('change', (e) => setze({ art: (e.target as HTMLSelectElement).value as Filter['art'] }));
  $('#max-preis').addEventListener('change', (e) => setze({ maxPreis: Number((e.target as HTMLSelectElement).value) || undefined }));
  $('#urteil').addEventListener('change', (e) => setze({ urteil: (e.target as HTMLSelectElement).value as Filter['urteil'] }));
  $('#nur-aktiv').addEventListener('change', (e) => setze({ nurAktiv: (e.target as HTMLInputElement).checked }));
  $('#sortierung').addEventListener('change', (e) => setze({ sortierung: (e.target as HTMLSelectElement).value as Filter['sortierung'] }));
  app.querySelectorAll<HTMLButtonElement>('[data-ansicht]').forEach((b) => b.addEventListener('click', () => setze({ ansicht: b.dataset.ansicht as Filter['ansicht'] })));
  $('#zuruecksetzen').addEventListener('click', reset);
  $('#filter-auf').addEventListener('click', () => $('#filter').classList.toggle('offen'));
  $('#csv').addEventListener('click', () => herunterladen(`steigerungen-${new Date().toISOString().slice(0, 10)}.csv`, csv(filtere(zustand.daten.objekte, zustand.filter).map((x) => x.o)), 'text/csv;charset=utf-8'));

  const umkreis = async () => {
    const ort = ($('#umkreis-ort') as HTMLInputElement).value.trim();
    const km = Number(($('#umkreis-km') as HTMLSelectElement).value);
    const info = $('#umkreis-info');
    if (!ort) { setze({ umkreisOrt: '', umkreisKoord: undefined, umkreisKm: km }); info.textContent = ''; return; }
    if (km === 0) ($('#umkreis-km') as HTMLSelectElement).value = '20';
    info.textContent = 'Suche Ort …';
    try {
      const r = await ortSuchen(ort);
      if (!r) { info.textContent = 'Ort nicht gefunden.'; return; }
      info.textContent = `Mittelpunkt: ${r.name}`;
      setze({ umkreisOrt: ort, umkreisKoord: r.koord, umkreisKm: Number(($('#umkreis-km') as HTMLSelectElement).value), sortierung: zustand.filter.sortierung === 'datum' ? 'distanz' : zustand.filter.sortierung });
      ($('#sortierung') as HTMLSelectElement).value = zustand.filter.sortierung;
    } catch { info.textContent = 'Ortssuche nicht erreichbar.'; }
  };
  $('#umkreis-ort').addEventListener('change', umkreis);
  $('#umkreis-km').addEventListener('change', umkreis);

  zeichne();
}
