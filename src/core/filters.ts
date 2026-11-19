import type { DurationFilter, SearchFilters, UploadDateFilter, VideoSummary } from './types';

/** Bornes de durée identiques à celles de YouTube (court < 4 min, long > 20 min). */
export function matchesDuration(durationSec: number | null, filter: DurationFilter): boolean {
  if (filter === 'any' || durationSec == null || durationSec === 0) return true;
  switch (filter) {
    case 'short':
      return durationSec < 240;
    case 'medium':
      return durationSec >= 240 && durationSec <= 1200;
    case 'long':
      return durationSec > 1200;
  }
}

const DAY = 86_400_000;

export function uploadDateCutoff(filter: UploadDateFilter, now: number = Date.now()): number | null {
  switch (filter) {
    case 'any':
      return null;
    case 'today':
      return now - DAY;
    case 'week':
      return now - 7 * DAY;
    case 'month':
      return now - 31 * DAY;
    case 'year':
      return now - 366 * DAY;
  }
}

export function matchesUploadDate(publishedAt: string | undefined, filter: UploadDateFilter, now?: number): boolean {
  const cutoff = uploadDateCutoff(filter, now);
  if (cutoff == null || !publishedAt) return true; // date inconnue : on garde
  const t = new Date(publishedAt).getTime();
  return Number.isNaN(t) || t >= cutoff;
}

/**
 * Applique filtres et tri côté client. Les sources qui savent filtrer côté
 * serveur le font aussi ; ce passage garantit un comportement identique quelle
 * que soit la source (et sert de seul filtre pour Piped et la démo).
 */
export function applyFilters<T extends VideoSummary>(items: T[], f: SearchFilters, now?: number): T[] {
  const filtered = items.filter(
    (v) => matchesDuration(v.durationSec, f.duration) && matchesUploadDate(v.publishedAt, f.uploadDate, now),
  );
  if (f.sort === 'date') {
    return [...filtered].sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
  }
  if (f.sort === 'views') {
    return [...filtered].sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1));
  }
  return filtered; // pertinence / note : ordre de la source
}

function time(iso?: string): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function filtersAreDefault(f: SearchFilters): boolean {
  return f.sort === 'relevance' && f.uploadDate === 'any' && f.duration === 'any';
}

export const SORT_LABELS: Record<SearchFilters['sort'], string> = {
  relevance: 'Pertinence',
  date: 'Plus récentes',
  views: 'Plus vues',
  rating: 'Mieux notées',
};

export const DATE_LABELS: Record<UploadDateFilter, string> = {
  any: 'Toutes dates',
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois-ci',
  year: 'Cette année',
};

export const DURATION_LABELS: Record<DurationFilter, string> = {
  any: 'Toutes durées',
  short: '< 4 min',
  medium: '4 – 20 min',
  long: '> 20 min',
};
