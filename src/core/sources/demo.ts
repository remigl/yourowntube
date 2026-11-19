import { AppError } from '../errors';
import type { PlaybackInfo, SearchFilters, SearchPage, VideoDetails, VideoSummary } from '../types';
import { DEMO_VIDEOS, type DemoVideo } from './demoData';
import type { VideoSource } from './types';

const PAGE_SIZE = 6;

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function strip({ streamUrl: _u, sizeBytes: _s, description: _d, related: _r, ...summary }: DemoVideo): VideoSummary {
  return summary;
}

/** Source hors réseau pour l'API ; seules les vidéos elles-mêmes viennent d'internet. */
export class DemoSource implements VideoSource {
  readonly kind = 'demo' as const;
  readonly label = 'Démonstration';

  constructor(
    private readonly videos: DemoVideo[] = DEMO_VIDEOS,
    private readonly latencyMs = 350,
  ) {}

  async search(query: string, _filters: SearchFilters, page?: string): Promise<SearchPage> {
    await this.delay();
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    const score = (v: DemoVideo) => {
      const hay = normalizeText([v.title, v.channelName, ...(v.keywords ?? []), v.description ?? ''].join(' '));
      return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    };
    let matches = this.videos
      .map((v) => ({ v, s: score(v) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v);
    // Démo : une recherche sans correspondance montre tout le catalogue.
    if (matches.length === 0) matches = this.videos;
    const start = page ? Number(page) : 0;
    const slice = matches.slice(start, start + PAGE_SIZE).map(strip);
    const next = start + PAGE_SIZE < matches.length ? String(start + PAGE_SIZE) : undefined;
    return { items: slice, nextPage: next };
  }

  async getDetails(id: string): Promise<VideoDetails> {
    await this.delay();
    const v = this.find(id);
    // « Recommandations » de démo : autres chaînes partageant au moins un mot-clé.
    const kw = new Set((v.keywords ?? []).map(normalizeText));
    const related = this.videos
      .filter((o) => o.id !== id && o.channelId !== v.channelId && (o.keywords ?? []).some((k) => kw.has(normalizeText(k))))
      .map(strip);
    return { ...strip(v), description: v.description, related };
  }

  async getPlayback(id: string): Promise<PlaybackInfo> {
    await this.delay();
    const v = this.find(id);
    const stream = {
      url: v.streamUrl,
      mimeType: 'video/mp4',
      quality: v.height ? `${Math.min(v.width ?? v.height, v.height)}p` : '720p',
      height: v.height,
      width: v.width,
      muxed: true,
      sizeBytes: v.sizeBytes,
      kind: 'progressive' as const,
    };
    return { playback: stream, candidates: [stream], downloadable: [stream], audio: [], width: v.width, height: v.height };
  }

  async getChannelVideos(channelId: string): Promise<VideoSummary[]> {
    await this.delay();
    return this.videos
      .filter((v) => v.channelId === channelId)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .map(strip);
  }

  async ping(): Promise<void> {
    await this.delay();
  }

  private find(id: string): DemoVideo {
    const v = this.videos.find((x) => x.id === id);
    if (!v) throw new AppError('not_found', 'Vidéo de démonstration introuvable.');
    return v;
  }

  private delay() {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }
}
