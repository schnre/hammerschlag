import './style.css';
import type { Datenbestand } from './typen';
import { zustand, merkeBesuch } from './zustand';
import { aktualisiereMerkZahl, leer } from './ui/teile';
import { uebersicht } from './ui/uebersicht';
import { objekte } from './ui/objekte';
import { detail } from './ui/detail';
import { merkliste, tipps, einstellungen } from './ui/seiten';

const app = document.getElementById('app')!;

function route(): void {
  const [, seite = '', id] = location.hash.replace(/^#/, '').split('/');
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) =>
    a.classList.toggle('aktiv', a.dataset.nav === (seite === 'objekt' ? 'objekte' : seite || 'uebersicht')));
  switch (seite) {
    case 'objekte': objekte(app); break;
    case 'objekt': detail(app, decodeURIComponent(id ?? '')); break;
    case 'merkliste': merkliste(app); break;
    case 'tipps': tipps(app); break;
    case 'einstellungen': einstellungen(app); break;
    default: uebersicht(app);
  }
  if (seite !== 'objekte') window.scrollTo(0, 0);
}

async function start(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/steigerungen.json`, { cache: 'no-cache' });
    zustand.daten = (await r.json()) as Datenbestand;
  } catch {
    app.innerHTML = leer('Die Daten konnten nicht geladen werden. Bitte später erneut versuchen.');
    return;
  }
  document.getElementById('demo-hinweis')!.hidden = !zustand.daten.demo;
  document.getElementById('stand')!.textContent = `Stand ${new Date(zustand.daten.stand).toLocaleDateString('de-CH')}`;
  aktualisiereMerkZahl();
  window.addEventListener('hashchange', route);
  route();
  // «Neu» bezieht sich auf den vorherigen Besuch – erst beim Verlassen aktualisieren.
  window.addEventListener('pagehide', merkeBesuch);
}

start();
