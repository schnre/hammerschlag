export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function chf(n?: number, kurz = false): string {
  if (n == null || !Number.isFinite(n)) return '–';
  if (kurz && Math.abs(n) >= 1_000_000) return `CHF ${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')} Mio.`;
  if (kurz && Math.abs(n) >= 10_000) return `CHF ${Math.round(n / 1000)}k`;
  return `CHF ${Math.round(n).toLocaleString('de-CH').replace(/[’]/g, "'")}`;
}

export const zahlFmt = (n?: number, einheit = ''): string =>
  n == null ? '–' : `${Math.round(n).toLocaleString('de-CH').replace(/[’]/g, "'")}${einheit ? ` ${einheit}` : ''}`;

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function datum(iso?: string, mitTag = true): string {
  if (!iso) return '–';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const s = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return mitTag ? `${WT[d.getDay()]}, ${s}` : s;
}

export function tageBis(iso?: string): number | undefined {
  if (!iso) return undefined;
  const heute = new Date(); heute.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${iso}T12:00:00`).getTime() - heute.getTime()) / 864e5);
}

export function inTagen(iso?: string): string {
  const t = tageBis(iso);
  if (t == null) return '';
  if (t === 0) return 'heute';
  if (t === 1) return 'morgen';
  if (t > 1) return `in ${t} Tagen`;
  if (t === -1) return 'gestern';
  return `vor ${-t} Tagen`;
}

export function distanzKm(a: [number, number], b: [number, number]): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLon = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
