/**
 * Ride Engine — GPS tracking + segment detection + TTS cues.
 *
 * Lifecycle: startRideEngine() → runs until stopRideEngine().
 * Updates rideStore with live position, speed, distance, segment state.
 * Fires TTS cues at segment approach (500m) and on segment completion.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useRideStore } from '../store/rideStore';
import { useSegmentStore } from '../store/segmentStore';
import { Segment } from '../store/segmentStore';
import { getCueForSegment } from './cueService';
import { speak, stop as stopTTS } from './ttsService';
import { haversineMetres, decodePolyline, LatLng } from '../utils/polyline';
import { segmentPhase, SEGMENT_END_RADIUS_M } from '../utils/segmentDetection';
import { spokenDistanceMeters } from '../utils/units';
import { GoalMode } from '../types/goalMode';
import { CueType } from '../store/rideStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SegmentTracker {
  segment: Segment;
  startCoord: LatLng;
  endCoord: LatLng;
  polylinePoints: LatLng[] | null; // decoded polyline, null if no polyline
  distanceM: number;
  approachCueFired: boolean;
  startCueFired: boolean;
  enteredAt: number | null; // timestamp ms
  checkpointsFired: Set<number>; // 25, 50, 75
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GPS_INTERVAL_MS = 1000;
const LOCATION_TASK = 'veloscape-ride-location';
const KEEP_AWAKE_TAG = 'veloscape-ride';

// Background location task — MUST be defined at module scope so it is registered
// whenever the JS bundle loads (incl. headless restarts). Each fix is fed into the
// same detection pipeline the foreground path uses. With the Android foreground
// service keeping the process alive, module state below stays valid mid-ride.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[rideEngine] location task error:', error.message);
    return;
  }
  const { locations } = (data as { locations?: Location.LocationObject[] }) ?? {};
  if (!locations?.length) return;
  for (const loc of locations) onLocationUpdate(loc);
});

// ─── Module state ────────────────────────────────────────────────────────────

let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _simInterval: ReturnType<typeof setInterval> | null = null;
let _trackers: SegmentTracker[] = [];
let _activeTracker: SegmentTracker | null = null;
let _goalMode: GoalMode = 'training';
let _prevPosition: LatLng | null = null;
let _totalDistanceM = 0;
let _startTimeMs = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startRideEngine(
  segmentIds: string[],
  goalMode: GoalMode,
): Promise<boolean> {
  // Permissions: foreground is required; background lets tracking continue with the
  // screen off / app backgrounded (the normal riding case). Background is best-effort.
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  try { await Location.requestBackgroundPermissionsAsync(); } catch { /* FG still works */ }

  // Keep audio playing in background / silent mode so cues are audible screen-off.
  try {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    });
  } catch { /* non-fatal */ }

  // Belt-and-suspenders for the screen-on / mounted case.
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

  _goalMode = goalMode;
  _prevPosition = null;
  _totalDistanceM = 0;
  _startTimeMs = Date.now();
  _activeTracker = null;

  // Build trackers from segment store
  const allSegments = useSegmentStore.getState().starredSegments;
  _trackers = segmentIds
    .map(id => allSegments.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined)
    .map(seg => ({
      segment: seg,
      startCoord: { lat: seg.startLat, lng: seg.startLng },
      endCoord: { lat: seg.endLat, lng: seg.endLng },
      polylinePoints: seg.polyline ? decodePolyline(seg.polyline) : null,
      distanceM: seg.distanceM,
      approachCueFired: false,
      startCueFired: false,
      enteredAt: null,
      checkpointsFired: new Set(),
    }));

  const store = useRideStore.getState();
  store.startRide(goalMode, segmentIds);

  // Speak start cue
  const segCount = _trackers.length;
  speak(`GPS locked. ${segCount} segment${segCount !== 1 ? 's' : ''} loaded. Goal: ${goalMode === 'pr' ? 'P R' : goalMode}. Let's go.`);
  store.setAudioActive(true);

  // Start background-capable GPS via a foreground service so tracking continues
  // when the screen locks or the app is backgrounded mid-ride.
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: GPS_INTERVAL_MS,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Veloscape — ride in progress',
      notificationBody: 'Tracking your route and coaching your segments.',
      notificationColor: '#F5C518',
    },
  });

  // Elapsed time ticker
  _timerInterval = setInterval(updateElapsedTime, 1000);

  return true;
}

export async function stopRideEngine(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (e) {
    console.warn('[rideEngine] stop location updates failed:', e);
  }
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  if (_simInterval) {
    clearInterval(_simInterval);
    _simInterval = null;
  }
  deactivateKeepAwake(KEEP_AWAKE_TAG);
  stopTTS();
  _trackers = [];
  _activeTracker = null;
  _prevPosition = null;
}

// ─── Simulated ride (Easter egg: long-press Start Ride) ──────────────────────
// Feeds a synthetic GPS track through the SAME detection pipeline so you can
// see the segment screen + hear every cue without a real ride. Foreground only —
// this verifies detection/cues/UI, NOT the background-location fix.

function buildSimPath(t: SegmentTracker): LatLng[] {
  const S = t.startCoord;
  const E = t.endCoord;
  const pts: LatLng[] = [];
  // Approach: ~650m "south" of the start, stepping in (crosses 500m approach + 40m enter).
  const approach = { lat: S.lat - 650 / 111320, lng: S.lng };
  const N = 14;
  for (let k = 0; k <= N; k++) {
    pts.push({
      lat: approach.lat + (S.lat - approach.lat) * (k / N),
      lng: approach.lng + (S.lng - approach.lng) * (k / N),
    });
  }
  // Through the segment: follow the real polyline if we have it, else interpolate S→E.
  if (t.polylinePoints && t.polylinePoints.length > 1) {
    pts.push(...t.polylinePoints);
  } else {
    const M = 16;
    for (let k = 1; k <= M; k++) {
      pts.push({ lat: S.lat + (E.lat - S.lat) * (k / M), lng: S.lng + (E.lng - S.lng) * (k / M) });
    }
  }
  return pts;
}

export function startSimulatedRide(segmentIds: string[], goalMode: GoalMode): boolean {
  _goalMode = goalMode;
  _prevPosition = null;
  _totalDistanceM = 0;
  _startTimeMs = Date.now();
  _activeTracker = null;

  const allSegments = useSegmentStore.getState().starredSegments;
  _trackers = segmentIds
    .map(id => allSegments.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined)
    .map(seg => ({
      segment: seg,
      startCoord: { lat: seg.startLat, lng: seg.startLng },
      endCoord: { lat: seg.endLat, lng: seg.endLng },
      polylinePoints: seg.polyline ? decodePolyline(seg.polyline) : null,
      distanceM: seg.distanceM,
      approachCueFired: false,
      startCueFired: false,
      enteredAt: null,
      checkpointsFired: new Set<number>(),
    }));
  if (!_trackers.length) return false;

  const store = useRideStore.getState();
  store.startRide(goalMode, segmentIds);
  speak('Simulated ride. Watch the segment screen and listen for the cues.');
  store.setAudioActive(true);

  // Chain through every segment in order so the board fills out across a
  // representative multi-segment ride (done → active → upcoming).
  const path = _trackers.flatMap(t => buildSimPath(t));
  _timerInterval = setInterval(updateElapsedTime, 1000);
  let i = 0;
  _simInterval = setInterval(() => {
    if (i >= path.length) {
      if (_simInterval) { clearInterval(_simInterval); _simInterval = null; }
      return;
    }
    const p = path[i++];
    onLocationUpdate({
      coords: {
        latitude: p.lat, longitude: p.lng, accuracy: 5, speed: 8,
        altitude: 0, altitudeAccuracy: 5, heading: 0,
      },
      timestamp: Date.now(),
    } as Location.LocationObject);
  }, 250);

  return true;
}

// ─── GPS callback ────────────────────────────────────────────────────────────

function onLocationUpdate(location: Location.LocationObject): void {
  const { latitude: lat, longitude: lng, accuracy, speed } = location.coords;
  const pos: LatLng = { lat, lng };
  const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : 0;
  const accuracyM = accuracy ?? 999;

  // Accumulate distance
  if (_prevPosition) {
    const delta = haversineMetres(_prevPosition, pos);
    // Only count if moving (> 1m) and GPS is reasonably accurate
    if (delta > 1 && delta < 200 && accuracyM < 30) {
      _totalDistanceM += delta;
    }
  }
  _prevPosition = pos;

  // Update store
  const store = useRideStore.getState();
  store.updatePosition({
    lat,
    lng,
    speedKmh,
    accuracyM,
    timestamp: Date.now(),
  });

  // Update distance in store
  const distanceKm = _totalDistanceM / 1000;
  // We set distanceKm by accessing the raw set — rideStore doesn't expose a setDistanceKm
  // so we use the internal zustand set via the store API
  useRideStore.setState({ distanceKm });

  // ─── Segment detection ───────────────────────────────────────────────
  if (_activeTracker) {
    handleActiveSegment(pos, _activeTracker);
  } else {
    handleBetweenSegments(pos);
  }
}

// ─── Between segments: detect approach + entry ───────────────────────────────

function handleBetweenSegments(pos: LatLng): void {
  for (const tracker of _trackers) {
    // Skip already completed segments
    const store = useRideStore.getState();
    const completed = store.completedSegments.some(c => c.segmentId === tracker.segment.id);
    if (completed) continue;

    const phase = segmentPhase(haversineMetres(pos, tracker.startCoord));

    // Approach cue (once) on the run-in to the segment
    if (phase === 'approach' && !tracker.approachCueFired) {
      tracker.approachCueFired = true;
      fireApproachCue(tracker);
    }

    // Segment start detection — only one segment active at a time
    if (phase === 'enter') {
      enterSegment(tracker);
      return;
    }
  }
}

// ─── Active segment: track progress + detect end ─────────────────────────────

function handleActiveSegment(pos: LatLng, tracker: SegmentTracker): void {
  if (!tracker.enteredAt) return;

  const distToEnd = haversineMetres(pos, tracker.endCoord);
  const elapsedSec = (Date.now() - tracker.enteredAt) / 1000;

  // Estimate progress along segment
  const distFromStart = haversineMetres(pos, tracker.startCoord);
  const totalDist = tracker.distanceM || haversineMetres(tracker.startCoord, tracker.endCoord);
  const progress = Math.min(1, Math.max(0, distFromStart / totalDist));

  // PR gap estimation (simple: compare elapsed vs best time at this progress point)
  let gapSec = 0;
  const bestTime = tracker.segment.bestTimeSec;
  if (bestTime) {
    const expectedElapsed = bestTime * progress;
    gapSec = Math.round(elapsedSec - expectedElapsed); // positive = behind PR
  }

  // Update store
  const store = useRideStore.getState();
  store.setActiveSegmentMetrics(elapsedSec, progress * 100, gapSec);

  // Split checkpoint cues (25%, 50%, 75%)
  for (const pct of [25, 50, 75]) {
    if (!tracker.checkpointsFired.has(pct) && progress * 100 >= pct) {
      tracker.checkpointsFired.add(pct);
      fireSplitCue(tracker, pct, elapsedSec, gapSec);
    }
  }

  // Segment end detection
  if (distToEnd < SEGMENT_END_RADIUS_M) {
    exitSegment(tracker, elapsedSec, gapSec);
  }
}

// ─── Segment lifecycle ───────────────────────────────────────────────────────

function enterSegment(tracker: SegmentTracker): void {
  tracker.enteredAt = Date.now();
  _activeTracker = tracker;

  const store = useRideStore.getState();
  store.setSegmentState(tracker.segment.id, 'active');
  // Populate segment name in the store
  useRideStore.setState(state => ({
    currentSegment: state.currentSegment
      ? { ...state.currentSegment, name: tracker.segment.name }
      : state.currentSegment,
  }));

  // Start cue (suppressed in Recovery — see shouldFireCue). Flag flips regardless
  // so we don't re-evaluate every GPS tick.
  if (!tracker.startCueFired) {
    tracker.startCueFired = true;
    if (shouldFireCue(_goalMode, 'start')) {
      const text = `${tracker.segment.name}. Go.`;
      speak(text);
      store.appendCueLog({
        segmentId: tracker.segment.id,
        cueType: 'start',
        variant: null,
        text,
        firedAt: Date.now(),
      });
    }
  }
}

function exitSegment(
  tracker: SegmentTracker,
  elapsedSec: number,
  gapSec: number,
): void {
  const timeSec = Math.round(elapsedSec);
  const bestTime = tracker.segment.bestTimeSec;
  const isNewPR = bestTime ? timeSec < bestTime : true; // first effort is always a "PR"
  const gapToPreSeconds = bestTime ? timeSec - bestTime : 0; // negative = faster than PR

  // Result cue
  const mins = Math.floor(timeSec / 60);
  const secs = timeSec % 60;
  const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs} seconds`;
  let endText: string;
  if (isNewPR && bestTime) {
    endText = `${timeStr}. New P R. ${Math.abs(gapToPreSeconds)} seconds faster.`;
  } else if (bestTime) {
    endText = `${timeStr}. ${Math.abs(gapToPreSeconds)} seconds off P R.`;
  } else {
    endText = `${timeStr}. First effort recorded.`;
  }
  speak(endText);
  useRideStore.getState().appendCueLog({
    segmentId: tracker.segment.id,
    cueType: 'end',
    variant: null,
    text: endText,
    firedAt: Date.now(),
  });

  // Update store
  const store = useRideStore.getState();
  store.completeSegment({
    segmentId: tracker.segment.id,
    name: tracker.segment.name,
    timeSec,
    isNewPR,
    gapToPreSeconds,
    prTimeSec: bestTime ?? undefined,
    wasSkipped: false,
    cueTextPlayed: tracker.segment.name, // simplified — full cue text could be stored
  });

  _activeTracker = null;
}

// ─── Mode-aware cue selection (Quick-Start Modes) ──────────────────────────────

/** Which LLM cue variant a mode speaks on segment approach. */
export function variantForMode(goalMode: GoalMode): 'aggressive' | 'moderate' | 'recovery' {
  return goalMode === 'pr' ? 'aggressive' : goalMode === 'recovery' ? 'recovery' : 'moderate';
}

/**
 * Whether a cue type fires for a mode. Recovery is intentionally quiet — it
 * suppresses the hard-effort push cues (start + all splits); approach + end
 * always fire so the rider still hears a (de-escalating) voice.
 */
export function shouldFireCue(goalMode: GoalMode, cueType: CueType): boolean {
  if (goalMode === 'recovery' && (cueType === 'start' || cueType.startsWith('split'))) return false;
  return true;
}

// ─── Cue firing ──────────────────────────────────────────────────────────────

function fireApproachCue(tracker: SegmentTracker): void {
  const seg = tracker.segment;
  const cue = getCueForSegment(seg.id, _goalMode);
  const store = useRideStore.getState();
  let cueText: string;
  let variant: 'aggressive' | 'moderate' | 'recovery' | null = null;

  if (cue) {
    variant = variantForMode(_goalMode);
    cueText = cue[variant];
    speak(cueText);
    store.setSegmentState(seg.id, 'approaching');
    useRideStore.setState({ nextSegmentId: seg.id });
  } else {
    const prStr = seg.bestTimeSec ? `P R is ${formatTimeSec(seg.bestTimeSec)}.` : '';
    cueText = `${seg.name} ahead. ${spokenDistanceMeters(seg.distanceM)}. ${prStr}`;
    speak(cueText);
  }

  store.appendCueLog({
    segmentId: seg.id,
    cueType: 'approach',
    variant,
    text: cueText,
    firedAt: Date.now(),
  });
}

function fireSplitCue(
  tracker: SegmentTracker,
  pct: number,
  _elapsedSec: number,
  gapSec: number,
): void {
  if (tracker.segment.bestTimeSec == null) return; // no PR to compare against
  if (!shouldFireCue(_goalMode, 'split50')) return; // Recovery: suppress all split cues

  const label = pct === 50 ? 'Halfway' : `${pct} percent`;
  let text: string | null = null;
  if (gapSec <= -3) {
    text = `${label}. ${Math.abs(gapSec)} seconds up. Hold.`;
  } else if (gapSec >= 3) {
    text = `${label}. ${gapSec} seconds back. Push.`;
  }
  if (!text) return; // within ±3s: stay silent (GPS noise)
  speak(text);
  const cueType = pct === 25 ? 'split25' : pct === 50 ? 'split50' : 'split75';
  useRideStore.getState().appendCueLog({
    segmentId: tracker.segment.id,
    cueType,
    variant: null,
    text,
    firedAt: Date.now(),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s} seconds`;
}

function updateElapsedTime(): void {
  // No-op for now — elapsed is computed from _startTimeMs in the wrapper
  // This interval keeps the UI ticker alive
}

/** Get the ride start timestamp (ms) for elapsed time display. */
export function getRideStartTime(): number {
  return _startTimeMs;
}

/** Get total distance in km. */
export function getRideDistanceKm(): number {
  return _totalDistanceM / 1000;
}
