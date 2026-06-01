import 'react-native-gesture-handler'; // must be first import
import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import RootNavigator from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrations';
import { colors } from './src/constants/colors';
import { loadStarredSegments } from './src/services/segmentService';
import { useSegmentStore } from './src/store/segmentStore';
import { useAuthStore } from './src/store/authStore';
import { reconcileOnLaunch } from './src/services/stravaReconciler';
import { sql } from 'drizzle-orm';
import { db } from './src/db/client';
import { riders } from './src/db/schema';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const lastReconcileRef = useRef(0);

  useEffect(() => {
    runMigrations()
      .then(async () => {
        console.log('[App] migrations done');
        // Backfill local riders row for already-authed users (pre-fix data)
        const cachedRider = useAuthStore.getState().rider;
        if (cachedRider) {
          try {
            const nowSec = Math.floor(Date.now() / 1000);
            db.insert(riders)
              .values({
                id: cachedRider.id,
                stravaAthleteId: cachedRider.stravaAthleteId,
                name: cachedRider.name,
                avatarUrl: cachedRider.avatarUrl ?? null,
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
            console.log('[App] backfilled local rider row');
          } catch (err) {
            console.warn('[App] rider backfill failed:', err);
          }
        }
        const segs = await loadStarredSegments();
        console.log('[App] segments loaded from DB:', segs.length);
        if (segs.length > 0) {
          useSegmentStore.getState().setStarredSegments(segs);
        }
        setDbReady(true);
      })
      .catch((err) => {
        console.error('[App] DB migration failed:', err);
        setDbReady(true);
      });
  }, []);

  // App-foreground launch reconciler (Phone-as-Coach amendment)
  useEffect(() => {
    if (!dbReady) return;

    async function runReconcile() {
      // Debounce: at most once per 60s
      const now = Date.now();
      if (now - lastReconcileRef.current < 60_000) return;
      lastReconcileRef.current = now;

      const token = useAuthStore.getState().stravaAccessToken;
      if (!token) return;
      try {
        const { reconciledRideIds } = await reconcileOnLaunch(token);
        if (reconciledRideIds.length > 0) {
          console.log('[App] launch reconciler upgraded rides:', reconciledRideIds);
        }
      } catch (err) {
        console.warn('[App] launch reconcile failed:', err);
      }
    }

    // Cold start
    runReconcile();

    // On foreground
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') runReconcile();
    });
    return () => sub.remove();
  }, [dbReady]);

  if (!dbReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
