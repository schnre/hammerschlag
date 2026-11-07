import { describe, it, expect } from 'vitest';
import { bewerte, baujahrKlasse, STANDARD_CONFIG } from '../src/bewertung';
import type { Objekt } from '../src/typen';

const basis: Objekt = {
  id: 'T1', art: 'betreibung', status: 'aktiv', kategorie: 'EFH', titel: 'Test', kanton: 'TG',
  grundstueckNr: ['1'], egrid: [], beschreibung: '', amt: { name: 'BA' },
  quelle: { nummer: 'T1', id: 't', url: '', xml: '', datum: '2026-10-01', sprache: 'de' },
  schaetzung: 600_000,
  gebaeude: { baujahr: 1965, wohnflaeche: 150, fossil: true },
};

describe('bewerte', () => {
  it('rechnet Investition, Marktwert und Gewinn nachvollziehbar', () => {
    const b = bewerte(basis);
    const preis = STANDARD_CONFIG.preisProM2.EFH.TG;
    expect(b.marktwert.wert).toBe(Math.round((150 * preis) / 1000) * 1000);
    expect(b.renovation.wert).toBe(Math.round((150 * (1500 + 220)) / 1000) * 1000);
    expect(b.investition).toBe(b.gebot.wert + b.nebenkosten + b.renovation.wert);
    expect(b.gewinn).toBe(b.marktwert.wert! - b.investition - b.verkaufskosten - b.risikoabschlag);
    expect(b.datenqualitaet).toBe(100);
  });

  it('teures Gebot → lohnt sich eher nicht', () => {
    expect(bewerte(basis, STANDARD_CONFIG, { gebot: 1_200_000 }).urteil).toBe('eher-nicht');
  });

  it('günstiges Gebot → lohnend', () => {
    expect(bewerte(basis, STANDARD_CONFIG, { gebot: 350_000 }).urteil).toBe('lohnend');
  });

  it('ohne Wohnfläche: unklar statt falscher Zahl', () => {
    const b = bewerte({ ...basis, gebaeude: undefined });
    expect(b.urteil).toBe('unklar');
    expect(b.marktwert.wert).toBeUndefined();
  });

  it('Zürich ohne Handänderungssteuer', () => {
    const b = bewerte({ ...basis, kanton: 'ZH' });
    expect(b.nebenkosten).toBe(Math.round(600_000 * STANDARD_CONFIG.nebenkosten.grundbuchUndSteigerung));
  });

  it('Baujahrklassen', () => {
    expect(baujahrKlasse(1900)).toBe('bis1949');
    expect(baujahrKlasse(2020)).toBe('ab2015');
    expect(baujahrKlasse()).toBe('unbekannt');
  });
});

describe('Deckungsprinzip', () => {
  it('Mindestgebot aus eingetragenen Hypotheken hebt das Standardgebot an', () => {
    const b = bewerte({ ...basis, verwertung: { durch: 'pfand', rang: 2 } }, STANDARD_CONFIG, { vorgehendePfand: 700_000 });
    expect(b.mindestgebot.wert).toBe(700_000);
    expect(b.gebot.wert).toBe(700_000);
    expect(b.hinweise.join(' ')).toMatch(/2\. Pfandstelle/);
  });
  it('eigenes Gebot unter dem Mindestgebot gibt einen Hinweis', () => {
    const b = bewerte(basis, STANDARD_CONFIG, { vorgehendePfand: 700_000, gebot: 500_000 });
    expect(b.gebot.wert).toBe(500_000);
    expect(b.hinweise.join(' ')).toMatch(/unter dem Mindestgebot/);
  });
  it('1. Pfandstelle → Mindestgebot 0', () => {
    expect(bewerte({ ...basis, verwertung: { durch: 'pfand', rang: 1 } }).mindestgebot.wert).toBe(0);
  });
});
