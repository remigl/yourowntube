/**
 * Modèle de données indépendant de la source (YouTube Data API, Invidious,
 * Piped ou données de démonstration). Aucune dépendance React Native ici :
 * tout le dossier `src/core` est testable sous Node.
 */

export type SourceKind = 'demo' | 'device' | 'invidious' | 'piped' | 'youtube';

export interface VideoSummary {
  id: string;
  title: string;
  channelName: string;
  channelId?: string;
  /** URL de la meilleure miniature disponible. */
  thumbnail: string;
  /** Durée en secondes. `null` = inconnue, 0 = direct. */
  durationSec: number | null;
  /** Date de publication ISO 8601 si connue. */
  publishedAt?: string;
  /** Texte relatif fourni par la source (« il y a 3 jours ») si pas de date exacte. */
  publishedText?: string;
  viewCount?: number;
  /** Indique si la source a explicitement marqué la vidéo comme Short. */
  isShort?: boolean;
  /** Dimensions de la vidéo si connues (détection des vidéos verticales). */
  width?: number;
  height?: number;
  isLive?: boolean;
  /** Mots-clés / tags si la source les fournit (utile pour les vidéos similaires). */
  keywords?: string[];
}

export interface VideoDetails extends VideoSummary {
  description?: string;
  /** Vidéos liées fournies nativement par la source, si elle en a. */
  related?: VideoSummary[];
}

export interface StreamOption {
  url: string;
  mimeType: string;
  /** Libellé lisible : « 720p », « 360p », « HLS »… */
  quality: string;
  height?: number;
  width?: number;
  /** true si le flux contient audio + vidéo (lisible et téléchargeable seul). */
  muxed: boolean;
  /** Taille annoncée par la source, en octets. */
  sizeBytes?: number;
  /** Débit en bits/s (pistes audio). */
  bitrate?: number;
  kind: 'progressive' | 'hls' | 'dash';
  /** En-têtes HTTP à envoyer pour lire / télécharger ce flux (User-Agent…). */
  headers?: Record<string, string>;
  /** Manifeste DASH généré localement (à écrire dans un fichier avant lecture). */
  manifest?: string;
  /** Qui a fourni le flux (client Innertube, instance…), pour le diagnostic. */
  origin?: string;
}

export interface PlaybackInfo {
  /** Flux à utiliser pour la lecture en streaming (= candidates[0]). */
  playback: StreamOption;
  /**
   * Tous les flux lisibles, du plus fiable au moins fiable. Le lecteur passe
   * au suivant si l'un échoue (instance qui sert mal un format, flux bloqué…).
   */
  candidates: StreamOption[];
  /** Flux muxés téléchargeables en un seul fichier, du meilleur au moins bon. */
  downloadable: StreamOption[];
  /** Pistes audio seules téléchargeables (écoute hors ligne), de la meilleure à la moins bonne. */
  audio: StreamOption[];
  width?: number;
  height?: number;
}

export type SortOrder = 'relevance' | 'date' | 'views' | 'rating';
export type UploadDateFilter = 'any' | 'today' | 'week' | 'month' | 'year';
export type DurationFilter = 'any' | 'short' | 'medium' | 'long';

export interface SearchFilters {
  sort: SortOrder;
  uploadDate: UploadDateFilter;
  duration: DurationFilter;
}

export const DEFAULT_FILTERS: SearchFilters = {
  sort: 'relevance',
  uploadDate: 'any',
  duration: 'any',
};

export interface SearchPage {
  items: VideoSummary[];
  /** Jeton opaque pour la page suivante, absent s'il n'y en a plus. */
  nextPage?: string;
}

export type SimilarReason = 'related' | 'channel' | 'topic';

export interface SimilarVideo extends VideoSummary {
  reason: SimilarReason;
}
