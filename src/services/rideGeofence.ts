/**
 * Background-reliable segment coaching via OS geofences.
 *
 * Why: expo-location's continuous foreground-service tracking stops delivering when
 * the app is backgrounded / screen-off on Android (esp. Samsung) — the recurring
 * "no cues in the background" bug. GEOFENCES are OS-managed: the system wakes the app
 * on region enter/exit even when backgrounded or killed, bypassing the JS-thread
 * pause entirely. We register a start-region and an end-region per segment; entering
 * them fires the approach/start and the result cue.
 *
 * De-dup with the continuous engine: this task speaks ONLY when the app is NOT in the
 * foreground. When foreground, the continuous engine (rideEngine) owns cues + live UI;
 * when the rider pockets the phone, the continuous path dies and THIS keeps coaching.
 *
 * Cross-context state: a geofence wake may run in a fresh headless JS context (no
 * module state), so the per-segment "entered at" times + goalMode are persisted to a
 * JSON file the task reads on every event.
 */
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { File, Paths } from 'expo-file-system';
import { useRideStore } from '../store/rideStore';
import { useSegmentStore, Segment } from '../store/segmentStore';
import { getCueForSegment } from './cueService';
import { speak } from './ttsService';
import { spokenDistanceMeters } from '../utils/units';
import { GoalMode } from '../types/goalMode';

// Inlined (avoids a cycle with rideEngine which imports this module).
function variantForMode(g: GoalMode): 'aggressive' | 'moderate' | 'recovery' {
  return g === 'pr' ? 'aggressive' : g === 'recovery' ? 'recovery' : 'moderate';
}
function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s} seconds`;
}

const GEOFENCE_TASK = 'veloscape-ride-geofence';
const START_RADIUS_M = 140; // Android geofence min is ~100m; 140 gives a little lead
const END_RADIUS_M = 140;
const STATE_FILE = 'veloscape-geofence-state.json';

interface GeofenceState {
  goalMode: GoalMode;
  started: Record<string, number>; // segmentId → entered-start timestamp (ms)
  fired: Record<string, true>;     // `${segId}:start|end` cues already spoken (de-dup)
}

// ─── Durable state (survives a headless wake) ────────────────────────────────
function stateFile(): File {
  return new File(Paths.document, STATE_FILE);
}
async function readState(): Promise<GeofenceState | null> {
  try {
    const f = stateFile();
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as GeofenceState;
  } catch {
    return null;
  }
}
function writeState(s: GeofenceState): void {
  try {
    const f = stateFile();
    if (f.exists) f.delete();
    f.write(JSON.stringify(s));
  } catch (e) {
    console.warn('[geofence] state write failed:', e);
  }
}
function clearState(): void {
  try {
    const f = stateFile();
    if (f.exists) f.delete();
  } catch { /* ignore */ }
}

// ─── The geofence task (module scope — runs on OS region events) ─────────────
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[geofence] task error:', error.message);
    return;
  }
  const { eventType, region } = (data as {
    eventType: Location.LocationGeofencingEventType;
    region: Location.LocationRegion;
  }) ?? {};
  if (eventType !== Location.LocationGeofencingEventType.Enter || !region?.identifier) return;

  // Only the BACKGROUND cue source — foreground is owned by the continuous engine.
  if (AppState.currentState === 'active') {
    console.log('[geofence] enter (foreground — engine handles it):', region.identifier);
    return;
  }

  const [segId, kind] = region.identifier.split('|');
  const state = await readState();
  if (!state) return;

  const seg = lookupSegment(segId);
  if (!seg) return;

  console.log(`[geofence] BACKGROUND enter ${kind} seg=${segId}`);

  if (kind === 'start') {
    if (state.fired[`${segId}:start`]) return;
    state.fired[`${segId}:start`] = true;
    state.started[segId] = Date.now();
    writeState(state);
    speakStartCue(seg, state.goalMode);
  } else if (kind === 'end') {
    if (state.fired[`${segId}:end`]) return;
    const startedAt = state.started[segId];
    state.fired[`${segId}:end`] = true;
    writeState(state);
    speakResultCue(seg, startedAt);
  }
});

function lookupSegment(segId: string): Segment | null {
  // starredSegments is populated before a ride; in a fresh headless context it may be
  // empty, so fall back is acceptable (cue still fires with generic text).
  return useSegmentStore.getState().starredSegments.find((s) => s.id === segId) ?? null;
}

function speakStartCue(seg: Segment, goalMode: GoalMode): void {
  const cue = getCueForSegment(seg.id, goalMode);
  if (cue) {
    speak(cue[variantForMode(goalMode)]);
  } else {
    const pr = seg.bestTimeSec ? `P R is ${formatTimeSec(seg.bestTimeSec)}.` : '';
    speak(`${seg.name}. ${spokenDistanceMeters(seg.distanceM)}. ${pr} Go.`);
  }
}

function speakResultCue(seg: Segment, startedAt: number | undefined): void {
  if (!startedAt) {
    speak(`${seg.name} complete.`);
    return;
  }
  const timeSec = Math.round((Date.now() - startedAt) / 1000);
  const best = seg.bestTimeSec;
  const t = formatTimeSec(timeSec);
  if (best && timeSec < best) speak(`${seg.name}. ${t}. New P R, ${best - timeSec} seconds faster.`);
  else if (best) speak(`${seg.name}. ${t}. ${timeSec - best} seconds off P R.`);
  else speak(`${seg.name}. ${t}. First effort.`);
}

// ─── Public API (called alongside the continuous engine) ─────────────────────

/** Register start+end geofences for every ride segment. OS-managed → fires
 *  enter events (and thus cues) even when the app is backgrounded/killed. */
export async function startRideGeofences(segments: Segment[], goalMode: GoalMode): Promise<void> {
  writeState({ goalMode, started: {}, fired: {} });

  // Android caps geofences at 100; start+end per segment. Cap at 50 segments.
  const capped = segments.slice(0, 50);
  const regions: Location.LocationRegion[] = [];
  for (const s of capped) {
    regions.push({ identifier: `${s.id}|start`, latitude: s.startLat, longitude: s.startLng, radius: START_RADIUS_M, notifyOnEnter: true, notifyOnExit: false });
    regions.push({ identifier: `${s.id}|end`, latitude: s.endLat, longitude: s.endLng, radius: END_RADIUS_M, notifyOnEnter: true, notifyOnExit: false });
  }
  if (!regions.length) return;
  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    console.log(`[geofence] registered ${regions.length} regions for ${capped.length} segments`);
  } catch (e) {
    console.warn('[geofence] startGeofencing failed:', e);
  }
}

export async function stopRideGeofences(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch (e) {
    console.warn('[geofence] stopGeofencing failed:', e);
  }
  clearState();
}
