import * as SQLite from 'expo-sqlite';

/**
 * Base SQLite locale. Les migrations sont versionnées via PRAGMA user_version :
 * ajouter une entrée à MIGRATIONS suffit pour faire évoluer le schéma.
 */
const MIGRATIONS: string[] = [
  // v1 — schéma initial
  `
  CREATE TABLE IF NOT EXISTS videos (
    id            TEXT PRIMARY KEY NOT NULL,
    title         TEXT NOT NULL,
    channel_name  TEXT NOT NULL,
    channel_id    TEXT,
    thumbnail     TEXT,
    duration_sec  INTEGER,
    published_at  TEXT,
    published_text TEXT,
    view_count    INTEGER,
    width         INTEGER,
    height        INTEGER,
    source        TEXT,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    video_id      TEXT PRIMARY KEY NOT NULL,
    position_sec  REAL NOT NULL DEFAULT 0,
    duration_sec  REAL,
    watched_at    INTEGER NOT NULL,
    completed     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_watch_history_at ON watch_history(watched_at DESC);

  CREATE TABLE IF NOT EXISTS search_history (
    query         TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
    searched_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_search_history_at ON search_history(searched_at DESC);

  CREATE TABLE IF NOT EXISTS downloads (
    video_id      TEXT PRIMARY KEY NOT NULL,
    status        TEXT NOT NULL,
    file_uri      TEXT,
    thumb_uri     TEXT,
    size_bytes    INTEGER,
    quality       TEXT,
    mime_type     TEXT,
    progress      REAL NOT NULL DEFAULT 0,
    error         TEXT,
    created_at    INTEGER NOT NULL,
    completed_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key           TEXT PRIMARY KEY NOT NULL,
    value         TEXT NOT NULL
  );
  `,
  // v2 — téléchargement vidéo ou audio seul
  `ALTER TABLE downloads ADD COLUMN kind TEXT NOT NULL DEFAULT 'video';`,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((e) => {
      dbPromise = null; // permet un nouvel essai
      throw e;
    });
  }
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('yourowntube.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  return db;
}
