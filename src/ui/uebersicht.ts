import { KATEGORIEN, type Kategorie } from '../typen';
import { bewertung, istNeu, zustand, speichereFilter, STANDARD_FILTER } from '../zustand';
import { esc, tageBis } from '../format';
import { objektKarte, leer } from './teile';
import { neueKarte, zeigeObjekte } from './karte';

export function uebersicht(app: HTMLElement): void {
  const alle = zustand.daten.objekte;
  const aktiv = alle.filter((o) => o.status === 'aktiv');
  const neu = aktiv.filter(istNeu);
  const bald = aktiv.filter((o) => (tageBis(o.steigerung?.datum) ?? 99) <= 14);
  const top = aktiv.filter((o) => bewertung(o).urteil === 'lohnend').sort((a, b) => bewertung(b).score - bewertung(a).score).slice(0, 4);
  const naechste = aktiv.slice().sort((a, b) => (a.steigerung?.datum ?? '9').localeCompare(b.steigerung?.datum ?? '9')).slice(0, 4);

  const kacheln = (Object.keys(KATEGORIEN) as Kategorie[]).map((k) => {
    const n = aktiv.filter((o) => o.kategorie === k).length;
    return `<button class="kachel kat-rand-${k}" data-kat="${k}"><b>${n}</b><span>${esc(KATEGORIEN[k])}</span></button>`;
  }).join('');

  const kantone = Object.entries(aktiv.reduce<Record<string, number>>((m, o) => ((m[o.kanton || '?'] = (m[o.kanton || '?'] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1]);

  app.innerHTML = `
    <section class="held">
      <h1>Zwangsversteigerungen in der ganzen Schweiz</h1>
      <p>Alle Grundstücksteigerungen der Betreibungs- und Konkursämter, direkt aus dem Schweizerischen Handelsamtsblatt – mit Vorbewertung, Renovationsrechner und Karte. Kostenlos.</p>
      <div class="kennzahlen">
        <a href="#/objekte" class="kz"><b>${aktiv.length}</b><span>offene Steigerungen</span></a>
        <a href="#/objekte" data-sort="neu" class="kz"><b>${neu.length}</b><span>neu seit letztem Besuch</span></a>
        <a href="#/objekte" class="kz"><b>${bald.length}</b><span>in den nächsten 14 Tagen</span></a>
        <a href="#/objekte" data-urteil="lohnend" class="kz gut"><b>${aktiv.filter((o) => bewertung(o).urteil === 'lohnend').length}</b><span>lohnen sich voraussichtlich</span></a>
      </div>
    </section>

    <section><h2>Nach Kategorie</h2><div class="kacheln">${kacheln}</div></section>

    <section class="zwei">
      <div>
        <h2>Beste Vorbewertung</h2>
        <div class="liste">${top.map((o) => objektKarte(o)).join('') || leer('Zurzeit keine Objekte mit klar positiver Vorbewertung.')}</div>
      </div>
      <div>
        <h2>Nächste Termine</h2>
        <div class="liste">${naechste.map((o) => objektKarte(o)).join('') || leer('Keine offenen Steigerungen.')}</div>
      </div>
    </section>

    <section>
      <h2>Karte</h2>
      <div id="uebersicht-karte" class="karte mittel"></div>
      <div class="legende"><span class="p gut"></span>lohnt sich voraussichtlich <span class="p mittel"></span>prüfen <span class="p schlecht"></span>eher nicht <span class="p unklar"></span>zu wenig Daten</div>
    </section>

    <section>
      <h2>Nach Kanton</h2>
      <div class="kantone">${kantone.map(([k, n]) => `<button class="kt" data-kanton="${esc(k)}"><b>${esc(k)}</b> ${n}</button>`).join('') || '<p class="still">–</p>'}</div>
    </section>`;

  const k = neueKarte(app.querySelector('#uebersicht-karte')!);
  zeigeObjekte(k, aktiv);

  const zuListe = (f: Partial<typeof STANDARD_FILTER>) => {
    zustand.filter = { ...STANDARD_FILTER, ansicht: zustand.filter.ansicht, ...f };
    speichereFilter();
    location.hash = '#/objekte';
  };
  app.querySelectorAll<HTMLButtonElement>('[data-kat]').forEach((b) => b.addEventListener('click', () => zuListe({ kategorien: [b.dataset.kat!] })));
  app.querySelectorAll<HTMLButtonElement>('[data-kanton]').forEach((b) => b.addEventListener('click', () => zuListe({ kanton: b.dataset.kanton! })));
  app.querySelectorAll<HTMLAnchorElement>('.kz').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    zuListe({ sortierung: a.dataset.sort === 'neu' ? 'neu' : 'datum', urteil: a.dataset.urteil === 'lohnend' ? 'lohnend' : '' });
  }));
}
