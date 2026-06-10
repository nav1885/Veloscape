import { db } from './client';
import { sql } from 'drizzle-orm';

/**
 * Run on app startup. Creates all tables if they don't exist.
 * Uses IF NOT EXISTS so it's safe to call on every launch.
 */
export async function runMigrations(): Promise<void> {
  await db.run(sql`PRAGMA journal_mode = WAL`);
  await db.run(sql`PRAGMA foreign_keys = ON`);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS riders (
      id TEXT PRIMARY KEY,
      strava_athlete_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      subscription_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      strava_segment_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      distance_m REAL NOT NULL,
      elevation_m REAL NOT NULL DEFAULT 0,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL NOT NULL,
      end_lng REAL NOT NULL,
      polyline TEXT,
      is_starred INTEGER NOT NULL DEFAULT 1,
      last_fetched_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_segments_strava_id ON segments(strava_segment_id)
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL REFERENCES riders(id),
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      distance_m REAL NOT NULL,
      elevation_m REAL NOT NULL DEFAULT 0,
      avg_hr_bpm INTEGER,
      avg_watts INTEGER,
      gpx_track TEXT,
      strava_activity_id TEXT,
      strava_synced INTEGER NOT NULL DEFAULT 0,
      debrief_text TEXT,
      goal_mode TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS segment_efforts (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL REFERENCES segments(id),
      ride_id TEXT NOT NULL REFERENCES rides(id),
      rider_id TEXT NOT NULL REFERENCES riders(id),
      time_sec INTEGER NOT NULL,
      avg_watts INTEGER,
      avg_hr_bpm INTEGER,
      was_skipped INTEGER NOT NULL DEFAULT 0,
      split_25_gap_sec INTEGER,
      split_50_gap_sec INTEGER,
      split_75_gap_sec INTEGER,
      cue_variant_played TEXT,
      cue_text_played TEXT,
      is_new_pr INTEGER NOT NULL DEFAULT 0,
      gap_to_pre_seconds INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_efforts_segment_id ON segment_efforts(segment_id)
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_efforts_ride_id ON segment_efforts(ride_id)
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_efforts_rider_id ON segment_efforts(rider_id)
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS cues (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL REFERENCES segments(id),
      goal_mode TEXT NOT NULL,
      aggressive TEXT NOT NULL,
      moderate TEXT NOT NULL,
      recovery TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cues_segment_goal ON cues(segment_id, goal_mode)
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS cached_activities (
      strava_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      distance REAL NOT NULL,
      moving_time INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      summary_polyline TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS pacing_models (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL UNIQUE REFERENCES segments(id),
      tendency TEXT NOT NULL DEFAULT 'unknown',
      confidence_score REAL NOT NULL DEFAULT 0,
      effort_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);

  // v2: Add detail_fetched_at to segments for staleness-gated caching
  try {
    await db.run(sql`ALTER TABLE segments ADD COLUMN detail_fetched_at INTEGER`);
    console.log('[migrations] added detail_fetched_at column');
  } catch (e) {
    console.log('[migrations] detail_fetched_at already exists or error:', e);
  }

  // v3: Phone-as-Coach amendment — Strava reconciliation state + cue log
  try {
    await db.run(sql`ALTER TABLE rides ADD COLUMN data_source TEXT NOT NULL DEFAULT 'provisional'`);
    console.log('[migrations] added rides.data_source');
  } catch (e) {
    console.log('[migrations] rides.data_source already exists');
  }
  try {
    await db.run(sql`ALTER TABLE rides ADD COLUMN imported_from_strava INTEGER NOT NULL DEFAULT 0`);
    console.log('[migrations] added rides.imported_from_strava');
  } catch (e) {
    console.log('[migrations] rides.imported_from_strava already exists');
  }
  try {
    await db.run(sql`ALTER TABLE rides ADD COLUMN last_reconcile_attempt_at INTEGER`);
    console.log('[migrations] added rides.last_reconcile_attempt_at');
  } catch (e) {
    console.log('[migrations] rides.last_reconcile_attempt_at already exists');
  }

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS cue_log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id TEXT NOT NULL REFERENCES rides(id),
      segment_id TEXT NOT NULL,
      cue_type TEXT NOT NULL,
      variant TEXT,
      text TEXT NOT NULL,
      fired_at INTEGER NOT NULL
    )
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_cue_log_ride_id ON cue_log_entries(ride_id)
  `);

  // v4: Unified Home Feed amendment — coached flag + summary metadata + activity metrics
  for (const stmt of [
    sql`ALTER TABLE rides ADD COLUMN coached_by_sherpaa INTEGER NOT NULL DEFAULT 0`,
    sql`ALTER TABLE rides ADD COLUMN summary_generated_at INTEGER`,
    sql`ALTER TABLE rides ADD COLUMN summary_model TEXT`,
    sql`ALTER TABLE cached_activities ADD COLUMN total_elevation_gain REAL NOT NULL DEFAULT 0`,
    sql`ALTER TABLE cached_activities ADD COLUMN average_heartrate INTEGER`,
    sql`ALTER TABLE cached_activities ADD COLUMN average_watts INTEGER`,
    sql`ALTER TABLE cached_activities ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'Ride'`,
  ]) {
    try {
      await db.run(stmt);
    } catch {
      // Column already exists — migrations are idempotent
    }
  }

  // Backfill: pre-amendment rides with cue_log entries are coached. Use a single
  // UPDATE that flips coached_by_sherpaa for any ride with ≥1 cue log row.
  await db.run(sql`
    UPDATE rides SET coached_by_sherpaa = 1
    WHERE id IN (SELECT DISTINCT ride_id FROM cue_log_entries)
      AND coached_by_sherpaa = 0
  `);

  // v5: deferred summary for a ride ended in the background (lock-screen End) — its
  // summary is shown on next app open. Track whether it's been seen yet. ONE-TIME
  // backfill marks all pre-existing rides as viewed so the launch router only ever
  // surfaces a genuinely new backgrounded-ended ride, never historical rides.
  let summaryViewedJustAdded = false;
  try {
    await db.run(sql`ALTER TABLE rides ADD COLUMN summary_viewed INTEGER NOT NULL DEFAULT 0`);
    summaryViewedJustAdded = true;
  } catch {
    // Column already exists — idempotent
  }
  if (summaryViewedJustAdded) {
    await db.run(sql`UPDATE rides SET summary_viewed = 1`);
  }
}
