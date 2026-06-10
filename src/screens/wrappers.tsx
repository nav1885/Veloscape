/**
 * Screen wrappers connect navigator route params to component props.
 * Mock data is used in Phase 0. Each wrapper is replaced with real
 * data hookups in the corresponding phase (1–5).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSegmentStore } from '../store/segmentStore';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { loadStarredSegments } from '../services/segmentService';
import { TTL } from '../constants/ttl';
import { GoalMode } from '../types/goalMode';
import { LatLng, haversineMetres, decodePolyline } from '../utils/polyline';
import { getCachedActivities, getActivitySummaryPolyline } from '../services/activityService';
import { getActivityDetail } from '../services/stravaApi';
import { upsertCachedActivityFromDetail } from '../services/homeIngestor';
import { startRideEngine, startSimulatedRide, stopRideEngine, getRideStartTime, muteCoaching, unmuteCoaching } from '../services/rideEngine';
import { endRideAndSave } from '../services/rideControl';
import { saveRide, generateDebrief } from '../services/rideService';
import {
  getOrGenerateSummary,
  computeMetricsForRide,
  loadSegmentEffortTrend,
  BASELINE_TARGET,
} from '../services/rideSummaryService';
import type { SummaryTextState } from '../components/SummaryText';
import type { AudioButtonState } from '../components/InlineAudioButton';
import { stop as stopTTS } from '../services/ttsService';
import { loadRideDetail } from '../services/rideHistoryService';
import { speak } from '../services/ttsService';
import {
  startReconciliation,
  forceReconcileOnce,
  remapRideToActivity,
  unmapRide,
  type ReconcilerHandle,
} from '../services/stravaReconciler';
import WrongActivityChooser from '../components/WrongActivityChooser';
import type { SyncState } from '../components/SyncStateBadge';
import { db } from '../db/client';
import { rides } from '../db/schema';
import { eq } from 'drizzle-orm';

import InRideScreen, { BoardSegment } from '../components/InRideScreen';
import SegmentResultScreen from '../components/SegmentResultScreen';
import PostRideSummaryScreen from '../components/PostRideSummaryScreen';
import PaywallScreen from '../components/PaywallScreen';

import { RideStackParamList } from '../navigation/types';

type RideNav = StackNavigationProp<RideStackParamList>;

// ─── InRide ───────────────────────────────────────────────────────────────────

export function InRideScreenWrapper() {
  const navigation = useNavigation<RideNav>();
  const route = useRoute<RouteProp<RideStackParamList, 'InRide'>>();
  // route.params may be absent if InRide is ever instantiated as the stack's
  // base route (e.g. under a PostRideSummary replay) — guard against that.
  const { segmentIds, goalMode, simulate } = route.params ?? ({} as Partial<{ segmentIds: string[]; goalMode: GoalMode; simulate: boolean }>);

  const currentPosition = useRideStore((s) => s.currentPosition);
  const gpsLocked = useRideStore((s) => s.gpsLocked);
  const distanceKm = useRideStore((s) => s.distanceKm);
  const cuesMuted = useRideStore((s) => s.cuesMuted);
  const rideStartedAt = useRideStore((s) => s.rideStartedAt);
  const currentSegment = useRideStore((s) => s.currentSegment);
  const routeSegmentIds = useRideStore((s) => s.routeSegmentIds);
  const completedSegments = useRideStore((s) => s.completedSegments);
  const starredSegments = useSegmentStore((s) => s.starredSegments);

  const [elapsedTime, setElapsedTime] = useState('0:00:00');
  const engineStartedRef = useRef(false);

  // Start the ride engine — but the engine lives INDEPENDENTLY of this screen.
  // Navigating away / hitting back must NOT stop the ride (that was a bug: the old
  // unmount cleanup called stopRideEngine(), killing GPS + cues). The engine is
  // stopped only by an explicit End Ride. On remount (navigating back into a live
  // ride) we must not start a second ride — guard on the store's isRideActive.
  useEffect(() => {
    if (engineStartedRef.current || !segmentIds?.length || !goalMode) return;
    engineStartedRef.current = true;

    if (useRideStore.getState().isRideActive) {
      console.log('[InRide] ride already running — re-attaching, not restarting');
      return;
    }

    if (simulate) {
      console.log('[InRide] starting SIMULATED ride with', segmentIds.length, 'segments');
      startSimulatedRide(segmentIds, goalMode);
    } else {
      console.log('[InRide] starting engine with', segmentIds.length, 'segments');
      startRideEngine(segmentIds, goalMode).then(ok => {
        if (!ok) console.warn('[InRide] GPS permission denied');
        else console.log('[InRide] engine started');
      });
    }
    // NO unmount cleanup — the ride continues across navigation. stopRideEngine()
    // is called only from handleEndRide (the explicit End Ride action).
  }, []);

  // Back works normally — the ride keeps running in the background (foreground
  // service + background location), independent of this screen being mounted. You
  // can leave, lock the phone, switch apps; coaching continues until End Ride.

  // Elapsed time ticker — fires when rideStartedAt is set by the engine
  useEffect(() => {
    if (!rideStartedAt) return;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - rideStartedAt) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setElapsedTime(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(tick);
  }, [rideStartedAt]);

  async function handleEndRide() {
    // Single save path: persists to SQLite + tears down + resets the store BEFORE
    // we navigate. The summary then renders from the saved row.
    const result = await endRideAndSave('in-app');
    if (result) {
      navigation.navigate('PostRideSummary', { rideId: result.rideId, speakDebrief: true });
    } else {
      navigation.getParent()?.navigate('Main', { screen: 'Home' });
    }
  }

  // InRide is the Ride stack's base route, so it can mount under a
  // PostRideSummary replay. If it's ever focused without params (e.g. user backs
  // out of a replayed summary), bounce to Home instead of showing a blank screen.
  useFocusEffect(
    React.useCallback(() => {
      if (!segmentIds?.length) navigation.getParent()?.navigate('Main', { screen: 'Home' });
    }, [segmentIds, navigation]),
  );

  if (!segmentIds?.length || !goalMode) return null;

  // Build the in-ride segment board: every segment on the ride, in order, tagged
  // done / active / upcoming, with the data each state needs (deltas, live timer,
  // distance-away, plus the segment's own stats: distance, grade, elevation, PR).
  const board: BoardSegment[] = useMemo(() => {
    const segById = (id: string) => starredSegments.find((s) => s.id === id);
    return routeSegmentIds.map((id) => {
      const seg = segById(id);
      const distanceM = seg?.distanceM ?? 0;
      const elevationM = seg?.elevationM ?? 0;
      const gradePercent = distanceM > 0 ? (elevationM / distanceM) * 100 : 0;
      const base = {
        id,
        name: seg?.name ?? 'Segment',
        distanceM,
        elevationM,
        gradePercent,
        prTimeSec: seg?.bestTimeSec ?? null,
        effortCount: seg?.effortCount ?? 0,
      };
      const done = completedSegments.find((c) => c.segmentId === id);
      if (done) {
        return {
          ...base,
          status: 'done' as const,
          resultTimeSec: done.timeSec,
          isNewPR: done.isNewPR,
          gapToPreSeconds: done.gapToPreSeconds,
        };
      }
      if (currentSegment && currentSegment.id === id && currentSegment.state === 'active') {
        return {
          ...base,
          status: 'active' as const,
          elapsedTimeSec: currentSegment.elapsedTimeSec,
          progressPercent: currentSegment.progressPercent,
          liveGapSeconds: currentSegment.gapToPreSeconds,
        };
      }
      const distanceAwayM =
        currentPosition && seg
          ? haversineMetres(currentPosition, { lat: seg.startLat, lng: seg.startLng })
          : undefined;
      return { ...base, status: 'upcoming' as const, distanceAwayM };
    });
  }, [routeSegmentIds, starredSegments, completedSegments, currentSegment, currentPosition]);

  return (
    <InRideScreen
      elapsedTime={elapsedTime}
      speedKmh={currentPosition?.speedKmh ?? 0}
      distanceKm={distanceKm}
      gpsLocked={gpsLocked}
      goalMode={goalMode}
      board={board}
      cuesMuted={cuesMuted}
      onToggleMute={() => (cuesMuted ? unmuteCoaching() : muteCoaching())}
      onEndRide={handleEndRide}
    />
  );
}

// ─── SegmentResult ────────────────────────────────────────────────────────────

export function SegmentResultScreenWrapper() {
  const navigation = useNavigation<RideNav>();
  const route = useRoute<RouteProp<RideStackParamList, 'SegmentResult'>>();
  const { segmentName, finalTimeSec, isNewPR, gapToPreSeconds } = route.params;
  return (
    <SegmentResultScreen
      segmentName={segmentName}
      finalTimeSec={finalTimeSec}
      isNewPR={isNewPR}
      gapToPreSeconds={gapToPreSeconds}
      onDismiss={() => navigation.goBack()}
    />
  );
}

// ─── PostRideSummary ──────────────────────────────────────────────────────────

/**
 * Locate a segment's slice of the ride track by nearest-point matching its
 * start/end coords (the effort row has no enter/exit timestamp). Returns the
 * sub-array of track points between those two indices, or undefined.
 */
function sliceTrackBySegment(
  track: LatLng[],
  start: LatLng | null,
  end: LatLng | null,
): LatLng[] | undefined {
  if (!track || track.length < 2 || !start || !end) return undefined;
  let i0 = 0, i1 = 0, d0 = Infinity, d1 = Infinity;
  track.forEach((p, i) => {
    const ds = haversineMetres(p, start);
    if (ds < d0) { d0 = ds; i0 = i; }
    const de = haversineMetres(p, end);
    if (de < d1) { d1 = de; i1 = i; }
  });
  const lo = Math.min(i0, i1);
  const hi = Math.max(i0, i1);
  if (hi - lo < 1) return undefined;
  return track.slice(lo, hi + 1);
}

export function PostRideSummaryScreenWrapper() {
  const navigation = useNavigation<RideNav>();
  const route = useRoute<RouteProp<RideStackParamList, 'PostRideSummary'>>();
  const rider = useAuthStore((s) => s.rider);
  const stravaAccessToken = useAuthStore((s) => s.stravaAccessToken);
  const completedSegments = useRideStore((s) => s.completedSegments);
  const rideStartedAt = useRideStore((s) => s.rideStartedAt);
  const distanceKm = useRideStore((s) => s.distanceKm);
  const goalMode = useRideStore((s) => s.goalMode);
  const routeSegmentIds = useRideStore((s) => s.routeSegmentIds);
  const gpxTrackPoints = useRideStore((s) => s.gpxTrackPoints);
  const cueLog = useRideStore((s) => s.cueLog);
  const starredSegments = useSegmentStore((s) => s.starredSegments);

  const routeRideId = route.params.rideId;

  // History mode: navigated from History list — load from SQLite.
  const isHistoryMode = completedSegments.length === 0 && !rideStartedAt;
  const [persisted, setPersisted] = useState(() =>
    isHistoryMode ? loadRideDetail(routeRideId) : null,
  );

  // Saved ride id (live mode generates it on save; history mode reuses route param)
  const [savedRideId, setSavedRideId] = useState<string | null>(
    isHistoryMode ? routeRideId : null,
  );

  const liveEndedAt = useRideStore((s) => s.lastRideEndedAt);
  const endedAt = isHistoryMode
    ? (persisted?.ride.endedAt ?? 0) * 1000
    : (liveEndedAt ?? Date.now());
  const effectiveStartedAt = isHistoryMode
    ? (persisted?.ride.startedAt ?? 0) * 1000
    : (rideStartedAt ?? Date.now());
  const durationSec = isHistoryMode
    ? (persisted ? persisted.ride.endedAt - persisted.ride.startedAt : 0)
    : (rideStartedAt ? Math.floor((endedAt - rideStartedAt) / 1000) : 0);
  const effectiveDistanceKm = isHistoryMode
    ? (persisted ? persisted.ride.distanceM / 1000 : 0)
    : distanceKm;

  // Full ride GPS track for the map.
  //  • live → phone-recorded points from the store
  //  • history, phone-recorded → persisted gpxTrack JSON
  //  • history, Strava-sourced (gpxTrack null) → decode the cached Strava
  //    summary polyline keyed by the ride's stravaActivityId
  const rideTrack = useMemo<LatLng[]>(() => {
    if (!isHistoryMode) {
      return (gpxTrackPoints ?? []).map(p => ({ lat: p.lat, lng: p.lng }));
    }
    const raw = persisted?.ride.gpxTrack;
    if (raw) {
      try {
        const arr = JSON.parse(raw) as Array<{ lat: number; lng: number }>;
        if (arr.length >= 2) return arr.map(p => ({ lat: p.lat, lng: p.lng }));
      } catch {
        // fall through to the Strava polyline fallback
      }
    }
    const sid = persisted?.ride.stravaActivityId;
    if (sid) {
      const poly = getActivitySummaryPolyline(Number(sid));
      if (poly) return decodePolyline(poly);
    }
    return [];
  }, [isHistoryMode, persisted, gpxTrackPoints]);

  // If a past Strava ride has no cached route, fetch its detail once on demand,
  // cache the summary polyline, and draw it. (The ingestor only backfills detail
  // for a capped number of rides per run, so most older rides aren't cached.)
  const [fetchedTrack, setFetchedTrack] = useState<LatLng[] | null>(null);
  const effectiveTrack = useMemo<LatLng[]>(
    () => (fetchedTrack && fetchedTrack.length >= 2 ? fetchedTrack : rideTrack),
    [fetchedTrack, rideTrack],
  );
  const trackFetchRef = useRef(false);
  useEffect(() => {
    if (!isHistoryMode || trackFetchRef.current || rideTrack.length >= 2) return;
    const sid = persisted?.ride.stravaActivityId;
    if (!sid || !stravaAccessToken) return;
    trackFetchRef.current = true;
    (async () => {
      try {
        const detail = await getActivityDetail(Number(sid), stravaAccessToken);
        const poly = detail.map?.summary_polyline;
        if (poly) {
          upsertCachedActivityFromDetail(detail);
          setFetchedTrack(decodePolyline(poly));
        }
      } catch (err) {
        console.warn('[PostRide] on-demand route fetch failed:', err);
      }
    })();
  }, [isHistoryMode, rideTrack, persisted, stravaAccessToken]);


  // NOTE: saving now happens in endRideAndSave() BEFORE navigation (the single save
  // path — see services/rideControl.ts), so there is no mount-effect save here. By
  // the time this screen mounts the ride row already exists and the store is reset,
  // so the component renders from SQLite via the isHistoryMode path below.

  // Local sync state — drives badge + affordances. Re-read from DB on changes.
  const [dataSource, setDataSource] = useState<'provisional' | 'strava'>(
    isHistoryMode ? (persisted?.ride.dataSource ?? 'provisional') : 'provisional',
  );
  const [importedFromStrava] = useState<boolean>(
    isHistoryMode ? (persisted?.ride.importedFromStrava ?? false) : false,
  );
  const [reconcilerActive, setReconcilerActive] = useState(false);
  const [reconcilerExpired, setReconcilerExpired] = useState(false);

  // Re-read ride from DB after a reconcile resolution
  function refreshFromDb(rideId: string) {
    const detail = loadRideDetail(rideId);
    if (!detail) return;
    setPersisted(detail);
    setDataSource(detail.ride.dataSource);
  }

  // Start reconciler when we have a saved id + token + provisional state
  const handleRef = useRef<ReconcilerHandle | null>(null);
  useEffect(() => {
    if (!savedRideId || !stravaAccessToken || dataSource === 'strava' || importedFromStrava) {
      return;
    }
    setReconcilerActive(true);
    setReconcilerExpired(false);
    const startMs = effectiveStartedAt || Date.now();
    const handle = startReconciliation(savedRideId, startMs, stravaAccessToken, () => {
      setReconcilerActive(false);
      refreshFromDb(savedRideId);
    });
    handleRef.current = handle;
    return () => {
      handle.stop();
      setReconcilerActive(false);
    };
  }, [savedRideId, stravaAccessToken, dataSource, importedFromStrava, effectiveStartedAt]);

  const [isChecking, setIsChecking] = useState(false);
  const onCheckAgain = async () => {
    if (!savedRideId || !stravaAccessToken || isChecking) return;
    setIsChecking(true);
    setReconcilerActive(true);
    const result = await forceReconcileOnce(savedRideId, stravaAccessToken);
    setIsChecking(false);
    setReconcilerActive(false);
    if (result === 'matched') refreshFromDb(savedRideId);
    else setReconcilerExpired(true);
  };

  const [showChooser, setShowChooser] = useState(false);
  const [chooserCandidates, setChooserCandidates] = useState(() => getCachedActivities());
  const onWrongActivity = () => {
    setChooserCandidates(getCachedActivities());
    setShowChooser(true);
  };
  const onPickActivity = async (activityId: number) => {
    setShowChooser(false);
    if (!savedRideId || !stravaAccessToken) return;
    try {
      await remapRideToActivity(savedRideId, activityId, stravaAccessToken);
      refreshFromDb(savedRideId);
    } catch (err) {
      console.warn('[PostRide] remap failed:', err);
    }
  };
  const onUnmap = async () => {
    setShowChooser(false);
    if (!savedRideId) return;
    await unmapRide(savedRideId);
    refreshFromDb(savedRideId);
    setDataSource('provisional');
  };

  // Derive sync state for the badge
  const syncState: SyncState = (() => {
    if (importedFromStrava) return 'imported';
    if (dataSource === 'strava') return 'synced';
    if (reconcilerActive) return 'awaiting';
    return 'phone-recorded';
  })();

  const currentMappedId = useMemo(() => {
    const id = isHistoryMode ? persisted?.ride.stravaActivityId : null;
    return id ? Number(id) : null;
  }, [isHistoryMode, persisted]);

  // Build segment results — include skipped segments
  const segmentResults = useMemo(() => {
    if (isHistoryMode && persisted) {
      return persisted.efforts.map(e => ({
        id: e.segmentId,
        name: e.segmentName,
        timeSec: e.timeSec,
        isNewPR: e.isNewPR,
        gapToPreSeconds: e.gapToPreSeconds,
        // Point-in-time PR (best as of that ride): gap = time − bestTime, so
        // bestTime = time − gap. First effort (isNewPR && gap===0) had no PR.
        prTimeSec: e.isNewPR && e.gapToPreSeconds === 0 ? undefined : e.timeSec - e.gapToPreSeconds,
        wasSkipped: false,
        cueTextPlayed: e.cueTextPlayed ?? undefined,
        highlightPath: sliceTrackBySegment(
          effectiveTrack,
          e.startLat != null && e.startLng != null ? { lat: e.startLat, lng: e.startLng } : null,
          e.endLat != null && e.endLng != null ? { lat: e.endLat, lng: e.endLng } : null,
        ),
      }));
    }
    const completedIds = new Set(completedSegments.map(c => c.segmentId));
    const results: Array<{
      id: string; name: string; timeSec: number; isNewPR: boolean;
      gapToPreSeconds: number; prTimeSec?: number; wasSkipped: boolean;
      cueTextPlayed?: string; highlightPath?: LatLng[];
    }> = [];

    // Add completed segments
    for (const c of completedSegments) {
      const seg = starredSegments.find(s => s.id === c.segmentId);
      results.push({
        id: c.segmentId,
        name: c.name,
        timeSec: c.timeSec,
        isNewPR: c.isNewPR,
        gapToPreSeconds: c.gapToPreSeconds,
        prTimeSec: c.prTimeSec,
        wasSkipped: false,
        cueTextPlayed: c.cueTextPlayed,
        highlightPath: sliceTrackBySegment(
          effectiveTrack,
          seg ? { lat: seg.startLat, lng: seg.startLng } : null,
          seg ? { lat: seg.endLat, lng: seg.endLng } : null,
        ),
      });
    }

    // Add skipped segments (on route but not completed)
    for (const segId of routeSegmentIds) {
      if (completedIds.has(segId)) continue;
      const seg = starredSegments.find(s => s.id === segId);
      results.push({
        id: segId,
        name: seg?.name ?? 'Unknown segment',
        timeSec: 0,
        isNewPR: false,
        gapToPreSeconds: 0,
        wasSkipped: true,
      });
    }

    return results;
  }, [isHistoryMode, persisted, completedSegments, routeSegmentIds, starredSegments, effectiveTrack]);

  // Generate debrief text — use persisted text in history mode if present
  const debriefText = useMemo(() => {
    if (isHistoryMode) {
      if (persisted?.ride.debriefText) return persisted.ride.debriefText;
      const fakeCompleted = (persisted?.efforts ?? []).map(e => ({
        segmentId: e.segmentId,
        name: e.segmentName,
        timeSec: e.timeSec,
        isNewPR: e.isNewPR,
        gapToPreSeconds: e.gapToPreSeconds,
        prTimeSec: undefined,
        wasSkipped: false,
      }));
      return generateDebrief(fakeCompleted, durationSec, effectiveDistanceKm);
    }
    return generateDebrief(completedSegments, durationSec, distanceKm);
  }, [isHistoryMode, persisted, completedSegments, durationSec, distanceKm, effectiveDistanceKm]);

  // Speak the debrief once, only when explicitly requested (a fresh in-app End passes
  // speakDebrief). History replays and deferred summaries stay silent.
  const speakDebrief = route.params.speakDebrief ?? false;
  const spokenRef = useRef(false);
  useEffect(() => {
    if (!speakDebrief || spokenRef.current || !debriefText) return;
    spokenRef.current = true;
    speak(debriefText);
  }, [debriefText, speakDebrief]);

  const rideName = useMemo(() => {
    if (isHistoryMode && persisted) return persisted.ride.name;
    const hour = new Date(rideStartedAt ?? Date.now()).getHours();
    if (hour < 12) return 'Morning Ride';
    if (hour < 17) return 'Afternoon Ride';
    return 'Evening Ride';
  }, [rideStartedAt, isHistoryMode, persisted]);

  const rideDate = useMemo(() => {
    const d = new Date(effectiveStartedAt);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [effectiveStartedAt]);

  function handleDone() {
    if (!isHistoryMode) useRideStore.getState().resetRide();
    navigation.getParent()?.navigate('Main', { screen: 'Home' });
  }

  // Hardware/gesture back from ride details always returns to Home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isHistoryMode) useRideStore.getState().resetRide();
      navigation.getParent()?.navigate('Main', { screen: 'Home' });
      return true;
    });
    return () => sub.remove();
  }, [isHistoryMode, navigation]);

  const showConnectStravaHint = !stravaAccessToken && syncState === 'phone-recorded' && !isHistoryMode;
  const showAwaitingExpiredHint = reconcilerExpired && syncState === 'phone-recorded';

  // ── Unified Home Feed: lazy summary, metrics, audio state, sparkline trends ──
  const jwt = useAuthStore((s) => s.jwt);
  const [summaryState, setSummaryState] = useState<SummaryTextState>('loading');
  const [summaryText, setSummaryText] = useState<string>('');
  const [audioState, setAudioState] = useState<AudioButtonState>('idle');
  const [metricsView, setMetricsView] = useState<ReturnType<typeof computeMetricsForRide> | null>(null);
  const summaryLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!savedRideId) return;
    if (summaryLoadedRef.current === savedRideId) return;
    summaryLoadedRef.current = savedRideId;

    // Recompute metrics from the just-persisted row
    const ride = db.select().from(rides).where(eq(rides.id, savedRideId)).get();
    if (ride) setMetricsView(computeMetricsForRide(ride));

    setSummaryState('loading');
    getOrGenerateSummary(savedRideId, jwt)
      .then((result) => {
        setSummaryText(result.text);
        setSummaryState(result.status === 'fallback' ? 'fallback' : 'loaded');
      })
      .catch(() => setSummaryState('fallback'));
  }, [savedRideId, jwt]);

  // Map metrics view → MetricsBlock props
  const metricsProps = useMemo(() => {
    if (!metricsView) return undefined;
    const hrRow = metricsView.rows.find((r) => r.label === 'Avg HR');
    const wRow = metricsView.rows.find((r) => r.label === 'Avg Power');
    const weekRow = metricsView.rows.find((r) => r.label === 'This week');
    const ride = savedRideId
      ? db.select().from(rides).where(eq(rides.id, savedRideId)).get()
      : null;
    return {
      avgHrBpm: ride?.avgHrBpm ?? undefined,
      avgHrDeltaPct: hrRow?.delta?.pct
        ? (hrRow.delta.direction === 'down' ? hrRow.delta.pct : -hrRow.delta.pct)
        : undefined,
      avgWatts: ride?.avgWatts ?? undefined,
      avgWattsDeltaPct: wRow?.delta?.pct
        ? (wRow.delta.direction === 'up' ? wRow.delta.pct : -wRow.delta.pct)
        : undefined,
      fitnessTrend: weekRow
        ? {
            weeklyDistanceKm: parseInt(weekRow.value, 10) || 0,
            direction: weekRow.delta?.direction ?? 'flat',
          }
        : undefined,
      baselineProgress: metricsView.baselineBuildingCount !== undefined
        ? { current: metricsView.baselineBuildingCount, required: BASELINE_TARGET }
        : undefined,
    };
  }, [metricsView, savedRideId]);

  // Audio CTA: live-coach already auto-spoke; here we just play on demand from cached/lazy summary
  const handleListenDebrief = () => {
    if (audioState === 'playing') {
      stopTTS();
      setAudioState('idle');
      return;
    }
    const text = summaryText || debriefText;
    if (!text) return;
    setAudioState('playing');
    speak(text, {
      onDone: () => setAudioState('idle'),
      onStopped: () => setAudioState('idle'),
    });
  };
  useEffect(() => {
    return () => { stopTTS(); };
  }, []);

  // Attach recent-effort trends to segment results for sparklines
  const segmentResultsWithTrends = useMemo(() => {
    if (!rider || !savedRideId) return segmentResults;
    const ride = db.select().from(rides).where(eq(rides.id, savedRideId)).get();
    if (!ride) return segmentResults;
    return segmentResults.map((seg) => {
      const trend = loadSegmentEffortTrend(seg.id, rider.id, ride.startedAt, 5);
      return { ...seg, recentEffortsSec: trend.map((t) => t.timeSec) };
    });
  }, [segmentResults, savedRideId, rider]);

  const chooserList = chooserCandidates.map((a) => ({
    id: a.id,
    name: a.name,
    startedAt: Math.floor(new Date(a.start_date).getTime() / 1000),
    distanceM: a.distance,
    elapsedSec: a.moving_time,
  }));

  return (
    <>
      <PostRideSummaryScreen
        rideName={rideName}
        rideDate={rideDate}
        distanceKm={effectiveDistanceKm}
        durationSec={durationSec}
        elevationM={isHistoryMode ? (persisted?.ride.elevationM ?? 0) : 0}
        avgHrBpm={isHistoryMode ? (persisted?.ride.avgHrBpm ?? undefined) : undefined}
        avgWatts={isHistoryMode ? (persisted?.ride.avgWatts ?? undefined) : undefined}
        rideTrack={effectiveTrack}
        segmentResults={segmentResultsWithTrends}
        syncState={syncState}
        segmentDataSource={dataSource}
        onWrongActivity={syncState === 'synced' && !importedFromStrava && stravaAccessToken ? onWrongActivity : undefined}
        onCheckAgain={syncState === 'phone-recorded' && stravaAccessToken ? onCheckAgain : undefined}
        showConnectStravaHint={showConnectStravaHint}
        showAwaitingExpiredHint={showAwaitingExpiredHint}
        debriefText={summaryText || debriefText}
        coachedBySherpaa={!isHistoryMode || (persisted?.ride.coachedBySherpaa ?? false)}
        summaryState={summaryState}
        metrics={metricsProps}
        audioState={audioState}
        onListenDebrief={handleListenDebrief}
        onShare={() => {}}
        onDone={handleDone}
      />
      <WrongActivityChooser
        visible={showChooser}
        currentlyMappedId={currentMappedId}
        candidates={chooserList}
        onPick={onPickActivity}
        onUnmap={onUnmap}
        onDismiss={() => setShowChooser(false)}
      />
    </>
  );
}

// ─── Paywall ──────────────────────────────────────────────────────────────────

export function PaywallScreenWrapper() {
  const navigation = useNavigation<RideNav>();
  return (
    <PaywallScreen
      onClose={() => navigation.goBack()}
      onSelectPlan={(planId) => {
        console.log('Selected plan:', planId);
        navigation.goBack();
      }}
      onRestorePurchases={() => {}}
      trialEligible={true}
    />
  );
}
