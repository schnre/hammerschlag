import { KANTONE } from '../typen';
import { STANDARD_CONFIG } from '../bewertung';
import { zustand, setzeOverrides, exportiere, importiere } from '../zustand';
import { esc } from '../format';
import { geraetText, setzeSkala, skala, type Skala } from '../geraet';
import { objektKarte, leer, csv, herunterladen, aktualisiereMerkZahl } from './teile';

export function merkliste(app: HTMLElement): void {
  const objekte = zustand.daten.objekte.filter((o) => zustand.merk.has(o.id));
  const verwaist = [...zustand.merk].filter((id) => !zustand.daten.objekte.some((o) => o.id === id));
  app.innerHTML = `
    <div class="seitenkopf"><h1>Merkliste</h1>${objekte.length ? '<button class="knopf klein" id="csv">CSV</button>' : ''}</div>
    <div class="liste raster">${objekte.map((o) => `<div class="mit-notiz">${objektKarte(o)}${zustand.notizen[o.id] ? `<p class="notiz">${esc(zustand.notizen[o.id])}</p>` : ''}</div>`).join('')
      || leer('Noch nichts gemerkt. Öffne ein Objekt und tippe auf «Merken».', '<a class="knopf" href="#/objekte">Objekte ansehen</a>')}</div>
    ${verwaist.length ? `<p class="still">${verwaist.length} gemerkte Objekte sind nicht mehr publiziert. <button class="link" id="aufraeumen">Entfernen</button></p>` : ''}`;
  app.querySelector('#csv')?.addEventListener('click', () => herunterladen('merkliste.csv', csv(objekte), 'text/csv;charset=utf-8'));
  app.querySelector('#aufraeumen')?.addEventListener('click', () => {
    verwaist.forEach((id) => zustand.merk.delete(id));
    localStorage.setItem('hs.merk', JSON.stringify([...zustand.merk]));
    aktualisiereMerkZahl(); merkliste(app);
  });
}

export function tipps(app: HTMLElement): void {
  const t: [string, string][] = [
    ['Wie läuft eine Steigerung in der Schweiz ab?', 'Das Betreibungs- oder Konkursamt publiziert die Steigerung mindestens einen Monat im Voraus im SHAB und im kantonalen Amtsblatt. Steigerungsbedingungen und Lastenverzeichnis liegen mindestens zehn Tage vor der Steigerung beim Amt auf. Am Termin wird das Grundstück mündlich ausgerufen; den Zuschlag erhält, wer am meisten bietet.'],
    ['Unterlagen zuerst', 'Fordere Steigerungsbedingungen, Lastenverzeichnis und Schätzungsgutachten beim Amt an (Knopf «Gutachten & Unterlagen anfordern» bei jedem Objekt). Im Lastenverzeichnis stehen Dienstbarkeiten, Grundpfandrechte und Mietverträge, die du übernimmst.'],
    ['Kein Mindestgebot – aber das Deckungsprinzip', 'Bei der betreibungsamtlichen Steigerung wird nur zugeschlagen, wenn das Gebot die vorgehenden Pfandforderungen deckt. Die amtliche Schätzung ist nur ein Anhaltspunkt: Begehrte Objekte gehen oft deutlich darüber weg, wenig gefragte Objekte auch darunter.'],
    ['Finanzierung vorher klären', 'Am Steigerungstag ist meist sofort eine Anzahlung fällig (in den Steigerungsbedingungen festgelegt, oft per Bankcheck), dazu eine Finanzierungsbestätigung der Bank. Der Rest ist innert kurzer Frist zu bezahlen. Ohne Zusage der Bank nicht mitbieten.'],
    ['Ohne Gewährleistung', 'Das Objekt wird gekauft, wie es steht. Mängel, Altlasten oder Feuchtigkeit gehen zu deinen Lasten. Besichtige immer und nimm wenn möglich eine Fachperson (Bauherrenberatung, Architektin) mit.'],
    ['Mietverhältnisse gehen über', 'Bestehende Mietverträge gehen grundsätzlich auf den Ersteigerer über. Eigenbedarf ist nur mit den gesetzlichen Fristen möglich. Das ist wichtig, wenn du selbst einziehen willst.'],
    ['Steuern und Pfandrechte', 'Je nach Kanton fallen Handänderungssteuer und Grundbuchgebühren an. Für gewisse Steuern und Abgaben (z. B. Grundstückgewinnsteuer) bestehen gesetzliche Pfandrechte – frag beim Amt, wer was trägt. Die Prozentsätze in dieser App sind Annahmen.'],
    ['Lex Koller', 'Personen im Ausland bzw. ohne Niederlassung brauchen für den Erwerb von Wohneigentum oft eine Bewilligung. Kläre das vor der Steigerung.'],
    ['Widerruf ist häufig', 'Viele Steigerungen werden abgesagt, weil der Schuldner kurz vorher zahlt. Ruf am Vortag beim Amt an, bevor du anreist.'],
    ['Wie die Bewertung hier funktioniert', 'Marktwert = Wohnfläche × Richtpreis pro m² für Kanton und Kategorie. Renovation = Wohnfläche × Kostensatz nach Baujahr (Zuschlag bei Öl-, Gas- oder Elektroheizung). Dazu Nebenkosten, Verkaufskosten und eine Risikoreserve. Wohnfläche und Baujahr kommen aus dem eidgenössischen Gebäuderegister, wenn die Adresse eindeutig ist. Alle Richtwerte lassen sich unter Einstellungen und pro Objekt anpassen.'],
  ];
  app.innerHTML = `<div class="schmal"><h1>Ratgeber Zwangsversteigerung</h1>
    <p class="still">Allgemeine Hinweise, keine Rechts- oder Finanzberatung. Massgebend sind die Steigerungsbedingungen des jeweiligen Amts.</p>
    ${t.map(([h, p], i) => `<details class="faq" ${i < 2 ? 'open' : ''}><summary>${esc(h)}</summary><p>${esc(p)}</p></details>`).join('')}</div>`;
}

export function einstellungen(app: HTMLElement): void {
  const o = zustand.overrides;
  const c = STANDARD_CONFIG;
  const pct = (v: number) => (v * 100).toFixed(0);
  const etw = c.preisProM2.ETW as Record<string, number>;
  const efh = c.preisProM2.EFH as Record<string, number>;
  app.innerHTML = `<div class="schmal">
    <h1>Einstellungen</h1>
    <section class="block">
      <h2>Darstellung</h2>
      <p class="still">Erkannt: <span id="geraet">${esc(geraetText())}</span></p>
      <fieldset class="feld"><legend>Schriftgrösse</legend><div class="segment segment-voll" role="radiogroup">
        ${([['auto', 'Auto'], ['klein', 'Klein'], ['normal', 'Normal'], ['gross', 'Gross'], ['sehr-gross', 'Grösser']] as [Skala, string][]).map(([k, t]) =>
          `<button type="button" role="radio" data-skala="${k}" aria-checked="${skala() === k}" aria-selected="${skala() === k}">${t}</button>`).join('')}
      </div></fieldset>
      <p class="still"><small>«Auto» passt die Grösse an die Bildschirmbreite deines Geräts an.</small></p>
    </section>
    <section class="block">
      <h2>Bewertung</h2>
      <form id="cfg" class="cfg">
        <label class="feld"><span>Erwarteter Zuschlag in % der Schätzung</span><input type="number" name="zuschlag" value="${pct(o.zuschlagFaktor ?? c.zuschlagFaktor)}"></label>
        <label class="feld"><span>Verkaufskosten in %</span><input type="number" name="verkauf" value="${pct(o.verkaufskosten ?? c.verkaufskosten)}"></label>
        <label class="feld"><span>Risikoreserve in %</span><input type="number" name="risiko" value="${pct(o.risikoabschlag ?? c.risikoabschlag)}"></label>
        <label class="feld"><span>«Lohnt sich» ab Rendite %</span><input type="number" name="lohnend" value="${o.schwellen?.lohnend ?? c.schwellen.lohnend}"></label>
        <label class="feld"><span>«Prüfen» ab Rendite %</span><input type="number" name="pruefen" value="${o.schwellen?.pruefen ?? c.schwellen.pruefen}"></label>
      </form>
      <details><summary>Richtpreise pro m² Wohnfläche je Kanton</summary>
        <table class="preise"><thead><tr><th>Kanton</th><th>Wohnung</th><th>Haus</th></tr></thead><tbody>
        ${KANTONE.map((k) => `<tr><td>${k}</td><td><input type="number" data-kt="${k}" data-typ="ETW" placeholder="${etw[k] ?? ''}" value="${o.preis?.[k]?.ETW ?? ''}"></td><td><input type="number" data-kt="${k}" data-typ="EFH" placeholder="${efh[k] ?? ''}" value="${o.preis?.[k]?.EFH ?? ''}"></td></tr>`).join('')}
        </tbody></table>
      </details>
      <details><summary>Renovationskosten pro m² nach Baujahr</summary>
        <div class="cfg">${(['bis1949', '1950bis1979', '1980bis1999', '2000bis2014', 'ab2015', 'unbekannt', 'fossileHeizungZuschlag'] as const).map((k) =>
          `<label class="feld"><span>${{ bis1949: 'bis 1949', '1950bis1979': '1950–1979', '1980bis1999': '1980–1999', '2000bis2014': '2000–2014', ab2015: 'ab 2015', unbekannt: 'Baujahr unbekannt', fossileHeizungZuschlag: 'Zuschlag Öl/Gas/Elektro' }[k]}</span><input type="number" data-reno="${k}" placeholder="${c.renovationProM2[k]}" value="${o.renovation?.[k] ?? ''}"></label>`).join('')}</div>
      </details>
      <p><button class="link" id="cfg-reset">Auf Standardwerte zurücksetzen</button> <span id="gespeichert" class="still"></span></p>
    </section>
    <section class="block">
      <h2>Daten sichern</h2>
      <p class="still">Merkliste, Notizen und eigene Werte liegen nur in diesem Browser. Mit Export/Import nimmst du sie auf ein anderes Gerät mit.</p>
      <p><button class="knopf" id="export">Exportieren</button> <label class="knopf">Importieren<input type="file" id="import" accept="application/json" hidden></label></p>
    </section>
    <section class="block">
      <h2>Datenstand</h2>
      <p>${zustand.daten.objekte.length} Objekte · Stand ${esc(new Date(zustand.daten.stand).toLocaleString('de-CH'))}${zustand.daten.demo ? ' · <b>Demodaten</b>' : ''}</p>
      <p class="still">Die Daten werden täglich automatisch aus dem SHAB aktualisiert (GitHub Actions, siehe README).</p>
    </section></div>`;

  const speichern = () => {
    const f = new FormData(app.querySelector<HTMLFormElement>('#cfg')!);
    const n = (k: string) => { const v = f.get(k); return v === '' || v == null ? undefined : Number(v); };
    const preis: Record<string, { ETW?: number; EFH?: number }> = {};
    app.querySelectorAll<HTMLInputElement>('[data-kt]').forEach((i) => {
      if (i.value) (preis[i.dataset.kt!] ??= {})[i.dataset.typ as 'ETW' | 'EFH'] = Number(i.value);
    });
    const renovation: Record<string, number> = {};
    app.querySelectorAll<HTMLInputElement>('[data-reno]').forEach((i) => { if (i.value) renovation[i.dataset.reno!] = Number(i.value); });
    setzeOverrides({
      zuschlagFaktor: n('zuschlag') != null ? n('zuschlag')! / 100 : undefined,
      verkaufskosten: n('verkauf') != null ? n('verkauf')! / 100 : undefined,
      risikoabschlag: n('risiko') != null ? n('risiko')! / 100 : undefined,
      schwellen: { lohnend: n('lohnend') ?? c.schwellen.lohnend, pruefen: n('pruefen') ?? c.schwellen.pruefen },
      preis, renovation,
    });
    app.querySelector('#gespeichert')!.textContent = 'Gespeichert';
  };
  app.querySelectorAll<HTMLButtonElement>('[data-skala]').forEach((b) => b.addEventListener('click', () => {
    setzeSkala(b.dataset.skala as Skala);
    app.querySelectorAll<HTMLButtonElement>('[data-skala]').forEach((x) => { const an = String(x === b); x.setAttribute('aria-checked', an); x.setAttribute('aria-selected', an); });
  }));
  // Android-Modell kommt asynchron
  setTimeout(() => { const g = app.querySelector('#geraet'); if (g) g.textContent = geraetText(); }, 300);
  app.addEventListener('change', (e) => { if ((e.target as HTMLElement).id !== 'import') speichern(); });
  app.querySelector('#cfg-reset')!.addEventListener('click', () => { setzeOverrides({}); einstellungen(app); });
  app.querySelector('#export')!.addEventListener('click', () => herunterladen('hammerschlag-daten.json', exportiere(), 'application/json'));
  app.querySelector<HTMLInputElement>('#import')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try { importiere(await file.text()); aktualisiereMerkZahl(); einstellungen(app); } catch { alert('Datei konnte nicht gelesen werden.'); }
  });
}
