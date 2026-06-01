import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import RideFeedRow from './RideFeedRow';
import type { SyncState } from './SyncStateBadge';
import type { AudioButtonState } from './InlineAudioButton';
import { GoalMode, GOAL_LABELS } from '../types/goalMode';
import type { LatLng } from '../utils/polyline';

export interface FeedRide {
  id: string;
  title: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  syncState: SyncState;
  coachedBySherpaa: boolean;
  hasDebriefCached: boolean;
  routeCoords?: LatLng[];
}

interface Props {
  athleteName: string;
  starredSegmentCount: number;
  lastSyncedAt: string;
  feed: FeedRide[];
  feedTotal: number;
  feedLoading: boolean;
  feedAudioState: (rideId: string) => AudioButtonState;
  hasStravaToken: boolean;
  canStartRideDirectly: boolean;
  selectedMode: GoalMode;
  cuesPreparing: boolean;
  isSyncing: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectMode: (mode: GoalMode) => void;
  onStartRide: () => void;
  onRideTap: (rideId: string) => void;
  onAudioPress: (rideId: string) => void;
  onLoadMore: () => void;
  onConnectStrava: () => void;
}

export default function HomeScreen({
  athleteName,
  starredSegmentCount,
  lastSyncedAt,
  feed,
  feedTotal,
  feedLoading,
  feedAudioState,
  hasStravaToken,
  canStartRideDirectly,
  selectedMode,
  cuesPreparing,
  isSyncing,
  isRefreshing,
  onRefresh,
  onSelectMode,
  onStartRide,
  onRideTap,
  onAudioPress,
  onLoadMore,
  onConnectStrava,
}: Props) {
  const greeting = `Good ${getTimeOfDay()}, ${athleteName.split(' ')[0]}.`;

  const renderFeedSection = () => {
    if (feedLoading && feed.length === 0) {
      // 3 shimmer ghost rows
      return (
        <>
          {[0, 1, 2].map((i) => (
            <ShimmerRow key={i} />
          ))}
        </>
      );
    }
    if (feed.length === 0) {
      if (!hasStravaToken) {
        return (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>Connect Strava to see your recent rides.</Text>
            <TouchableOpacity style={styles.connectBtn} onPress={onConnectStrava} activeOpacity={0.8}>
              <Text style={styles.connectBtnText}>Connect Strava →</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>No rides in the last 30 days.</Text>
          <Text style={styles.emptySub}>Your next ride will appear here automatically.</Text>
        </View>
      );
    }
    return (
      <>
        {feed.map((r) => (
          <RideFeedRow
            key={r.id}
            rideId={r.id}
            title={r.title}
            date={r.date}
            distanceKm={r.distanceKm}
            durationSec={r.durationSec}
            syncState={r.syncState}
            coachedBySherpaa={r.coachedBySherpaa}
            hasDebriefCached={r.hasDebriefCached}
            routeCoords={r.routeCoords}
            audioState={feedAudioState(r.id)}
            onPress={() => onRideTap(r.id)}
            onAudioPress={() => onAudioPress(r.id)}
          />
        ))}
        {feed.length < feedTotal ? (
          <TouchableOpacity style={styles.loadMore} onPress={onLoadMore} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.loadMoreText}>Load more</Text>
          </TouchableOpacity>
        ) : feed.length >= 10 ? (
          <TouchableOpacity style={styles.loadMore} onPress={onLoadMore} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.loadMoreText}>See full history →</Text>
          </TouchableOpacity>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
      >

        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <View style={styles.syncRow}>
              {(isSyncing || feedLoading) && (
                <ActivityIndicator size="small" color={colors.gold} style={styles.syncSpinner} />
              )}
              <Text style={styles.syncStatus}>
                {feedLoading && feed.length === 0
                  ? 'Loading your rides...'
                  : isSyncing
                    ? 'Syncing segments from Strava...'
                    : `${starredSegmentCount} starred segments · Last synced ${lastSyncedAt}`}
              </Text>
            </View>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{athleteName[0]}</Text>
          </View>
        </View>

        <Text style={styles.modeLabel}>Goal Mode</Text>
        <View style={styles.modeChips} accessibilityRole="radiogroup">
          {(['pr', 'training', 'recovery'] as GoalMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.goalChip, selectedMode === mode && styles.goalChipSelected]}
              onPress={() => onSelectMode(mode)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedMode === mode }}
              accessibilityLabel={`${GOAL_LABELS[mode]} mode`}
            >
              <Text style={[styles.goalChipText, selectedMode === mode && styles.goalChipTextSelected]}>
                {GOAL_LABELS[mode]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.startBtn, !canStartRideDirectly && styles.startBtnDisabled]}
          onPress={onStartRide}
          disabled={!canStartRideDirectly}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStartRideDirectly }}
          accessibilityLabel={`Start ride in ${GOAL_LABELS[selectedMode]} mode`}
        >
          <Text style={styles.startBtnText}>Start Ride</Text>
        </TouchableOpacity>

        {!canStartRideDirectly ? (
          <View style={styles.helperCard}>
            <Text style={styles.helperText}>Star segments on Strava, then sync to start a coached ride.</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : cuesPreparing ? (
          <Text style={styles.coldNote}>
            Coaching cues are still preparing — your ride starts now, cues fill in shortly.
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>Recent Rides</Text>
        {renderFeedSection()}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShimmerRow() {
  return (
    <View style={styles.shimmerCard}>
      <View style={[styles.shimmerLine, { width: '70%', height: 16 }]} />
      <View style={[styles.shimmerLine, { width: '90%', height: 14, marginTop: 8 }]} />
      <View style={[styles.shimmerLine, { width: '40%', height: 12, marginTop: 8 }]} />
    </View>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  syncRow: { flexDirection: 'row', alignItems: 'center' },
  syncSpinner: { marginRight: 6 },
  syncStatus: { fontSize: 13, color: colors.textMuted },
  avatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.textOnGold },
  modeLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textDim, textTransform: 'uppercase',
    letterSpacing: 1.2, paddingHorizontal: 20, paddingBottom: 10,
  },
  modeChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  goalChip: {
    flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  goalChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  goalChipText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  goalChipTextSelected: { color: colors.textOnGold, fontWeight: '600' },
  startBtn: {
    marginHorizontal: 20, height: 54, borderRadius: 999, backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.35 },
  startBtnText: { fontSize: 17, fontWeight: '600', color: colors.textOnGold },
  helperCard: {
    marginHorizontal: 20, marginTop: 12, padding: 16, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  helperText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  refreshBtn: {
    marginTop: 14, alignSelf: 'flex-start', height: 40, paddingHorizontal: 18, borderRadius: 999,
    borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  refreshBtnText: { fontSize: 14, fontWeight: '600', color: colors.gold },
  coldNote: {
    marginHorizontal: 24, marginTop: 10, fontSize: 12, fontWeight: '500',
    color: colors.textMuted, textAlign: 'center', lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textDim, textTransform: 'uppercase',
    letterSpacing: 1.2, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12,
  },
  emptyBlock: { paddingVertical: 40, paddingHorizontal: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, color: colors.textSecondary, fontWeight: '500', textAlign: 'center', marginBottom: 8 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  connectBtn: {
    marginTop: 16, height: 44, paddingHorizontal: 24, borderRadius: 999,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  connectBtnText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  loadMore: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: colors.gold },
  shimmerCard: {
    marginHorizontal: 20, marginBottom: 10, padding: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  shimmerLine: { borderRadius: 4, backgroundColor: colors.surfaceAlt },
});
