/**
 * Strava Reconciler — Phone-as-Coach amendment.
 *
 * Matches in-flight `provisional` rides against authoritative Strava activities
 * from the rider's head unit, then upgrades the local SQLite row in place.
 *
 * Three entry points:
 *   - startReconciliation(rideId, startedAtMs, token) → in-session polling handle
 *   - reconcileOnLaunch(token) → one-shot scan on app foreground
 *   - forceReconcileOnce(rideId, token) → manual "Check again"
 *
 * Plus remapRideToActivity(rideId, stravaActivityId, token) for "Wrong activity?".
 */

import { eq, and, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { rides } from '../db/schema';
import {
  getActivitiesInWindow,
  getActivityDetail,
  type StravaActivityListItem,
  type StravaDetailedActivity,
} from './stravaApi';
import { upgradeRideToStrava } from './rideService';

const MATCH_WINDOW_MS = 10 * 60 * 1000;    // ±10 min on start time
const ACTIVITY_QUERY_PRE_MS = 15 * 60 * 1000; // pull window: ride.startedAt − 15 min
const ACTIVITY_QUERY_POST_MS = 30 * 60 * 1000; // ride.startedAt + 30 min

// In-session back-off schedule (per amendment): 30s × 10, then 60s × 15 (~20 min)
const POLL_SCHEDULE_MS: number[] = [
  ...Array(10).fill(30_000),
  ...Array(15).fill(60_000),
];

const LAUNCH_RIDES_CAP = 5;

export interface ReconcilerHandle {
  stop: () => void;
}

// ─── Match logic ─────────────────────────────────────────────────────────────

function pickMatchingActivity(
  list: StravaActivityListItem[],
  rideStartedAtMs: number,
): StravaActivityListItem | null {
  const eligible = list.filter(
    (a) => a.type === 'Ride' || a.type === 'VirtualRide',
  );
  for (const a of eligible) {
    const delta = Math.abs(new Date(a.start_date).getTime() - rideStartedAtMs);
    if (delta <= MATCH_WINDOW_MS) return a;
  }
  return null;
}

async function tryMatchOnce(
  rideId: string,
  rideStartedAtMs: number,
  accessToken: string,
): Promise<{ matched: boolean; activity?: StravaDetailedActivity }> {
  const afterSec = Math.floor((rideStartedAtMs - ACTIVITY_QUERY_PRE_MS) / 1000);
  const beforeSec = Math.floor((rideStartedAtMs + ACTIVITY_QUERY_POST_MS) / 1000);

  let list: StravaActivityListItem[];
  try {
    list = await getActivitiesInWindow(afterSec, beforeSec, accessToken);
  } catch (err) {
    console.warn('[reconciler] activities fetch failed:', err);
    return { matched: false };
  }

  const match = pickMatchingActivity(list, rideStartedAtMs);
  if (!match) {
    db.update(rides)
      .set({ lastReconcileAttemptAt: Math.floor(Date.now() / 1000) })
      .where(eq(rides.id, rideId))
      .run();
    return { matched: false };
  }

  try {
    const detail = await getActivityDetail(match.id, accessToken);
    await upgradeRideToStrava(rideId, detail);
    return { matched: true, activity: detail };
  } catch (err) {
    console.warn('[reconciler] activity detail fetch failed:', err);
    return { matched: false };
  }
}

// ─── In-session polling ──────────────────────────────────────────────────────

export function startReconciliation(
  rideId: string,
  rideStartedAtMs: number,
  accessToken: string,
  onResolved?: () => void,
): ReconcilerHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scheduleIdx = 0;

  const tick = async () => {
    if (cancelled) return;
    const { matched } = await tryMatchOnce(rideId, rideStartedAtMs, accessToken);
    if (cancelled) return;
    if (matched) {
      onResolved?.();
      return;
    }
    if (scheduleIdx >= POLL_SCHEDULE_MS.length) return;
    const delay = POLL_SCHEDULE_MS[scheduleIdx++];
    timer = setTimeout(tick, delay);
  };

  // First attempt fires after 30s (or however the first slot is set)
  const firstDelay = POLL_SCHEDULE_MS[scheduleIdx++];
  timer = setTimeout(tick, firstDelay);

  return {
    stop: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

// ─── Manual "Check again" ────────────────────────────────────────────────────

export async function forceReconcileOnce(
  rideId: string,
  accessToken: string,
): Promise<'matched' | 'no-match' | 'error'> {
  const ride = db.select().from(rides).where(eq(rides.id, rideId)).get();
  if (!ride) return 'error';
  try {
    const { matched } = await tryMatchOnce(rideId, ride.startedAt * 1000, accessToken);
    return matched ? 'matched' : 'no-match';
  } catch {
    return 'error';
  }
}

// ─── Launch-time scan ────────────────────────────────────────────────────────

export async function reconcileOnLaunch(
  accessToken: string,
): Promise<{ reconciledRideIds: string[] }> {
  const launchTimeSec = Math.floor(Date.now() / 1000);

  // Find provisional rides that haven't been attempted this launch
  const candidates = db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.dataSource, 'provisional'),
        isNull(rides.stravaActivityId),
        or(
          isNull(rides.lastReconcileAttemptAt),
          lt(rides.lastReconcileAttemptAt, launchTimeSec),
        ),
      ),
    )
    .orderBy(sql`${rides.startedAt} DESC`)
    .limit(LAUNCH_RIDES_CAP)
    .all();

  const reconciledRideIds: string[] = [];
  for (const ride of candidates) {
    const { matched } = await tryMatchOnce(ride.id, ride.startedAt * 1000, accessToken);
    if (matched) reconciledRideIds.push(ride.id);
  }
  return { reconciledRideIds };
}

// ─── Manual re-map ───────────────────────────────────────────────────────────

export async function remapRideToActivity(
  rideId: string,
  stravaActivityId: number,
  accessToken: string,
): Promise<void> {
  const detail = await getActivityDetail(stravaActivityId, accessToken);
  await upgradeRideToStrava(rideId, detail);
}

export async function unmapRide(rideId: string): Promise<void> {
  db.update(rides)
    .set({
      stravaActivityId: null,
      stravaSynced: false,
      dataSource: 'provisional',
    })
    .where(eq(rides.id, rideId))
    .run();
}
