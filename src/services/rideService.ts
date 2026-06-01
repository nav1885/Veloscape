/**
 * Persists ride data and segment efforts to SQLite after a ride ends.
 * Reads from rideStore state (passed in, not subscribed).
 *
 * Phone-as-Coach amendment: rides default to dataSource='provisional'; the
 * Strava reconciler later promotes them in place via upgradeRideToStrava().
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { rides, segmentEfforts, cueLogEntries, segments, riders } from '../db/schema';
import { CompletedSegmentResult, CueLogEntry as ZCueLogEntry } from '../store/rideStore';
import type { StravaDetailedActivity } from './stravaApi';
import { useAuthStore } from '../store/authStore';

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

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface SaveRideInput {
  riderId: string;
  goalMode: 'pr' | 'training' | 'recovery';
  startedAt: number;       // ms timestamp
  endedAt: number;         // ms timestamp
  distanceKm: number;
  elevationM: number;
  completedSegments: CompletedSegmentResult[];
  gpxTrackPoints: Array<{ lat: number; lng: number; timestamp: number }>;
  cueLog?: ZCueLogEntry[];
}

export function saveRide(input: SaveRideInput): string {
  ensureRiderRow(input.riderId);
  const rideId = genId();
  const nowSec = Math.floor(Date.now() / 1000);

  db.insert(rides)
    .values({
      id: rideId,
      riderId: input.riderId,
      name: formatRideName(),
      startedAt: Math.floor(input.startedAt / 1000),
      endedAt: Math.floor(input.endedAt / 1000),
      distanceM: input.distanceKm * 1000,
      elevationM: input.elevationM,
      gpxTrack: JSON.stringify(input.gpxTrackPoints),
      goalMode: input.goalMode,
      createdAt: nowSec,
      dataSource: 'provisional',
      importedFromStrava: false,
      coachedBySherpaa: true,
    })
    .run();

  for (const seg of input.completedSegments) {
    if (seg.wasSkipped) continue;
    db.insert(segmentEfforts)
      .values({
        id: genId(),
        segmentId: seg.segmentId,
        rideId,
        riderId: input.riderId,
        timeSec: seg.timeSec,
        wasSkipped: false,
        isNewPR: seg.isNewPR,
        gapToPreSeconds: seg.gapToPreSeconds,
        createdAt: nowSec,
      })
      .run();
  }

  // Flush cue log
  if (input.cueLog && input.cueLog.length > 0) {
    for (const c of input.cueLog) {
      db.insert(cueLogEntries)
        .values({
          rideId,
          segmentId: c.segmentId,
          cueType: c.cueType,
          variant: c.variant,
          text: c.text,
          firedAt: c.firedAt,
        })
        .run();
    }
  }

  return rideId;
}

/**
 * Atomic in-place upgrade of a provisional ride to Strava-authoritative data.
 * Called by the reconciler (in-session, launch-time, or "Wrong activity?" remap).
 */
export async function upgradeRideToStrava(
  rideId: string,
  activity: StravaDetailedActivity,
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);

  db.update(rides)
    .set({
      stravaActivityId: String(activity.id),
      stravaSynced: true,
      dataSource: 'strava',
      distanceM: activity.distance,
      elevationM: activity.total_elevation_gain ?? 0,
      avgHrBpm: activity.average_heartrate
        ? Math.round(activity.average_heartrate)
        : null,
      avgWatts: activity.average_watts
        ? Math.round(activity.average_watts)
        : null,
      lastReconcileAttemptAt: nowSec,
    })
    .where(eq(rides.id, rideId))
    .run();

  // Overwrite segment effort times for any matching Strava efforts.
  // Strava key: segment.id (number) ↔ our segments.stravaSegmentId (string).
  const efforts = activity.segment_efforts ?? [];
  if (efforts.length === 0) return;

  const localEfforts = db
    .select()
    .from(segmentEfforts)
    .where(eq(segmentEfforts.rideId, rideId))
    .all();

  for (const eff of localEfforts) {
    const seg = db.select().from(segments).where(eq(segments.id, eff.segmentId)).get();
    if (!seg) continue;
    const match = efforts.find((e) => String(e.segment.id) === seg.stravaSegmentId);
    if (!match) continue;
    db.update(segmentEfforts)
      .set({
        timeSec: match.elapsed_time,
        avgWatts: match.average_watts ? Math.round(match.average_watts) : null,
        avgHrBpm: match.average_heartrate ? Math.round(match.average_heartrate) : null,
      })
      .where(eq(segmentEfforts.id, eff.id))
      .run();
  }
}

function formatRideName(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning Ride';
  if (hour < 17) return 'Afternoon Ride';
  return 'Evening Ride';
}

/**
 * Generate a spoken debrief summary from completed segments.
 */
export function generateDebrief(
  completedSegments: CompletedSegmentResult[],
  durationSec: number,
  distanceKm: number,
): string {
  const hit = completedSegments.filter(s => !s.wasSkipped);
  const prs = hit.filter(s => s.isNewPR);
  const total = completedSegments.length;

  const parts: string[] = [];

  if (total === 0) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spokenDistanceKm } = require('../utils/units');
    parts.push(`Ride complete. ${spokenDistanceKm(distanceKm)} in ${Math.round(durationSec / 60)} minutes.`);
    return parts.join(' ');
  }

  parts.push(`Ride complete. You hit ${hit.length} of ${total} segment${total !== 1 ? 's' : ''}.`);

  for (const pr of prs) {
    const time = formatTimeSec(pr.timeSec);
    parts.push(`New PR on ${pr.name}: ${time}, ${Math.abs(pr.gapToPreSeconds)} seconds faster.`);
  }

  const nonPR = hit.filter(s => !s.isNewPR && s.prTimeSec);
  if (nonPR.length > 0) {
    const worst = nonPR.reduce((a, b) => a.gapToPreSeconds > b.gapToPreSeconds ? a : b);
    parts.push(`${worst.name} was ${worst.gapToPreSeconds} seconds off PR.`);
  }

  if (prs.length > 0) parts.push('Strong effort today.');
  else if (hit.length > 0) parts.push('Solid ride. Keep building.');

  return parts.join(' ');
}

function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s} seconds`;
}
