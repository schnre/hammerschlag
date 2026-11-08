import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Objekt } from '../typen';
import { KATEGORIEN } from '../typen';
import { bewertung } from '../zustand';
import { chf, datum, esc } from '../format';

const SCHWEIZ: L.LatLngBoundsExpression = [[45.8, 5.95], [47.85, 10.5]];

export type Kartenstil = 'grau' | 'farbig' | 'luftbild';
const EBENEN: Record<Kartenstil, string> = {
  grau: 'ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',
  farbig: 'ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  luftbild: 'ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
};

const TOUCH = () => matchMedia('(pointer: coarse)').matches;

/**
 * sperre = Karte steht mitten in einer scrollbaren Seite. Auf Touch-Geräten scrollt ein Finger
 * dann die Seite, zwei Finger zoomen; nach einem Tippen lässt sich die Karte verschieben.
 */
export function neueKarte(el: HTMLElement, stil: Kartenstil = 'grau', sperre = false): L.Map {
  const gesperrt = sperre && TOUCH();
  const karte = L.map(el, { zoomControl: !TOUCH(), attributionControl: true, maxBounds: [[45.3, 5.2], [48.3, 11.2]], dragging: !gesperrt });
  if (gesperrt) {
    const hinweis = Object.assign(document.createElement('button'), { className: 'karte-sperre', type: 'button', textContent: 'Tippen, um die Karte zu bewegen' });
    el.append(hinweis);
    hinweis.addEventListener('click', () => { karte.dragging.enable(); hinweis.remove(); });
  }
  const ebenen = Object.fromEntries(
    (Object.keys(EBENEN) as Kartenstil[]).map((k) => [
      { grau: 'Karte grau', farbig: 'Karte farbig', luftbild: 'Luftbild' }[k],
      L.tileLayer(`https://wmts.geo.admin.ch/1.0.0/${EBENEN[k]}`, { maxZoom: 19, attribution: '© <a href="https://www.swisstopo.admin.ch" target="_blank">swisstopo</a>' }),
    ]),
  );
  Object.values(ebenen)[(Object.keys(EBENEN) as Kartenstil[]).indexOf(stil)].addTo(karte);
  L.control.layers(ebenen, undefined, { position: 'topright' }).addTo(karte);
  karte.fitBounds(SCHWEIZ);
  return karte;
}

const FARBE = { lohnend: '#2f7d4f', pruefen: '#c48712', 'eher-nicht': '#b4462b', unklar: '#6f8190' } as const;
function farbe(o: Objekt): string {
  return o.status !== 'aktiv' ? '#a3a7a4' : FARBE[bewertung(o).urteil];
}

export function zeigeObjekte(karte: L.Map, objekte: Objekt[], umkreis?: { koord: [number, number]; km: number }): void {
  karte.eachLayer((l) => { if (!(l instanceof L.TileLayer)) karte.removeLayer(l); });
  const punkte: L.LatLngExpression[] = [];
  for (const o of objekte) {
    if (o.lat == null || o.lon == null) continue;
    const m = L.circleMarker([o.lat, o.lon], {
      radius: o.genau ? 8 : 6, weight: 2, color: '#fff', fillColor: farbe(o), fillOpacity: 0.95,
      dashArray: o.genau ? undefined : '2 3',
    }).addTo(karte);
    m.bindPopup(`<div class="popup"><small>${esc(KATEGORIEN[o.kategorie])} · ${esc(o.kanton)}</small><b>${esc(o.titel)}</b>
      <span>Schätzung ${chf(o.schaetzung)}</span><span>Steigerung ${datum(o.steigerung?.datum)}</span>
      <a href="#/objekt/${encodeURIComponent(o.id)}">Details öffnen →</a></div>`);
    punkte.push([o.lat, o.lon]);
  }
  if (umkreis) {
    L.circle(umkreis.koord, { radius: umkreis.km * 1000, color: '#1d2420', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }).addTo(karte);
    karte.fitBounds(L.latLng(umkreis.koord).toBounds(umkreis.km * 2000));
  } else if (punkte.length) {
    karte.fitBounds(L.latLngBounds(punkte), { padding: [30, 30], maxZoom: 13 });
  }
}

export function einzelKarte(el: HTMLElement, o: Objekt): L.Map | undefined {
  if (o.lat == null || o.lon == null) return undefined;
  const k = neueKarte(el, 'farbig', true);
  k.setView([o.lat, o.lon], o.genau ? 17 : 13);
  if (o.genau) L.marker([o.lat, o.lon], { icon: L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22] }) }).addTo(k);
  else L.circle([o.lat, o.lon], { radius: 800, color: '#b4462b', weight: 1, fillOpacity: 0.08 }).addTo(k);
  return k;
}
