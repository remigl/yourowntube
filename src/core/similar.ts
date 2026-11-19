import { excludeShorts, type ShortsPolicy } from './shorts';
import type { VideoSource } from './sources/types';
import { DEFAULT_FILTERS, type SimilarReason, type SimilarVideo, type VideoDetails, type VideoSummary } from './types';

const STOPWORDS = new Set(
  (
    'le la les un une des du de d l et ou en au aux a à ce ces cet cette pour par sur dans avec sans qui que quoi ' +
    'est son sa ses mon ma mes ton ta tes notre nos votre vos leur leurs plus moins tout tous très comment pourquoi ' +
    'the a an of and or to in on for with without by from at is are was this that these those how why what my your ' +
    'vs official video vidéo full hd 4k part partie episode épisode ep feat ft new nouveau nouvelle'
  ).split(/\s+/),
);

/** Extrait une requête « même sujet » à partir des tags ou, à défaut, du titre. */
export function topicQuery(v: Pick<VideoDetails, 'title' | 'keywords' | 'channelName'>, maxTerms = 4): string {
  const channel = v.channelName.toLowerCase();
  const tags = (v.keywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length > 2 && !/^#?shorts?$/i.test(k) && k.toLowerCase() !== channel);
  if (tags.length >= 2) return tags.slice(0, 3).join(' ');

  const words = v.title
    .replace(/[([{].*?[)\]}]/g, ' ') // (Official Video), [4K]…
    .replace(/#\S+/g, ' ')
    .split(/[^\p{L}\p{N}'’-]+/u)
    .map((w) => w.replace(/^['’-]+|['’-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()) && w.toLowerCase() !== channel);
  const unique: string[] = [];
  for (const w of words) if (!unique.some((u) => u.toLowerCase() === w.toLowerCase())) unique.push(w);
  return unique.slice(0, maxTerms).join(' ');
}

/**
 * Fusionne plusieurs listes en alternant (round-robin pondéré), sans doublons.
 * Le motif favorise les recommandations natives tout en diversifiant.
 */
export function mergeSimilar(
  lists: Record<SimilarReason, VideoSummary[]>,
  excludeId: string,
  limit = 30,
  pattern: SimilarReason[] = ['related', 'topic', 'related', 'channel'],
): SimilarVideo[] {
  const cursors: Record<SimilarReason, number> = { related: 0, channel: 0, topic: 0 };
  const seen = new Set<string>([excludeId]);
  const out: SimilarVideo[] = [];
  while (out.length < limit) {
    let progressed = false;
    for (const reason of pattern) {
      const list = lists[reason];
      while (cursors[reason] < list.length) {
        const v = list[cursors[reason]++];
        if (!seen.has(v.id)) {
          seen.add(v.id);
          out.push({ ...v, reason });
          progressed = true;
          break;
        }
      }
      if (out.length >= limit) break;
    }
    if (!progressed) break;
  }
  return out;
}

export interface SimilarResult {
  items: SimilarVideo[];
  /** Nombre de sous-requêtes en échec (affichage discret, pas bloquant). */
  failures: number;
}

/** Vidéos similaires : recommandations natives + même chaîne + même sujet, sans Shorts. */
export async function findSimilar(
  source: VideoSource,
  video: VideoDetails,
  policy: ShortsPolicy,
  limit = 30,
): Promise<SimilarResult> {
  const query = topicQuery(video);
  const [channel, topic] = await Promise.allSettled([
    video.channelId ? source.getChannelVideos(video.channelId) : Promise.resolve([]),
    query ? source.search(query, DEFAULT_FILTERS).then((p) => p.items) : Promise.resolve([]),
  ]);
  const failures = [channel, topic].filter((r) => r.status === 'rejected').length;
  const lists = {
    related: excludeShorts(video.related ?? [], policy),
    channel: excludeShorts(channel.status === 'fulfilled' ? channel.value : [], policy),
    topic: excludeShorts(topic.status === 'fulfilled' ? topic.value : [], policy),
  };
  return { items: mergeSimilar(lists, video.id, limit), failures };
}

export const REASON_LABELS: Record<SimilarReason, string> = {
  related: 'Recommandée',
  channel: 'Même chaîne',
  topic: 'Sujet proche',
};
