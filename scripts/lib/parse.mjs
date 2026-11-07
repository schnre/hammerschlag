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
  return { text: zeilen.join('\n'), meta };
}

/** «1'310'000.00», «390'OOO.OQ» (OCR), «1 200 000» → Zahl */
export function betrag(s) {
  if (!s) return undefined;
  const t = s.replace(/[OoQ]/g, '0').replace(/[’'´`  ]/g, '').replace(/\.(\d{2})$/, '').replace(/,(\d{2})$/, '').replace(/[.,](?=\d{3})/g, '');
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export function datumIso(s) {
  const m = s?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Schuldner-Block und andere Personenangaben aus dem Fliesstext entfernen. */
export function ohnePersonen(text) {
  return text
    // Meldungstitel enthält den Namen («Betreibungsamtliche Grundstücksteigerung Max Muster»)
    .replace(/^\s*(?:(?:Betreibungs|Konkurs)amtliche\s+)?Grundst(?:ü|ue)cks?teigerung\b[^\n]*$/gim, '')
    .replace(/^\s*(?:Vente aux enchères|Vente d['’]immeubles?|Réalisation d['’]immeubles?|Incanto|Pubblico incanto)\b[^\n:]*$/gim, '')
    .replace(/(Schuldner(?:in)?|Débiteur|Debitore|Konkursit(?:in)?|Failli|Fallito)\s*:?[\s\S]*?(?=Steigerungsobjekt|Objet|Oggett|Im Grundbuch|Registre foncier|Registro fondiario|Grundst)/i, '')
    .replace(/^.*(Geburtsdatum|Heimatort|Staatsbürgerschaft|Staatsangehörigkeit|Date de naissance|Lieu d'origine|Nationalité|Data di nascita|Luogo d'origine|Cittadinanza).*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const KAT_REGELN = [
  ['ETW', /stockwerk|sonderrecht|eigentumswohnung|\d[\d ½/]*-?zimmer-?wohnung|propriété par étages|\bppe\b|appartement|proprietà per piani|\bppp\b|appartamento/i],
  ['MFH', /mehrfamilienhaus|wohn- und geschäftshaus|wohn-\s*und\s*gewerbe|immeuble locatif|immeuble d'habitation|casa plurifamiliare|stabile abitativo/i],
  ['EFH', /einfamilienhaus|doppeleinfamilienhaus|reihen(?:einfamilien)?haus|wohnhaus|bauernhaus|ferienhaus|chalet|villa|maison individuelle|maison familiale|casa unifamiliare|rustico/i],
  ['Gewerbe', /gewerbe|geschäftshaus|werkstatt|industrie|lager|büro|restaurant|hotel|laden|commercial|artisanal|industriel|bureau|commerciale|negozio|albergo/i],
  ['Grundstueck', /bauland|unüberbaut|wiese|acker|wald|weide|landwirtschaft|reben|gartenanlage|terrain|parcelle non bâtie|pré|forêt|terreno|prato|bosco/i],
  ['Sonstiges', /autoabstellplatz|parkplatz|garage|einstellhalle|tiefgarage|place de parc|posteggio|autorimessa/i],
];

export function kategorie(objektText, stammText = '') {
  // Stockwerkeigentum zuerst: der Stammgrundstück-Beschrieb nennt oft «Mehrfamilienhaus».
  for (const [kat, re] of KAT_REGELN) {
    const t = kat === 'MFH' ? objektText.replace(/Stammgrundstück[\s\S]*$/i, '') : objektText;
    if (re.test(t)) return kat;
  }
  if (/gebäude|wohn/i.test(objektText + stammText)) return 'EFH';
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

export function adresse(text) {
  const re = new RegExp(`([A-ZÄÖÜÉÈ][^\\n,;:()]{1,40}?${STRASSEN}[^\\n,;:()\\d]{0,10}\\s+\\d{1,4}\\s?[a-zA-Z]?|(?:${STRASSEN})[^\\n,;:()\\d]{1,40}\\s+\\d{1,4}\\s?[a-zA-Z]?)\\s*,?\\s*(\\d{4})\\s+([A-ZÄÖÜÉÈ][^\\n,;.:()]{1,40})`, 'i');
  const m = text.match(re);
  if (m) return { strasse: m[1].replace(/^.*?EDID:\s*\d+,\s*/i, '').trim(), plz: m[2], ort: m[3].trim().replace(/\s+(?:und|et|e)$/i, '') };
  const p = text.match(/\b(\d{4})\s+([A-ZÄÖÜÉÈ][a-zäöüéèàô\-. ]{2,30}?)(?=\s*[,.;\n]|$)/);
  if (p) return { plz: p[1], ort: p[2].trim() };
  return undefined;
}

/**
 * @param {string} text  Volltext der Publikation
 * @param {object} meta  { id, nummer, datum, kantone, subRubrik, sprache, amtName, amtAdresse }
 */
export function parsePublikation(text, meta) {
  const sauber = ohnePersonen(text);
  const objektText = abschnitt(sauber, /Steigerungsobjekt|Objets? (?:de la vente|vendus?|à vendre|mis aux enchères)|Oggett[oi]|Im Grundbuch|Registre foncier/i,
    /Rechtskräftige|Schätzung|Angaben zur Steigerung|Estimation|Stima|Date (?:et lieu|des enchères)|Data/i);

  const schaetzung = betrag(
    sauber.match(/(?:Schätzung(?:swert)?|Schatzung|Verkehrswert|estimation(?: de l'office)?|valeur estimative|stima(?: dell'ufficio)?)[^\d\n]{0,60}?(?:Fr\.|CHF|SFr\.)\s*([\d'’´ .,OQ]{4,})/i)?.[1],
  );

  const stMatch = sauber.match(/(?:Angaben zur Steigerung|Steigerung(?:stermin|sdatum)?|Steigerungslokal|Date,? heure et lieu|Date (?:et lieu )?(?:des enchères|de la vente)|Data(?:,)? (?:ora e luogo )?dell['’]incanto)[\s:,-]*?(?:am\s*|le\s*|il\s*)?(\d{1,2}\.\d{1,2}\.\d{4})[^\d\n]{0,12}(\d{1,2}[:.]\d{2})?(?:\s*(?:Uhr|h|heures|ore))?,?\s*([^\n]*)/i);
  const steigerung = stMatch ? {
    datum: datumIso(stMatch[1]),
    zeit: stMatch[2]?.replace('.', ':'),
    ort: stMatch[3]?.replace(/^[,\s]+/, '').trim().slice(0, 140) || undefined,
  } : undefined;

  const besichtigung = sauber.match(/(?:Besichtigung|Visite|Visita)[^\n]{0,100}?(\d{1,2}\.\d{1,2}\.\d{4}[^\n]{0,60})/i)?.[1]?.trim();
  const auflage = sauber.match(/(?:Steigerungsbedingungen|Lastenverzeichnis|conditions de vente|état des charges|condizioni d['’]incanto|elenco oneri)[\s\S]{0,160}?(\d{1,2}\.\d{1,2}\.\d{4}(?:\s*(?:bis|-|–|au|al)\s*\d{1,2}\.\d{1,2}\.\d{4})?)/i)?.[1];
  const eingabefrist = sauber.match(/(?:Ansprüche|Forderungen|productions|insinuazioni|pretese)[\s\S]{0,220}?(?:bis|spätestens|innert|jusqu'au|entro il)\s*(?:spätestens\s*)?(?:zum\s*|am\s*)?(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1];

  const grundbuch = sauber.match(/(?:Im Grundbuch|Grundbuch)\s+(?:von\s+|der Gemeinde\s+)?([A-ZÄÖÜÉÈ][\wäöüéè\-.' ]{1,40}?)(?=\s*(?:[:,;.\n]|Grundst|Liegensch|Parz))/)?.[1]?.trim()
    ?? sauber.match(/Registre foncier (?:de |d['’])?([A-ZÉÈ][\wéèàô\-' ]{1,40})/)?.[1]?.trim()
    ?? sauber.match(/Registro fondiario (?:di )?([A-Z][\wàèéìòù\-' ]{1,40})/)?.[1]?.trim();

  const grundstueckNr = [...new Set([...objektText.matchAll(/(?:Grundstück(?:-Nr\.?|\s*Nr\.?|-Nummer)?|Liegenschaft\s*Nr\.?|Parzelle\s*(?:Nr\.?)?|Kat\.-?Nr\.?|bien-fonds\s*(?:n°|no)?|parcelle\s*(?:n°|no)?|fondo\s*(?:n\.|no)?|particella\s*(?:n\.)?)\s*:?\s*([A-Z]{0,2}\d[\w/.-]*)/gi)].map((m) => m[1].replace(/[.,]$/, '')))];

  const egrid = [...new Set([...sauber.matchAll(/CH\s?(\d{3})\s?(\d{3})\s?(\d{3})\s?(\d{3})/g)].map((m) => `CH${m[1]}${m[2]}${m[3]}${m[4]}`))];

  const flaecheTxt = objektText.match(/(?:Fläche|Grundstücksfläche|Gesamtfläche|surface|superficie)[:\s]*([\d'’]+)\s*m(?:2|²)/i)?.[1]
    ?? objektText.match(/Grundstück:?\s*([\d'’]+)\s*m(?:2|²)/i)?.[1];
  const flaecheGrundstueck = betrag(flaecheTxt);

  const zimmer = Number.parseFloat((objektText.match(/(\d{1,2}(?:[.,]5| ?½| 1\/2)?)\s*-?\s*Zimmer/i)?.[1] ?? '').replace(/ ?(½|1\/2)/, '.5').replace(',', '.')) || undefined;

  const adr = adresse(objektText) ?? adresse(sauber.replace(/Publizierende Stelle[\s\S]*?\n\n/i, ''));

  const kat = kategorie(objektText || sauber);
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
    adresse: adr,
    schaetzung,
    flaecheGrundstueck,
    zimmer,
    beschreibung,
    steigerung,
    besichtigung,
    auflage,
    eingabefrist: datumIso(eingabefrist),
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
