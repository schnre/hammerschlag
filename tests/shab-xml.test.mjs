import { describe, it, expect } from 'vitest';
import { xmlZuText, parsePublikation, verwertung, wohnungsLage, datenIn, adresse, ohnePersonen } from '../scripts/lib/parse.mjs';
import { passendeWohnung, kategorieAusKlasse } from '../scripts/lib/quellen.mjs';

// Aufbau wie eine echte SB01-Publikation im SHAB-XML (Person erfunden).
const XML = `<?xml version='1.0' encoding='UTF-8'?>
<SB01:publication xmlns:SB01="https://shab.ch/shab/SB01-export">
<meta>
  <id>c66281d1-0000-0000-0000-000000000000</id>
  <subRubric>SB01</subRubric>
  <registrationOffice><id>6d3dd210-8345-11e8</id><displayName>Betreibungsamt Bezirk Frauenfeld</displayName><street>St. Gallerstrasse</street><streetNumber>4</streetNumber><swissZipCode>8510</swissZipCode><town>Frauenfeld</town></registrationOffice>
  <publicationNumber>SB01-0000004994</publicationNumber>
  <title><de>Betreibungsamtliche Grundstücksteigerung Erika Beispiel</de></title>
</meta>
<content>
  <debtor><selectType>person</selectType><person><prename>Erika</prename><name>Beispiel</name><dateOfBirth>1970-04-26</dateOfBirth>
    <addressSwitzerland><street>Thurstrasse</street><houseNumber>2</houseNumber><swissZipCode>8552</swissZipCode><town>Felben-Wellhausen</town></addressSwitzerland></person></debtor>
  <auctionObjects>&lt;p&gt;Im Grundbuch Felben-Wellhausen&lt;/p&gt;&lt;p&gt;Liegenschaft Nr. S178, 96/1000 Miteigentum, Sonderrecht an 3 1/2-Zimmerwohnung Nr. 3 im Erdgeschoss rechts mit Keller Nr. 9&lt;/p&gt;&lt;p&gt;Liegenschaft Nr.&amp;nbsp; M1159, Autoabstellplatz Nr. 16, 1/43 Miteigentum&lt;/p&gt;&lt;p&gt;&lt;b&gt;Rechtskräftige betreibungsamtliche Schätzung: &lt;/b&gt;Fr. 480'000.00&lt;/p&gt;&lt;p&gt;Stammgrundstück zu Nr. S178: Grundstück Nr. 580, Fläche 1161m2, Mehrfamilienhaus, EGID: 2754348, Adresse: EDID: 0, Thurstrasse 2, 8552 Felben-Wellhausen&lt;/p&gt;</auctionObjects>
  <auction><date>2027-02-18</date><time>10:30</time><location>Ausbildungszentrum Galgenholz, Thurstrasse 85, 8500 Frauenfeld</location></auction>
  <locationCirculationAuthority>Auflage der Steigerungsbedingungen und des Lastenverzeichnisses beim Betreibungsamt Bezirk Frauenfeld, St. Gallerstrasse 4, 8510 Frauenfeld.</locationCirculationAuthority>
  <additionalLegalRemedy>Die Verwertung wird verlangt infolge Grundpfandgläubigerin mit gesetzlichem Grundpfandrecht. Unmittelbar vor dem Zuschlag ist eine Anzahlung von Fr. 50'000.00 zu zahlen.</additionalLegalRemedy>
  <circulation><entryDeadline>2026-11-09</entryDeadline></circulation>
  <registration><entryDeadline>2026-11-16</entryDeadline></registration>
  <remarks>Besichtigung des Steigerungsobjektes:
Mittwoch, 11. Dezember 2026 um 13.30 Uhr</remarks>
</content>
</SB01:publication>`;

describe('strukturierte SHAB-Publikation', () => {
  const { text, meta, felder } = xmlZuText(XML);
  const o = parsePublikation(text, { id: meta.id, nummer: meta.publicationNumber, kantone: ['TG'], subRubrik: 'SB01', titel: meta['title.de'] }, felder);

  it('liest Steigerungstermin, Fristen und Besichtigung aus den XML-Feldern', () => {
    expect(o.steigerung).toMatchObject({ datum: '2027-02-18', zeit: '10:30' });
    expect(o.steigerung.ort).toContain('Galgenholz');
    expect(o.eingabefrist).toBe('2026-11-09');
    expect(o.besichtigung).toBe('11.12.2026, 13:30 Uhr');
  });

  it('nimmt die Objektadresse, nicht «1000 Miteigentum» oder die Amtsadresse', () => {
    expect(o.adresse).toEqual({ strasse: 'Thurstrasse 2', plz: '8552', ort: 'Felben-Wellhausen' });
    expect(o.egid).toEqual(['2754348']);
  });

  it('erkennt Wohnung, Schätzung, Lage und Verwertungsgrund', () => {
    expect(o.kategorie).toBe('ETW');
    expect(o.schaetzung).toBe(480000);
    expect(o.zimmer).toBe(3.5);
    expect(o.grundstueckNr).toEqual(['S178', 'M1159']);
    expect(o.lage).toEqual({ stock: 3100, seite: 'rechts' });
    expect(o.verwertung).toEqual({ durch: 'pfand', gesetzlich: true });
    expect(o.titel).toBe('Eigentumswohnung, 3½ Zimmer in Felben-Wellhausen');
  });

  it('enthält keine Schuldnerdaten', () => {
    const json = JSON.stringify(o);
    expect(json).not.toMatch(/Erika|Beispiel|1970/);
  });
});

describe('Verwertungsgrund', () => {
  it('Pfandstelle und Rang', () => {
    expect(verwertung('Die Verwertung erfolgt auf Begehren der Grundpfandgläubigerin an 1. Pfandstelle', 'betreibung')).toEqual({ durch: 'pfand', rang: 1 });
    expect(verwertung('Die Verwertung wird verlangt von der Grundpfandgläubigerin im 2. Rang.', 'betreibung')).toEqual({ durch: 'pfand', rang: 2 });
    expect(verwertung('Vente requise par le créancier hypothécaire en 1er rang pour son capital.', 'betreibung')).toEqual({ durch: 'pfand', rang: 1 });
  });
  it('Pfändung und Konkurs', () => {
    expect(verwertung("Die Verwertung erfolgt auf Verlangen des Pfändungsgläubigers in Betreibung Nr. 70'613", 'betreibung')).toEqual({ durch: 'pfaendung' });
    expect(verwertung('irgendwas', 'konkurs')).toEqual({ durch: 'konkurs' });
  });
  it('ignoriert die Standard-Aufforderung an alle Pfandgläubiger', () => {
    expect(verwertung('Wir fordern hiermit die Pfandgläubiger auf, ihre Ansprüche anzumelden.', 'betreibung')).toBeUndefined();
  });
});

describe('Hilfsfunktionen für XML-Daten', () => {
  it('datenIn versteht Monatsnamen und Tippfehler', () => {
    expect(datenIn('vom 05. Januar 2027 bis 14. Janaur 2027').map((d) => d.iso)).toEqual(['2027-01-05', '2027-01-14']);
    expect(datenIn('le 1er décembre 2026').map((d) => d.iso)).toEqual(['2026-12-01']);
  });
  it('adresse liest keine PLZ aus Bruchteilen', () => {
    expect(adresse('Liegenschaft Nr. S178, 96/1000 Miteigentum')).toBeUndefined();
  });
  it('ohnePersonen: «der Schuldnerin» im Satz bleibt, Pfandeigentümer-Liste fällt weg', () => {
    const t = ohnePersonen('1/2 ME-Anteil der Schuldnerin an GBBL 8999, 4.5-Zimmer-Wohnung\nPfandeigentümer:\n1. Erika Beispiel, Weg 1, 8700 Küsnacht\n2. Max Muster, Weg 1, 8700 Küsnacht\nBesichtigung');
    expect(t).toContain('4.5-Zimmer-Wohnung');
    expect(t).not.toMatch(/Erika|Max Muster/);
  });
  it('ohnePersonen entfernt Eigentümernamen', () => {
    expect(ohnePersonen('Wohnhaus, Magernau 14, Schwarzenburg\nAlleineigentum von Muster Max')).not.toContain('Muster');
  });
  it('Gemeinde in verschiedenen Schreibweisen', () => {
    const g = (t, k = 'VD') => parsePublikation(t, { nummer: 'X', kantone: [k], subRubrik: 'SB01' }, { objekte: t }).gemeinde;
    expect(g("SUR LA COMMUNE D'ICOGNE\nPPE n° 50304", 'VS')).toBe('Icogne');
    expect(g('Comune: CENTOVALLI-INTRAGNA\nNumero fondo 12', 'TI')).toBe('Centovalli-Intragna');
    expect(g('Bien-fonds PPE no 5509/H du cadastre de Bevaix :', 'NE')).toBe('Bevaix');
    expect(g('Grundstück Nr. 613, GB Ruswil, Plan Nr. 16', 'LU')).toBe('Ruswil');
    expect(g('Bien-fonds n° 2245 sis Chemin du Polny 33 à Epalinges, en nature de')).toBe('Epalinges');
    expect(g('Schwarzenburg 2 / 364\nWohnhaus', 'BE')).toBe('Schwarzenburg');
  });
  it('wohnungsLage', () => {
    expect(wohnungsLage('4½-Zimmerwohnung im 2. Obergeschoss links')).toEqual({ stock: 3102, seite: 'links' });
  });
  it('passendeWohnung findet die Wohnung im GWR', () => {
    const a = { wstwk: [3101, 3100, 3100, 3100], wbez: ['Links', 'Links', 'Mitte', 'Rechts'], wazim: [4, 4, 2, 3], warea: [83, 83, 42, 68], wbauj: [1999, 1999, 1999, 1999] };
    expect(passendeWohnung(a, { lage: { stock: 3100, seite: 'rechts' }, zimmer: 3.5 })?.wohnflaeche).toBe(68);
    expect(passendeWohnung(a, { zimmer: 4 })?.wohnflaeche).toBe(83);
    expect(passendeWohnung(a, {})).toBeUndefined();
  });
  it('kategorieAusKlasse', () => {
    expect(kategorieAusKlasse(1122)).toBe('MFH');
    expect(kategorieAusKlasse(1110)).toBe('EFH');
    expect(kategorieAusKlasse(1251)).toBe('Gewerbe');
  });
});
