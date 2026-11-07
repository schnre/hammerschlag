import type L from 'leaflet';
import { KATEGORIEN, type Objekt } from '../typen';
import { URTEIL_TEXT, handaenderungssatz, type Bewertung, type Eingaben, type Posten } from '../bewertung';
import { bewertung, config, setzeEingaben, setzeNotiz, toggleMerk, zustand } from '../zustand';
import { chf, datum, esc, inTagen, zahlFmt } from '../format';
import { adresseText, aktualisiereMerkZahl, herunterladen, ics, leer, statusChips } from './teile';
import { einzelKarte } from './karte';

let karte: L.Map | undefined;

const QUELLE_KURZ: Record<string, string> = { Eingabe: 'eigene Eingabe', Publikation: 'SHAB', Gebäuderegister: 'GWR', Schätzung: 'geschätzt', Annahme: 'Annahme' };
const q = (p: Posten<unknown>) => `<small class="quelle q-${p.quelle}">${QUELLE_KURZ[p.quelle]}</small>`;

function links(o: Objekt): string {
  const ort = adresseText(o);
  const suche = encodeURIComponent(o.egrid[0] ?? (ort || `${o.lat},${o.lon}`));
  const ll = o.lat != null ? `${o.lat},${o.lon}` : '';
  const l: [string, string, string][] = [
    ['Amtliche Publikation (SHAB)', o.quelle.url, 'Massgebender Originaltext'],
    ['Parzelle & ÖREB-Kataster', `https://map.geo.admin.ch/?lang=de&swisssearch=${suche}&layers=ch.kantone.cadastralwebmap-farbe`, 'Grenzen, Eigentumsbeschränkungen, Auszug'],
    ['Bauzonen', `https://map.geo.admin.ch/?lang=de&swisssearch=${suche}&layers=ch.are.bauzonen`, 'Zone und Ausbaureserven abschätzen'],
    ['Strassenlärm', `https://map.geo.admin.ch/?lang=de&swisssearch=${suche}&layers=ch.bafu.laerm-strassenlaerm_tag`, 'Lärmbelastung am Tag'],
    ['Solarpotenzial Dach', `https://www.uvek-gis.admin.ch/BFE/sonnendach/?lang=de${o.lat != null ? `#lat=${o.lat}&lon=${o.lon}` : ''}`, 'sonnendach.ch'],
  ];
  if (ll) {
    l.push(['Google Maps', `https://www.google.com/maps/search/?api=1&query=${ll}`, 'Umgebung, Route']);
    l.push(['Street View', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`, 'Ansicht von der Strasse']);
  }
  if (o.amt.web) l.push(['Website des Amts', `https://${o.amt.web.replace(/^https?:\/\//, '')}`, 'Oft mit Gutachten und Steigerungsbedingungen']);
  return l.map(([t, u, s]) => `<a class="linkzeile" href="${esc(u)}" target="_blank" rel="noopener"><b>${esc(t)}</b><small>${esc(s)}</small><span aria-hidden="true">↗</span></a>`).join('');
}

function mailUnterlagen(o: Objekt): string {
  const betreff = `Unterlagen zur Grundstücksteigerung ${o.quelle.nummer}`;
  const text = `Guten Tag

Ich interessiere mich für die publizierte Grundstücksteigerung (SHAB ${o.quelle.nummer}, Grundbuch ${o.grundbuch ?? '–'}, Grundstück Nr. ${o.grundstueckNr.join(', ') || '–'}, Steigerung am ${datum(o.steigerung?.datum, false)}).

Könnten Sie mir bitte folgende Unterlagen zustellen:
- Steigerungsbedingungen
- Lastenverzeichnis
- Schätzungsgutachten bzw. Verkehrswertschätzung
- Grundbuchauszug und Pläne, sofern vorhanden

Ausserdem möchte ich mich für die Besichtigung anmelden${o.besichtigung ? ` (${o.besichtigung})` : ''}.

Freundliche Grüsse
[Name]
[Adresse]
[Telefon]`;
  return `mailto:${o.amt.email ?? ''}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

function rechnerFeld(id: keyof Eingaben, label: string, p: Posten<number | undefined>, einheit: string, eigen?: number): string {
  return `<label class="feld rechner-feld"><span>${esc(label)} ${q(p)}</span>
    <div class="mit-einheit"><input type="number" inputmode="numeric" data-eingabe="${id}" value="${eigen ?? ''}" placeholder="${p.wert != null ? Math.round(p.wert) : 'unbekannt'}"><em>${einheit}</em></div></label>`;
}

function rechnung(o: Objekt, b: Bewertung): string {
  const c = config();
  const satz = handaenderungssatz(o.kanton, c) + c.nebenkosten.grundbuchUndSteigerung;
  const zeile = (t: string, w?: number, k = '', z = '') => `<tr class="${k}"><td>${t}${z ? ` <small>${z}</small>` : ''}</td><td>${w == null ? '–' : chf(w)}</td></tr>`;
  const max = Math.max(b.investition + b.verkaufskosten + b.risikoabschlag, b.marktwert.wert ?? 0, 1);
  const pct = (n: number) => `${((n / max) * 100).toFixed(1)}%`;
  return `
    <div class="balken" aria-hidden="true">
      <div class="balken-zeile"><span>Kosten</span><div class="spur">
        <i class="b-gebot" style="width:${pct(b.gebot.wert)}"></i><i class="b-neben" style="width:${pct(b.nebenkosten)}"></i><i class="b-reno" style="width:${pct(b.renovation.wert)}"></i><i class="b-risiko" style="width:${pct(b.verkaufskosten + b.risikoabschlag)}"></i>
      </div></div>
      <div class="balken-zeile"><span>Wert</span><div class="spur"><i class="b-wert" style="width:${pct(b.marktwert.wert ?? 0)}"></i></div></div>
      <div class="balken-legende"><span><i class="b-gebot"></i>Gebot</span><span><i class="b-neben"></i>Nebenkosten</span><span><i class="b-reno"></i>Renovation</span><span><i class="b-risiko"></i>Verkauf & Risiko</span><span><i class="b-wert"></i>Marktwert</span></div>
    </div>
    <table class="rechnung">
      ${zeile('Gebot / Zuschlag', b.gebot.wert)}
      ${zeile('Nebenkosten Erwerb', b.nebenkosten, '', `${(satz * 100).toFixed(1)} %`)}
      ${zeile('Renovation', b.renovation.wert)}
      ${zeile('Investition total', b.investition, 'summe')}
      ${zeile('Marktwert nach Renovation', b.marktwert.wert)}
      ${zeile('– Verkaufskosten', b.verkaufskosten ? -b.verkaufskosten : undefined, '', `${(c.verkaufskosten * 100).toFixed(0)} %`)}
      ${zeile('– Risikoreserve', -b.risikoabschlag, '', 'Unvorhergesehenes')}
      ${zeile('Gewinn bei Verkauf', b.gewinn, `summe ${b.gewinn != null && b.gewinn < 0 ? 'neg' : 'pos'}`)}
    </table>
    <div class="rendite">
      <div><small>Rendite auf Investition</small><b>${b.renditeProzent != null ? `${b.renditeProzent.toFixed(1)} %` : '–'}</b></div>
      <div><small>Bruttomietrendite ${b.mieteJahr ? q(b.mieteJahr) : ''}</small><b>${b.bruttoRendite != null ? `${b.bruttoRendite.toFixed(1)} %` : '–'}</b><small>${b.mieteJahr?.wert ? `${chf(b.mieteJahr.wert)} Miete/Jahr` : ''}</small></div>
    </div>`;
}

export function detail(app: HTMLElement, id: string): void {
  const o = zustand.daten.objekte.find((x) => x.id === id);
  if (!o) { app.innerHTML = leer('Dieses Objekt gibt es nicht (mehr).', '<a class="knopf" href="#/objekte">Zu allen Objekten</a>'); return; }
  const b = bewertung(o);
  const e = zustand.eingaben[o.id] ?? {};
  const g = o.gebaeude;
  const termine: [string, string | undefined, string?][] = [
    ['Steigerung', o.steigerung?.datum ? `${datum(o.steigerung.datum)}${o.steigerung.zeit ? `, ${o.steigerung.zeit} Uhr` : ''}` : undefined, o.steigerung?.ort],
    ['Besichtigung', o.besichtigung],
    ['Auflage Steigerungsbedingungen', o.auflage, 'Beim Amt einsehbar, Beschwerdefrist läuft ab Auflage'],
    ['Eingabefrist Gläubiger', o.eingabefrist ? datum(o.eingabefrist) : undefined],
  ];

  app.innerHTML = `
    <nav class="zurueck"><a href="#/objekte">← Alle Objekte</a></nav>
    <article class="detail">
      <header class="detail-kopf">
        <div class="chips-zeile"><span class="kat kat-${o.kategorie}">${esc(KATEGORIEN[o.kategorie])}</span><span class="kanton">${esc(o.kanton)}</span>${statusChips(o)}</div>
        <h1>${esc(o.titel)}</h1>
        <p class="adresse">${esc(adresseText(o))}${o.genau === false ? ' <small>(Standort nur ungefähr)</small>' : ''}</p>
        <div class="aktionen">
          <button class="knopf ${zustand.merk.has(o.id) ? 'aktiv' : ''}" id="merken">${zustand.merk.has(o.id) ? '★ Gemerkt' : '☆ Merken'}</button>
          ${o.steigerung?.datum ? '<button class="knopf" id="kalender">In Kalender</button>' : ''}
          <a class="knopf primaer" href="${mailUnterlagen(o)}">Gutachten & Unterlagen anfordern</a>
          <button class="knopf" id="teilen">Teilen</button>
        </div>
      </header>

      <section class="urteil-karte urteil-rand-${b.urteil}">
        <div class="urteil-haupt">
          <div class="score" style="--s:${b.score}"><b>${b.renditeProzent != null ? b.score : '?'}</b><small>/100</small></div>
          <div><h2>${esc(URTEIL_TEXT[b.urteil])}</h2>
            <p>${b.gewinn != null ? `Geschätzter Gewinn nach Renovation und Verkauf: <b>${chf(b.gewinn)}</b> (${b.renditeProzent!.toFixed(1)} % auf ${chf(b.investition, true)} Investition).` : 'Für eine Aussage fehlen Wohnfläche oder Marktpreis. Trag die Werte unten im Rechner ein – sie stehen meist im Schätzungsgutachten.'}</p>
            <p class="still">Datenqualität ${b.datenqualitaet} % · Werte mit «geschätzt» oder «Annahme» unbedingt prüfen.</p>
          </div>
        </div>
        ${b.hinweise.length ? `<ul class="hinweise">${b.hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      </section>

      <div class="detail-raster">
        <section class="block">
          <h2>Eckdaten</h2>
          <dl class="eckdaten">
            <dt>Amtliche Schätzung</dt><dd><b>${chf(o.schaetzung)}</b></dd>
            ${o.flaecheGrundstueck ? `<dt>Grundstücksfläche</dt><dd>${zahlFmt(o.flaecheGrundstueck, 'm²')}</dd>` : ''}
            ${o.zimmer ? `<dt>Zimmer</dt><dd>${String(o.zimmer).replace('.5', '½')}</dd>` : ''}
            <dt>Grundbuch</dt><dd>${esc(o.grundbuch ?? '–')}</dd>
            <dt>Grundstück-Nr.</dt><dd>${esc(o.grundstueckNr.join(', ') || '–')}</dd>
            ${o.egrid.length ? `<dt>E-GRID</dt><dd><code>${esc(o.egrid.join(', '))}</code></dd>` : ''}
            <dt>Verfahren</dt><dd>${o.art === 'konkurs' ? 'Konkursamtliche Steigerung' : 'Betreibungsamtliche Steigerung'}</dd>
            <dt>Publiziert</dt><dd>${datum(o.quelle.datum, false)} · ${esc(o.quelle.nummer)}</dd>
          </dl>
        </section>

        <section class="block">
          <h2>Termine</h2>
          <ul class="termine">${termine.filter(([, w]) => w).map(([t, w, s]) => `<li><small>${esc(t)}</small><b>${esc(w)}</b>${t === 'Steigerung' ? ` <span class="chip">${esc(inTagen(o.steigerung?.datum))}</span>` : ''}${s ? `<span class="still">${esc(s)}</span>` : ''}</li>`).join('') || '<li class="still">Keine Termine erkannt – siehe Publikation.</li>'}</ul>
        </section>

        <section class="block">
          <h2>Gebäude <small class="still">Gebäude- und Wohnungsregister</small></h2>
          ${g ? `<dl class="eckdaten">
            ${g.baujahr ? `<dt>Baujahr</dt><dd>${g.baujahr}</dd>` : ''}
            ${g.geschosse ? `<dt>Geschosse</dt><dd>${g.geschosse}</dd>` : ''}
            ${g.wohnungen ? `<dt>Wohnungen im Gebäude</dt><dd>${g.wohnungen}</dd>` : ''}
            ${g.grundflaeche ? `<dt>Gebäudegrundfläche</dt><dd>${zahlFmt(g.grundflaeche, 'm²')}</dd>` : ''}
            ${g.wohnflaeche ? `<dt>Wohnfläche</dt><dd>${zahlFmt(g.wohnflaeche, 'm²')}</dd>` : ''}
            ${g.heizung ? `<dt>Heizung</dt><dd>${esc(g.heizung)}${g.fossil ? ' <span class="chip rot">Ersatz absehbar</span>' : ''}</dd>` : ''}
            ${g.egid ? `<dt>EGID</dt><dd><code>${esc(g.egid)}</code></dd>` : ''}
          </dl>` : '<p class="still">Keine Gebäudedaten gefunden (z. B. Bauland, Parkplatz oder Adresse nicht eindeutig).</p>'}
        </section>

        <section class="block">
          <h2>Standort</h2>
          <div id="detail-karte" class="karte klein">${o.lat == null ? '<p class="still">Kein Standort ermittelt.</p>' : ''}</div>
        </section>
      </div>

      <section class="block">
        <h2>Renovations- und Renditerechner</h2>
        <p class="still">Leere Felder verwenden den grau angezeigten Wert. Deine Eingaben bleiben in diesem Browser gespeichert.</p>
        <form class="rechner" id="rechner">
          ${rechnerFeld('gebot', 'Gebot', b.gebot, 'CHF', e.gebot)}
          ${rechnerFeld('wohnflaeche', 'Wohnfläche', b.wohnflaeche, 'm²', e.wohnflaeche)}
          ${rechnerFeld('baujahr', 'Baujahr', b.baujahr, '', e.baujahr)}
          ${rechnerFeld('preisProM2', 'Marktpreis renoviert', b.preisProM2, 'CHF/m²', e.preisProM2)}
          ${rechnerFeld('renovation', 'Renovationskosten', b.renovation, 'CHF', e.renovation)}
          ${rechnerFeld('mieteJahr', 'Mieteinnahmen', b.mieteJahr ?? { wert: undefined, quelle: 'Annahme' }, 'CHF/Jahr', e.mieteJahr)}
        </form>
        <div id="rechnung">${rechnung(o, b)}</div>
        <button class="link" id="rechner-reset">Eigene Werte löschen</button>
      </section>

      <div class="detail-raster">
        <section class="block">
          <h2>Objektbeschrieb <small class="still">aus der Publikation</small></h2>
          <pre class="beschrieb">${esc(o.beschreibung)}</pre>
        </section>
        <section class="block">
          <h2>Zuständiges Amt</h2>
          <p><b>${esc(o.amt.name)}</b>${o.amt.adresse ? `<br>${esc(o.amt.adresse)}` : ''}</p>
          <p>${o.amt.email ? `<a href="mailto:${esc(o.amt.email)}">${esc(o.amt.email)}</a><br>` : ''}${o.amt.telefon ? `<a href="tel:${esc(o.amt.telefon.replace(/\s/g, ''))}">${esc(o.amt.telefon)}</a>` : ''}</p>
          <p class="still">Steigerungsbedingungen, Lastenverzeichnis und Gutachten liegen beim Amt auf. Für Besichtigung und Steigerung ist meist eine Voranmeldung nötig.</p>
        </section>
      </div>

      <section class="block">
        <h2>Abklären & Recherche</h2>
        <div class="links">${links(o)}</div>
      </section>

      <section class="block">
        <h2>Meine Notizen</h2>
        <textarea id="notiz" rows="4" placeholder="z. B. Eindruck Besichtigung, Fragen ans Amt, Finanzierung …">${esc(zustand.notizen[o.id] ?? '')}</textarea>
      </section>
    </article>`;

  const kEl = app.querySelector<HTMLElement>('#detail-karte')!;
  karte?.remove();
  if (o.lat != null) karte = einzelKarte(kEl, o);

  app.querySelector('#merken')!.addEventListener('click', (ev) => {
    const an = toggleMerk(o.id);
    const btn = ev.currentTarget as HTMLButtonElement;
    btn.textContent = an ? '★ Gemerkt' : '☆ Merken';
    btn.classList.toggle('aktiv', an);
    aktualisiereMerkZahl();
  });
  app.querySelector('#kalender')?.addEventListener('click', () => herunterladen(`steigerung-${o.id}.ics`, ics(o), 'text/calendar'));
  app.querySelector('#teilen')!.addEventListener('click', async () => {
    const daten = { title: o.titel, text: `${o.titel} – Steigerung ${datum(o.steigerung?.datum, false)}, Schätzung ${chf(o.schaetzung)}`, url: location.href };
    try {
      if (navigator.share) await navigator.share(daten);
      else { await navigator.clipboard.writeText(location.href); (app.querySelector('#teilen') as HTMLElement).textContent = 'Link kopiert'; }
    } catch { /* abgebrochen */ }
  });

  let nt: number | undefined;
  app.querySelector('#notiz')!.addEventListener('input', (ev) => {
    clearTimeout(nt);
    nt = window.setTimeout(() => setzeNotiz(o.id, (ev.target as HTMLTextAreaElement).value), 300);
  });

  const form = app.querySelector<HTMLFormElement>('#rechner')!;
  const neuRechnen = () => {
    const ein: Eingaben = {};
    form.querySelectorAll<HTMLInputElement>('[data-eingabe]').forEach((i) => {
      if (i.value !== '') ein[i.dataset.eingabe as keyof Eingaben] = Number(i.value);
    });
    setzeEingaben(o.id, ein);
    const nb = bewertung(o);
    app.querySelector('#rechnung')!.innerHTML = rechnung(o, nb);
    // Platzhalter abhängiger Felder (Renovation, Miete) aktualisieren
    const ph: Partial<Record<keyof Eingaben, number | undefined>> = { renovation: nb.renovation.wert, mieteJahr: nb.mieteJahr?.wert, preisProM2: nb.preisProM2.wert };
    for (const [k, v] of Object.entries(ph)) {
      const inp = form.querySelector<HTMLInputElement>(`[data-eingabe=${k}]`);
      if (inp) inp.placeholder = v != null ? String(Math.round(v)) : 'unbekannt';
    }
    const kopf = app.querySelector('.urteil-karte h2');
    if (kopf) kopf.textContent = URTEIL_TEXT[nb.urteil];
  };
  form.addEventListener('input', neuRechnen);
  form.addEventListener('submit', (ev) => ev.preventDefault());
  app.querySelector('#rechner-reset')!.addEventListener('click', () => { setzeEingaben(o.id, {}); detail(app, id); });
}
