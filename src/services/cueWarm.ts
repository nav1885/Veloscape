/**
 * Background cue pre-generation (Quick-Start Modes amendment).
 *
 * Makes "instant start" honest: after a segment sync we generate LLM cues for
 * the rider's likely mode ahead of time, so a Quick-Start ride finds warm cues
 * instead of falling back to the plain spoken line. Capped per run; fire-and-
 * forget (errors are swallowed by the caller — a cold segment just uses the
 * non-LLM fallback in rideEngine.fireApproachCue).
 */

import { GoalMode } from '../types/goalMode';
import { loadStarredSegments } from './segmentService';
import { getExistingCueSegmentIds, saveCues } from './cueService';
import { generateCuesForSegments } from './cueGeneration';

/**
 * Generate + persist cues for starred segments that lack fresh (≤7d) cues for
 * `mode`, up to `cap` per run. Remaining cold segments fill in on later syncs.
 */
export async function preWarmCuesForMode(
  mode: GoalMode,
  jwt: string,
  cap = 10,
): Promise<void> {
  const segs = await loadStarredSegments();
  if (!segs.length) return;

  const fresh = getExistingCueSegmentIds(segs.map(s => s.id), mode);
  const cold = segs.filter(s => !fresh.has(s.id)).slice(0, cap);
  if (!cold.length) return;

  const generated = await generateCuesForSegments(cold, mode, jwt);
  saveCues(
    generated.map(g => ({
      segmentId: cold[g.segmentIndex].id,
      goalMode: mode,
      aggressive: g.aggressive,
      moderate: g.moderate,
      recovery: g.recovery,
    })),
  );
}
