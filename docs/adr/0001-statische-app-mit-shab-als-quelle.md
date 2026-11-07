# ADR 0001: Statische App, SHAB als einzige Pflichtquelle

## Kontext
Jede Grundstücksteigerung eines Betreibungs- oder Konkursamts muss im Schweizerischen Handelsamtsblatt (SHAB) publiziert werden (SchKG 138, VZG 29). Das Amtsblattportal bietet dafür eine frei zugängliche Lese-API. Kommerzielle Dienste wie zwangsversteigerung.ch werten dieselben Publikationen aus.

## Entscheidung
- Eine GitHub Action fragt täglich die Rubriken SB (Schuldbetreibungen) und KK (Konkurse) ab, filtert Grundstücksteigerungen, liest den Volltext (XML) und schreibt `public/data/steigerungen.json`.
- Koordinaten und Gebäudedaten (Baujahr, Fläche, Heizung) kommen aus geo.admin.ch bzw. dem GWR.
- Die App ist statisch (Vite + TypeScript, GitHub Pages). Merkliste, Notizen und eigene Rechnerwerte bleiben im Browser.

## Personendaten
Schuldnernamen, Geburtsdaten, Heimatorte usw. werden beim Import verworfen und durch `validate-daten.mjs` vor jedem Build geprüft. Das SHAB publiziert diese Angaben nur zeitlich begrenzt; eine Weiterverbreitung wäre datenschutzrechtlich heikel und für die Bewertung nicht nötig.

## Folgen
- Kein Server, keine Kosten, keine Konten.
- Gutachten und Steigerungsbedingungen sind nicht öffentlich im Netz, sondern beim Amt erhältlich. Die App erleichtert die Anfrage per vorbereiteter E-Mail.
- Der Parser arbeitet mit Textmustern, weil die Ämter den Inhalt unterschiedlich formulieren. Unvollständig erkannte Felder bleiben leer statt geraten.
