/**
 * Pure segment-proximity logic — no GPS, stores, TTS, or native imports, so it is
 * unit-testable in isolation. The ride engine consumes these to decide when to fire
 * approach cues and when a segment starts.
 */

export const APPROACH_RADIUS_M = 500;
export const SEGMENT_START_RADIUS_M = 40;
export const SEGMENT_END_RADIUS_M = 40;

export type SegmentPhase = 'idle' | 'approach' | 'enter';

/**
 * Classify how close a position is to a segment start:
 *  - 'enter'    inside the start radius (segment begins)
 *  - 'approach' within the approach radius (fire the run-in cue)
 *  - 'idle'     too far to matter
 */
export function segmentPhase(
  distToStartM: number,
  approachRadiusM: number = APPROACH_RADIUS_M,
  startRadiusM: number = SEGMENT_START_RADIUS_M,
): SegmentPhase {
  if (distToStartM < startRadiusM) return 'enter';
  if (distToStartM < approachRadiusM) return 'approach';
  return 'idle';
}

/**
 * Whether an active segment should complete. A direct hit inside the end radius is
 * ideal, but at riding speed with sparse GPS a sample often never lands in the 40 m
 * window — so also complete when the rider clearly approached the end and is now
 * moving away from it ("passed through"). Without this a segment hangs at 100%
 * forever (observed on a real ride).
 */
export function shouldExitSegment(
  distToEndM: number,
  minDistToEndM: number,
  progress: number, // 0..1
  endRadiusM: number = SEGMENT_END_RADIUS_M,
): boolean {
  const hitEnd = distToEndM < endRadiusM;
  const passedEnd =
    progress >= 0.85 &&
    minDistToEndM < 150 &&
    distToEndM > minDistToEndM + endRadiusM;
  return hitEnd || passedEnd;
}
