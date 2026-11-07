#!/usr/bin/env node
// Erfundene Demodaten, damit man die App ohne SHAB-Abfrage ausprobieren kann.
// Orte und Koordinaten sind echt, Adressen, Ämter und Objekte sind erfunden.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DATEI = fileURLToPath(new URL('../public/data/steigerungen.json', import.meta.url));

let saat = 42;
const zufall = () => ((saat = (saat * 16807) % 2147483647) - 1) / 2147483646;
const wahl = (a) => a[Math.floor(zufall() * a.length)];
const zwischen = (a, b) => Math.round(a + zufall() * (b - a));

const ORTE = [
  ['Frauenfeld', 'TG', '8500', 47.5536, 8.8987], ['Winterthur', 'ZH', '8400', 47.4988, 8.7237], ['Uster', 'ZH', '8610', 47.3471, 8.7209],
  ['St. Gallen', 'SG', '9000', 47.4245, 9.3767], ['Wil SG', 'SG', '9500', 47.4615, 9.0455], ['Luzern', 'LU', '6003', 47.0502, 8.3093],
  ['Emmen', 'LU', '6020', 47.0817, 8.2985], ['Bern', 'BE', '3011', 46.948, 7.4474], ['Thun', 'BE', '3600', 46.758, 7.628],
  ['Biel/Bienne', 'BE', '2502', 47.1368, 7.2468], ['Aarau', 'AG', '5000', 47.3925, 8.0444], ['Baden', 'AG', '5400', 47.4733, 8.3059],
  ['Olten', 'SO', '4600', 47.3499, 7.9033], ['Basel', 'BS', '4051', 47.5596, 7.5886], ['Liestal', 'BL', '4410', 47.484, 7.735],
  ['Chur', 'GR', '7000', 46.8508, 9.532], ['Davos', 'GR', '7270', 46.8027, 9.836], ['Lausanne', 'VD', '1003', 46.5197, 6.6323],
  ['Yverdon-les-Bains', 'VD', '1400', 46.7785, 6.6411], ['Fribourg', 'FR', '1700', 46.8065, 7.162], ['Sion', 'VS', '1950', 46.2331, 7.3606],
  ['Lugano', 'TI', '6900', 46.0037, 8.9511], ['Bellinzona', 'TI', '6500', 46.1946, 9.0244], ['Zug', 'ZG', '6300', 47.1662, 8.5155],
  ['Schaffhausen', 'SH', '8200', 47.697, 8.634], ['Herisau', 'AR', '9100', 47.386, 9.279], ['Glarus', 'GL', '8750', 47.0404, 9.0679],
  ['Delémont', 'JU', '2800', 47.3649, 7.3445], ['Schwyz', 'SZ', '6430', 47.0207, 8.6541], ['Altdorf', 'UR', '6460', 46.8804, 8.6444],
];
const STRASSEN = ['Musterweg', 'Lindenstrasse', 'Bergstrasse', 'Bahnhofstrasse', 'Rosenweg', 'Feldstrasse', 'Seeblick', 'Obstgartenweg', 'Kirchgasse', 'Sonnenrain'];
const HEIZ = [['Heizöl', true], ['Gas', true], ['Luft (Wärmepumpe)', false], ['Holz', false], ['Fernwärme', false], ['Elektrizität (direkt)', true]];
const KATS = ['EFH', 'EFH', 'EFH', 'ETW', 'ETW', 'ETW', 'MFH', 'Grundstueck', 'Gewerbe', 'Sonstiges'];
const NAMEN = { EFH: 'Einfamilienhaus', MFH: 'Mehrfamilienhaus', ETW: 'Eigentumswohnung', Grundstueck: 'Grundstück', Gewerbe: 'Gewerbeobjekt', Sonstiges: 'Objekt' };
const PREIS = { ZH: 11000, ZG: 13000, GE: 12000, BS: 9000, VD: 9000, SZ: 9500, LU: 8000, BL: 7800, GR: 8000, AG: 7200, SG: 6800, TG: 6800, BE: 6600, FR: 6500, TI: 6600, VS: 6200, SH: 6200, AR: 6200, UR: 6400, GL: 5500, SO: 5900, JU: 4400 };

const heute = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const chf = (n) => n.toLocaleString('de-CH').replace(/[’']/g, "'");

const objekte = ORTE.map(([ort, kanton, plz, lat, lon], i) => {
  const kategorie = KATS[i % KATS.length];
  const strasse = `${wahl(STRASSEN)} ${zwischen(1, 80)}`;
  const baujahr = wahl([1912, 1934, 1956, 1963, 1971, 1978, 1985, 1992, 2004, 2011, 2018]);
  const wohnflaeche = kategorie === 'ETW' ? zwischen(65, 140) : kategorie === 'MFH' ? zwischen(380, 900) : kategorie === 'Gewerbe' ? zwischen(250, 700) : zwischen(110, 220);
  const zimmer = kategorie === 'ETW' ? wahl([2.5, 3.5, 4.5, 5.5]) : kategorie === 'EFH' ? wahl([4.5, 5.5, 6.5]) : undefined;
  const flaecheGrundstueck = kategorie === 'ETW' ? undefined : zwischen(300, 1400);
  const zustand = baujahr < 1980 ? 0.62 : baujahr < 2000 ? 0.75 : 0.88;
  const basis = kategorie === 'Grundstueck' ? flaecheGrundstueck * zwischen(500, 1400)
    : kategorie === 'Sonstiges' ? zwischen(25, 45) * 1000
    : wohnflaeche * (PREIS[kanton] ?? 7000) * (kategorie === 'MFH' ? 0.8 : kategorie === 'Gewerbe' ? 0.5 : 1) * zustand * (0.8 + zufall() * 0.35);
  const schaetzung = Math.round(basis / 5000) * 5000;
  const [heizung, fossil] = wahl(HEIZ);
  const tag = new Date(heute.getTime() + zwischen(-10, 60) * 864e5);
  const pub = new Date(tag.getTime() - zwischen(28, 40) * 864e5);
  const nr = `SB01-DEMO${String(1000 + i)}`;
  const gNr = String(zwischen(100, 4999));
  const bau = kategorie !== 'Grundstueck' && kategorie !== 'Sonstiges';
  const titel = `${NAMEN[kategorie]}${zimmer ? `, ${String(zimmer).replace('.5', '½')} Zimmer` : ''} in ${ort}`;

  return {
    id: nr,
    art: i % 6 === 5 ? 'konkurs' : 'betreibung',
    status: iso(tag) < iso(heute) ? 'vorbei' : i === 7 ? 'abgesagt' : 'aktiv',
    kategorie,
    titel,
    kanton,
    gemeinde: ort,
    grundbuch: ort,
    grundstueckNr: kategorie === 'ETW' ? [`${gNr}-${zwischen(1, 12)}`] : [gNr],
    egrid: [`CH${String(zwischen(100000, 999999))}${String(zwischen(100000, 999999))}`],
    adresse: { strasse, plz, ort },
    lat: lat + (zufall() - 0.5) * 0.02,
    lon: lon + (zufall() - 0.5) * 0.03,
    genau: true,
    schaetzung,
    flaecheGrundstueck,
    zimmer,
    beschreibung: [
      `Im Grundbuch ${ort}`,
      kategorie === 'ETW'
        ? `Grundstück Nr. ${gNr}-${zwischen(1, 12)}, Stockwerkeigentum, Sonderrecht an der ${String(zimmer).replace('.5', ' ½')}-Zimmerwohnung im ${zwischen(1, 4)}. Obergeschoss mit Kellerabteil, ${strasse}, ${plz} ${ort}`
        : kategorie === 'Grundstueck'
          ? `Grundstück Nr. ${gNr}, ${chf(flaecheGrundstueck)} m², Wiese/Bauland, ${strasse}, ${plz} ${ort}`
          : kategorie === 'Sonstiges'
            ? `Grundstück Nr. ${gNr}, Autoabstellplatz in Einstellhalle, Miteigentum 1/24, ${strasse}, ${plz} ${ort}`
            : `Grundstück Nr. ${gNr}, ${chf(flaecheGrundstueck)} m², ${NAMEN[kategorie]} Vers.-Nr. ${zwischen(100, 999)}, ${strasse}, ${plz} ${ort}`,
    ].join('\n'),
    steigerung: { datum: iso(tag), zeit: wahl(['10:00', '14:00', '14:30', '15:00']), ort: `Gemeindesaal, ${plz} ${ort}` },
    besichtigung: `${new Date(tag.getTime() - 14 * 864e5).toLocaleDateString('de-CH')}, 14:00 Uhr, nur mit Voranmeldung`,
    auflage: `${new Date(tag.getTime() - 25 * 864e5).toLocaleDateString('de-CH')} bis ${new Date(tag.getTime() - 15 * 864e5).toLocaleDateString('de-CH')}`,
    eingabefrist: iso(new Date(pub.getTime() + 20 * 864e5)),
    amt: { name: `Betreibungsamt ${ort} (Demo)`, adresse: `${plz} ${ort}`, email: 'demo@example.ch', telefon: '058 000 00 00' },
    gebaeude: bau && zufall() > 0.15 ? {
      egid: String(zwischen(100000, 9999999)),
      baujahr,
      geschosse: kategorie === 'MFH' ? zwischen(3, 5) : kategorie === 'ETW' ? zwischen(3, 6) : 2,
      wohnungen: kategorie === 'MFH' ? zwischen(4, 10) : kategorie === 'ETW' ? zwischen(6, 16) : 1,
      grundflaeche: kategorie === 'ETW' ? zwischen(250, 500) : Math.round(wohnflaeche / 1.6),
      wohnflaeche: kategorie === 'ETW' && zufall() > 0.5 ? undefined : wohnflaeche,
      heizung,
      fossil,
    } : undefined,
    quelle: { nummer: nr, id: `demo-${i}`, url: 'https://www.shab.ch/', xml: '', datum: iso(pub), sprache: 'de' },
    demo: true,
  };
}).sort((a, b) => a.steigerung.datum.localeCompare(b.steigerung.datum));

await writeFile(DATEI, JSON.stringify({ stand: new Date().toISOString(), demo: true, objekte }, null, 1) + '\n');
console.log(`${objekte.length} Demo-Objekte geschrieben.`);
