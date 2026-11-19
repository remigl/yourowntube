import { AppError } from '../../errors';
import type {
  PlaybackInfo,
  SearchFilters,
  SearchPage,
  StreamOption,
  VideoDetails,
  VideoSummary,
} from '../../types';
import { postJson, type HttpOptions } from '../http';
import { heightFromLabel, sortStreams } from '../streams';
import type { VideoSource } from '../types';
import { PLAYER_CLIENTS, WEB, type InnertubeClient } from './clients';
import { buildDashManifest, type AdaptiveFormat } from './dash';
import { bestThumb, collectVideos, deepFind, findContinuation, parseCount, text } from './parse';
import { searchParams } from './searchParams';

const API = 'https://www.youtube.com/youtubei/v1';
/** Onglet « Vidéos » d'une chaîne. */
const CHANNEL_VIDEOS_PARAMS = 'EgZ2aWRlb3PyBgQKAjoA';
const PLAYER_TTL_MS = 5 * 60_000;

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface PlayerResult {
  data: J;
  client: InnertubeClient;
  at: number;
}

export interface InnertubeOptions {
  hl?: string;
  gl?: string;
  http?: HttpOptions;
}

/**
 * Source « Sur l'appareil » : le téléphone interroge directement l'API interne
 * de YouTube, comme Grayjay ou NewPipe. Aucune instance ni clé API. Les URL
 * de flux sont émises pour l'adresse IP du téléphone, donc lisibles par lui.
 */
export class InnertubeSource implements VideoSource {
  readonly kind = 'device' as const;
  readonly label = 'Sur l’appareil';
  private readonly hl: string;
  private readonly gl: string;
  private readonly http: HttpOptions;
  private visitorData?: string;
  private players = new Map<string, PlayerResult>();

  constructor(opts: InnertubeOptions = {}) {
    this.hl = opts.hl ?? 'fr';
    this.gl = opts.gl ?? 'FR';
    this.http = opts.http ?? {};
  }

  /* ───────────── Requêtes ───────────── */

  private async call(endpoint: string, client: InnertubeClient, body: J): Promise<J> {
    const context = {
      client: {
        ...client.context,
        hl: this.hl,
        gl: this.gl,
        ...(this.visitorData ? { visitorData: this.visitorData } : {}),
      },
    };
    const headers: Record<string, string> = {
      'User-Agent': client.userAgent,
      'X-YouTube-Client-Name': String(client.id),
      'X-YouTube-Client-Version': String(client.context.clientVersion),
      Origin: 'https://www.youtube.com',
      ...(this.visitorData ? { 'X-Goog-Visitor-Id': this.visitorData } : {}),
    };
    const data = await postJson<J>(`${API}/${endpoint}?prettyPrint=false`, { context, ...body }, headers, this.http);
    const vd = data?.responseContext?.visitorData;
    if (typeof vd === 'string' && vd) this.visitorData = vd;
    return data;
  }

  /** Réponse « player » (métadonnées + flux), avec repli sur un autre client. */
  private async player(id: string, fresh = false): Promise<PlayerResult> {
    const cached = this.players.get(id);
    if (!fresh && cached && Date.now() - cached.at < PLAYER_TTL_MS) return cached;
    let reason = '';
    let status = '';
    for (const client of PLAYER_CLIENTS) {
      try {
        const data = await this.call('player', client, { videoId: id, contentCheckOk: true, racyCheckOk: true });
        status = data?.playabilityStatus?.status ?? '';
        reason = data?.playabilityStatus?.reason ?? reason;
        const sd = data?.streamingData;
        const playable =
          status === 'OK' &&
          !!sd &&
          (!!sd.hlsManifestUrl || [...(sd.formats ?? []), ...(sd.adaptiveFormats ?? [])].some((f: J) => !!f?.url));
        if (playable) {
          const result = { data, client, at: Date.now() };
          this.players.set(id, result);
          if (this.players.size > 30) this.players.delete(this.players.keys().next().value as string);
          return result;
        }
      } catch (e) {
        if (client === PLAYER_CLIENTS[PLAYER_CLIENTS.length - 1] && !status) throw e;
      }
    }
    if (status === 'LOGIN_REQUIRED' || /bot|robot/i.test(reason)) {
      throw new AppError(
        'blocked',
        `YouTube demande une vérification pour cette vidéo depuis ce réseau${reason ? ` (« ${reason} »)` : ''}. Réessayez plus tard ou depuis une autre connexion.`,
      );
    }
    throw new AppError('not_found', reason ? `YouTube : ${reason}` : 'YouTube ne fournit aucun flux lisible pour cette vidéo.');
  }

  /* ───────────── VideoSource ───────────── */

  async search(query: string, filters: SearchFilters, page?: string): Promise<SearchPage> {
    const data = page
      ? await this.call('search', WEB, { continuation: page })
      : await this.call('search', WEB, { query, params: searchParams(filters) });
    return { items: collectVideos(data), nextPage: findContinuation(data) };
  }

  async getDetails(id: string): Promise<VideoDetails> {
    const [player, next] = await Promise.allSettled([this.player(id), this.call('next', WEB, { videoId: id })]);
    if (player.status === 'rejected' && next.status === 'rejected') throw player.reason;

    const nextData = next.status === 'fulfilled' ? next.value : undefined;
    const primary = deepFind(nextData, 'videoPrimaryInfoRenderer') as J | undefined;
    const secondary = deepFind(nextData, 'videoSecondaryInfoRenderer') as J | undefined;
    const secondaryResults = deepFind(nextData, 'secondaryResults') ?? {};
    const related = collectVideos(secondaryResults).filter((v) => v.id !== id);
    const publishedText = text(primary?.dateText) || text(primary?.relativeDateText) || undefined;

    if (player.status === 'fulfilled') {
      const vd: J = player.value.data.videoDetails ?? {};
      const dims = largestFormat(player.value.data);
      const live = !!vd.isLive || !!vd.isLiveContent && !!player.value.data.streamingData?.hlsManifestUrl;
      return {
        id,
        title: vd.title ?? text(primary?.title),
        channelName: vd.author ?? text(secondary?.owner?.videoOwnerRenderer?.title),
        channelId: vd.channelId,
        thumbnail: bestThumb(vd.thumbnail?.thumbnails) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        durationSec: live ? 0 : vd.lengthSeconds ? Number(vd.lengthSeconds) : null,
        publishedText,
        viewCount: vd.viewCount ? Number(vd.viewCount) : undefined,
        keywords: Array.isArray(vd.keywords) ? vd.keywords : undefined,
        isLive: live,
        width: dims?.width,
        height: dims?.height,
        description: vd.shortDescription ?? text(secondary?.attributedDescription) ?? undefined,
        related,
      };
    }

    // Lecture bloquée mais page vidéo accessible : on affiche quand même les infos.
    const owner = secondary?.owner?.videoOwnerRenderer;
    return {
      id,
      title: text(primary?.title),
      channelName: text(owner?.title),
      channelId: owner?.navigationEndpoint?.browseEndpoint?.browseId,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSec: null,
      publishedText,
      viewCount: parseCount(text(primary?.viewCount?.videoViewCountRenderer?.viewCount)),
      description: text(secondary?.attributedDescription) || undefined,
      related,
    };
  }

  async getPlayback(id: string, opts: { fresh?: boolean } = {}): Promise<PlaybackInfo> {
    const { data, client } = await this.player(id, opts.fresh);
    const sd: J = data.streamingData ?? {};
    const headers = { 'User-Agent': client.userAgent };
    const origin = String(client.context.clientName);
    const live = !!data.videoDetails?.isLive;
    const duration = Number(data.videoDetails?.lengthSeconds ?? 0);

    const muxed = sortStreams(
      ((sd.formats ?? []) as J[])
        .filter((f) => !!f.url)
        .map(
          (f): StreamOption => ({
            url: f.url,
            mimeType: String(f.mimeType ?? 'video/mp4').split(';')[0].trim(),
            quality: f.qualityLabel ?? `${f.height ?? '?'}p`,
            height: f.height ?? heightFromLabel(f.qualityLabel),
            width: f.width,
            muxed: true,
            sizeBytes: f.contentLength ? Number(f.contentLength) : undefined,
            kind: 'progressive',
            headers,
            origin,
          }),
        ),
    );

    const manifest = live ? undefined : buildDashManifest((sd.adaptiveFormats ?? []) as AdaptiveFormat[], duration);
    const dash: StreamOption | undefined = manifest
      ? { url: '', manifest, mimeType: 'application/dash+xml', quality: 'HD', muxed: true, kind: 'dash', headers, origin }
      : undefined;
    const hls: StreamOption | undefined = sd.hlsManifestUrl
      ? { url: sd.hlsManifestUrl, mimeType: 'application/x-mpegURL', quality: 'Auto', muxed: true, kind: 'hls', headers, origin }
      : undefined;

    // HD d'abord (DASH, puis HLS), puis le fichier muxé, plus sûr mais limité.
    const candidates = (live ? [hls] : [dash, hls, ...muxed]).filter((s): s is StreamOption => !!s);
    if (candidates.length === 0) throw new AppError('no_stream', 'YouTube ne fournit aucun flux lisible pour cette vidéo.');
    const dims = largestFormat(data);
    const audio = ((sd.adaptiveFormats ?? []) as J[])
      .filter((f) => !!f.url && /^audio\//.test(String(f.mimeType)))
      .filter((f) => f.audioTrack?.audioIsDefault !== false) // piste d'origine, pas un doublage
      .map(
        (f): StreamOption => ({
          url: f.url,
          mimeType: String(f.mimeType).split(';')[0].trim(),
          quality: f.bitrate ? `${Math.round(f.bitrate / 1000)} kbit/s` : 'Audio',
          muxed: false,
          sizeBytes: f.contentLength ? Number(f.contentLength) : undefined,
          bitrate: f.bitrate,
          kind: 'progressive',
          headers,
          origin,
        }),
      );
    return { playback: candidates[0], candidates, downloadable: muxed, audio, width: dims?.width, height: dims?.height };
  }

  async getChannelVideos(channelId: string): Promise<VideoSummary[]> {
    const data = await this.call('browse', WEB, { browseId: channelId, params: CHANNEL_VIDEOS_PARAMS });
    return collectVideos(data);
  }

  async ping(): Promise<void> {
    const page = await this.search('test', { sort: 'relevance', uploadDate: 'any', duration: 'any' });
    if (page.items.length === 0) throw new AppError('parse', 'YouTube a répondu, mais sans résultats lisibles.');
  }
}

/** Plus grande définition annoncée (détection des Shorts verticaux). */
function largestFormat(data: J): { width: number; height: number } | undefined {
  const all = [...(data?.streamingData?.adaptiveFormats ?? []), ...(data?.streamingData?.formats ?? [])] as J[];
  const best = all.filter((f) => f?.width && f?.height).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return best ? { width: best.width, height: best.height } : undefined;
}
