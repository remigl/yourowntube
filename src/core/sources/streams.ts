import type { StreamOption } from '../types';

/** Hauteur à partir d'un libellé « 720p60 », « 1080p », « 360p ». */
export function heightFromLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const m = /(\d{3,4})p/i.exec(label);
  return m ? Number(m[1]) : undefined;
}

/** Trie du meilleur au moins bon : hauteur décroissante, mp4 avant webm. */
export function sortStreams(list: StreamOption[]): StreamOption[] {
  return [...list].sort((a, b) => {
    const h = (b.height ?? 0) - (a.height ?? 0);
    if (h !== 0) return h;
    return Number(b.mimeType.includes('mp4')) - Number(a.mimeType.includes('mp4'));
  });
}

/** Meilleure piste audio : AAC (m4a, lisible partout) d'abord, puis débit décroissant. */
export function pickAudioStream(list: StreamOption[]): StreamOption | undefined {
  return [...list].sort((a, b) => {
    const mp4 = Number(b.mimeType === 'audio/mp4') - Number(a.mimeType === 'audio/mp4');
    return mp4 !== 0 ? mp4 : (b.bitrate ?? 0) - (a.bitrate ?? 0);
  })[0];
}

/**
 * Choisit le flux téléchargeable le plus proche de la qualité souhaitée, sans
 * la dépasser si possible (sinon le plus petit disponible).
 */
export function pickDownloadStream(list: StreamOption[], maxHeight: number): StreamOption | undefined {
  const sorted = sortStreams(list.filter((s) => s.muxed && s.kind === 'progressive'));
  return sorted.find((s) => (s.height ?? 0) <= maxHeight) ?? sorted[sorted.length - 1];
}
