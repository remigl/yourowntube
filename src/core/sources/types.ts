import type {
  PlaybackInfo,
  SearchFilters,
  SearchPage,
  SourceKind,
  VideoDetails,
  VideoSummary,
} from '../types';

/**
 * Contrat commun à toutes les sources vidéo. Chaque adaptateur se contente de
 * traduire l'API distante vers le modèle de `core/types` ; le filtrage des
 * Shorts, les filtres client et la fusion des vidéos similaires sont faits
 * au-dessus, une seule fois, pour toutes les sources.
 */
export interface VideoSource {
  readonly kind: SourceKind;
  readonly label: string;

  search(query: string, filters: SearchFilters, page?: string): Promise<SearchPage>;

  getDetails(id: string): Promise<VideoDetails>;

  /** Flux lisibles (streaming) et téléchargeables (fichier unique). */
  /** `fresh` : ignorer tout cache et redemander des flux neufs. */
  getPlayback(id: string, opts?: { fresh?: boolean }): Promise<PlaybackInfo>;

  /** Dernières vidéos de la chaîne. */
  getChannelVideos(channelId: string): Promise<VideoSummary[]>;

  /** Vérifie que la source répond (écran Réglages). */
  ping(): Promise<void>;
}

/** Fournisseur de flux seul (utilisé avec l'API YouTube Data, qui n'en fournit pas). */
export type StreamProvider = Pick<VideoSource, 'getPlayback' | 'ping' | 'label'>;
