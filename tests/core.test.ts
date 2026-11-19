import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../src/core/errors';
import { applyFilters } from '../src/core/filters';
import { formatBytes, formatDuration, formatRelativeDate, formatViews, parseClockDuration, parseIsoDuration } from '../src/core/format';
import { choosePlaybackOrigin, isCompleted, resumePosition } from '../src/core/playback';
import { classifyShort, excludeShorts } from '../src/core/shorts';
import { findSimilar, mergeSimilar, topicQuery } from '../src/core/similar';
import { DemoSource } from '../src/core/sources/demo';
import { DEMO_VIDEOS } from '../src/core/sources/demoData';
import type { FetchLike } from '../src/core/sources/http';
import { InvidiousSource } from '../src/core/sources/invidious';
import { PipedSource } from '../src/core/sources/piped';
import { pickDownloadStream } from '../src/core/sources/streams';
import { YouTubeDataSource } from '../src/core/sources/youtube';
import { createSource } from '../src/core/sources';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { thumbnailCandidates } from '../src/core/thumbnails';
import { DEFAULT_FILTERS, type VideoSummary } from '../src/core/types';

/** Faux fetch : associe un motif d'URL à une réponse JSON. */
function mockFetch(routes: [RegExp, unknown, number?][], calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const route = routes.find(([re]) => re.test(url));
    if (!route) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    const [, body, status = 200] = route;
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
}

const v = (over: Partial<VideoSummary>): VideoSummary => ({
  id: over.id ?? 'x',
  title: 'Titre',
  channelName: 'Chaîne',
  thumbnail: '',
  durationSec: 600,
  ...over,
});

describe('format', () => {
  it('analyse les durées ISO 8601', () => {
    assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
    assert.equal(parseIsoDuration('PT45S'), 45);
    assert.equal(parseIsoDuration('P1DT1M'), 86460);
    assert.equal(parseIsoDuration('P0D'), 0);
    assert.equal(parseIsoDuration('n/a'), null);
    assert.equal(parseClockDuration('1:02:03'), 3723);
    assert.equal(parseClockDuration('abc'), null);
  });
  it('formate durées, tailles et vues', () => {
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(formatDuration(null), '--:--');
    assert.equal(formatBytes(1536), '1,5 Ko');
    assert.equal(formatBytes(734_003_200), '700 Mo');
    assert.equal(formatViews(1_234_567), '1,2 M vues');
    assert.equal(formatViews(1), '1 vue');
  });
  it('formate les dates relatives', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    assert.equal(formatRelativeDate('2026-11-16T12:00:00Z', now), 'il y a 3 jours');
    assert.equal(formatRelativeDate('2026-11-19T11:00:00Z', now), 'il y a 1 heure');
    assert.equal(formatRelativeDate('2024-11-01T12:00:00Z', now), 'il y a 2 ans');
    assert.equal(formatRelativeDate('2026-09-10T12:00:00Z', now), 'il y a 2 mois');
  });
});

describe('Shorts', () => {
  it('détecte les Shorts par tous les signaux', () => {
    assert.deepEqual(classifyShort(v({ isShort: true })), { short: true, reason: 'flag' });
    assert.deepEqual(classifyShort({ ...v({}), url: '/shorts/abc' }), { short: true, reason: 'url' });
    assert.deepEqual(classifyShort(v({ durationSec: 120, width: 1080, height: 1920 })), { short: true, reason: 'vertical' });
    assert.deepEqual(classifyShort(v({ durationSec: 150, title: 'Wow #shorts' })), { short: true, reason: 'hashtag' });
    assert.deepEqual(classifyShort(v({ durationSec: 30 })), { short: true, reason: 'duration' });
  });
  it('garde les vidéos classiques', () => {
    assert.equal(classifyShort(v({ durationSec: 150, title: 'A short story about cats' })).short, false);
    assert.equal(classifyShort(v({ durationSec: 900, width: 1080, height: 1920 })).short, false); // longue verticale
    assert.equal(classifyShort(v({ durationSec: 0, isLive: true })).short, false);
    assert.equal(classifyShort(v({ durationSec: null })).short, false);
    assert.equal(classifyShort(v({ durationSec: 90 }), { thresholdSec: 60 }).short, false);
    assert.equal(classifyShort(v({ durationSec: 90 }), { thresholdSec: 120 }).short, true);
  });
  it('retire les Shorts de démonstration et les doublons', () => {
    const out = excludeShorts([...DEMO_VIDEOS, DEMO_VIDEOS[0]]);
    assert.ok(out.every((x) => !x.id.startsWith('demo-short')));
    assert.equal(out.length, DEMO_VIDEOS.length - 2);
  });
});

describe('filtres et tri', () => {
  const now = new Date('2026-11-19T12:00:00Z').getTime();
  const items = [
    v({ id: 'a', durationSec: 200, publishedAt: '2026-11-18T00:00:00Z', viewCount: 5 }),
    v({ id: 'b', durationSec: 600, publishedAt: '2025-01-01T00:00:00Z', viewCount: 50 }),
    v({ id: 'c', durationSec: 3600, publishedAt: '2026-11-01T00:00:00Z', viewCount: 500 }),
  ];
  it('filtre par durée et par date', () => {
    assert.deepEqual(applyFilters(items, { ...DEFAULT_FILTERS, duration: 'long' }, now).map((x) => x.id), ['c']);
    assert.deepEqual(applyFilters(items, { ...DEFAULT_FILTERS, duration: 'short' }, now).map((x) => x.id), ['a']);
    assert.deepEqual(applyFilters(items, { ...DEFAULT_FILTERS, uploadDate: 'month' }, now).map((x) => x.id), ['a', 'c']);
  });
  it('trie par date et par vues', () => {
    assert.deepEqual(applyFilters(items, { ...DEFAULT_FILTERS, sort: 'date' }, now).map((x) => x.id), ['a', 'c', 'b']);
    assert.deepEqual(applyFilters(items, { ...DEFAULT_FILTERS, sort: 'views' }, now).map((x) => x.id), ['c', 'b', 'a']);
  });
});

describe('lecture', () => {
  it('reprend seulement au milieu de la vidéo', () => {
    assert.equal(resumePosition(2, 600), 0);
    assert.equal(resumePosition(120, 600), 120);
    assert.equal(resumePosition(590, 600), 0);
    assert.equal(isCompleted(580, 600), true);
  });
  it('privilégie toujours le fichier local', () => {
    assert.equal(choosePlaybackOrigin(true, true), 'local');
    assert.equal(choosePlaybackOrigin(true, false), 'local');
    assert.equal(choosePlaybackOrigin(false, true), 'stream');
    assert.equal(choosePlaybackOrigin(false, false), 'unavailable_offline');
  });
  it('choisit la qualité de téléchargement', () => {
    const s = (h: number) => ({ url: `${h}`, mimeType: 'video/mp4', quality: `${h}p`, height: h, muxed: true, kind: 'progressive' as const });
    assert.equal(pickDownloadStream([s(360), s(720), s(1080)], 720)?.height, 720);
    assert.equal(pickDownloadStream([s(1080)], 720)?.height, 1080);
    assert.equal(pickDownloadStream([], 720), undefined);
  });
  it('propose des miniatures de qualité avec repli', () => {
    assert.deepEqual(thumbnailCandidates('dQw4w9WgXcQ').slice(-1), ['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);
    assert.deepEqual(thumbnailCandidates('demo-sintel', 'x.jpg'), ['x.jpg']);
  });
});

describe('source Invidious', () => {
  const base = 'https://inv.test';
  const fetchImpl = mockFetch([
    [
      /\/api\/v1\/search/,
      [
        {
          type: 'video',
          videoId: 'aaaaaaaaaaa',
          title: 'Vidéo longue',
          author: 'Chaîne A',
          authorId: 'UCa',
          lengthSeconds: 900,
          viewCount: 1000,
          published: 1_763_000_000,
          publishedText: '1 day ago',
          videoThumbnails: [{ quality: 'high', url: '/vi/aaaaaaaaaaa/hqdefault.jpg', width: 480, height: 360 }],
        },
        { type: 'channel', videoId: '', title: 'Une chaîne' },
      ],
    ],
    [
      /\/api\/v1\/videos\/aaaaaaaaaaa\?local=true/,
      {
        videoId: 'aaaaaaaaaaa',
        title: 'Vidéo longue',
        author: 'Chaîne A',
        authorId: 'UCa',
        lengthSeconds: 900,
        keywords: ['vélo', 'voyage'],
        formatStreams: [
          { url: '/latest_version?id=aaaaaaaaaaa&itag=18&local=true', type: 'video/mp4; codecs="avc1"', qualityLabel: '360p', size: '640x360' },
          { url: '/latest_version?id=aaaaaaaaaaa&itag=22&local=true', type: 'video/mp4', qualityLabel: '720p', size: '1280x720' },
        ],
        adaptiveFormats: [{ url: '/x', size: '1920x1080' }],
        recommendedVideos: [{ videoId: 'bbbbbbbbbbb', title: 'Liée', author: 'B', lengthSeconds: 30 }],
      },
    ],
  ]);
  const src = new InvidiousSource(`${base}/`, { fetchImpl });

  it('convertit les résultats et ignore les non-vidéos', async () => {
    const page = await src.search('vélo', { ...DEFAULT_FILTERS, sort: 'date' });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].thumbnail, `${base}/vi/aaaaaaaaaaa/hqdefault.jpg`);
    assert.equal(page.items[0].durationSec, 900);
    assert.equal(page.nextPage, '2');
  });
  it('renvoie des flux muxés absolus, triés du meilleur au moins bon', async () => {
    const p = await src.getPlayback('aaaaaaaaaaa');
    assert.equal(p.playback.quality, '720p');
    assert.ok(p.playback.url.startsWith(`${base}/latest_version`));
    assert.deepEqual(p.downloadable.map((d) => d.height), [720, 360]);
    assert.equal(p.height, 1080);
  });
  it('fournit les vidéos liées dans les détails', async () => {
    const d = await src.getDetails('aaaaaaaaaaa');
    assert.equal(d.related?.[0].id, 'bbbbbbbbbbb');
    assert.deepEqual(d.keywords, ['vélo', 'voyage']);
  });
  it('explique un refus de l’instance (403)', async () => {
    const blocked = new InvidiousSource('inv.test', { fetchImpl: mockFetch([[/search/, 'Forbidden', 403]]) });
    await assert.rejects(blocked.search('x', DEFAULT_FILTERS), (e: unknown) => e instanceof AppError && e.code === 'blocked' && /anti-robots/.test(e.message));
  });
  it('signale une instance manquante', () => {
    assert.throws(() => new InvidiousSource(''), (e: unknown) => e instanceof AppError && e.code === 'not_configured');
  });
});

describe('source Piped', () => {
  const fetchImpl = mockFetch([
    [
      /\/search\?/,
      {
        items: [
          { url: '/watch?v=ccccccccccc', type: 'stream', title: 'Normale', uploaderName: 'C', uploaderUrl: '/channel/UCc', duration: 700, views: 10, uploaded: 1_763_000_000_000 },
          { url: '/shorts/ddddddddddd', type: 'stream', title: 'Short', duration: 20, isShort: true },
          { url: '/channel/UCx', type: 'channel', title: 'Chaîne' },
        ],
        nextpage: 'TOKEN',
      },
    ],
    [
      /\/streams\/ccccccccccc/,
      {
        title: 'Normale',
        uploader: 'C',
        uploaderUrl: '/channel/UCc',
        duration: 700,
        hls: 'https://piped.test/hls.m3u8',
        videoStreams: [
          { url: 'https://p/1', quality: '1080p', mimeType: 'video/mp4', videoOnly: true, width: 1920, height: 1080 },
          { url: 'https://p/2', quality: '360p', mimeType: 'video/mp4', videoOnly: false, width: 640, height: 360 },
        ],
        relatedStreams: [{ url: '/watch?v=eeeeeeeeeee', type: 'stream', title: 'Liée', duration: 400 }],
      },
    ],
  ]);
  const src = new PipedSource('piped.test', { fetchImpl });

  it('marque les Shorts et garde le jeton de page suivante', async () => {
    const page = await src.search('x', DEFAULT_FILTERS);
    assert.equal(page.items.length, 2);
    assert.equal(page.items[1].isShort, true);
    assert.equal(excludeShorts(page.items).length, 1);
    assert.equal(page.items[0].channelId, 'UCc');
    assert.equal(page.nextPage, 'TOKEN');
  });
  it('lit en HLS et télécharge le flux muxé', async () => {
    const p = await src.getPlayback('ccccccccccc');
    assert.equal(p.playback.kind, 'hls');
    assert.deepEqual(p.downloadable.map((d) => d.url), ['https://p/2']);
    assert.equal(p.width, 1920);
  });
});

describe('source YouTube Data API', () => {
  it('enrichit la recherche avec durée, vues et format', async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch(
      [
        [/\/youtube\/v3\/search/, { items: [{ id: { videoId: 'fffffffffff' } }, { id: { videoId: 'ggggggggggg' } }], nextPageToken: 'N' }],
        [
          /\/youtube\/v3\/videos/,
          {
            items: [
              { id: 'ggggggggggg', snippet: { title: 'Court', channelTitle: 'G', channelId: 'UCg', publishedAt: '2026-01-01T00:00:00Z', thumbnails: {} }, contentDetails: { duration: 'PT40S' }, player: { embedWidth: '405', embedHeight: '720' } },
              { id: 'fffffffffff', snippet: { title: 'L&#39;été &amp; moi', channelTitle: 'F', channelId: 'UCf', publishedAt: '2026-01-01T00:00:00Z', thumbnails: { high: { url: 'h.jpg' } } }, contentDetails: { duration: 'PT12M' }, statistics: { viewCount: '42' } },
            ],
          },
        ],
      ],
      calls,
    );
    const src = new YouTubeDataSource('KEY', null, { fetchImpl });
    const page = await src.search('été', { ...DEFAULT_FILTERS, duration: 'medium' });
    assert.deepEqual(page.items.map((i) => i.id), ['fffffffffff', 'ggggggggggg']);
    assert.equal(page.items[0].title, "L'été & moi");
    assert.equal(page.items[0].durationSec, 720);
    assert.equal(page.items[0].viewCount, 42);
    assert.equal(classifyShort(page.items[1]).short, true);
    assert.ok(calls[0].includes('videoDuration=medium'));
    await assert.rejects(src.getPlayback('fffffffffff'), (e: unknown) => e instanceof AppError && e.code === 'not_configured');
  });
  it('traduit le dépassement de quota', async () => {
    const fetchImpl = mockFetch([[/search/, '{"error":{"errors":[{"reason":"quotaExceeded"}]}}', 403]]);
    const src = new YouTubeDataSource('KEY', null, { fetchImpl });
    await assert.rejects(src.search('x', DEFAULT_FILTERS), (e: unknown) => e instanceof AppError && e.code === 'quota');
  });
  it('se construit depuis les réglages', () => {
    assert.equal(createSource(DEFAULT_SETTINGS).kind, 'demo');
    assert.throws(() => createSource({ ...DEFAULT_SETTINGS, source: 'youtube' }));
    const yt = createSource({ ...DEFAULT_SETTINGS, source: 'youtube', youtubeApiKey: 'K', invidiousInstance: 'inv.test' });
    assert.equal(yt.label, 'YouTube Data API + Invidious (inv.test)');
    // Saisie brute (espaces, sans https, slash final) : nettoyée à l'usage.
    const piped = createSource({ ...DEFAULT_SETTINGS, source: 'piped', pipedInstance: '  pipedapi.adminforge.de/ ' });
    assert.equal(piped.label, 'Piped (pipedapi.adminforge.de)');
  });
});

describe('vidéos similaires', () => {
  it('extrait un sujet du titre ou des tags', () => {
    assert.equal(topicQuery({ title: 'Traversée des Alpes à vélo (Official Video) #shorts', channelName: 'X' }), 'Traversée Alpes vélo');
    assert.equal(topicQuery({ title: 'peu importe', channelName: 'X', keywords: ['bikepacking', 'eurovelo', 'X'] }), 'bikepacking eurovelo');
  });
  it('fusionne en alternant sans doublon ni vidéo courante', () => {
    const out = mergeSimilar(
      { related: [v({ id: 'cur' }), v({ id: 'r1' }), v({ id: 'r2' })], channel: [v({ id: 'r1' }), v({ id: 'c1' })], topic: [v({ id: 't1' })] },
      'cur',
    );
    assert.deepEqual(out.map((x) => `${x.id}:${x.reason}`), ['r1:related', 't1:topic', 'r2:related', 'c1:channel']);
  });
  it('ne propose jamais de Shorts (démo)', async () => {
    const src = new DemoSource(DEMO_VIDEOS, 0);
    const details = await src.getDetails('demo-sintel');
    const { items, failures } = await findSimilar(src, details, { thresholdSec: 60 });
    assert.equal(failures, 0);
    assert.ok(items.length > 0);
    assert.ok(items.every((x) => !x.id.startsWith('demo-short') && x.id !== 'demo-sintel'));
    assert.ok(items.some((x) => x.reason === 'channel'));
  });
});
