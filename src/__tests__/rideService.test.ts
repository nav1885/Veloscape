import { generateDebrief } from '../services/rideService';
import { CompletedSegmentResult } from '../store/rideStore';

function makeResult(overrides: Partial<CompletedSegmentResult> & { segmentId: string; name: string }): CompletedSegmentResult {
  return {
    timeSec: 300,
    isNewPR: false,
    gapToPreSeconds: 0,
    wasSkipped: false,
    ...overrides,
  };
}

describe('generateDebrief', () => {
  it('reports a single PR', () => {
    const segments = [
      makeResult({
        segmentId: 's1', name: 'Hawk Hill',
        timeSec: 252, isNewPR: true, gapToPreSeconds: -8, prTimeSec: 260,
      }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('1 of 1 segment');
    expect(text).toContain('New PR on Hawk Hill');
    expect(text).toContain('8 seconds faster');
    expect(text).toContain('Strong effort');
  });

  it('reports multiple PRs', () => {
    const segments = [
      makeResult({ segmentId: 's1', name: 'Hawk Hill', isNewPR: true, gapToPreSeconds: -4, prTimeSec: 260, timeSec: 256 }),
      makeResult({ segmentId: 's2', name: 'Paradise Loop', isNewPR: true, gapToPreSeconds: -2, prTimeSec: 600, timeSec: 598 }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('2 of 2 segments');
    expect(text).toContain('New PR on Hawk Hill');
    expect(text).toContain('New PR on Paradise Loop');
  });

  it('reports non-PR with gap', () => {
    const segments = [
      makeResult({
        segmentId: 's1', name: 'Grizzly Peak',
        timeSec: 631, isNewPR: false, gapToPreSeconds: 19, prTimeSec: 612,
      }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('Grizzly Peak was 19 seconds off PR');
  });

  it('handles skipped segments', () => {
    const segments = [
      makeResult({ segmentId: 's1', name: 'Hit Segment', timeSec: 300 }),
      makeResult({ segmentId: 's2', name: 'Skipped Segment', wasSkipped: true, timeSec: 0 }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('1 of 2 segments');
  });

  it('handles all skipped', () => {
    const segments = [
      makeResult({ segmentId: 's1', name: 'Skip1', wasSkipped: true, timeSec: 0 }),
      makeResult({ segmentId: 's2', name: 'Skip2', wasSkipped: true, timeSec: 0 }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('0 of 2 segments');
  });

  it('handles empty segments', () => {
    const text = generateDebrief([], 3600, 25);
    // Empty ride → distance/time summary (intentionally no "N of M segments" line)
    expect(text).toContain('Ride complete');
    expect(text).toContain('minutes');
  });

  it('handles first efforts (no PR reference)', () => {
    const segments = [
      makeResult({ segmentId: 's1', name: 'First Try', timeSec: 300, isNewPR: false }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('1 of 1 segment');
    expect(text).not.toContain('New PR');
  });

  it('picks the worst non-PR gap for callout', () => {
    const segments = [
      makeResult({ segmentId: 's1', name: 'Close', gapToPreSeconds: 3, prTimeSec: 300, timeSec: 303 }),
      makeResult({ segmentId: 's2', name: 'Far Off', gapToPreSeconds: 25, prTimeSec: 400, timeSec: 425 }),
    ];
    const text = generateDebrief(segments, 3600, 25);
    expect(text).toContain('Far Off was 25 seconds off PR');
    // Should only mention the worst, not both
    expect(text).not.toContain('Close was');
  });
});
