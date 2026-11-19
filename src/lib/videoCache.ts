import type { VideoSummary } from '../core/types';

/**
 * Cache mémoire des résumés de vidéos : quand on ouvre une vidéo depuis une
 * liste, l'écran de lecture affiche immédiatement titre, chaîne et miniature.
 */
const cache = new Map<string, VideoSummary>();
const MAX = 300;

export function rememberVideo(v: VideoSummary): void {
  cache.delete(v.id);
  cache.set(v.id, v);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function recallVideo(id: string): VideoSummary | undefined {
  return cache.get(id);
}
