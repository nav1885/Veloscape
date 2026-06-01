import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';

import HomeScreen from '../components/HomeScreen';
import type { FeedRide } from '../components/HomeScreen';
import { useAuthStore } from '../store/authStore';
import { useSegmentStore } from '../store/segmentStore';
import { loadStarredSegments, getStarredSegmentCount } from '../services/segmentService';
import { getExistingCueSegmentIds } from '../services/cueService';
import { preWarmCuesForMode } from '../services/cueWarm';
import { useSettingsStore } from '../store/settingsStore';
import { getActivitySummaryPolyline } from '../services/activityService';
import { resolveRideRouteCoords } from '../services/routeResolver';
import { getActivityDetail } from '../services/stravaApi';
import { upsertCachedActivityFromDetail } from '../services/homeIngestor';
import { syncStarredSegments } from '../services/segmentSync';
import { refreshStravaToken } from '../services/stravaAuth';
import { TTL } from '../constants/ttl';
import { ingestRecentActivities, loadHomeFeed } from '../services/homeIngestor';
import { speak, stop as stopTTS } from '../services/ttsService';
import { getOrGenerateSummary } from '../services/rideSummaryService';
import type { AudioButtonState } from '../components/InlineAudioButton';

type Nav = StackNavigationProp<RootStackParamList>;

let _syncedThisSession = false;
let _ingestedThisSession = false;
let _routeBackfilledThisSession = false;

export default function HomeTab() {
  const navigation = useNavigation<Nav>();
  const rider = useAuthStore((s) => s.rider);
  const jwt = useAuthStore((s) => s.jwt);
  const stravaAccessToken = useAuthStore((s) => s.stravaAccessToken);
  const stravaRefreshToken = useAuthStore((s) => s.stravaRefreshToken);
  const stravaTokenExpiresAt = useAuthStore((s) => s.stravaTokenExpiresAt);
  const lastSegmentSyncAt = useAuthStore((s) => s.lastSegmentSyncAt);
  const setStravaToken = useAuthStore((s) => s.setStravaToken);
  const setLastSegmentSyncAt = useAuthStore((s) => s.setLastSegmentSyncAt);
  const setStarredSegments = useSegmentStore((s) => s.setStarredSegments);
  const starredSegments = useSegmentStore((s) => s.starredSegments);
  const lastGoalMode = useSettingsStore((s) => s.lastGoalMode);
  const setLastGoalMode = useSettingsStore((s) => s.setLastGoalMode);

  const [segmentCount, setSegmentCount] = useState(() => getStarredSegmentCount());
  const [lastSynced, setLastSynced] = useState('—');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feed, setFeed] = useState<FeedRide[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLimit, setFeedLimit] = useState(10);
  const [playingRideId, setPlayingRideId] = useState<string | null>(null);
  const [generatingRideId, setGeneratingRideId] = useState<string | null>(null);
  const [cuesPreparing, setCuesPreparing] = useState(false);

  useEffect(() => {
    if (starredSegments.length > 0) {
      setSegmentCount(starredSegments.length);
      setLastSynced(formatSyncAge(lastSegmentSyncAt));
    }
  }, [starredSegments.length, lastSegmentSyncAt]);

  // Cold-cue whisper: true when the selected mode lacks fresh cues for some
  // starred segments (the ride still starts; cold segments use the fallback line).
  useEffect(() => {
    const ids = starredSegments.map((s) => s.id);
    if (ids.length === 0) { setCuesPreparing(false); return; }
    const fresh = getExistingCueSegmentIds(ids, lastGoalMode);
    setCuesPreparing(fresh.size < ids.length);
  }, [starredSegments, lastGoalMode]);

  // Load feed from SQLite whenever Home gains focus
  const reloadFeed = useCallback(() => {
    if (!rider) return;
    const rows = loadHomeFeed(rider.id);
    setFeed(rows.map(toFeedRide));
  }, [rider]);

  useFocusEffect(useCallback(() => {
    reloadFeed();
  }, [reloadFeed]));

  // Background ingest: pull last 30 days of Strava rides into the feed once per session
  useEffect(() => {
    if (!rider || !stravaAccessToken || _ingestedThisSession) return;

    const empty = feed.length === 0;
    if (empty) setFeedLoading(true);
    _ingestedThisSession = true;

    (async () => {
      try {
        const token = await ensureFreshToken();
        if (!token) return;
        const result = await ingestRecentActivities(token, rider.id, {
          onListIngested: () => {
            // First pass: basic rows are in SQLite — show them now
            reloadFeed();
            setFeedLoading(false);
          },
        });
        console.log('[HomeTab] ingest:', result);
        reloadFeed(); // second pass: efforts/sparklines populated
      } catch (err) {
        console.warn('[HomeTab] ingest failed:', err);
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [rider?.id, stravaAccessToken]);

  // Background backfill: cache missing Strava route polylines (capped per
  // session) so Recent Rides tiles fill in their route thumbnails over time.
  useEffect(() => {
    if (!rider || !stravaAccessToken || _routeBackfilledThisSession) return;
    _routeBackfilledThisSession = true;
    (async () => {
      const token = await ensureFreshToken();
      if (!token) return;
      const rows = loadHomeFeed(rider.id);
      const missing = rows
        .filter((r) => !r.gpxTrack && r.stravaActivityId && !getActivitySummaryPolyline(Number(r.stravaActivityId)))
        .slice(0, 8);
      if (!missing.length) return;
      for (const r of missing) {
        try {
          const detail = await getActivityDetail(Number(r.stravaActivityId), token);
          upsertCachedActivityFromDetail(detail);
        } catch (err) {
          console.warn('[HomeTab] route backfill failed:', r.stravaActivityId, err);
        }
      }
      reloadFeed();
    })();
  }, [rider?.id, stravaAccessToken]);

  // Existing segment sync (separate concern)
  useEffect(() => {
    if (!stravaAccessToken || !stravaRefreshToken || !jwt) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const isStale = !lastSegmentSyncAt || (nowSec - lastSegmentSyncAt) > TTL.SEGMENT_LIST_SEC;
    const isEmpty = getStarredSegmentCount() === 0;
    if (!isStale && !isEmpty) return;
    if (_syncedThisSession && !isEmpty) return;
    _syncedThisSession = true;

    let cancelled = false;
    (async () => {
      setIsSyncing(true);
      setLastSynced('Syncing…');
      const token = await ensureFreshToken();
      if (!token) { setIsSyncing(false); setLastSynced('Sync failed'); return; }
      try {
        await syncStarredSegments(token, undefined, { listOnly: true });
        if (cancelled) return;
        const segs = await loadStarredSegments();
        setStarredSegments(segs);
        setSegmentCount(segs.length);
        const ts = Math.floor(Date.now() / 1000);
        setLastSegmentSyncAt(ts);
        setLastSynced('Just now');
        if (jwt) preWarmCuesForMode(lastGoalMode, jwt).catch(() => {});
      } catch (err) {
        console.error('[HomeTab] sync error:', err);
        if (!cancelled) setLastSynced('Sync failed');
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [stravaAccessToken]);

  async function ensureFreshToken(force = false): Promise<string | null> {
    if (!stravaAccessToken) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const expiringSoon = !!stravaTokenExpiresAt && stravaTokenExpiresAt <= nowSec + 60;
    if (!force && !expiringSoon) return stravaAccessToken;
    if (!stravaRefreshToken || !jwt) {
      console.warn('[HomeTab] refresh skipped — missing', { hasRefresh: !!stravaRefreshToken, hasJwt: !!jwt });
      return stravaAccessToken;
    }
    try {
      console.log('[HomeTab] refreshing Strava token...');
      const refreshed = await refreshStravaToken(stravaRefreshToken, jwt);
      setStravaToken(refreshed.accessToken, refreshed.expiresAt);
      console.log('[HomeTab] token refreshed; new expiry', refreshed.expiresAt);
      return refreshed.accessToken;
    } catch (err) {
      console.warn('[HomeTab] token refresh failed:', err);
      return stravaAccessToken;
    }
  }

  const handleRefresh = async () => {
    if (!stravaAccessToken || !stravaRefreshToken || !jwt || !rider) return;
    setIsRefreshing(true);
    setLastSynced('Syncing…');
    // Pull-to-refresh always forces a token refresh — Strava may have expired
    // it server-side even if local expiry timestamp says otherwise.
    const token = await ensureFreshToken(true);
    if (!token) { setIsRefreshing(false); setLastSynced('Sync failed'); return; }
    const run = async (t: string) => Promise.all([
      syncStarredSegments(t, undefined, { listOnly: true }).then(async () => {
        const segs = await loadStarredSegments();
        setStarredSegments(segs);
        setSegmentCount(segs.length);
        const ts = Math.floor(Date.now() / 1000);
        setLastSegmentSyncAt(ts);
        if (jwt) preWarmCuesForMode(lastGoalMode, jwt).catch(() => {});
      }),
      ingestRecentActivities(t, rider.id, { onListIngested: reloadFeed }).then(reloadFeed),
    ]);

    try {
      await run(token);
      setLastSynced('Just now');
    } catch (err: any) {
      // On 401: force-refresh and retry once
      const isAuth = String(err?.message ?? '').includes('TOKEN_EXPIRED') || String(err?.message ?? '').includes('401');
      if (isAuth) {
        const retryToken = await ensureFreshToken(true);
        if (retryToken && retryToken !== token) {
          try {
            await run(retryToken);
            setLastSynced('Just now');
            setIsRefreshing(false);
            return;
          } catch (err2) {
            console.warn('[HomeTab] retry-after-refresh failed:', err2);
          }
        }
      }
      console.warn('[HomeTab] refresh error:', err);
      setLastSynced('Sync failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAudioPress = async (rideId: string) => {
    // Toggle stop
    if (playingRideId === rideId) {
      stopTTS();
      setPlayingRideId(null);
      return;
    }
    if (playingRideId) stopTTS();
    setPlayingRideId(null);
    setGeneratingRideId(rideId);
    try {
      const { text } = await getOrGenerateSummary(rideId, jwt);
      setGeneratingRideId(null);
      setPlayingRideId(rideId);
      speak(text, {
        onDone: () => setPlayingRideId((cur) => (cur === rideId ? null : cur)),
        onStopped: () => setPlayingRideId((cur) => (cur === rideId ? null : cur)),
      });
    } catch (err) {
      console.warn('[HomeTab] audio fail:', err);
      setGeneratingRideId(null);
    }
  };

  // Stop audio on blur
  useFocusEffect(useCallback(() => {
    return () => {
      stopTTS();
      setPlayingRideId(null);
      setGeneratingRideId(null);
    };
  }, []));

  // Quick-Start: load starred segments (engine builds trackers from the store,
  // which may be unpopulated when sync was skipped), then go straight to InRide.
  const handleStartRide = async () => {
    const segs = await loadStarredSegments();
    if (!segs.length) return;
    setStarredSegments(segs);
    navigation.navigate('Ride', {
      screen: 'InRide',
      params: { segmentIds: segs.map((s) => s.id), goalMode: lastGoalMode },
    });
  };

  const firstName = rider?.name.split(' ')[0] ?? 'Rider';

  const feedAudioState = (rideId: string): AudioButtonState => {
    if (generatingRideId === rideId) return 'generating';
    if (playingRideId === rideId) return 'playing';
    return 'idle';
  };

  return (
    <HomeScreen
      athleteName={firstName}
      starredSegmentCount={segmentCount}
      lastSyncedAt={lastSynced}
      feed={feed.slice(0, feedLimit)}
      feedTotal={feed.length}
      feedLoading={feedLoading}
      feedAudioState={feedAudioState}
      hasStravaToken={!!stravaAccessToken}
      canStartRideDirectly={segmentCount > 0}
      selectedMode={lastGoalMode}
      cuesPreparing={cuesPreparing}
      isSyncing={isSyncing}
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
      onSelectMode={setLastGoalMode}
      onStartRide={handleStartRide}
      onRideTap={(rideId) =>
        navigation.navigate('Ride', { screen: 'PostRideSummary', params: { rideId } })
      }
      onAudioPress={handleAudioPress}
      onLoadMore={() => {
        if (feedLimit < feed.length) setFeedLimit(feedLimit + 10);
        else navigation.navigate('Main', { screen: 'History' });
      }}
      onConnectStrava={() => navigation.navigate('Auth', { screen: 'StravaConnect' })}
    />
  );
}

function toFeedRide(r: ReturnType<typeof loadHomeFeed>[number]): FeedRide {
  const syncState: FeedRide['syncState'] = r.importedFromStrava
    ? 'imported'
    : r.dataSource === 'strava'
      ? 'synced'
      : 'phone-recorded';
  return {
    id: r.id,
    title: r.name,
    date: formatRelativeDate(r.startedAt),
    distanceKm: r.distanceM / 1000,
    durationSec: r.endedAt - r.startedAt,
    syncState,
    coachedBySherpaa: r.coachedBySherpaa,
    hasDebriefCached: !!r.debriefText,
    routeCoords: resolveRideRouteCoords(r),
  };
}

function formatRelativeDate(unixSec: number): string {
  const now = Date.now() / 1000;
  const ageSec = now - unixSec;
  const d = new Date(unixSec * 1000);
  if (ageSec < 24 * 3600) return 'TODAY';
  if (ageSec < 48 * 3600) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function formatSyncAge(ts: number | null): string {
  if (!ts) return '—';
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (ageSec < 60) return 'Just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}
