// Liest den Text einer SHAB-Publikation (Grundstücksteigerung) und macht daraus ein Objekt.
// Bewusst ohne Personendaten: Schuldner, Geburtsdaten, Heimatorte usw. werden verworfen.

import { XMLParser } from 'fast-xml-parser';

const PERSONEN_SCHLUESSEL = /debtor|schuldner|person|birth|geburt|heimat|nationality|citizen|firstName|lastName|familyName|givenName|title$/i;

/** XML → Textzeilen (ohne Felder, die Personen beschreiben). */
export function xmlZuText(xml) {
  const parser = new XMLParser({ ignoreAttributes: true, textNodeName: '#text', processEntities: true, htmlEntities: true });
  const baum = parser.parse(xml);
  const zeilen = [];
  const meta = {};
  (function lauf(knoten, pfad) {
    if (knoten == null) return;
    if (typeof knoten === 'string' || typeof knoten === 'number') {
      const s = String(knoten).replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').trim();
      if (s) {
        const mi = pfad.search(/(^|\.)meta\./i);
        if (mi >= 0) {
          const k = pfad.slice(pfad.indexOf('meta.', mi) + 5);
          meta[k] = meta[k] ? `${meta[k]}, ${s}` : s;
        }
        else zeilen.push(s);
      }
      return;
    }
    if (Array.isArray(knoten)) { knoten.forEach((k) => lauf(k, pfad)); return; }
    for (const [k, v] of Object.entries(knoten)) {
      if (PERSONEN_SCHLUESSEL.test(k) && !/meta\.?$/i.test(pfad)) continue;
      lauf(v, pfad ? `${pfad}.${k}` : k);
    }
  })(baum, '');
  return { text: zeilen.join('\n'), meta, felder: strukturFelder(baum) };
}

/** HTML-Fragment aus dem XML → schlichter Text mit Zeilenumbrüchen. */
function htmlText(v) {
  if (v == null) return undefined;
  const s = String(typeof v === 'object' ? (v['#text'] ?? '') : v)
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return s || undefined;
}

function findeKnoten(knoten, name) {
  if (!knoten || typeof knoten !== 'object') return undefined;
  if (name in knoten) return knoten[name];
  for (const v of Object.values(knoten)) {
    const t = findeKnoten(v, name);
    if (t !== undefined) return t;
  }
  return undefined;
}

const isoOderUndef = (v) => (v != null && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : undefined);

/**
 * Felder des SHAB-Schemas (SB01, KK08). Die Publikationen sind strukturiert: Steigerungsdatum,
 * Fristen und Objektbeschrieb stehen in eigenen Elementen. Schuldnerangaben werden nicht gelesen.
 */
export function strukturFelder(baum) {
  const c = findeKnoten(baum, 'content');
  if (!c || typeof c !== 'object') return {};
  const a = c.auction ?? {};
  const zeit = a.time != null ? String(a.time).match(/(\d{1,2})[:.](\d{2})/) : null;
  return {
    objekte: htmlText(c.auctionObjects),
    datum: isoOderUndef(a.date),
    zeit: zeit ? `${zeit[1].padStart(2, '0')}:${zeit[2]}` : undefined,
    ort: htmlText(a.location),
    eingabefrist: isoOderUndef(c.circulation?.entryDeadline),
    auflageVon: isoOderUndef(c.entryStart),
    auflageBis: isoOderUndef(c.entryDeadline),
    auflageText: [c.registration?.commentEntryDeadline, c.informationAboutEdition, c.locationCirculationAuthority].map(htmlText).filter(Boolean).join('\n') || undefined,
    hinweise: [c.remarks, c.additionalLegalRemedy].map(htmlText).filter(Boolean).join('\n') || undefined,
  };
}

/** «1'310'000.00», «390'OOO.OQ» (OCR), «1 200 000» → Zahl */
export function betrag(s) {
  if (!s) return undefined;
  const t = s.replace(/[OoQ]/g, '0').replace(/[’'´`  ]/g, '').replace(/\.(\d{2})$/, '').replace(/,(\d{2})$/, '').replace(/[.,](?=\d{3})/g, '');
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

const MONATE = [
  [/^jan|^gen/i, 1], [/^f[eé]b/i, 2], [/^m[äa]r/i, 3], [/^a[pv]r/i, 4], [/^ma[ig]/i, 5], [/^jun|^juin|^giu/i, 6],
  [/^jul|^juil|^lug/i, 7], [/^ao[uû]|^aug|^ago/i, 8], [/^sep|^set/i, 9], [/^o[kc]t|^ott/i, 10], [/^nov/i, 11], [/^de[zc]|^déc|^dic/i, 12],
];
const DATUM_RE = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})|(\d{1,2})(?:\.|er|°)?\s+([A-Za-zÄäÉéÈèÛûô]{3,10})\.?\s+(\d{4})/g;

/** Alle Daten im Text, auch «5. Januar 2027», «1er décembre 2026», «12 gennaio 2027» → ISO. */
export function datenIn(s) {
  const r = [];
  for (const m of String(s ?? '').matchAll(DATUM_RE)) {
    let tag, monat, jahr;
    if (m[1]) { tag = +m[1]; monat = +m[2]; jahr = m[3]; }
    else { tag = +m[4]; monat = MONATE.find(([re]) => re.test(m[5]))?.[1]; jahr = m[6]; }
    if (!monat || monat > 12 || tag < 1 || tag > 31) continue;
    r.push({ iso: `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`, index: m.index, ende: m.index + m[0].length });
  }
  return r;
}

export function datumIso(s) {
  return datenIn(s)[0]?.iso;
}

/** ISO → «05.01.2027» */
export const datumCh = (iso) => (iso ? iso.split('-').reverse().join('.') : undefined);

/** Schuldner-Block und andere Personenangaben aus dem Fliesstext entfernen. */
export function ohnePersonen(text) {
  return text
    // Meldungstitel enthält den Namen («Betreibungsamtliche Grundstücksteigerung Max Muster»)
    .replace(/^\s*(?:(?:Betreibungs|Konkurs)amtliche\s+)?Grundst(?:ü|ue)cks?teigerung\b[^\n]*$/gim, '')
    .replace(/^\s*(?:Vente aux enchères|Vente d['’]immeubles?|Réalisation d['’]immeubles?|Incanto|Pubblico incanto)\b[^\n:]*$/gim, '')
    // nur ein Schuldner-Block («Schuldner:» bzw. Zeile «Schuldnerin»), nicht «ME-Anteil der Schuldnerin an …»
    .replace(/(?:^|\n)[ \t]*(?:Schuldner(?:in)?|Débiteur|Debitore|Konkursit(?:in)?|Failli|Fallito)[ \t]*(?::|\n)[\s\S]*?(?=Steigerungsobjekt|Objet|Oggett|Im Grundbuch|Registre foncier|Registro fondiario|Grundst)/i, '')
    // «Pfandeigentümer: 1. Name, Adresse 2. Name, Adresse» (Drittpfand, Miteigentum)
    .replace(/(Pfandeigentümer(?:in|innen)?|Eigentümer(?:in|innen)?|Propriétaires?|Proprietari[oa]?)\s*:[^\n]*(?:\n\s*\d+\.[^\n]*)*/gi, '')
    // «Alleineigentum von Muster Max» → «Alleineigentum»
    .replace(/\b(Allein|Gesamt|Mit)eigentum\s+(?:von|der|des)\s+(?!\d)[^\n,;]*/gi, '$1eigentum')
    .replace(/\b(propriété|proprietà)\s+(?:de|di)\s+(?:M(?:me|\.)|Monsieur|Madame|Sig(?:\.|nor[a]?))[^\n,;]*/gi, '$1')
    .replace(/\bappartenant à\s+[^\n,;]*/gi, '')
    .replace(/^.*(Geburtsdatum|Heimatort|Staatsbürgerschaft|Staatsangehörigkeit|Date de naissance|Lieu d'origine|Nationalité|Data di nascita|Luogo d'origine|Cittadinanza).*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const KAT_REGELN = [
  ['ETW', /stockwerkeigentum|stockwerkeinheit|\bStWE\b|sonderrecht|eigentumswohnung|\d[\d ½/.,]*-?zimmer-?wohnung|propriété par étages|\bppe\b|appartement|proprietà per piani|\bppp\b|appartamento/i],
  ['MFH', /mehrfamilienhaus|wohn- und geschäftshaus|wohn-\s*und\s*gewerbe|immeuble locatif|immeuble d'habitation|casa plurifamiliare|stabile abitativo/i],
  ['EFH', /einfamilienhaus|doppeleinfamilienhaus|reihen(?:einfamilien)?haus|wohnhaus|bauernhaus|ferienhaus|chalet|villa|maison individuelle|maison familiale|\bmaison\b|habitation mitoyenne|\bhabitation\b(?!\s*n[°o])|casa unifamiliare|rustico/i],
  ['Gewerbe', /gewerbe|geschäftshaus|werkstatt|industrie|lager|büro|restaurant|hotel|laden|commercial|artisanal|industriel|bureau|commerciale|negozio|albergo/i],
  ['Grundstueck', /bauland|unüberbaut|\b(?:wiese|acker|wald|weide|reben|prés?|forêt|terreno|prato|bosco)\b|landwirtschaft|gartenanlage|\bterrain\b|parcelle non bâtie/i],
  ['Sonstiges', /autoabstellplatz|parkplatz|garage|einstellhalle|tiefgarage|place de parc|posteggio|autorimessa/i],
];

export function kategorie(objektText, beschrieb = '') {
  // Stockwerkeigentum zuerst: der Stammgrundstück-Beschrieb nennt oft «Mehrfamilienhaus».
  for (const [kat, re] of KAT_REGELN) {
    const t = kat === 'MFH' ? objektText.replace(/Stammgrundstück[\s\S]*$/i, '') : objektText;
    if (re.test(t)) return kat;
  }
  // Danach der längere Beschrieb (z. B. «Description : bâtiment commercial …»), ohne Stammgrundstück
  const b = beschrieb.replace(/Stammgrundstück[\s\S]*$|immeuble de base[\s\S]*$/i, '');
  for (const [kat, re] of KAT_REGELN) if (kat !== 'Sonstiges' && re.test(b)) return kat;
  if (/gebäude|wohn|habitation|bâtiment|maison|abitazione|edificio|casa\b/i.test(objektText + b)) return 'EFH';
  return 'Sonstiges';
}

function abschnitt(text, start, ende) {
  const s = text.search(start);
  if (s < 0) return '';
  const rest = text.slice(s);
  const e = rest.slice(20).search(ende);
  return e < 0 ? rest.slice(0, 1500) : rest.slice(0, e + 20);
}

const STRASSEN = '(?:strasse|str\\.|weg|gasse|platz|rain|halde|ring|allee|matte|hof|acker|feld|steig|graben|berg|quai|rue|route|chemin|avenue|av\\.|ruelle|impasse|via|viale|piazza|vicolo|strada)';

const KEIN_ORT = /^(?:Miteigentum|Zimmer|Wertquote|Tausendstel|m2|m²|Fr\.|CHF|Uhr|Stockwerk|Anteil|copropriété|PPE|millièmes?|comproprietà)\b/i;

export function adresse(text, { nurVoll = false } = {}) {
  const re = new RegExp(`([A-ZÄÖÜÉÈ][^\\n,;:()]{1,40}?${STRASSEN}[^\\n,;:()\\d]{0,10}\\s+\\d{1,4}\\s?[a-zA-Z]?|(?:${STRASSEN})[^\\n,;:()\\d]{1,40}\\s+\\d{1,4}\\s?[a-zA-Z]?)\\s*,?\\s*(\\d{4})\\s+([A-ZÄÖÜÉÈ][^\\n,;.:()]{1,40})`, 'i');
  const m = text.match(re);
  if (m) return { strasse: m[1].replace(/^.*?(?:EDID|Adresse):\s*(?:\d+,\s*)?/i, '').trim(), plz: m[2], ort: m[3].trim().replace(/\s+(?:und|et|e)$/i, '') };
  if (nurVoll) return undefined;
  // PLZ nicht aus Bruchteilen wie «96/1000 Miteigentum» oder Beträgen lesen
  for (const p of text.matchAll(/(?<![\d/'’.,])(\d{4})\s+([A-ZÄÖÜÉÈ][a-zäöüéèàô\-. ]{2,30}?)(?=\s*[,.;\n]|$)/g)) {
    if (+p[1] >= 1000 && !KEIN_ORT.test(p[2])) return { plz: p[1], ort: p[2].trim() };
  }
  return undefined;
}

const BEGEHREN = /begehren|verlang|antrag|requise?|réquisition|à la demande|richiest|istanza|domanda/i;

/**
 * Wer verlangt die Verwertung? Wichtig fürs Deckungsprinzip (Art. 126/142a SchKG): Gebote müssen
 * die Pfandforderungen decken, die dem betreibenden Gläubiger im Rang vorgehen.
 * @returns {{durch: 'pfand'|'pfaendung'|'konkurs', rang?: number, gesetzlich?: boolean} | undefined}
 */
export function verwertung(text, art) {
  if (art === 'konkurs') return { durch: 'konkurs' };
  // nicht nach «1.» trennen («an 1. Pfandstelle»)
  const saetze = String(text ?? '').split(/(?<=[^\d][.!?])\s+|\n/).filter((s) => BEGEHREN.test(s));
  for (const s of saetze) {
    if (/pfändungsgläubiger|pfändung\b|créanciers? saisissants?|saisie|creditor[ei] pignorant|pignoramento/i.test(s)) return { durch: 'pfaendung' };
    const rang = s.match(/(\d)\s*\.?\s*(?:e|er|re|ère|ème|°|o|a)?\s*(?:Pfandstelle|Rang|rang|grado)/i)
      ?? s.match(/(?:Pfandstelle|rang|grado)\s*(?:Nr\.?\s*)?(\d)\b/i);
    if (rang && /pfand|hypoth|gag|pign|ipotec/i.test(s)) return { durch: 'pfand', rang: Number(rang[1]) };
    if (/gesetzlich\w*\s+(?:Grund)?pfand|hypothèque légale|ipoteca legale/i.test(s)) return { durch: 'pfand', gesetzlich: true };
    if (/grundpfand|pfandgläubiger|hypothécaire|gagiste|pignoratizi|ipotecari/i.test(s)) return { durch: 'pfand' };
  }
  return undefined;
}

/** «3 1/2-Zimmerwohnung Nr. 3 im Erdgeschoss rechts» → Stockwerk-Code wie im GWR (3100 = EG, 3101 = 1. OG …) und Lage. */
export function wohnungsLage(text) {
  const t = String(text ?? '');
  let stock;
  if (/erdgeschoss|parterre|\bEG\b|rez-de-chaussée|pianterreno|piano terra/i.test(t)) stock = 3100;
  const og = t.match(/(\d{1,2})\s*\.?\s*(?:Obergeschoss|OG\b|Stock\b|Stockwerk\b)/i) ?? t.match(/(\d{1,2})(?:er|e|ème)\s+étage/i) ?? t.match(/(\d{1,2})°\s*piano/i);
  if (stock == null && og) stock = 3100 + Number(og[1]);
  const s = t.match(/\b(links|rechts|mitte|gauche|droite|centre|sinistra|destra|centro)\b/i)?.[1]?.toLowerCase();
  const SEITE = { links: 'links', gauche: 'links', sinistra: 'links', rechts: 'rechts', droite: 'rechts', destra: 'rechts', mitte: 'mitte', centre: 'mitte', centro: 'mitte' };
  if (stock == null && !s) return undefined;
  return { stock, seite: s ? SEITE[s] : undefined };
}

/**
 * @param {string} text  Volltext der Publikation
 * @param {object} meta  { id, nummer, datum, kantone, subRubrik, sprache, amtName, amtAdresse }
 */
export function parsePublikation(text, meta, felder = {}) {
  const sauber = ohnePersonen(text);
  const objektText = felder.objekte ? ohnePersonen(felder.objekte) : abschnitt(sauber, /Steigerungsobjekt|Objets? (?:de la vente|vendus?|à vendre|mis aux enchères)|Oggett[oi]|Im Grundbuch|Registre foncier/i,
    /Rechtskräftige|Schätzung|Angaben zur Steigerung|Estimation|Stima|Date (?:et lieu|des enchères)|Data/i);

  const SCHAETZUNG_RE = /(?:Schätzung(?:swert)?|Schatzung|Verkehrswert|Schätzwert|estimation|valeur estimative|stima)(?:(?!Fr\.|CHF|SFr\.)[\s\S]){0,220}?(?:Fr\.|CHF|SFr\.)\s*([\dOQ]{1,3}(?:[’'´  .]?[\dOQ]{3})*(?:[.,][\dOQ]{2})?)/i;
  const schaetzung = betrag(objektText.match(SCHAETZUNG_RE)?.[1] ?? sauber.match(SCHAETZUNG_RE)?.[1]);

  // Kern = eigentliches Objekt, ohne Schätzung und Stammgrundstück-Beschrieb
  const kern = objektText.split(/Rechtskräftige|betreibungsamtliche Schätzung|Schätzung(?:swert)?:|Estimation|Stima|Stammgrundstück|immeuble de base|fondo base/i)[0] || objektText;

  const stMatch = felder.datum ? null : sauber.match(/(?:Angaben zur Steigerung|Steigerung(?:stermin|sdatum)?|Steigerungslokal|Date,? heure et lieu|Date (?:et lieu )?(?:des enchères|de la vente)|Data(?:,)? (?:ora e luogo )?dell['’]incanto)[\s:,-]*?(?:am\s*|le\s*|il\s*)?(\d{1,2}\.\d{1,2}\.\d{4})[^\d\n]{0,12}(\d{1,2}[:.]\d{2})?(?:\s*(?:Uhr|h|heures|ore))?,?\s*([^\n]*)/i);
  const steigerung = felder.datum ? { datum: felder.datum, zeit: felder.zeit, ort: felder.ort?.replace(/\n/g, ', ').slice(0, 140) } : stMatch ? {
    datum: datumIso(stMatch[1]),
    zeit: stMatch[2]?.replace('.', ':'),
    ort: stMatch[3]?.replace(/^[,\s]+/, '').trim().slice(0, 140) || undefined,
  } : undefined;

  const besichtigung = (() => {
    const m = sauber.match(/(?:Besichtigung|Visites?|Visita)[^\n]*(?:\n[^\n]*){0,2}/i);
    const d = m && datenIn(m[0])[0];
    if (!d) return undefined;
    const z = m[0].slice(d.ende, d.ende + 40).match(/^[^\n]*?(\d{1,2})[:.h](\d{2})/);
    return `${datumCh(d.iso)}${z ? `, ${z[1].padStart(2, '0')}:${z[2]} Uhr` : ''}`;
  })();
  const auflage = (() => {
    if (felder.auflageVon && felder.auflageBis) return `${datumCh(felder.auflageVon)} bis ${datumCh(felder.auflageBis)}`;
    const quelle = [felder.auflageText, sauber].filter(Boolean).join('\n');
    const m = quelle.match(/(?:Steigerungsbedingungen|Lastenverzeichnis|Unterlagen liegen|conditions de (?:vente|la vente)|état des charges|condizioni d['’]incanto|elenco (?:degli )?oneri)[\s\S]{0,160}/i);
    const d = m ? datenIn(m[0]) : [];
    if (d.length >= 2 && d[1].index - d[0].ende < 12) return `${datumCh(d[0].iso)} bis ${datumCh(d[1].iso)}`;
    if (d.length) return datumCh(d[0].iso);
    return undefined;
  })();
  const eingabefrist = felder.eingabefrist ?? sauber.match(/(?:Ansprüche|Forderungen|productions|insinuazioni|pretese)[\s\S]{0,220}?(?:bis|spätestens|innert|jusqu'au|entro il)\s*(?:spätestens\s*)?(?:zum\s*|am\s*)?(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1];

  // «MÜMLISWIL-RAMISWIL» → «Mümliswil-Ramiswil», gemischte Schreibweise bleibt
  const namensform = (n) => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : n)?.trim();
  const ORT = String.raw`(?!(?:Nr|No|N°|Plan|Art)\b)(\p{Lu}[\p{L}\-.'’ ]{1,40}?)`;
  const ORT_ENDE = String.raw`(?=\s*(?:[:,;.()\n/]|\s(?:an|in|à|a|au|zu|secteur|zona|mit|avec|con)\s|$))`;
  const grundbuch = namensform(
    sauber.match(new RegExp(String.raw`(?:Im Grundbuch|Grundbuch)\s+(?!Blatt)(?:von\s+|der Gemeinde\s+)?${ORT}(?=\s*(?:[:,;.\n/]|Grundst|Liegensch|Parz))`, 'u'))?.[1]
    ?? sauber.match(new RegExp(String.raw`Registre foncier (?:de |d['’])?${ORT}${ORT_ENDE}`, 'u'))?.[1]
    ?? sauber.match(new RegExp(String.raw`Registro fondiario (?:di )?${ORT}${ORT_ENDE}`, 'u'))?.[1]
    // «In der Gemeinde Meilen», «SUR LA COMMUNE D'ICOGNE», «Comune: CENTOVALLI», «du ban de Pleigne» (JU)
    ?? (() => {
      // auch «cadastre de Bevaix», «RFD di Maggia», «GB Ruswil»
      for (const m of objektText.matchAll(/(?:gemeinde|commune|comune|\bban|cadastre|\bRFD|\bGB)\s*(?::\s*|de la\s+|de\s+|d['’]\s*|du\s+|di\s+|delle?\s+|della\s+|dei\s+)?/gi)) {
        const ort = objektText.slice(m.index + m[0].length).match(new RegExp(`^${ORT}${ORT_ENDE}`, 'u'))?.[1];
        if (ort) return ort;
      }
      return undefined;
    })()
    // «sis Chemin du Polny 33 à Epalinges», «sise à Nyon»
    ?? objektText.match(new RegExp(String.raw`\b(?:sis|sise|situé|située|sito|sita)\b[^\n]{0,60}?\sà\s+${ORT}(?=\s*[,;.\n(]|$)`, 'u'))?.[1]
    // Bern: «Schwarzenburg 2 / 364» (Grundbuchkreis / Nummer)
    ?? (meta.kantone?.[0] === 'BE' ? objektText.match(/^(\p{Lu}[\p{L}-]+(?: \p{Lu}[\p{L}-]+)*)(?: \d+)?\s*\/\s*\d+/mu)?.[1] : undefined),
  );

  const grundstueckNr = [...new Set([...kern.matchAll(/(?:Grundstück(?:-Nr\.?|\s*Nr\.?|-Nummer)?|Liegenschaft\s*Nr\.?|Parzelle\s*(?:Nr\.?)?|Kat\.-?Nr\.?|Kataster(?:\s*Nr\.?)?|Grundbuch\s?blatt(?:\s*Nr\.?)?|Grundbuch Blatt(?:\s*Nr\.?)?|GBBL|Blatt\s*Nr\.?|immeuble\s*(?:RF\s*)?(?:n°|no)?|bien-fonds\s*(?:n°|no)?|parcelle\s*(?:n°|no)?|fondo\s*(?:n\.|no)?|particella\s*(?:n\.)?)\s*:?\s*([A-Z]{0,2}\d[\w/.-]*)/gi)].map((m) => m[1].replace(/[.,]$/, '')))];

  const egrid = [...new Set([...sauber.matchAll(/CH\s?(\d{3})\s?(\d{3})\s?(\d{3})\s?(\d{3})/g)].map((m) => `CH${m[1]}${m[2]}${m[3]}${m[4]}`))];

  const egid = [...new Set([...sauber.matchAll(/\bEGID\s*:?\s*(\d{1,9})\b/g)].map((m) => m[1]))];

  const flaecheTxt = kern.match(/(?:Fläche|Grundstücksfläche|Gesamtfläche|surface|superficie)[:\s]*([\d'’]+)\s*m(?:2|²)/i)?.[1]
    ?? kern.match(/Grundstück:?\s*([\d'’]+)\s*m(?:2|²)/i)?.[1];
  const flaecheGrundstueck = betrag(flaecheTxt);

  const zimmer = Number.parseFloat((kern.match(/(\d{1,2}(?:[.,]5| ?½| 1\/2)?)\s*-?\s*Zimmer/i)?.[1] ?? '').replace(/ ?(½|1\/2)/, '.5').replace(',', '.')) || undefined;

  // Adressen von Ämtern, Steigerungslokalen und Treffpunkten sind nicht die Objektadresse
  // Bei strukturierten Publikationen nur Objektbeschrieb und Bemerkungen, nie die Amtsadresse
  const ohneAmt = (felder.objekte ? `${objektText}\n${ohnePersonen(felder.hinweise ?? '')}` : sauber.replace(/Publizierende Stelle[\s\S]*?\n\n/i, ''))
    .split(/(?<=[.!?;])\s+|\n/)
    .filter((z) => !/(?:amt|ämter|office|ufficio)\b|amt,|Gericht|tribunal|Saal\b|salle|sala\b|Restaurant|Steigerungslokal|Einlass|Besammlung|IBAN|Postfach|case postale|casella postale/i.test(z)
      && !(felder.ort && z.includes(felder.ort.split('\n')[0])))
    .join('\n');
  let adr = adresse(objektText, { nurVoll: true }) ?? adresse(ohneAmt, { nurVoll: true }) ?? adresse(kern) ?? adresse(ohneAmt);
  if (!adr?.strasse) {
    // Strasse ohne PLZ, z. B. «In der Gemeinde Meilen an der Burgstrasse 85»
    const s = kern.match(/\b([A-ZÄÖÜ][\wäöüéè-]*(?:strasse|weg|gasse|platz|rain|ring|allee|halde|matte)|(?:Rue|Chemin|Route|Avenue|Via|Viale)\s[^\n,;:\d]{2,30}?)\s+(\d{1,4}\s?[a-z]?)\b/);
    if (s) adr = { strasse: `${s[1]} ${s[2]}`.trim(), plz: adr?.plz, ort: adr?.ort ?? grundbuch };
  }

  const kat = kategorie(kern || sauber, objektText);
  const art = meta.subRubrik?.startsWith('KK') || /konkurs|faillite|fallimento/i.test(meta.titel ?? '') ? 'konkurs' : 'betreibung';

  const email = sauber.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0];
  const telefon = sauber.match(/(?:Tel(?:efon)?\.?|Tél\.?)\s*:?\s*(\+?\d[\d ./]{8,16}\d)/i)?.[1];
  const web = sauber.match(/\bwww\.[\w-]+(?:\.[\w-]+)+(?:\/[\w\-./]*)?/i)?.[0];

  const beschreibung = (objektText || sauber.slice(0, 1200))
    .replace(/^(Steigerungsobjekte?|Objets?[^\n]*|Oggett[oi])\s*:?\s*/i, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 1500);

  const ort = adr?.ort ?? grundbuch;
  return {
    id: meta.nummer,
    art,
    status: 'aktiv',
    kategorie: kat,
    titel: `${KAT_NAMEN[kat]}${zimmer && kat !== 'Grundstueck' ? `, ${String(zimmer).replace('.5', '½')} Zimmer` : ''}${ort ? ` in ${ort}` : ''}`,
    kanton: meta.kantone?.[0] ?? '',
    gemeinde: grundbuch,
    grundbuch,
    grundstueckNr,
    egrid,
    egid,
    adresse: adr,
    schaetzung,
    flaecheGrundstueck,
    zimmer,
    beschreibung,
    steigerung,
    besichtigung,
    auflage,
    eingabefrist: /^\d{4}-/.test(eingabefrist ?? '') ? eingabefrist : datumIso(eingabefrist),
    verwertung: verwertung([felder.hinweise, sauber].filter(Boolean).join('\n'), art),
    lage: kat === 'ETW' ? wohnungsLage(kern) : undefined,
    amt: { name: meta.amtName ?? 'Betreibungs- bzw. Konkursamt', adresse: meta.amtAdresse, email, telefon, web },
    quelle: {
      nummer: meta.nummer,
      id: meta.id,
      url: `https://www.shab.ch/#!/search/publications/detail/${meta.id}`,
      xml: `https://amtsblattportal.ch/api/v1/publications/${meta.id}/xml`,
      datum: meta.datum,
      sprache: meta.sprache ?? 'de',
    },
  };
}

const KAT_NAMEN = {
  EFH: 'Einfamilienhaus', MFH: 'Mehrfamilienhaus', ETW: 'Eigentumswohnung',
  Grundstueck: 'Grundstück', Gewerbe: 'Gewerbeobjekt', Sonstiges: 'Objekt',
};

/** Erkennt Titel von Grundstücksteigerungen und Widerrufen. */
export const IST_STEIGERUNG = (titel, subRubrik) =>
  subRubrik === 'SB01' || subRubrik === 'KK08' ||
  (/grundst(?:ü|ue)ck|liegenschaft|immeuble|immobili|fondi?\b|stockwerk|im grundbuch/i.test(titel) && /steiger|versteiger|enchère|incanto|vente/i.test(titel));

export const IST_WIDERRUF = (titel) => /widerruf|annullier|abgesagt|abgesetzt|révocation|annulation|revoca|annullament/i.test(titel);
