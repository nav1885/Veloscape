import React, { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import {
  loadRideHistory,
  formatDistanceKm,
  formatDuration,
  formatRelativeDate,
  type RideHistoryRow,
} from '../services/rideHistoryService';
import { RootStackParamList } from '../navigation/types';
import { SyncStateBadge, type SyncState } from '../components/SyncStateBadge';
import CoachedPill from '../components/CoachedPill';
import RouteThumbnail from '../components/RouteThumbnail';
import { reconcileOnLaunch } from '../services/stravaReconciler';
import { ingestRecentActivities } from '../services/homeIngestor';

type Nav = StackNavigationProp<RootStackParamList>;

function rideToSyncState(r: RideHistoryRow): SyncState {
  if (r.importedFromStrava) return 'imported';
  if (r.dataSource === 'strava') return 'synced';
  return 'phone-recorded';
}

export default function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const riderId = useAuthStore((s) => s.rider?.id);
  const stravaAccessToken = useAuthStore((s) => s.stravaAccessToken);
  const [rides, setRides] = useState<RideHistoryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => {
    if (!riderId) return;
    setRides(loadRideHistory(riderId));
  }, [riderId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    reload();
    if (stravaAccessToken && riderId) {
      try {
        await Promise.all([
          reconcileOnLaunch(stravaAccessToken),
          ingestRecentActivities(stravaAccessToken, riderId),
        ]);
        reload();
      } catch (err) {
        console.warn('[History] reconcile failed:', err);
      }
    }
    setRefreshing(false);
  };

  const provisionalCount = rides.filter((r) => r.dataSource === 'provisional').length;
  const subtitleText =
    provisionalCount > 0 && stravaAccessToken
      ? `${rides.length} rides · ${provisionalCount} awaiting Strava`
      : `${rides.length} ${rides.length === 1 ? 'ride' : 'rides'}`;

  const renderItem = ({ item }: { item: RideHistoryRow }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate('Ride', { screen: 'PostRideSummary', params: { rideId: item.id } })
      }
      activeOpacity={0.7}
    >
      <View style={styles.rowWrap}>
        <RouteThumbnail coords={item.routeCoords} width={64} height={64} style={styles.thumb} />
        <View style={styles.content}>
          <View style={styles.rowHeader}>
            <Text style={styles.rideName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.dateText}>{formatRelativeDate(item.startedAt)}</Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="Distance" value={formatDistanceKm(item.distanceM)} />
            <Stat label="Duration" value={formatDuration(item.endedAt - item.startedAt)} />
            <Stat label="Segments" value={`${item.segmentCount}`} />
            <Stat label="PRs" value={`${item.prCount}`} accent={item.prCount > 0} />
          </View>
          <View style={styles.tagRow}>
            <View style={[styles.tag, goalTagStyle(item.goalMode)]}>
              <Text style={styles.tagText}>{goalModeLabel(item.goalMode)}</Text>
            </View>
            <SyncStateBadge state={rideToSyncState(item)} size="sm" />
            {item.coachedBySherpaa && <CoachedPill size="sm" />}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ride History</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={rides.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No rides yet</Text>
            <Text style={styles.emptyText}>Your completed rides will appear here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function goalModeLabel(g: 'pr' | 'training' | 'recovery'): string {
  if (g === 'pr') return 'PR Attempt';
  if (g === 'training') return 'Training';
  return 'Recovery';
}

function goalTagStyle(g: 'pr' | 'training' | 'recovery') {
  if (g === 'pr') return styles.goal_pr;
  if (g === 'training') return styles.goal_training;
  return styles.goal_recovery;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  thumb: { marginRight: 12 },
  content: { flex: 1 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  rideName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginRight: 8 },
  dateText: { fontSize: 12, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  stat: { flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  statValueAccent: { color: colors.gold },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  goal_pr: { backgroundColor: colors.goldDim, borderColor: colors.goldBorder },
  goal_training: { backgroundColor: colors.successDim, borderColor: colors.successBorder },
  goal_recovery: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
  tagText: { fontSize: 10, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.5 },
  tagMuted: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
  },
  tagMutedText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
});
