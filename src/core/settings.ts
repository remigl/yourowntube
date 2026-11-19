import { DEFAULT_SHORTS_THRESHOLD_SEC } from './shorts';
import type { SourceKind } from './types';

export interface AppSettings {
  source: SourceKind;
  invidiousInstance: string;
  pipedInstance: string;
  /** Stockée dans le trousseau sécurisé du système, jamais dans SQLite. */
  youtubeApiKey: string;
  /** Fournisseur de flux quand la recherche passe par l'API YouTube Data. */
  youtubeStreamProvider: 'invidious' | 'piped';
  shortsThresholdSec: number;
  backgroundPlayback: boolean;
  resumePlayback: boolean;
  /** Qualité maximale des téléchargements (hauteur en pixels). */
  downloadMaxHeight: number;
  saveSearchHistory: boolean;
  saveWatchHistory: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  source: 'demo',
  invidiousInstance: '',
  pipedInstance: '',
  youtubeApiKey: '',
  youtubeStreamProvider: 'invidious',
  shortsThresholdSec: DEFAULT_SHORTS_THRESHOLD_SEC,
  backgroundPlayback: true,
  resumePlayback: true,
  downloadMaxHeight: 720,
  saveSearchHistory: true,
  saveWatchHistory: true,
};

export const INSTANCE_HINTS = {
  invidious: 'https://votre-instance-invidious.example',
  piped: 'https://pipedapi.votre-instance.example',
};

export const SOURCE_LABELS: Record<SourceKind, string> = {
  demo: 'Démonstration',
  device: 'Sur l’appareil (comme Grayjay)',
  invidious: 'Invidious',
  piped: 'Piped',
  youtube: 'YouTube Data API v3',
};

/** Décode une valeur stockée en texte en respectant le type par défaut. */
export function coerceSetting<K extends keyof AppSettings>(key: K, raw: string): AppSettings[K] {
  const def = DEFAULT_SETTINGS[key];
  if (typeof def === 'boolean') return (raw === 'true') as AppSettings[K];
  if (typeof def === 'number') {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : def) as AppSettings[K];
  }
  return raw as AppSettings[K];
}
