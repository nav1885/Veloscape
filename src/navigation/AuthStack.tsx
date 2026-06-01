import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';

import { AuthStackParamList } from './types';
import WelcomeScreen from '../components/WelcomeScreen';
import CarouselScreen from '../components/CarouselScreen';
import StravaConnectScreen, { ConnectState } from '../components/StravaConnectScreen';
import ConnectedScreen from '../components/ConnectedScreen';

import { useAuthStore } from '../store/authStore';
import { syncStarredSegments, SyncProgress } from '../services/segmentSync';
import { API_URL, STRAVA_CLIENT_ID } from '../constants/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { riders } from '../db/schema';

const Stack = createStackNavigator<AuthStackParamList>();
type AuthNav = StackNavigationProp<AuthStackParamList>;

// The backend /oauth/callback URL — Strava redirects here (proper HTTPS)
const REDIRECT_URI = `${API_URL}/oauth/callback`;

// Strava authorization URL
function buildStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    approval_prompt: 'auto',
    scope: 'read,activity:read,profile:read_all',
  });
  return `https://www.strava.com/oauth/mobile/authorize?${params.toString()}`;
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function WelcomeWrapper() {
  const navigation = useNavigation<AuthNav>();
  return (
    <WelcomeScreen
      onGetStarted={() => navigation.navigate('Carousel')}
      onSignIn={() => navigation.navigate('StravaConnect')}
    />
  );
}

// ─── Carousel ─────────────────────────────────────────────────────────────────

function CarouselWrapper() {
  const navigation = useNavigation<AuthNav>();
  return (
    <CarouselScreen
      onComplete={() => navigation.navigate('StravaConnect')}
    />
  );
}

// ─── StravaConnect ────────────────────────────────────────────────────────────
// Opens the Strava auth URL in a browser. The backend handles the code exchange
// and redirects back to sherpaa://connected?jwt=...&accessToken=... etc.

function StravaConnectWrapper() {
  const navigation = useNavigation<AuthNav>();
  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const listenerRef = useRef<ReturnType<typeof Linking.addEventListener> | null>(null);

  // Listen for the deep link redirect from the backend
  useEffect(() => {
    function handleUrl({ url }: { url: string }) {
      if (!url.startsWith('sherpaa://connected')) return;

      const parsed = new URL(url);
      const error = parsed.searchParams.get('error');

      if (error) {
        setConnectState('error');
        setErrorMessage(`Strava error: ${decodeURIComponent(error)}`);
        return;
      }

      const jwt = parsed.searchParams.get('jwt') ?? '';
      const accessToken = parsed.searchParams.get('accessToken') ?? '';
      const refreshToken = parsed.searchParams.get('refreshToken') ?? '';
      const expiresAt = Number(parsed.searchParams.get('expiresAt') ?? '0');
      const riderId = parsed.searchParams.get('riderId') ?? '';
      const stravaAthleteId = parsed.searchParams.get('stravaAthleteId') ?? '';
      const name = parsed.searchParams.get('name') ?? '';
      const avatarUrl = parsed.searchParams.get('avatarUrl') ?? undefined;

      navigation.navigate('Connected', {
        athleteName: name,
        avatarUrl,
        stravaAthleteId,
        riderId,
        jwt,
        stravaAccessToken: accessToken,
        stravaRefreshToken: refreshToken,
        stravaTokenExpiresAt: expiresAt,
      });
    }

    listenerRef.current = Linking.addEventListener('url', handleUrl);

    // Also check if app was launched from the deep link
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });

    return () => {
      listenerRef.current?.remove();
    };
  }, [navigation]);

  const handleConnect = useCallback(async () => {
    if (!STRAVA_CLIENT_ID) {
      setConnectState('error');
      setErrorMessage(
        'Strava client ID is missing in this build. Set EXPO_PUBLIC_STRAVA_CLIENT_ID in .env and rebuild.',
      );
      return;
    }
    setConnectState('connecting');
    setErrorMessage(undefined);

    try {
      await WebBrowser.openBrowserAsync(buildStravaAuthUrl());
      // After browser closes, if no deep link came in, reset to idle
      setConnectState('idle');
    } catch (err: any) {
      setConnectState('error');
      setErrorMessage(err?.message ?? 'Could not open browser');
    }
  }, []);

  return (
    <StravaConnectScreen
      state={connectState}
      errorMessage={errorMessage}
      onConnect={handleConnect}
      onBack={() => navigation.goBack()}
    />
  );
}

// ─── Connected ────────────────────────────────────────────────────────────────

type StatusLine = { label: string; state: 'success' | 'loading' | 'error' | 'warning' };

function ConnectedWrapper() {
  const route = useRoute<RouteProp<AuthStackParamList, 'Connected'>>();
  const {
    athleteName, avatarUrl,
    stravaAthleteId, riderId,
    jwt, stravaAccessToken, stravaRefreshToken, stravaTokenExpiresAt,
  } = route.params;

  const setAuth = useAuthStore((s) => s.setAuth);
  const setLastSegmentSyncAt = useAuthStore((s) => s.setLastSegmentSyncAt);
  const [locationGranted, setLocationGranted] = useState(false);

  const [statusLines, setStatusLines] = useState<StatusLine[]>([
    { label: 'Strava connected', state: 'success' },
    { label: 'Syncing starred segments…', state: 'loading' },
    { label: 'Requesting location access…', state: 'loading' },
  ]);

  function patchStatus(index: number, patch: Partial<StatusLine>) {
    setStatusLines(prev => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        await syncStarredSegments(stravaAccessToken, (progress: SyncProgress) => {
          if (cancelled) return;
          if (progress.phase === 'complete') {
            patchStatus(1, { label: `${progress.total} segments synced`, state: 'success' });
          } else if (progress.phase === 'error') {
            patchStatus(1, { label: 'Segment sync failed', state: 'error' });
          } else if (progress.total > 0) {
            patchStatus(1, { label: `Syncing… ${progress.done}/${progress.total}`, state: 'loading' });
          }
        }, { listOnly: true });
        // Mark sync timestamp so HomeTab won't re-sync immediately
        if (!cancelled) {
          setLastSegmentSyncAt(Math.floor(Date.now() / 1000));
        }
      } catch {
        if (!cancelled) {
          patchStatus(1, { label: 'Segments will sync on first ride', state: 'warning' });
        }
      }

      if (cancelled) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === 'granted') {
          setLocationGranted(true);
          patchStatus(2, { label: 'Location access granted', state: 'success' });
        } else {
          patchStatus(2, { label: 'Location denied — enable in Settings', state: 'warning' });
        }
      } catch {
        if (!cancelled) patchStatus(2, { label: 'Location permission failed', state: 'error' });
      }
    }

    setup();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = useCallback(() => {
    // Upsert local riders row so FK constraints on rides + segment_efforts are satisfied
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      db.insert(riders)
        .values({
          id: riderId,
          stravaAthleteId,
          name: athleteName,
          avatarUrl: avatarUrl ?? null,
          createdAt: nowSec,
          updatedAt: nowSec,
        })
        .onConflictDoUpdate({
          target: riders.id,
          set: {
            stravaAthleteId: sql`excluded.strava_athlete_id`,
            name: sql`excluded.name`,
            avatarUrl: sql`excluded.avatar_url`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    } catch (err) {
      console.warn('[Auth] failed to upsert local rider row:', err);
    }
    setAuth(
      jwt,
      { id: riderId, stravaAthleteId, name: athleteName, avatarUrl },
      { accessToken: stravaAccessToken, refreshToken: stravaRefreshToken, expiresAt: stravaTokenExpiresAt },
    );
  }, [setAuth, jwt, riderId, stravaAthleteId, athleteName, avatarUrl,
      stravaAccessToken, stravaRefreshToken, stravaTokenExpiresAt]);

  return (
    <ConnectedScreen
      athleteName={athleteName}
      locationGranted={locationGranted}
      statusLines={statusLines}
      onContinue={handleContinue}
      onEnableLocation={() => Linking.openSettings()}
    />
  );
}

// ─── Stack ────────────────────────────────────────────────────────────────────

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeWrapper} />
      <Stack.Screen name="Carousel" component={CarouselWrapper} />
      <Stack.Screen name="StravaConnect" component={StravaConnectWrapper} />
      <Stack.Screen name="Connected" component={ConnectedWrapper} />
    </Stack.Navigator>
  );
}
