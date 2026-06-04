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
