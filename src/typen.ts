export type Kategorie = 'EFH' | 'MFH' | 'ETW' | 'Grundstueck' | 'Gewerbe' | 'Sonstiges';

export const KATEGORIEN: Record<Kategorie, string> = {
  EFH: 'Einfamilienhaus',
  MFH: 'Mehrfamilienhaus',
  ETW: 'Eigentumswohnung',
  Grundstueck: 'Grundstück',
  Gewerbe: 'Gewerbeobjekt',
  Sonstiges: 'Sonstiges',
};

export const KANTONE = [
  'AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE',
  'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH',
] as const;

export interface Gebaeude {
  egid?: string;
  baujahr?: number;
  geschosse?: number;
  wohnungen?: number;
  grundflaeche?: number;
  wohnflaeche?: number;
  zimmer?: number;
  heizung?: string;
  fossil?: boolean;
}

export interface Objekt {
  id: string;
  art: 'betreibung' | 'konkurs';
  status: 'aktiv' | 'abgesagt' | 'vorbei';
  kategorie: Kategorie;
  titel: string;
  kanton: string;
  gemeinde?: string;
  grundbuch?: string;
  grundstueckNr: string[];
  egrid: string[];
  adresse?: { strasse?: string; plz?: string; ort?: string };
  lat?: number;
  lon?: number;
  /** true = Koordinate der Adresse, false = nur Gemeinde */
  genau?: boolean;
  schaetzung?: number;
  flaecheGrundstueck?: number;
  zimmer?: number;
  beschreibung: string;
  steigerung?: { datum: string; zeit?: string; ort?: string };
  besichtigung?: string;
  auflage?: string;
  eingabefrist?: string;
  amt: { name: string; adresse?: string; email?: string; telefon?: string; web?: string };
  gebaeude?: Gebaeude;
  quelle: { nummer: string; id: string; url: string; xml: string; datum: string; sprache: string };
  neu?: boolean;
  demo?: boolean;
}

export interface Datenbestand {
  stand: string;
  demo: boolean;
  objekte: Objekt[];
}
