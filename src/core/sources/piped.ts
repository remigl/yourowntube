import { AppError } from '../errors';
import type {
  PlaybackInfo,
  SearchFilters,
  SearchPage,
  StreamOption,
  VideoDetails,
  VideoSummary,
} from '../types';
import { buildUrl, getJson, normalizeInstance, type HttpOptions } from './http';
import { heightFromLabel, sortStreams } from './streams';
import type { VideoSource } from './types';

export interface PipedItem {
  url: string;
  type?: string;
  title: string;
  thumbnail?: string;
  uploaderName?: string;
  uploaderUrl?: string;
  uploadedDate?: string;
  uploaded?: number;
  duration?: number;
  views?: number;
  isShort?: boolean;
}
interface PipedStream {
  url: string;
  format?: string;
  quality?: string;
  mimeType?: string;
  videoOnly?: boolean;
  width?: number;
  height?: number;
  contentLength?: number;
}
interface PipedStreams {
  title: string;
  description?: string;
  uploadDate?: string;
  uploader?: string;
  uploaderUrl?: string;
  thumbnailUrl?: string;
  hls?: string;
  duration?: number;
  views?: number;
  livestream?: boolean;
  tags?: string[];
  videoStreams?: PipedStream[];
  relatedStreams?: PipedItem[];
}

export function videoIdFromUrl(url: string): string | undefined {
  const m = /[?&]v=([\w-]{6,})/.exec(url) ?? /\/(?:shorts|watch|embed)\/([\w-]{6,})/.exec(url);
  return m?.[1];
}

function channelIdFromUrl(url?: string): string | undefined {
  const m = url ? /\/channel\/([\w-]+)/.exec(url) : null;
  return m?.[1];
}

export class PipedSource implements VideoSource {
  readonly kind = 'piped' as const;
  readonly label: string;
  private readonly base: string;

  constructor(apiInstance: string, private readonly http: HttpOptions = {}) {
    this.base = normalizeInstance(apiInstance);
    if (!this.base) throw new AppError('not_configured', 'Aucune instance Piped configurée.');
    this.label = `Piped (${this.base.replace(/^https?:\/\//, '')})`;
  }

  async search(query: string, _filters: SearchFilters, page?: string): Promise<SearchPage> {
    // Piped ne sait ni trier ni filtrer : c'est fait côté client (core/filters).
    const url = page
      ? buildUrl(this.base, '/nextpage/search', { nextpage: page, q: query, filter: 'videos' })
      : buildUrl(this.base, '/search', { q: query, filter: 'videos' });
    const data = await getJson<{ items?: PipedItem[]; nextpage?: string | null }>(url, this.http);
    const items = (data.items ?? [])
      .filter((it) => (it.type ?? 'stream') === 'stream')
      .map((it) => this.toSummary(it))
      .filter((v): v is VideoSummary => !!v);
    return { items, nextPage: data.nextpage ?? undefined };
  }

  async getDetails(id: string): Promise<VideoDetails> {
    const s = await this.fetchStreams(id);
    const best = s.videoStreams?.slice().sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    return {
      id,
      title: s.title,
      channelName: s.uploader ?? '',
      channelId: channelIdFromUrl(s.uploaderUrl),
      thumbnail: s.thumbnailUrl ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: s.livestream ? 0 : (s.duration ?? null),
      publishedAt: s.uploadDate ? safeIso(s.uploadDate) : undefined,
      viewCount: s.views,
      isLive: !!s.livestream,
      width: best?.width,
      height: best?.height,
      keywords: s.tags,
      description: s.description ? stripHtml(s.description) : undefined,
      related: (s.relatedStreams ?? [])
        .filter((it) => (it.type ?? 'stream') === 'stream')
        .map((it) => this.toSummary(it))
        .filter((v): v is VideoSummary => !!v),
    };
  }

  async getPlayback(id: string): Promise<PlaybackInfo> {
    const s = await this.fetchStreams(id);
    const downloadable = sortStreams(
      (s.videoStreams ?? []).filter((v) => !v.videoOnly && v.url).map((v) => this.toStream(v)),
    );
    const best = s.videoStreams?.slice().sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    const dims = { width: best?.width, height: best?.height };
    if (s.hls) {
      return {
        playback: { url: s.hls, mimeType: 'application/x-mpegURL', quality: 'Auto', muxed: true, kind: 'hls' },
        downloadable,
        ...dims,
      };
    }
    if (!downloadable[0]) throw new AppError('no_stream', 'Aucun flux lisible pour cette vidéo sur cette instance.');
    return { playback: downloadable[0], downloadable, ...dims };
  }

  async getChannelVideos(channelId: string): Promise<VideoSummary[]> {
    const data = await getJson<{ relatedStreams?: PipedItem[] }>(
      buildUrl(this.base, `/channel/${encodeURIComponent(channelId)}`),
      this.http,
    );
    return (data.relatedStreams ?? []).map((it) => this.toSummary(it)).filter((v): v is VideoSummary => !!v);
  }

  async ping(): Promise<void> {
    await getJson(buildUrl(this.base, '/search', { q: 'test', filter: 'videos' }), { ...this.http, timeoutMs: 8000 });
  }

  private fetchStreams(id: string): Promise<PipedStreams> {
    return getJson<PipedStreams>(buildUrl(this.base, `/streams/${encodeURIComponent(id)}`), this.http);
  }

  toSummary(it: PipedItem): VideoSummary | undefined {
    const id = videoIdFromUrl(it.url);
    if (!id) return undefined;
    return {
      id,
      title: it.title,
      channelName: it.uploaderName ?? '',
      channelId: channelIdFromUrl(it.uploaderUrl),
      thumbnail: it.thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: it.duration == null || it.duration < 0 ? (it.duration === -1 ? 0 : null) : it.duration,
      publishedAt: it.uploaded && it.uploaded > 0 ? new Date(it.uploaded).toISOString() : undefined,
      publishedText: it.uploadedDate,
      viewCount: it.views != null && it.views >= 0 ? it.views : undefined,
      isShort: it.isShort || /\/shorts\//.test(it.url),
      isLive: it.duration === -1,
    };
  }

  private toStream(v: PipedStream): StreamOption {
    return {
      url: v.url,
      mimeType: v.mimeType ?? 'video/mp4',
      quality: v.quality ?? '?',
      height: v.height || heightFromLabel(v.quality),
      width: v.width || undefined,
      muxed: true,
      sizeBytes: v.contentLength && v.contentLength > 0 ? v.contentLength : undefined,
      kind: 'progressive',
    };
  }
}

function safeIso(s: string): string | undefined {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
