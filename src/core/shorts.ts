import type { VideoSummary } from './types';

/**
 * Exclusion des YouTube Shorts.
 *
 * Les Shorts n'ont pas de marqueur fiable dans toutes les API, on combine donc
 * plusieurs signaux, du plus sûr au plus heuristique :
 *  1. la source marque explicitement la vidéo comme Short (Piped `isShort`) ;
 *  2. l'URL d'origine pointe vers /shorts/ ;
 *  3. la vidéo est verticale et dure au plus 3 minutes (durée max d'un Short) ;
 *  4. le titre ou les tags contiennent #shorts et la durée ≤ 3 minutes ;
 *  5. la durée est inférieure ou égale au seuil « court » configuré (60 s par défaut).
 */

/** Durée maximale d'un Short depuis octobre 2024. */
export const SHORTS_MAX_DURATION_SEC = 180;
export const DEFAULT_SHORTS_THRESHOLD_SEC = 60;

export interface ShortsPolicy {
  /** Toute vidéo de durée ≤ ce seuil est considérée comme un Short. */
  thresholdSec: number;
}

export const DEFAULT_SHORTS_POLICY: ShortsPolicy = { thresholdSec: DEFAULT_SHORTS_THRESHOLD_SEC };

/** Uniquement le hashtag : « a short story » ne doit pas être filtré. */
const SHORTS_TAG = /#shorts?\b/i;

export function isVertical(width?: number, height?: number): boolean {
  return !!width && !!height && height > width * 1.05;
}

export type ShortVerdict =
  | { short: false }
  | { short: true; reason: 'flag' | 'url' | 'vertical' | 'hashtag' | 'duration' };

export function classifyShort(
  v: Pick<VideoSummary, 'isShort' | 'durationSec' | 'width' | 'height' | 'title' | 'keywords' | 'isLive'> & {
    url?: string;
  },
  policy: ShortsPolicy = DEFAULT_SHORTS_POLICY,
): ShortVerdict {
  if (v.isShort) return { short: true, reason: 'flag' };
  if (v.url && /\/shorts\//i.test(v.url)) return { short: true, reason: 'url' };
  if (v.isLive) return { short: false };

  const d = v.durationSec;
  const withinShortLength = d != null && d > 0 && d <= SHORTS_MAX_DURATION_SEC;

  if (withinShortLength && isVertical(v.width, v.height)) return { short: true, reason: 'vertical' };

  if (withinShortLength) {
    const tagged =
      SHORTS_TAG.test(v.title ?? '') ||
      (v.keywords ?? []).some((k) => /^#?shorts?$/i.test(k.trim()));
    if (tagged) return { short: true, reason: 'hashtag' };
  }

  if (d != null && d > 0 && d <= policy.thresholdSec) return { short: true, reason: 'duration' };

  return { short: false };
}

export function isShort(v: Parameters<typeof classifyShort>[0], policy?: ShortsPolicy): boolean {
  return classifyShort(v, policy).short;
}

/** Retire les Shorts et les doublons d'une liste, en conservant l'ordre. */
export function excludeShorts<T extends VideoSummary>(items: T[], policy?: ShortsPolicy): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    if (!isShort(it, policy)) out.push(it);
  }
  return out;
}
