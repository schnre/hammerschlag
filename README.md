# Hammerschlag

*Jede Zwangsversteigerung der Schweiz – mit Bewertung, gratis.*

Web-App, die alle Grundstücksteigerungen der Betreibungs- und Konkursämter aus dem Schweizerischen Handelsamtsblatt (SHAB) auflistet, auf einer Karte zeigt und vorbewertet, ob sich Kauf und Renovation lohnen.

Aufbau wie [schnre/schnittpunkt](https://github.com/schnre/schnittpunkt): Vite + TypeScript ohne Framework, GitHub Pages, GitHub Actions, ADRs, Tests.

## Was die App kann

**Objekte**
- Alle offenen Steigerungen der ganzen Schweiz, täglich automatisch aus dem SHAB
- Kategorien: Einfamilienhaus, Mehrfamilienhaus, Eigentumswohnung, Grundstück, Gewerbe, Sonstiges
- Filter nach Kategorie, Kanton, Verfahren (Betreibung/Konkurs), Preis, Bewertung; Volltextsuche
- **Umkreissuche** um jede PLZ, jeden Ort oder jede Adresse (10–100 km)
- Sortierung nach Datum, Neuheit, Bewertung, Preis oder Distanz
- Listen- und **Kartenansicht** (swisstopo: grau, farbig, Luftbild), Farbe nach Bewertung
- Badge «Neu» für alles seit dem letzten Besuch, abgesagte Steigerungen werden markiert
- CSV-Export für Excel

**Objektdetails**
- Amtliche Schätzung, Grundbuch, Grundstück-Nr., E-GRID, Fläche, Zimmer, exakter Standort
- Termine: Steigerung, Besichtigung, Auflage der Steigerungsbedingungen, Eingabefrist – als Kalendereintrag (.ics)
- Gebäudedaten aus dem eidgenössischen Gebäuderegister: Baujahr, Geschosse, Wohnungen, Fläche, Heizung
- **Gutachten & Unterlagen anfordern**: fertige E-Mail ans zuständige Amt
- Direktlinks: SHAB-Original, Parzelle/ÖREB-Kataster, Bauzonen, Strassenlärm, Solarpotenzial, Google Maps, Street View
- Merkliste mit Notizen, Teilen

**Bewertung «Lohnt sich das?»**
- Geschätzter Marktwert nach Renovation = Wohnfläche × Richtpreis pro m² (Kanton, Kategorie)
- Renovationskosten nach Baujahr, Zuschlag für Öl-, Gas- oder Elektroheizung
- Nebenkosten (Handänderungssteuer, Grundbuch), Verkaufskosten, Risikoreserve
- Ergebnis: Gewinn, Rendite, Bruttomietrendite, Score 0–100 und Ampel
- **Rechner** pro Objekt: jeden Wert selbst überschreiben (z. B. Wohnfläche aus dem Gutachten, eigenes Gebot), Quelle jedes Werts sichtbar (SHAB, GWR, geschätzt, Annahme)
- Alle Richtwerte unter Einstellungen bzw. in `config/bewertung.json` anpassbar

**Sonstiges**
- Ratgeber zum Ablauf einer Steigerung in der Schweiz
- Heller und dunkler Modus, Handy und Desktop, installierbar (PWA-Manifest)
- Export/Import der eigenen Daten (Merkliste, Notizen, Werte)

## Sind die Daten öffentlich?

| Was | Quelle | Öffentlich |
|---|---|---|
| Steigerung, Termin, Ort, Schätzung, Grundstück, Amt | SHAB (amtsblattportal.ch API) | Ja, frei per API |
| Koordinaten | geo.admin.ch | Ja |
| Baujahr, Fläche, Wohnungen, Heizung | Gebäude- und Wohnungsregister (GWR) über geo.admin.ch | Ja |
| Bauzonen, Lärm, ÖREB, Solarpotenzial | map.geo.admin.ch, sonnendach.ch | Ja (verlinkt) |
| Schätzungsgutachten, Steigerungsbedingungen, Lastenverzeichnis | beim Betreibungs-/Konkursamt | Auf Anfrage für Interessenten, einige Ämter stellen sie online |
| Marktpreise pro m² | keine freie amtliche Quelle für die ganze Schweiz | Richtwerte in `config/bewertung.json` |

Bezahldienste wie zwangsversteigerung.ch werten dieselben SHAB-Publikationen aus. Ihre «Gutachtenanforderung» ist ebenfalls eine Anfrage beim Amt.

## Erste Inbetriebnahme

1. **Repository anlegen** und diesen Ordner pushen (Branch `main`).
2. **GitHub Pages einschalten:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Bestand aufbauen:** Actions → *Steigerungen* → *Run workflow* → `tage` = `120`. Ersetzt die Demodaten durch echte Objekte.
4. Danach läuft die Abfrage täglich von selbst und die Seite wird neu gebaut.

> Bis zur ersten Abfrage zeigt die App **erfundene Demodaten** (gekennzeichnet).

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```
npm install
npm run dev                    # Entwicklungsserver
npm test                       # Parser- und Bewertungstests
npm run build                  # Daten prüfen, Typen prüfen, nach dist/ bauen
npm run steigerungen           # SHAB der letzten 10 Tage abfragen
npm run steigerungen:bestand   # letzte 120 Tage
npm run demo-daten             # Demodaten neu erzeugen
```

## Projektstruktur

```
├─ index.html
├─ config/bewertung.json         Preise, Mieten, Renovationskosten, Nebenkosten, Schwellen
├─ public/data/steigerungen.json Objekte (schreibt die Abfrage)
├─ scripts/
│  ├─ steigerungen.mjs          tägliche Abfrage SHAB → geo.admin → GWR
│  ├─ lib/parse.mjs             Publikationstext → Objekt (ohne Personendaten)
│  ├─ lib/quellen.mjs           API-Zugriffe
│  ├─ validate-daten.mjs        Prüfung vor jedem Build
│  └─ demo-daten.mjs
├─ src/
│  ├─ bewertung.ts              Vorbewertung und Rechner
│  ├─ zustand.ts                Merkliste, Notizen, Einstellungen (localStorage)
│  └─ ui/                       Übersicht, Objekte, Detail, Karte, Merkliste, Ratgeber, Einstellungen
├─ tests/
├─ docs/adr/
└─ .github/workflows/           steigerungen.yml, deploy.yml, validate.yml
```

## Datenschutz

- Schuldnernamen, Geburtsdaten, Heimatorte und Staatsangehörigkeit werden beim Import verworfen; der Build bricht ab, falls doch etwas durchrutscht.
- Merkliste, Notizen und eigene Werte bleiben im Browser.

## Grenzen

- Die Ämter formulieren ihre Publikationen unterschiedlich. Der Parser erkennt die üblichen Muster (de, fr, it); was er nicht sicher erkennt, bleibt leer. Massgebend ist immer die verlinkte Originalpublikation.
- Bei Stockwerkeigentum ist meist unklar, welche Wohnung im Gebäuderegister gemeint ist – Wohnfläche dann aus dem Gutachten im Rechner eintragen.
- Die Bewertung ist eine grobe Vorabschätzung, keine Verkehrswertschätzung und keine Anlageberatung.
