/**
 * Home Ingestor — Unified Home Feed amendment.
 *
 * Pulls the rider's recent Strava activities and ensures every one of them
 * exists as a `rides` row, so Home can present a unified feed regardless of
 * whether Veloscape coached the ride.
 *
 * Public API:
 *   - ingestRecentActivities(accessToken, riderId, opts?)
 *       → fetches the last 30 days of Strava activities, dedupes against
 *         existing rides (by stravaActivityId), writes new rows, backfills
 *         segment efforts for up to 15 newly-ingested rides per run.
 *
 * Coexists with stravaReconciler:
 *   - The reconciler binds a *just-finished provisional ride* to an inbound
 *     Strava activity. Those rides already have stravaActivityId set after
 *     match, so this ingestor's dedup filter skips them.
 *   - The ingestor only inserts rides where no rides row already references
 *     that stravaActivityId.
 */

import { sql, eq, and, gte, isNotNull, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { rides, segmentEfforts, segments, cachedActivities, riders } from '../db/schema';
import { useAuthStore } from '../store/authStore';
import {
  getActivityDetail,
  type StravaActivityListItem,
  type StravaDetailedActivity,
} from './stravaApi';

const WINDOW_DAYS = 30;
const DETAIL_FETCH_CAP_PER_RUN = 15;
const BASE = 'https://www.strava.com/api/v3';

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchActivitiesWindow(
  accessToken: string,
  afterSec: number,
): Promise<StravaActivityListItem[]> {
  const res = await fetch(
    `${BASE}/athlete/activities?after=${afterSec}&per_page=30&page=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 401) throw new Error('STRAVA_TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Strava activities fetch failed (${res.status})`);
  return (await res.json()) as StravaActivityListItem[];
}

export interface IngestResult {
  inserted: number;
  detailsFetched: number;
  skippedExisting: number;
}

/**
 * Guarantee a local riders row exists for this riderId so FK constraints on
 * rides + segment_efforts don't blow up. Idempotent.
 */
function ensureRiderRow(riderId: string): void {
  const existing = db.select({ id: riders.id }).from(riders).where(eq(riders.id, riderId)).get();
  if (existing) return;
  const rider = useAuthStore.getState().rider;
  const nowSec = Math.floor(Date.now() / 1000);
  db.insert(riders)
    .values({
      id: riderId,
      stravaAthleteId: rider?.stravaAthleteId ?? 'unknown',
      name: rider?.name ?? 'Rider',
      avatarUrl: rider?.avatarUrl ?? null,
      createdAt: nowSec,
      updatedAt: nowSec,
    })
    .onConflictDoNothing()
    .run();
}

export interface IngestOptions {
  /** Fires after the list-phase write completes, before slow detail backfill */
  onListIngested?: () => void;
}

export async function ingestRecentActivities(
  accessToken: string,
  riderId: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  ensureRiderRow(riderId);
  const nowSec = Math.floor(Date.now() / 1000);
  const afterSec = nowSec - WINDOW_DAYS * 86400;

  let list: StravaActivityListItem[];
  try {
    list = await fetchActivitiesWindow(accessToken, afterSec);
  } catch (err: any) {
    // Surface auth errors so the caller can refresh + retry; eat the rest.
    if (String(err?.message ?? '').includes('TOKEN_EXPIRED')) throw err;
    console.warn('[ingestor] activities fetch failed:', err);
    return { inserted: 0, detailsFetched: 0, skippedExisting: 0 };
  }

  // Filter to ride-type activities (drop runs, swims, etc.)
  const rideActivities = list.filter(
    (a) => a.type === 'Ride' || a.type === 'VirtualRide',
  );

  // Existing rides in this window keyed by stravaActivityId
  const existing = db
    .select({ stravaId: rides.stravaActivityId })
    .from(rides)
    .where(
      and(
        eq(rides.riderId, riderId),
        isNotNull(rides.stravaActivityId),
        gte(rides.startedAt, afterSec),
      ),
    )
    .all();
  const existingSet = new Set(
    existing.map((r) => r.stravaId).filter((v): v is string => v !== null),
  );

  let inserted = 0;
  let skippedExisting = 0;
  const newRideIds: Array<{ rideId: string; stravaActivityId: number; hasPolyline: boolean }> = [];

  for (const a of rideActivities) {
    if (existingSet.has(String(a.id))) {
      skippedExisting++;
      continue;
    }
    const rideId = genId();
    const startedAtSec = Math.floor(new Date(a.start_date).getTime() / 1000);
    db.insert(rides)
      .values({
        id: rideId,
        riderId,
        name: a.name || 'Ride',
        startedAt: startedAtSec,
        endedAt: startedAtSec + (a.elapsed_time ?? a.moving_time ?? 0),
        distanceM: a.distance ?? 0,
        elevationM: a.total_elevation_gain ?? 0,
        avgHrBpm: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        avgWatts: a.average_watts ? Math.round(a.average_watts) : null,
        gpxTrack: null,
        stravaActivityId: String(a.id),
        stravaSynced: true,
        goalMode: 'training',
        createdAt: nowSec,
        dataSource: 'strava',
        importedFromStrava: false,
        coachedBySherpaa: false,
      })
      .run();
    inserted++;
    // We only attempt detail fetch (for segment efforts) on rides — defer to next loop, capped.
    newRideIds.push({
      rideId,
      stravaActivityId: a.id,
      hasPolyline: false, // list endpoint doesn't include polyline; we don't gate on it here
    });
  }

  // Basic rows are now in SQLite — let the UI re-render immediately while
  // the slow detail backfill continues in the background.
  options?.onListIngested?.();

  // Backfill segment_efforts for up to DETAIL_FETCH_CAP_PER_RUN newly ingested rides.
  let detailsFetched = 0;
  for (const item of newRideIds) {
    if (detailsFetched >= DETAIL_FETCH_CAP_PER_RUN) break;
    try {
      const detail = await getActivityDetail(item.stravaActivityId, accessToken);
      detailsFetched++;
      await backfillSegmentEfforts(item.rideId, riderId, detail);
      // Also update cached_activities row if present (for richer summaries later)
      upsertCachedActivityFromDetail(detail);
    } catch (err) {
      console.warn('[ingestor] activity detail failed for', item.stravaActivityId, err);
    }
  }

  return { inserted, detailsFetched, skippedExisting };
}

async function backfillSegmentEfforts(
  rideId: string,
  riderId: string,
  detail: StravaDetailedActivity,
): Promise<void> {
  const efforts = detail.segment_efforts ?? [];
  if (efforts.length === 0) return;
  const nowSec = Math.floor(Date.now() / 1000);
  for (const eff of efforts) {
    const seg = db
      .select()
      .from(segments)
      .where(eq(segments.stravaSegmentId, String(eff.segment.id)))
      .get();
    if (!seg) continue; // only persist efforts on starred segments we track
    db.insert(segmentEfforts)
      .values({
        id: genId(),
        segmentId: seg.id,
        rideId,
        riderId,
        timeSec: eff.elapsed_time,
        avgWatts: eff.average_watts ? Math.round(eff.average_watts) : null,
        avgHrBpm: eff.average_heartrate ? Math.round(eff.average_heartrate) : null,
        wasSkipped: false,
        isNewPR: false,
        gapToPreSeconds: 0,
        createdAt: nowSec,
      })
      .run();
  }
}

export function upsertCachedActivityFromDetail(detail: StravaDetailedActivity): void {
  const now = Math.floor(Date.now() / 1000);
  db.insert(cachedActivities)
    .values({
      stravaId: detail.id,
      name: detail.name,
      distance: detail.distance,
      movingTime: detail.moving_time,
      startDate: detail.start_date,
      summaryPolyline: detail.map?.summary_polyline ?? '',
      fetchedAt: now,
      totalElevationGain: detail.total_elevation_gain ?? 0,
      averageHeartrate: detail.average_heartrate ? Math.round(detail.average_heartrate) : null,
      averageWatts: detail.average_watts ? Math.round(detail.average_watts) : null,
      activityType: detail.type || 'Ride',
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
        totalElevationGain: sql`excluded.total_elevation_gain`,
        averageHeartrate: sql`excluded.average_heartrate`,
        averageWatts: sql`excluded.average_watts`,
        activityType: sql`excluded.activity_type`,
      },
    })
    .run();
}

/** Load the Home feed: every ride in the 30-day window, ordered newest first. */
export function loadHomeFeed(riderId: string): typeof rides.$inferSelect[] {
  const cutoff = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  return db
    .select()
    .from(rides)
    .where(and(eq(rides.riderId, riderId), gte(rides.startedAt, cutoff)))
    .orderBy(desc(rides.startedAt))
    .all();
}
