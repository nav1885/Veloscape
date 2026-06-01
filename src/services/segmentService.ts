/**
 * Reads starred segments from SQLite and enriches them with effort stats.
 * Used by Home / Quick-Start and anywhere segments need to be listed.
 */

import { desc, eq, min, count } from 'drizzle-orm';
import { db } from '../db/client';
import { segments, segmentEfforts, pacingModels } from '../db/schema';
import { Segment } from '../store/segmentStore';

export async function loadStarredSegments(): Promise<Segment[]> {
  // Load all starred segments
  const rows = db
    .select()
    .from(segments)
    .where(eq(segments.isStarred, true))
    .all();

  if (rows.length === 0) return [];

  // For each segment, get effort stats
  const results: Segment[] = await Promise.all(
    rows.map(async (seg) => {
      const efforts = db
        .select({
          count: count(),
          bestTime: min(segmentEfforts.timeSec),
        })
        .from(segmentEfforts)
        .where(eq(segmentEfforts.segmentId, seg.id))
        .get();

      const pacing = db
        .select({ tendency: pacingModels.tendency })
        .from(pacingModels)
        .where(eq(pacingModels.segmentId, seg.id))
        .get();

      const effortCount = efforts?.count ?? 0;
      const bestTimeSec = efforts?.bestTime ?? null;

      return {
        id: seg.id,
        stravaSegmentId: seg.stravaSegmentId,
        name: seg.name,
        distanceM: seg.distanceM,
        elevationM: seg.elevationM,
        startLat: seg.startLat,
        startLng: seg.startLng,
        endLat: seg.endLat,
        endLng: seg.endLng,
        polyline: seg.polyline,
        isStarred: seg.isStarred,
        effortCount,
        bestTimeSec,
        avgTimeSec: null, // computed separately if needed
        pacingTendency: (pacing?.tendency ?? 'unknown') as Segment['pacingTendency'],
      };
    }),
  );

  return results;
}

/** Count of all starred segments in the DB. */
export function getStarredSegmentCount(): number {
  const result = db
    .select({ count: count() })
    .from(segments)
    .where(eq(segments.isStarred, true))
    .get();
  return result?.count ?? 0;
}
