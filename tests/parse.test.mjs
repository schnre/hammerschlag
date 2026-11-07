import { describe, it, expect } from 'vitest';
import { parsePublikation, betrag, kategorie, ohnePersonen, xmlZuText, IST_STEIGERUNG, IST_WIDERRUF } from '../scripts/lib/parse.mjs';

// Aufbau wie echte SHAB-Publikationen (SB01), Personen und Adressen verfremdet.
const ETW = `Betreibungsamtliche Grundstücksteigerung Max Muster
Schuldner:
Max Muster
Heimatort: Wald ZH
Staatsbürgerschaft: Schweiz
Geburtsdatum: 23.12.1980
Seestrasse 246
8267 Berlingen
Steigerungsobjekte:
Im Grundbuch Berlingen
Grundstück Nr. S87, 61/1000 Miteigentum, Sonderrecht an der 5 1/2-Zimmerwohnung Nr. 21111 im 1. Obergeschoss süd-west mit Keller, Seestrasse 246, 8267 Berlingen;
Grundstück Nr. M65 / Autoabstellplatz Nr. 98514, 1/29 Miteigentum
Rechtskräftige betreibungsamtliche Schätzung: Fr. 920'000.00
Stammgrundstück zu Nr. S87: Grundstück Nr. 693, Fläche 5'196 m2, Plan-Nr. 7, Mehrfamilienhaus, E-GRID CH327742413234;
Angaben zur Steigerung
10.01.2025 um 14:00 Uhr, Ausbildungszentrum Galgenholz, Thurstrasse 85, 8500 Frauenfeld
Auflage der Steigerungsbedingungen und des Lastenverzeichnisses: 05.12.2024 bis 16.12.2024
Besichtigung: 12.12.2024, 14:00 Uhr
Die Pfandgläubiger werden aufgefordert, ihre Ansprüche bis spätestens 30.08.2024 anzumelden.
Kontakt: betreibungsamt.frauenfeld@tg.ch
Weitere Unterlagen befinden sich auf unserer Homepage: www.betreibungsamt.tg.ch`;

const EFH = `Schuldner:
Erika Beispiel
Geburtsdatum: 26.04.1970
St. Johannstrasse 27
8500 Frauenfeld
Steigerungsobjekte:
Im Grundbuch Frauenfeld.
Grundstück-Nr. 50136, Gebäude, 115 m2 Gartenanlage, 63 m2
Einfamilienhaus, St. Johannstrasse 27, 8500 Frauenfeld
Rechtskräftige betreibungsamtliche Schätzung: Fr. 390'OOO.OQ.
Angaben zur Steigerung
04.02.2025 um 14:00 Uhr, Gemeindesaal, 8500 Frauenfeld`;

const meta = { id: 'abc', nummer: 'SB01-0000003734', datum: '2024-08-09', kantone: ['TG'], subRubrik: 'SB01', amtName: 'Betreibungsamt Bezirk Frauenfeld' };

describe('parsePublikation', () => {
  it('liest Eigentumswohnung mit allen Kernangaben', () => {
    const o = parsePublikation(ETW, meta);
    expect(o.kategorie).toBe('ETW');
    expect(o.schaetzung).toBe(920000);
    expect(o.steigerung).toMatchObject({ datum: '2025-01-10', zeit: '14:00' });
    expect(o.steigerung.ort).toContain('Galgenholz');
    expect(o.grundbuch).toBe('Berlingen');
    expect(o.grundstueckNr).toContain('S87');
    expect(o.egrid).toEqual(['CH327742413234']);
    expect(o.adresse).toMatchObject({ strasse: 'Seestrasse 246', plz: '8267', ort: 'Berlingen' });
    expect(o.zimmer).toBe(5.5);
    expect(o.amt.email).toBe('betreibungsamt.frauenfeld@tg.ch');
    expect(o.amt.web).toBe('www.betreibungsamt.tg.ch');
    expect(o.auflage).toContain('05.12.2024');
    expect(o.besichtigung).toContain('12.12.2024');
    expect(o.kanton).toBe('TG');
    expect(o.titel).toBe('Eigentumswohnung, 5½ Zimmer in Berlingen');
  });

  it('enthält keine Personendaten', () => {
    const json = JSON.stringify(parsePublikation(ETW, meta));
    expect(json).not.toMatch(/Max Muster|Geburtsdatum|Heimatort|1980/);
  });

  it('liest OCR-Fehler im Betrag und Einfamilienhaus', () => {
    const o = parsePublikation(EFH, meta);
    expect(o.schaetzung).toBe(390000);
    expect(o.kategorie).toBe('EFH');
    expect(o.adresse?.plz).toBe('8500');
    expect(JSON.stringify(o)).not.toContain('Erika');
  });
});

describe('Hilfsfunktionen', () => {
  it('betrag', () => {
    expect(betrag("1'310'000.00")).toBe(1310000);
    expect(betrag('1 200 000')).toBe(1200000);
    expect(betrag("850’000")).toBe(850000);
  });
  it('kategorie', () => {
    expect(kategorie('Parzelle Nr. 12, Bauland unüberbaut')).toBe('Grundstueck');
    expect(kategorie('Wohn- und Geschäftshaus mit 6 Wohnungen')).toBe('MFH');
    expect(kategorie('Autoabstellplatz in Tiefgarage')).toBe('Sonstiges');
    expect(kategorie('Restaurant mit Saal')).toBe('Gewerbe');
    expect(kategorie('Propriété par étages, appartement de 4 pièces')).toBe('ETW');
  });
  it('ohnePersonen entfernt Schuldnerblock', () => {
    expect(ohnePersonen(ETW)).not.toContain('Max Muster');
  });
  it('erkennt Steigerungen und Widerrufe', () => {
    expect(IST_STEIGERUNG('Betreibungsamtliche Grundstücksteigerung X', 'SB01')).toBe(true);
    expect(IST_STEIGERUNG('Konkursamtliche Grundstücksteigerung X', 'KK04')).toBe(true);
    expect(IST_STEIGERUNG('Konkurseröffnung X', 'KK01')).toBe(false);
    expect(IST_WIDERRUF('Widerruf der Grundstücksteigerung')).toBe(true);
  });
  it('xmlZuText lässt Personenfelder weg', () => {
    const { text, meta: m } = xmlZuText('<p><meta><publicationNumber>SB01-1</publicationNumber></meta><content><debtor><name>Hans</name></debtor><object>Im Grundbuch Arbon</object></content></p>');
    expect(text).toContain('Arbon');
    expect(text).not.toContain('Hans');
    expect(m.publicationNumber).toBe('SB01-1');
  });
});
