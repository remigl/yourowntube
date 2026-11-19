import { router } from 'expo-router';

import type { VideoSummary } from '../core/types';
import { rememberVideo } from './videoCache';

/** Ouvre le lecteur. `replace` évite d'empiler les lecteurs (vidéos similaires). */
export function openVideo(v: VideoSummary, replace = false): void {
  rememberVideo(v);
  const href = { pathname: '/watch/[id]' as const, params: { id: v.id } };
  if (replace) router.replace(href);
  else router.push(href);
}

/** Relance une recherche depuis un autre écran (historique). */
export function searchFor(q: string): void {
  router.navigate({ pathname: '/', params: { q, t: String(Date.now()) } });
}
