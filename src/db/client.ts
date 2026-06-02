import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as schema from './schema';

const DB_NAME = 'veloscape.db';
const LEGACY_DB_NAME = 'sherpaa.db';

// One-time migration (Sherpaa → Veloscape rebrand): rename the legacy SQLite
// file — and its WAL/SHM sidecars — to the new name so existing local data
// (incl. not-yet-synced phone-recorded rides) carries over. The data *is* the
// file, so this is an atomic move, not a copy. Runs before the DB is opened.
// Guarded + best-effort: on failure we just start fresh (it re-syncs from Strava).
try {
  const sqliteDir = new Directory(Paths.document, 'SQLite');
  if (sqliteDir.exists) {
    for (const suffix of ['', '-wal', '-shm']) {
      const legacy = new File(sqliteDir, LEGACY_DB_NAME + suffix);
      const next = new File(sqliteDir, DB_NAME + suffix);
      if (legacy.exists && !next.exists) legacy.move(next);
    }
  }
} catch (e) {
  console.warn('[db] legacy database migration skipped:', e);
}

// Single SQLite connection shared across the app
const sqlite = SQLite.openDatabaseSync(DB_NAME);

export const db = drizzle(sqlite, { schema });

export type DB = typeof db;
