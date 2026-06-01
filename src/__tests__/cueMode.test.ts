/**
 * Quick-Start Modes — mode-aware cue selection.
 *
 * Encodes the regression baseline Chisel flagged: before this change every mode
 * spoke the `moderate` variant (PR/Training/Recovery sounded identical). These
 * tests assert the three modes now diverge, and that Recovery is quiet.
 */
import { variantForMode, shouldFireCue } from '../services/rideEngine';

describe('variantForMode', () => {
  it('maps PR → aggressive', () => expect(variantForMode('pr')).toBe('aggressive'));
  it('maps Training → moderate', () => expect(variantForMode('training')).toBe('moderate'));
  it('maps Recovery → recovery', () => expect(variantForMode('recovery')).toBe('recovery'));

  it('produces three distinct variants across modes', () => {
    const variants = new Set([variantForMode('pr'), variantForMode('training'), variantForMode('recovery')]);
    expect(variants.size).toBe(3);
  });
});

describe('shouldFireCue', () => {
  it('Recovery suppresses the start cue', () => expect(shouldFireCue('recovery', 'start')).toBe(false));
  it('Recovery suppresses all split cues', () => {
    expect(shouldFireCue('recovery', 'split25')).toBe(false);
    expect(shouldFireCue('recovery', 'split50')).toBe(false);
    expect(shouldFireCue('recovery', 'split75')).toBe(false);
  });
  it('Recovery still fires approach + end', () => {
    expect(shouldFireCue('recovery', 'approach')).toBe(true);
    expect(shouldFireCue('recovery', 'end')).toBe(true);
  });
  it('PR and Training fire every cue type', () => {
    for (const t of ['approach', 'start', 'split25', 'split50', 'split75', 'end'] as const) {
      expect(shouldFireCue('pr', t)).toBe(true);
      expect(shouldFireCue('training', t)).toBe(true);
    }
  });
});
