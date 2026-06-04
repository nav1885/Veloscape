import {
  segmentPhase,
  APPROACH_RADIUS_M,
  SEGMENT_START_RADIUS_M,
} from '../utils/segmentDetection';

describe('segmentPhase (segment detection core)', () => {
  it('enters inside the start radius', () => {
    expect(segmentPhase(0)).toBe('enter');
    expect(segmentPhase(SEGMENT_START_RADIUS_M - 1)).toBe('enter');
  });

  it('approaches within the approach radius', () => {
    expect(segmentPhase(SEGMENT_START_RADIUS_M)).toBe('approach');
    expect(segmentPhase(250)).toBe('approach');
    expect(segmentPhase(APPROACH_RADIUS_M - 1)).toBe('approach');
  });

  it('is idle beyond the approach radius', () => {
    expect(segmentPhase(APPROACH_RADIUS_M)).toBe('idle');
    expect(segmentPhase(2000)).toBe('idle');
  });

  it('honors custom radii', () => {
    expect(segmentPhase(20, 200, 30)).toBe('enter');
    expect(segmentPhase(50, 200, 30)).toBe('approach');
    expect(segmentPhase(250, 200, 30)).toBe('idle');
  });

  it('models a run-in: idle → approach → enter as distance shrinks', () => {
    const phases = [800, 450, 300, 60, 35, 5].map((d) => segmentPhase(d));
    expect(phases).toEqual(['idle', 'approach', 'approach', 'approach', 'enter', 'enter']);
  });
});
