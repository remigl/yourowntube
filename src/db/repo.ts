import { isCompleted } from '../core/playback';
import type { SourceKind, VideoSummary } from '../core/types';
import { dataEvents } from '../lib/emitter';
import { getDb } from './database';

/* ───────────────────────────── Vidéos (cache de métadonnées) ───────────────────────────── */

interface VideoRow {
  id: string;
  title: string;
  channel_name: string;
  channel_id: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  published_at: string | null;
  published_text: string | null;
  view_count: number | null;
  width: number | null;
  height: number | null;
}

const VIDEO_COLUMNS =
  'v.id, v.title, v.channel_name, v.channel_id, v.thumbnail, v.duration_sec, v.published_at, v.published_text, v.view_count, v.width, v.height';

function rowToVideo(r: VideoRow): VideoSummary {
  return {
    id: r.id,
    title: r.title,
    channelName: r.channel_name,
    channelId: r.channel_id ?? undefined,
    thumbnail: r.thumbnail ?? '',
    durationSec: r.duration_sec,
    publishedAt: r.published_at ?? undefined,
    publishedText: r.published_text ?? undefined,
    viewCount: r.view_count ?? undefined,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
  };
}

/** Mémorise les métadonnées d'une vidéo (historique et bibliothèque hors ligne). */
export async function upsertVideo(v: VideoSummary, source?: SourceKind): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO videos (id, title, channel_name, channel_id, thumbnail, duration_sec, published_at, published_text,
                         view_count, width, height, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       channel_name = excluded.channel_name,
       channel_id = COALESCE(excluded.channel_id, videos.channel_id),
       thumbnail = COALESCE(excluded.thumbnail, videos.thumbnail),
       duration_sec = COALESCE(excluded.duration_sec, videos.duration_sec),
       published_at = COALESCE(excluded.published_at, videos.published_at),
       published_text = COALESCE(excluded.published_text, videos.published_text),
       view_count = COALESCE(excluded.view_count, videos.view_count),
       width = COALESCE(excluded.width, videos.width),
       height = COALESCE(excluded.height, videos.height),
       source = COALESCE(excluded.source, videos.source),
       updated_at = excluded.updated_at`,
    [
      v.id,
      v.title,
      v.channelName,
      v.channelId ?? null,
      v.thumbnail || null,
      v.durationSec,
      v.publishedAt ?? null,
      v.publishedText ?? null,
      v.viewCount ?? null,
      v.width ?? null,
      v.height ?? null,
      source ?? null,
      Date.now(),
    ],
  );
}

export async function getCachedVideo(id: string): Promise<VideoSummary | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<VideoRow>(`SELECT ${VIDEO_COLUMNS} FROM videos v WHERE v.id = ?`, [id]);
  return r ? rowToVideo(r) : null;
}

/* ───────────────────────────── Historique de visionnage ───────────────────────────── */

export interface WatchEntry {
  video: VideoSummary;
  positionSec: number;
  durationSec: number | null;
  watchedAt: number;
  completed: boolean;
}

export async function recordProgress(videoId: string, positionSec: number, durationSec: number | null): Promise<void> {
  const db = await getDb();
  const done = isCompleted(positionSec, durationSec) ? 1 : 0;
  await db.runAsync(
    `INSERT INTO watch_history (video_id, position_sec, duration_sec, watched_at, completed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       position_sec = excluded.position_sec,
       duration_sec = COALESCE(excluded.duration_sec, watch_history.duration_sec),
       watched_at = excluded.watched_at,
       completed = excluded.completed`,
    [videoId, positionSec, durationSec, Date.now(), done],
  );
  dataEvents.emit('history');
}

export async function getProgress(videoId: string): Promise<{ positionSec: number; durationSec: number | null } | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ position_sec: number; duration_sec: number | null }>(
    'SELECT position_sec, duration_sec FROM watch_history WHERE video_id = ?',
    [videoId],
  );
  return r ? { positionSec: r.position_sec, durationSec: r.duration_sec } : null;
}

type WatchRow = VideoRow & { position_sec: number; h_duration: number | null; watched_at: number; completed: number };

function rowToWatch(r: WatchRow): WatchEntry {
  return {
    video: rowToVideo(r),
    positionSec: r.position_sec,
    durationSec: r.h_duration ?? r.duration_sec,
    watchedAt: r.watched_at,
    completed: r.completed === 1,
  };
}

export async function listWatchHistory(opts: { limit?: number; inProgressOnly?: boolean } = {}): Promise<WatchEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WatchRow>(
    `SELECT ${VIDEO_COLUMNS}, h.position_sec, h.duration_sec AS h_duration, h.watched_at, h.completed
       FROM watch_history h JOIN videos v ON v.id = h.video_id
      ${opts.inProgressOnly ? 'WHERE h.completed = 0 AND h.position_sec >= 5' : ''}
      ORDER BY h.watched_at DESC
      LIMIT ?`,
    [opts.limit ?? 500],
  );
  return rows.map(rowToWatch);
}

export async function deleteWatchEntry(videoId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watch_history WHERE video_id = ?', [videoId]);
  dataEvents.emit('history');
}

export async function clearWatchHistory(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watch_history');
  dataEvents.emit('history');
}

/* ───────────────────────────── Historique de recherche ───────────────────────────── */

export interface SearchEntry {
  query: string;
  searchedAt: number;
}

export async function addSearch(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO search_history (query, searched_at) VALUES (?, ?)
     ON CONFLICT(query) DO UPDATE SET searched_at = excluded.searched_at`,
    [q, Date.now()],
  );
  // On garde les 200 dernières recherches.
  await db.runAsync(
    'DELETE FROM search_history WHERE query NOT IN (SELECT query FROM search_history ORDER BY searched_at DESC LIMIT 200)',
  );
  dataEvents.emit('searches');
}

export async function listSearches(limit = 50): Promise<SearchEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ query: string; searched_at: number }>(
    'SELECT query, searched_at FROM search_history ORDER BY searched_at DESC LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({ query: r.query, searchedAt: r.searched_at }));
}

export async function deleteSearch(query: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM search_history WHERE query = ?', [query]);
  dataEvents.emit('searches');
}

export async function clearSearches(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM search_history');
  dataEvents.emit('searches');
}

/* ───────────────────────────── Téléchargements ───────────────────────────── */

export type DownloadStatus = 'downloading' | 'done' | 'error';

export interface DownloadEntry {
  video: VideoSummary;
  status: DownloadStatus;
  fileUri: string | null;
  thumbUri: string | null;
  sizeBytes: number | null;
  quality: string | null;
  mimeType: string | null;
  progress: number;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

type DownloadRow = VideoRow & {
  status: DownloadStatus;
  file_uri: string | null;
  thumb_uri: string | null;
  size_bytes: number | null;
  quality: string | null;
  mime_type: string | null;
  progress: number;
  error: string | null;
  created_at: number;
  completed_at: number | null;
};

function rowToDownload(r: DownloadRow): DownloadEntry {
  return {
    video: rowToVideo(r),
    status: r.status,
    fileUri: r.file_uri,
    thumbUri: r.thumb_uri,
    sizeBytes: r.size_bytes,
    quality: r.quality,
    mimeType: r.mime_type,
    progress: r.progress,
    error: r.error,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

const DOWNLOAD_SELECT = `SELECT ${VIDEO_COLUMNS}, d.status, d.file_uri, d.thumb_uri, d.size_bytes, d.quality, d.mime_type,
                                d.progress, d.error, d.created_at, d.completed_at
                           FROM downloads d JOIN videos v ON v.id = d.video_id`;

export async function getDownload(videoId: string): Promise<DownloadEntry | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<DownloadRow>(`${DOWNLOAD_SELECT} WHERE d.video_id = ?`, [videoId]);
  return r ? rowToDownload(r) : null;
}

export async function listDownloads(): Promise<DownloadEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DownloadRow>(
    `${DOWNLOAD_SELECT} ORDER BY (d.status = 'done') ASC, COALESCE(d.completed_at, d.created_at) DESC`,
  );
  return rows.map(rowToDownload);
}

export async function saveDownload(
  videoId: string,
  patch: Partial<{
    status: DownloadStatus;
    fileUri: string | null;
    thumbUri: string | null;
    sizeBytes: number | null;
    quality: string | null;
    mimeType: string | null;
    progress: number;
    error: string | null;
    completedAt: number | null;
  }>,
  emit = true,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO downloads (video_id, status, progress, created_at) VALUES (?, ?, 0, ?)
     ON CONFLICT(video_id) DO NOTHING`,
    [videoId, patch.status ?? 'downloading', Date.now()],
  );
  const map: Record<string, string> = {
    status: 'status',
    fileUri: 'file_uri',
    thumbUri: 'thumb_uri',
    sizeBytes: 'size_bytes',
    quality: 'quality',
    mimeType: 'mime_type',
    progress: 'progress',
    error: 'error',
    completedAt: 'completed_at',
  };
  const keys = Object.keys(patch).filter((k) => k in map) as (keyof typeof patch)[];
  if (keys.length > 0) {
    await db.runAsync(
      `UPDATE downloads SET ${keys.map((k) => `${map[k]} = ?`).join(', ')} WHERE video_id = ?`,
      [...keys.map((k) => (patch[k] ?? null) as string | number | null), videoId],
    );
  }
  if (emit) dataEvents.emit('downloads');
}

export async function deleteDownloadRows(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;
  const db = await getDb();
  await db.runAsync(`DELETE FROM downloads WHERE video_id IN (${videoIds.map(() => '?').join(',')})`, videoIds);
  dataEvents.emit('downloads');
}

export async function downloadStats(): Promise<{ count: number; totalBytes: number }> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ count: number; total: number | null }>(
    "SELECT COUNT(*) AS count, SUM(size_bytes) AS total FROM downloads WHERE status = 'done'",
  );
  return { count: r?.count ?? 0, totalBytes: r?.total ?? 0 };
}

/* ───────────────────────────── Réglages ───────────────────────────── */

export async function loadSettingRows(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveSettingRows(entries: Record<string, string>): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(entries)) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [k, v],
      );
    }
  });
  dataEvents.emit('settings');
}

/** Efface les métadonnées en cache qui ne sont plus référencées. */
export async function pruneOrphanVideos(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM videos WHERE id NOT IN (SELECT video_id FROM watch_history)
                          AND id NOT IN (SELECT video_id FROM downloads)`,
  );
}
