import { parseClockDuration } from '../../format';
import type { VideoSummary } from '../../types';

/**
 * Lecture défensive des réponses Innertube. Leur structure change souvent :
 * au lieu de chemins fixes, on cherche les blocs vidéo connus où qu'ils soient
 * (videoRenderer, compactVideoRenderer, lockupViewModel…).
 */

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function text(t: unknown): string {
  if (!t || typeof t !== 'object') return typeof t === 'string' ? t : '';
  const o = t as J;
  if (typeof o.simpleText === 'string') return o.simpleText;
  if (typeof o.content === 'string') return o.content;
  if (Array.isArray(o.runs)) return o.runs.map((r: J) => r?.text ?? '').join('');
  return '';
}

/** « 1 234 567 vues », « 1,2 M de vues », « 12K views », « Aucune vue ». */
export function parseCount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  if (/aucune|no views/i.test(s)) return 0;
  const short = /(\d+(?:[.,]\d+)?)\s*(k|m|md|mrd|b)\b/i.exec(s.replace(/ | /g, ' '));
  if (short) {
    const mult: Record<string, number> = { k: 1e3, m: 1e6, md: 1e9, mrd: 1e9, b: 1e9 };
    return Math.round(Number(short[1].replace(',', '.')) * mult[short[2].toLowerCase()]);
  }
  const digits = s.replace(/[^\d]/g, '');
  return digits ? Number(digits) : undefined;
}

/** Valeur de la première clé `key` rencontrée (parcours en profondeur). */
export function deepFind(node: unknown, key: string, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 40) return undefined;
  if (!Array.isArray(node) && key in (node as J)) return (node as J)[key];
  for (const v of Object.values(node as J)) {
    const r = deepFind(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Toutes les chaînes contenues dans un sous-arbre (badges, textes…). */
export function deepStrings(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 30 || node == null) return out;
  if (typeof node === 'string') out.push(node);
  else if (typeof node === 'object') for (const v of Object.values(node as J)) deepStrings(v, out, depth + 1);
  return out;
}

function bestThumb(list: unknown): string | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const best = [...list].sort((a: J, b: J) => (b?.width ?? 0) - (a?.width ?? 0))[0] as J;
  const url = typeof best?.url === 'string' ? best.url : undefined;
  return url?.startsWith('//') ? `https:${url}` : url;
}

const CLOCK = /^\d{1,2}(?::\d{2}){1,2}$/;

export function parseVideoRenderer(r: J): VideoSummary | undefined {
  const id: string | undefined = r?.videoId;
  if (!id || r.upcomingEventData) return undefined;
  const overlays: J[] = r.thumbnailOverlays ?? [];
  const time = overlays.find((o) => o?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer;
  const style: string = time?.style ?? '';
  const lengthText = text(r.lengthText) || text(time?.text);
  const badges = deepStrings(r.badges);
  const isLive = style === 'LIVE' || badges.some((b) => /LIVE_NOW|^LIVE$|EN DIRECT/i.test(b));
  const owner = r.ownerText ?? r.longBylineText ?? r.shortBylineText;
  return {
    id,
    title: text(r.title) || text(r.headline),
    channelName: text(owner),
    channelId: owner?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
    thumbnail: bestThumb(r.thumbnail?.thumbnails) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSec: isLive ? 0 : parseClockDuration(lengthText),
    publishedText: text(r.publishedTimeText) || undefined,
    viewCount: isLive ? undefined : parseCount(text(r.viewCountText) || text(r.shortViewCountText)),
    isLive,
    isShort: style === 'SHORTS' || !!r.navigationEndpoint?.reelWatchEndpoint,
  };
}

export function parseLockup(l: J): VideoSummary | undefined {
  if (l?.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return undefined;
  const id: string | undefined = l?.contentId;
  if (!id) return undefined;
  const meta = l.metadata?.lockupMetadataViewModel;
  const rows: J[] = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const parts = rows.map((row) => ((row?.metadataParts ?? []) as J[]).map((p) => text(p?.text)).filter(Boolean));
  const rest = parts.slice(1).flat();
  const viewText = rest.find((t) => /vue|view/i.test(t));
  const dateText = rest.find((t) => t !== viewText && /il y a|ago|^\d/i.test(t));
  const imageStrings = deepStrings(l.contentImage);
  const isLive = imageStrings.some((s) => /^(LIVE|EN DIRECT|DIRECT)$/i.test(s.trim()));
  const browseId = deepFind(meta, 'browseId');
  return {
    id,
    title: text(meta?.title),
    channelName: parts[0]?.[0] ?? '',
    channelId: typeof browseId === 'string' && browseId.startsWith('UC') ? browseId : undefined,
    thumbnail: bestThumb(deepFind(l.contentImage, 'sources')) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSec: isLive ? 0 : parseClockDuration(imageStrings.find((s) => CLOCK.test(s.trim()))?.trim()),
    publishedText: dateText,
    viewCount: parseCount(viewText),
    isLive,
    isShort: deepFind(l, 'reelWatchEndpoint') !== undefined,
  };
}

const VIDEO_KEYS = new Set(['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer', 'videoWithContextRenderer']);
const SHORT_KEYS = new Set(['reelItemRenderer', 'shortsLockupViewModel']);
const SKIP_KEYS = new Set(['adSlotRenderer', 'promotedVideoRenderer', 'searchPyvRenderer', 'playlistRenderer', 'channelRenderer']);

/** Toutes les vidéos d'une réponse, dans l'ordre, Shorts marqués comme tels. */
export function collectVideos(root: unknown): VideoSummary[] {
  const out: VideoSummary[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 60) return;
    if (Array.isArray(node)) {
      for (const v of node) visit(v, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(node as J)) {
      if (SKIP_KEYS.has(k)) continue;
      if (VIDEO_KEYS.has(k)) {
        const p = parseVideoRenderer(v as J);
        if (p) out.push(p);
      } else if (k === 'lockupViewModel') {
        const p = parseLockup(v as J);
        if (p) out.push(p);
      } else if (SHORT_KEYS.has(k)) {
        const sid = (v as J)?.videoId ?? deepFind(v, 'videoId');
        if (typeof sid === 'string') out.push({ id: sid, title: '', channelName: '', thumbnail: '', durationSec: null, isShort: true });
      } else {
        visit(v, depth + 1);
      }
    }
  };
  visit(root, 0);
  return out;
}

/** Jeton de la page suivante : celui du dernier bloc « continuation ». */
export function findContinuation(root: unknown): string | undefined {
  let token: string | undefined;
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 60) return;
    for (const [k, v] of Object.entries(node as J)) {
      if (k === 'continuationItemRenderer') {
        const t = deepFind(v, 'token');
        if (typeof t === 'string') token = t;
      } else visit(v, depth + 1);
    }
  };
  visit(root, 0);
  return token;
}

export { bestThumb };
