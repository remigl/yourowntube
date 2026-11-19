import { AppError } from '../errors';
import type {
  PlaybackInfo,
  SearchFilters,
  SearchPage,
  StreamOption,
  VideoDetails,
  VideoSummary,
} from '../types';
import { absolutize, buildUrl, getJson, normalizeInstance, type HttpOptions } from './http';
import { heightFromLabel, sortStreams } from './streams';
import type { VideoSource } from './types';

/** Sous-ensemble utile de la réponse Invidious (/api/v1). */
interface InvThumb {
  quality?: string;
  url: string;
  width?: number;
  height?: number;
}
export interface InvVideoItem {
  type?: string;
  videoId: string;
  title: string;
  author?: string;
  authorId?: string;
  lengthSeconds?: number;
  viewCount?: number;
  published?: number;
  publishedText?: string;
  videoThumbnails?: InvThumb[];
  liveNow?: boolean;
  isUpcoming?: boolean;
}
interface InvFormat {
  url: string;
  type?: string;
  qualityLabel?: string;
  quality?: string;
  resolution?: string;
  size?: string;
  container?: string;
  clen?: string;
}
interface InvVideo extends InvVideoItem {
  description?: string;
  keywords?: string[];
  formatStreams?: InvFormat[];
  adaptiveFormats?: InvFormat[];
  recommendedVideos?: InvVideoItem[];
  hlsUrl?: string;
}

const SORT: Record<SearchFilters['sort'], string> = {
  relevance: 'relevance',
  date: 'upload_date',
  views: 'view_count',
  rating: 'rating',
};

export class InvidiousSource implements VideoSource {
  readonly kind = 'invidious' as const;
  readonly label: string;
  private readonly base: string;

  constructor(instance: string, private readonly http: HttpOptions = {}) {
    this.base = normalizeInstance(instance);
    if (!this.base) throw new AppError('not_configured', 'Aucune instance Invidious configurée.');
    this.label = `Invidious (${this.base.replace(/^https?:\/\//, '')})`;
  }

  async search(query: string, filters: SearchFilters, page?: string): Promise<SearchPage> {
    const pageNum = page ? Number(page) : 1;
    const url = buildUrl(this.base, '/api/v1/search', {
      q: query,
      type: 'video',
      page: pageNum,
      sort: SORT[filters.sort],
      date: filters.uploadDate === 'any' ? undefined : filters.uploadDate,
      duration: filters.duration === 'any' ? undefined : filters.duration,
    });
    const data = await getJson<InvVideoItem[]>(url, this.http);
    const items = (Array.isArray(data) ? data : [])
      .filter((it) => (it.type ?? 'video') === 'video' && !it.isUpcoming)
      .map((it) => this.toSummary(it));
    return { items, nextPage: items.length > 0 ? String(pageNum + 1) : undefined };
  }

  async getDetails(id: string): Promise<VideoDetails> {
    const v = await this.fetchVideo(id);
    return {
      ...this.toSummary(v),
      description: v.description,
      keywords: v.keywords,
      related: (v.recommendedVideos ?? []).map((r) => this.toSummary(r)),
    };
  }

  async getPlayback(id: string): Promise<PlaybackInfo> {
    const v = await this.fetchVideo(id);
    const muxed = sortStreams(
      (v.formatStreams ?? [])
        .map((f) => this.toStream(f, true))
        .filter((s): s is StreamOption => !!s),
    );
    const best = muxed[0];
    if (v.hlsUrl && (!best || v.liveNow)) {
      const hls: StreamOption = {
        url: absolutize(this.base, v.hlsUrl)!,
        mimeType: 'application/x-mpegURL',
        quality: 'Auto',
        muxed: true,
        kind: 'hls',
      };
      return { playback: hls, downloadable: muxed };
    }
    if (!best) throw new AppError('no_stream', 'Aucun flux lisible pour cette vidéo sur cette instance.');
    // Dimensions de la vidéo (pour la détection des Shorts verticaux) via le
    // meilleur flux adaptatif, plus fiable que les flux muxés limités en qualité.
    const dims = (v.adaptiveFormats ?? [])
      .map((f) => parseSize(f.size))
      .filter((d): d is { width: number; height: number } => !!d)
      .sort((a, b) => b.height - a.height)[0] ?? (best.width && best.height ? { width: best.width, height: best.height } : undefined);
    return { playback: best, downloadable: muxed, width: dims?.width, height: dims?.height };
  }

  async getChannelVideos(channelId: string): Promise<VideoSummary[]> {
    const data = await getJson<InvVideoItem[] | { videos?: InvVideoItem[] }>(
      buildUrl(this.base, `/api/v1/channels/${encodeURIComponent(channelId)}/videos`),
      this.http,
    );
    const list = Array.isArray(data) ? data : (data.videos ?? []);
    return list.map((it) => this.toSummary(it));
  }

  async ping(): Promise<void> {
    await getJson(buildUrl(this.base, '/api/v1/stats'), { ...this.http, timeoutMs: 8000 });
  }

  private fetchVideo(id: string): Promise<InvVideo> {
    // local=true : les flux passent par l'instance (les URL googlevideo sont
    // liées à l'IP de l'instance et ne marcheraient pas depuis le téléphone).
    return getJson<InvVideo>(buildUrl(this.base, `/api/v1/videos/${encodeURIComponent(id)}`, { local: 'true' }), this.http);
  }

  toSummary(it: InvVideoItem): VideoSummary {
    const thumbs = [...(it.videoThumbnails ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const preferred =
      thumbs.find((t) => t.quality === 'high') ?? thumbs.find((t) => t.quality === 'sddefault') ?? thumbs[0];
    return {
      id: it.videoId,
      title: it.title,
      channelName: it.author ?? '',
      channelId: it.authorId,
      thumbnail: absolutize(this.base, preferred?.url) ?? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
      durationSec: it.liveNow ? 0 : (it.lengthSeconds ?? null),
      publishedAt: it.published ? new Date(it.published * 1000).toISOString() : undefined,
      publishedText: it.publishedText,
      viewCount: it.viewCount,
      isLive: !!it.liveNow,
    };
  }

  private toStream(f: InvFormat, muxed: boolean): StreamOption | undefined {
    const url = absolutize(this.base, f.url);
    if (!url) return undefined;
    const dims = parseSize(f.size);
    const label = f.qualityLabel ?? f.resolution ?? f.quality ?? '?';
    return {
      url,
      mimeType: (f.type ?? `video/${f.container ?? 'mp4'}`).split(';')[0].trim(),
      quality: label,
      height: dims?.height ?? heightFromLabel(label),
      width: dims?.width,
      muxed,
      sizeBytes: f.clen ? Number(f.clen) : undefined,
      kind: 'progressive',
    };
  }
}

function parseSize(size: string | undefined): { width: number; height: number } | undefined {
  const m = size ? /^(\d+)x(\d+)$/.exec(size) : null;
  return m ? { width: Number(m[1]), height: Number(m[2]) } : undefined;
}
