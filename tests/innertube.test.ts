import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../src/core/errors';
import { excludeShorts } from '../src/core/shorts';
import type { FetchLike } from '../src/core/sources/http';
import { InnertubeSource } from '../src/core/sources/innertube';
import { buildDashManifest } from '../src/core/sources/innertube/dash';
import { collectVideos, findContinuation, parseCount } from '../src/core/sources/innertube/parse';
import { searchParams } from '../src/core/sources/innertube/searchParams';
import { DEFAULT_FILTERS } from '../src/core/types';

interface Call {
  url: string;
  body: any;
  headers: Record<string, string>;
}

/** Faux fetch POST : la réponse dépend de l'URL et du corps envoyé. */
function mockPost(handler: (url: string, body: any, headers: Record<string, string>) => [number, unknown], calls: Call[] = []): FetchLike {
  return async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const headers = init?.headers ?? {};
    calls.push({ url, body, headers });
    const [status, payload] = handler(url, body, headers);
    return { ok: status < 400, status, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
}

const videoRenderer = (id: string, extra: Record<string, unknown> = {}) => ({
  videoRenderer: {
    videoId: id,
    title: { runs: [{ text: `Vidéo ${id}` }] },
    ownerText: { runs: [{ text: 'Chaîne Vélo', navigationEndpoint: { browseEndpoint: { browseId: 'UCvelo' } } }] },
    thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hq720.jpg`, width: 720 }, { url: 'small.jpg', width: 120 }] },
    lengthText: { simpleText: '12:34' },
    publishedTimeText: { simpleText: 'il y a 3 jours' },
    viewCountText: { simpleText: '1 234 567 vues' },
    navigationEndpoint: { watchEndpoint: { videoId: id } },
    ...extra,
  },
});

const SEARCH_RESPONSE = {
  responseContext: { visitorData: 'VISITOR123' },
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  { adSlotRenderer: { videoRenderer: { videoId: 'adadadadada' } } },
                  videoRenderer('aaaaaaaaaaa'),
                  {
                    reelShelfRenderer: {
                      items: [{ reelItemRenderer: { videoId: 'shshshshshs', headline: { simpleText: 'Short' } } }],
                    },
                  },
                  videoRenderer('ccccccccccc', {
                    lengthText: { simpleText: '0:45' },
                    navigationEndpoint: { reelWatchEndpoint: { videoId: 'ccccccccccc' } },
                  }),
                  {
                    lockupViewModel: {
                      contentId: 'lklklklklkl',
                      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
                      contentImage: {
                        thumbnailViewModel: {
                          image: { sources: [{ url: 'https://i.ytimg.com/vi/lklklklklkl/hqdefault.jpg', width: 480 }] },
                          overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: '1:02:03' } }] } }],
                        },
                      },
                      metadata: {
                        lockupMetadataViewModel: {
                          title: { content: 'Traversée des Alpes' },
                          metadata: {
                            contentMetadataViewModel: {
                              metadataRows: [
                                { metadataParts: [{ text: { content: 'Montagne TV', commandRuns: [{ onTap: { innertubeCommand: { browseEndpoint: { browseId: 'UCmont' } } } }] } }] },
                                { metadataParts: [{ text: { content: '1,2 M de vues' } }, { text: { content: 'il y a 2 mois' } }] },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
            { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'NEXT_TOKEN', request: 'CONTINUATION_REQUEST_TYPE_SEARCH' } } } },
          ],
        },
      },
    },
  },
};

const adaptive = (itag: number, mime: string, extra: Record<string, unknown>) => ({
  itag,
  url: `https://rr1.googlevideo.com/videoplayback?itag=${itag}&expire=1&sig=a`,
  mimeType: mime,
  bitrate: 1000 * itag,
  initRange: { start: '0', end: '740' },
  indexRange: { start: '741', end: '1900' },
  ...extra,
});

const PLAYER_OK = {
  playabilityStatus: { status: 'OK' },
  videoDetails: {
    videoId: 'aaaaaaaaaaa',
    title: 'Vidéo aaaaaaaaaaa',
    author: 'Chaîne Vélo',
    channelId: 'UCvelo',
    lengthSeconds: '754',
    viewCount: '1234567',
    keywords: ['vélo', 'bikepacking'],
    shortDescription: 'Description',
    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg', width: 1280 }] },
  },
  streamingData: {
    formats: [{ itag: 18, url: 'https://rr1.googlevideo.com/videoplayback?itag=18', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', width: 640, height: 360, qualityLabel: '360p', contentLength: '12345678' }],
    adaptiveFormats: [
      adaptive(137, 'video/mp4; codecs="avc1.640028"', { width: 1920, height: 1080, fps: 30 }),
      adaptive(136, 'video/mp4; codecs="avc1.4d401f"', { width: 1280, height: 720, fps: 30 }),
      adaptive(248, 'video/webm; codecs="vp9"', { width: 1920, height: 1080 }),
      adaptive(140, 'audio/mp4; codecs="mp4a.40.2"', { audioSampleRate: '44100', audioChannels: 2 }),
      adaptive(251, 'audio/webm; codecs="opus"', {}),
    ],
  },
};

describe('Innertube — paramètres et analyse', () => {
  it('encode les paramètres de recherche comme YouTube', () => {
    assert.equal(searchParams(DEFAULT_FILTERS), 'EgIQAQ==');
    assert.equal(searchParams({ ...DEFAULT_FILTERS, sort: 'date' }), 'CAISAhAB');
    assert.equal(searchParams({ ...DEFAULT_FILTERS, duration: 'short' }), 'EgQQARgB');
    assert.equal(searchParams({ ...DEFAULT_FILTERS, uploadDate: 'today' }), 'EgQIAhAB');
  });

  it('lit les compteurs de vues', () => {
    assert.equal(parseCount('1 234 567 vues'), 1234567);
    assert.equal(parseCount('1,2 M de vues'), 1_200_000);
    assert.equal(parseCount('12K views'), 12_000);
    assert.equal(parseCount('Aucune vue'), 0);
  });

  it('extrait les vidéos, marque les Shorts, ignore les pubs', () => {
    const items = collectVideos(SEARCH_RESPONSE);
    assert.deepEqual(items.map((v) => v.id), ['aaaaaaaaaaa', 'shshshshshs', 'ccccccccccc', 'lklklklklkl']);
    const [a, , c, l] = items;
    assert.equal(a.title, 'Vidéo aaaaaaaaaaa');
    assert.equal(a.channelId, 'UCvelo');
    assert.equal(a.durationSec, 754);
    assert.equal(a.viewCount, 1234567);
    assert.equal(a.thumbnail, 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq720.jpg');
    assert.equal(c.isShort, true);
    assert.equal(l.title, 'Traversée des Alpes');
    assert.equal(l.channelName, 'Montagne TV');
    assert.equal(l.channelId, 'UCmont');
    assert.equal(l.durationSec, 3723);
    assert.equal(l.viewCount, 1_200_000);
    assert.equal(l.publishedText, 'il y a 2 mois');
    assert.deepEqual(excludeShorts(items).map((v) => v.id), ['aaaaaaaaaaa', 'lklklklklkl']);
    assert.equal(findContinuation(SEARCH_RESPONSE), 'NEXT_TOKEN');
  });

  it('construit un manifeste DASH H.264 + AAC', () => {
    const mpd = buildDashManifest(PLAYER_OK.streamingData.adaptiveFormats, 754)!;
    assert.match(mpd, /mediaPresentationDuration="PT754.000S"/);
    assert.match(mpd, /id="137"/);
    assert.match(mpd, /id="140"/);
    assert.doesNotMatch(mpd, /id="248"|id="251"/);
    assert.match(mpd, /itag=137&amp;expire=1&amp;sig=a/);
    assert.match(mpd, /indexRange="741-1900"/);
    assert.equal(buildDashManifest(PLAYER_OK.streamingData.adaptiveFormats.filter((f) => !f.mimeType.startsWith('audio')), 754), undefined);
  });
});

describe('Innertube — source', () => {
  it('cherche avec le client WEB et réutilise le visitorData', async () => {
    const calls: Call[] = [];
    const src = new InnertubeSource({ http: { fetchImpl: mockPost(() => [200, SEARCH_RESPONSE], calls) } });
    const page = await src.search('vélo', { ...DEFAULT_FILTERS, sort: 'date' });
    assert.equal(page.items.length, 4);
    assert.equal(page.nextPage, 'NEXT_TOKEN');
    assert.match(calls[0].url, /\/youtubei\/v1\/search\?prettyPrint=false$/);
    assert.equal(calls[0].body.query, 'vélo');
    assert.equal(calls[0].body.params, 'CAISAhAB');
    assert.equal(calls[0].body.context.client.clientName, 'WEB');
    assert.equal(calls[0].body.context.client.hl, 'fr');
    await src.search('vélo', DEFAULT_FILTERS, page.nextPage);
    assert.equal(calls[1].body.continuation, 'NEXT_TOKEN');
    assert.equal(calls[1].body.context.client.visitorData, 'VISITOR123');
    assert.equal(calls[1].headers['X-Goog-Visitor-Id'], 'VISITOR123');
  });

  it('se replie sur un autre client et propose DASH, puis le MP4', async () => {
    const calls: Call[] = [];
    const src = new InnertubeSource({
      http: {
        fetchImpl: mockPost((_u, body) => {
          if (body.context.client.clientName === 'ANDROID_VR') return [200, { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' } }];
          return [200, PLAYER_OK];
        }, calls),
      },
    });
    const p = await src.getPlayback('aaaaaaaaaaa');
    assert.deepEqual(calls.map((c) => c.body.context.client.clientName), ['ANDROID_VR', 'IOS']);
    assert.deepEqual(p.candidates.map((c) => c.kind), ['dash', 'progressive']);
    assert.ok(p.candidates[0].manifest?.startsWith('<?xml'));
    assert.match(p.candidates[1].headers?.['User-Agent'] ?? '', /com\.google\.ios\.youtube/);
    assert.equal(p.downloadable[0].quality, '360p');
    assert.equal(p.downloadable[0].sizeBytes, 12345678);
    assert.deepEqual([p.width, p.height], [1920, 1080]);
    // La réponse player est mise en cache : pas de nouvel appel pour les détails.
    await src.getPlayback('aaaaaaaaaaa');
    assert.equal(calls.length, 2);
  });

  it('explique un blocage anti-robot', async () => {
    const src = new InnertubeSource({
      http: {
        fetchImpl: mockPost(() => [200, { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" } }]),
      },
    });
    await assert.rejects(src.getPlayback('aaaaaaaaaaa'), (e: unknown) => e instanceof AppError && e.code === 'blocked');
  });

  it('assemble les détails et les vidéos liées', async () => {
    const next = {
      contents: {
        twoColumnWatchNextResults: {
          results: { results: { contents: [{ videoPrimaryInfoRenderer: { title: { runs: [{ text: 'T' }] }, dateText: { simpleText: '19 nov. 2026' } } }] } },
          secondaryResults: { secondaryResults: { results: [videoRenderer('rrrrrrrrrrr'), videoRenderer('aaaaaaaaaaa')] } },
        },
      },
    };
    const src = new InnertubeSource({
      http: { fetchImpl: mockPost((url) => [200, url.includes('/next') ? next : PLAYER_OK]) },
    });
    const d = await src.getDetails('aaaaaaaaaaa');
    assert.equal(d.title, 'Vidéo aaaaaaaaaaa');
    assert.equal(d.durationSec, 754);
    assert.deepEqual(d.keywords, ['vélo', 'bikepacking']);
    assert.equal(d.publishedText, '19 nov. 2026');
    assert.deepEqual(d.related?.map((r) => r.id), ['rrrrrrrrrrr']);
  });
});
