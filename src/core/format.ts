/** Utilitaires de formatage et d'analyse (durées, dates, tailles). */

/** Analyse une durée ISO 8601 (« PT1H2M3S », « P1DT2H ») en secondes. */
export function parseIsoDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso.trim());
  if (!m) return null;
  const [, w, d, h, min, s] = m;
  return (
    Number(w ?? 0) * 604800 +
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Math.round(Number(s ?? 0))
  );
}

/** Analyse « 1:02:03 », « 12:34 » ou « 45 » en secondes. */
export function parseClockDuration(text: string | undefined | null): number | null {
  if (!text) return null;
  const parts = text.trim().split(':');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** 3725 → « 1:02:05 », 65 → « 1:05 ». */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec < 0) return '--:--';
  const t = Math.floor(totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 1536 → « 1,5 Ko », 734003200 → « 700 Mo ». */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : 1;
  return `${v.toFixed(digits).replace('.', ',')} ${units[i]}`;
}

/** 1234567 → « 1,2 M vues ». */
export function formatViews(n: number | null | undefined): string | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  if (n < 1000) return `${n} vue${n > 1 ? 's' : ''}`;
  if (n < 1_000_000) return `${trim1(n / 1000)} k vues`;
  if (n < 1_000_000_000) return `${trim1(n / 1_000_000)} M vues`;
  return `${trim1(n / 1_000_000_000)} Md vues`;
}

function trim1(v: number): string {
  return (v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '')).replace('.', ',');
}

/** Date relative en français : « il y a 3 jours », « il y a 2 mois ». */
export function formatRelativeDate(iso: string | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  const t = date.getTime();
  if (Number.isNaN(t)) return undefined;
  const diff = Math.max(0, (now.getTime() - t) / 1000);
  const steps: [number, string, string][] = [
    [60, 'seconde', 'secondes'],
    [60, 'minute', 'minutes'],
    [24, 'heure', 'heures'],
    [7, 'jour', 'jours'],
    [4.345, 'semaine', 'semaines'],
    [12, 'mois', 'mois'],
    [Number.POSITIVE_INFINITY, 'an', 'ans'],
  ];
  let value = diff;
  for (const [size, one, many] of steps) {
    if (value < size) {
      const n = Math.max(1, Math.floor(value));
      if (one === 'seconde') return "à l'instant";
      return `il y a ${n} ${n > 1 ? many : one}`;
    }
    value /= size;
  }
  return undefined;
}

/** Date absolue courte : « 19 nov. 2026 ». */
export function formatShortDate(iso: string | number | undefined): string {
  if (iso == null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Libellé de publication : date relative si connue, sinon texte de la source. */
export function publishedLabel(publishedAt?: string, publishedText?: string, now?: Date): string | undefined {
  return formatRelativeDate(publishedAt, now) ?? publishedText;
}

/** Pourcentage de progression borné dans [0, 1]. */
export function progressRatio(position: number, duration: number | null | undefined): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(1, Math.max(0, position / duration));
}
