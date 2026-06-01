/**
 * Activity caching layer.
 *
 * - `getCachedActivities()` reads from SQLite — instant, offline-safe
 * - `refreshActivities(token)` fetches from Strava, upserts into SQLite,
 *   and returns the updated list. Only fetches activities newer than the
 *   most recent cached one (incremental).
 */

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { cachedActivities } from '../db/schema';
import { StravaActivitySummary } from './stravaApi';

const BASE = 'https://www.strava.com/api/v3';

/**
 * Encoded Strava summary polyline for a single cached activity (by Strava id),
 * or null if not cached / no map. Used to draw the route for Strava-sourced
 * rides that have no phone `gpxTrack`. Queries by id (not limited to recents).
 */
export function getActivitySummaryPolyline(stravaId: number): string | null {
  const row = db
    .select({ p: cachedActivities.summaryPolyline })
    .from(cachedActivities)
    .where(eq(cachedActivities.stravaId, stravaId))
    .get();
  return row?.p && row.p.length > 0 ? row.p : null;
}

export function getCachedActivities(): StravaActivitySummary[] {
  const rows = db
    .select()
    .from(cachedActivities)
    .orderBy(desc(cachedActivities.startDate))
    .limit(10)
    .all();

  return rows.map(r => ({
    id: r.stravaId,
    name: r.name,
    distance: r.distance,
    moving_time: r.movingTime,
    start_date: r.startDate,
    map: { summary_polyline: r.summaryPolyline },
  }));
}

export async function refreshActivities(
  accessToken: string,
  maxResults = 10,
): Promise<StravaActivitySummary[]> {
  // Find the newest cached activity's start date for incremental fetch
  const newest = db
    .select({ startDate: cachedActivities.startDate })
    .from(cachedActivities)
    .orderBy(desc(cachedActivities.startDate))
    .limit(1)
    .get();

  let afterParam = '';
  if (newest) {
    const afterEpoch = Math.floor(new Date(newest.startDate).getTime() / 1000);
    afterParam = `&after=${afterEpoch}`;
  }

  const res = await fetch(
    `${BASE}/athlete/activities?per_page=30&page=1${afterParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) throw new Error(`Strava activities fetch failed (${res.status})`);

  const all = (await res.json()) as StravaActivitySummary[];
  const withRoute = all.filter(a => a.map?.summary_polyline);

  const now = Math.floor(Date.now() / 1000);

  for (const a of withRoute) {
    db.insert(cachedActivities)
      .values({
        stravaId: a.id,
        name: a.name,
        distance: a.distance,
        movingTime: a.moving_time,
        startDate: a.start_date,
        summaryPolyline: a.map.summary_polyline,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cachedActivities.stravaId,
        set: {
          name: sql`excluded.name`,
          distance: sql`excluded.distance`,
          movingTime: sql`excluded.moving_time`,
          startDate: sql`excluded.start_date`,
          summaryPolyline: sql`excluded.summary_polyline`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
      .run();
  }

  return getCachedActivities();
}
