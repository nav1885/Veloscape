/**
 * The rider's intent for a ride. Drives which voice-cue variant the engine
 * speaks and (for recovery) which cues are suppressed.
 *
 * Canonical home for GoalMode — kept in a neutral module (not a screen) so it
 * survives screen deletions and avoids circular imports.
 */
export type GoalMode = 'pr' | 'training' | 'recovery';

/** Short labels for the mode-selector chips and the in-ride HUD chip. */
export const GOAL_LABELS: Record<GoalMode, string> = {
  pr: 'PR',
  training: 'Training',
  recovery: 'Recovery',
};
