import { AppError } from '../errors';
import { parseIsoDuration } from '../format';
import { uploadDateCutoff } from '../filters';
import type { PlaybackInfo, SearchFilters, SearchPage, VideoDetails, VideoSummary } from '../types';
import { buildUrl, decodeEntities, getJson, type HttpOptions } from './http';
import type { StreamProvider, VideoSource } from './types';

const API = 'https://www.googleapis.com/youtube/v3';

const ORDER: Record<SearchFilters['sort'], string> = {
  relevance: 'relevance',
  date: 'date',
  views: 'viewCount',
  rating: 'rating',
};

interface YtThumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
  standard?: { url: string };
  maxres?: { url: string };
}
interface YtSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    liveBroadcastContent?: string;
    thumbnails: YtThumbs;
  };
}
interface YtVideo {
  id: string;
  snippet?: {
    title: string;
    description?: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    tags?: string[];
    liveBroadcastContent?: string;
    thumbnails: YtThumbs;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  player?: { embedWidth?: string | number; embedHeight?: string | number };
}

/**
 * Métadonnées via l'API officielle YouTube Data v3 (clé API nécessaire).
 * L'API ne fournit aucun flux vidéo : la lecture et le téléchargement sont
 * délégués à un `StreamProvider` (Invidious ou Piped).
 */
export class YouTubeDataSource implements VideoSource {
  readonly kind = 'youtube' as const;
  readonly label: string;

  constructor(
    private readonly apiKey: string,
    private readonly streams: StreamProvider | null,
    private readonly http: HttpOptions = {},
  ) {
    if (!apiKey.trim()) throw new AppError('not_configured', 'Aucune clé API YouTube Data configurée.');
    this.label = streams ? `YouTube Data API + ${streams.label}` : 'YouTube Data API';
  }

  async search(query: string, filters: SearchFilters, page?: string): Promise<SearchPage> {
    const cutoff = uploadDateCutoff(filters.uploadDate);
    const data = await getJson<{ items?: YtSearchItem[]; nextPageToken?: string }>(
      buildUrl(API, '/search', {
        part: 'snippet',
        type: 'video',
        maxResults: 25,
        q: query,
        order: ORDER[filters.sort],
        videoDuration: filters.duration,
        publishedAfter: cutoff ? new Date(cutoff).toISOString() : undefined,
        pageToken: page,
        key: this.apiKey,
      }),
      this.http,
    );
    const ids = (data.items ?? []).map((i) => i.id.videoId).filter((x): x is string => !!x);
    const items = await this.getMany(ids);
    return { items, nextPage: data.nextPageToken };
  }

  async getDetails(id: string): Promise<VideoDetails> {
    const [v] = await this.fetchVideos([id]);
    if (!v) throw new AppError('not_found', 'Vidéo introuvable.');
    // L'API ne propose plus de « vidéos liées » (relatedToVideoId supprimé en
    // 2023) : core/similar.ts complète avec la chaîne et une recherche par sujet.
    return { ...toSummary(v), description: v.snippet?.description, related: [] };
  }

  getPlayback(id: string, opts?: { fresh?: boolean }): Promise<PlaybackInfo> {
    if (!this.streams) {
      return Promise.reject(
        new AppError(
          'not_configured',
          'L’API YouTube Data ne fournit pas les flux vidéo. Configurez une instance Invidious ou Piped pour la lecture.',
        ),
      );
    }
    return this.streams.getPlayback(id, opts);
  }

  async getChannelVideos(channelId: string): Promise<VideoSummary[]> {
    const data = await getJson<{ items?: YtSearchItem[] }>(
      buildUrl(API, '/search', {
        part: 'snippet',
        type: 'video',
        channelId,
        order: 'date',
        maxResults: 20,
        key: this.apiKey,
      }),
      this.http,
    );
    return this.getMany((data.items ?? []).map((i) => i.id.videoId).filter((x): x is string => !!x));
  }

  async ping(): Promise<void> {
    await this.fetchVideos(['dQw4w9WgXcQ']);
    if (this.streams) await this.streams.ping();
  }

  /** videos.list : durée, vues, tags et format (détection des Shorts verticaux). */
  private async getMany(ids: string[]): Promise<VideoSummary[]> {
    if (ids.length === 0) return [];
    const videos = await this.fetchVideos(ids);
    const byId = new Map(videos.map((v) => [v.id, v]));
    return ids.map((id) => byId.get(id)).filter((v): v is YtVideo => !!v).map(toSummary);
  }

  private async fetchVideos(ids: string[]): Promise<YtVideo[]> {
    const data = await getJson<{ items?: YtVideo[] }>(
      buildUrl(API, '/videos', {
        part: 'snippet,contentDetails,statistics,player',
        id: ids.join(','),
        maxHeight: 720,
        key: this.apiKey,
      }),
      this.http,
    );
    return data.items ?? [];
  }
}

function bestThumb(t: YtThumbs | undefined, id: string): string {
  return t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function toSummary(v: YtVideo): VideoSummary {
  const s = v.snippet;
  const live = s?.liveBroadcastContent === 'live';
  const w = Number(v.player?.embedWidth);
  const h = Number(v.player?.embedHeight);
  return {
    id: v.id,
    title: decodeEntities(s?.title ?? ''),
    channelName: decodeEntities(s?.channelTitle ?? ''),
    channelId: s?.channelId,
    thumbnail: bestThumb(s?.thumbnails, v.id),
    durationSec: live ? 0 : parseIsoDuration(v.contentDetails?.duration),
    publishedAt: s?.publishedAt,
    viewCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
    width: Number.isFinite(w) && w > 0 ? w : undefined,
    height: Number.isFinite(h) && h > 0 ? h : undefined,
    keywords: s?.tags,
    isLive: live,
  };
}
