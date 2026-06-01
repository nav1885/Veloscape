import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { SyncStateBadge, type SyncState } from './SyncStateBadge';
import CoachedPill from './CoachedPill';
import MetricsBlock from './MetricsBlock';
import SummaryText, { type SummaryTextState } from './SummaryText';
import InlineAudioButton, { type AudioButtonState } from './InlineAudioButton';
import SegmentEffortSparkline from './SegmentEffortSparkline';
import RideRouteMap from './RideRouteMap';
import type { LatLng } from '../utils/polyline';

export interface SegmentResult {
  id: string;
  name: string;
  timeSec: number;
  isNewPR: boolean;
  gapToPreSeconds: number; // negative = new PR / faster
  prTimeSec?: number;
  wasSkipped: boolean;
  splits?: SplitPoint[];
  cueTextPlayed?: string;
  /** Last 5 effort durations on this segment (oldest → newest) */
  recentEffortsSec?: number[];
  /** This segment's slice of the ride's GPS track, for map highlighting */
  highlightPath?: LatLng[];
}

interface SplitPoint {
  label: string; // '25%' | '50%' | '75%' | 'End'
  gapSeconds: number; // vs PR at same checkpoint
}

interface Props {
  rideName: string;
  rideDate: string;
  distanceKm: number;
  durationSec: number;
  elevationM: number;
  avgHrBpm?: number;
  avgWatts?: number;
  /** Full ride GPS track ({lat,lng}); empty → "Route not recorded" */
  rideTrack: LatLng[];
  segmentResults: SegmentResult[];
  /** Phone-as-Coach sync state */
  syncState: SyncState;
  /** Source-of-truth microcopy for segment rows: 'provisional' | 'strava' */
  segmentDataSource: 'provisional' | 'strava';
  /** "Wrong activity?" link — only when syncState='synced' AND !importedFromStrava */
  onWrongActivity?: () => void;
  /** "Check again" link — when terminal phone-recorded WITH a Strava token */
  onCheckAgain?: () => void;
  /** First-time no-Strava-ever inline copy */
  showConnectStravaHint?: boolean;
  /** Terminal awaiting-expired hint */
  showAwaitingExpiredHint?: boolean;
  debriefText: string;
  /** Unified Home Feed amendment additions */
  coachedBySherpaa: boolean;
  summaryState: SummaryTextState;
  metrics?: {
    avgHrBpm?: number;
    avgHrDeltaPct?: number;
    avgWatts?: number;
    avgWattsDeltaPct?: number;
    fitnessTrend?: { weeklyDistanceKm: number; direction: 'up' | 'down' | 'flat' };
    baselineProgress?: { current: number; required: number };
  };
  audioState: AudioButtonState;
  onListenDebrief: () => void;
  onShare: () => void;
  onDone: () => void;
}

export default function PostRideSummaryScreen({
  rideName,
  rideDate,
  distanceKm,
  durationSec,
  elevationM,
  avgHrBpm,
  avgWatts,
  rideTrack,
  segmentResults,
  syncState,
  segmentDataSource,
  onWrongActivity,
  onCheckAgain,
  showConnectStravaHint,
  showAwaitingExpiredHint,
  debriefText,
  coachedBySherpaa,
  summaryState,
  metrics,
  audioState,
  onListenDebrief,
  onShare,
  onDone,
}: Props) {
  const [expandedSegId, setExpandedSegId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const prCount = segmentResults.filter(s => s.isNewPR).length;
  const hitCount = segmentResults.filter(s => !s.wasSkipped).length;

  // Selecting a segment highlights its slice on the map — scroll up so the map
  // (and the highlight) is in view.
  const handleSegmentPress = (id: string) => {
    const willSelect = expandedSegId !== id;
    setExpandedSegId(willSelect ? id : null);
    if (willSelect) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Selected segment drives the map highlight (and the expanded splits).
  const highlightPath =
    segmentResults.find(s => s.id === expandedSegId)?.highlightPath ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>

        {/* Map — full ride route; tapping a segment highlights its slice */}
        <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
          <RideRouteMap track={rideTrack} highlight={highlightPath} />
          <View style={styles.mapScrim} pointerEvents="none" />
          <View style={styles.mapNav} pointerEvents="box-none">
            <View style={{ flex: 1 }}>
              <Text style={styles.mapDate}>{rideDate}</Text>
              <Text style={styles.mapTitle} numberOfLines={1}>{rideName}</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={onShare} activeOpacity={0.8}>
              <Text style={styles.shareBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PR headline */}
        {prCount > 0 && (
          <View style={styles.prHeadline}>
            <View style={styles.prCrownBadge}>
              <Text style={styles.prCrownText}>🏆 {prCount} New PR</Text>
            </View>
            <Text style={styles.prHeadlineSub}>
              {segmentResults.find(s => s.isNewPR)?.name}
            </Text>
          </View>
        )}

        {/* Metrics block (unified amendment) */}
        <MetricsBlock
          distanceKm={distanceKm}
          durationSec={durationSec}
          elevationM={elevationM}
          avgHrBpm={metrics?.avgHrBpm ?? avgHrBpm}
          avgHrDeltaPct={metrics?.avgHrDeltaPct}
          avgWatts={metrics?.avgWatts ?? avgWatts}
          avgWattsDeltaPct={metrics?.avgWattsDeltaPct}
          fitnessTrend={metrics?.fitnessTrend}
          baselineProgress={metrics?.baselineProgress}
          style={styles.metricsWrap}
        />

        {/* Summary text (lazy LLM) */}
        <SummaryText
          state={summaryState}
          text={debriefText}
          style={styles.summaryWrap}
        />

        {/* Primary audio CTA */}
        <View style={styles.audioCtaWrap}>
          <InlineAudioButton size="lg" state={audioState} onPress={onListenDebrief} />
        </View>

        {/* Sync state badge + coached pill + affordance row */}
        <View style={styles.badgeRow}>
          <SyncStateBadge state={syncState} size="md" />
          {coachedBySherpaa && <CoachedPill size="md" />}
          {syncState === 'synced' && onWrongActivity && (
            <TouchableOpacity onPress={onWrongActivity} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.affordanceLink}>Wrong activity?</Text>
            </TouchableOpacity>
          )}
          {syncState === 'phone-recorded' && onCheckAgain && (
            <TouchableOpacity onPress={onCheckAgain} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.affordanceLinkGold}>Check again</Text>
            </TouchableOpacity>
          )}
        </View>
        {showAwaitingExpiredHint && (
          <Text style={styles.hintCopy}>
            Strava activity not found yet — we'll keep looking on your next launch.
          </Text>
        )}
        {showConnectStravaHint && (
          <Text style={styles.hintCopy}>
            Connect Strava to verify distance and effort times.
          </Text>
        )}

        {/* Segment results */}
        <Text style={styles.sectionLabel}>Segments</Text>

        {segmentResults.map(seg => {
          const expanded = expandedSegId === seg.id;
          return (
            <TouchableOpacity
              key={seg.id}
              style={[
                styles.segCard,
                seg.isNewPR && styles.segCardPR,
                seg.wasSkipped && { opacity: 0.5 },
              ]}
              onPress={() => !seg.wasSkipped && handleSegmentPress(seg.id)}
              activeOpacity={seg.wasSkipped ? 1 : 0.75}
            >
              <View style={styles.segCardTop}>
                <Text style={styles.segName}>{seg.name}</Text>
                <Text style={[styles.segTime, seg.isNewPR && { color: colors.gold }]}>
                  {seg.wasSkipped ? '—' : formatTime(seg.timeSec)}
                </Text>
              </View>
              <View style={styles.segCardBottom}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.segNote}>
                    {seg.wasSkipped
                      ? 'Skipped · took alternate route'
                      : seg.prTimeSec
                      ? `PR: ${formatTime(seg.prTimeSec)}`
                      : 'First effort'}
                  </Text>
                  {!seg.wasSkipped && (
                    <Text style={styles.segSource}>
                      {segmentDataSource === 'strava' ? 'via Strava' : 'via GPS · provisional'}
                    </Text>
                  )}
                </View>
                {!seg.wasSkipped && seg.recentEffortsSec && seg.recentEffortsSec.length > 0 && (
                  <SegmentEffortSparkline
                    recentEffortsSec={[...seg.recentEffortsSec, seg.timeSec]}
                    prSec={seg.prTimeSec}
                    style={{ marginLeft: 8 }}
                  />
                )}
                {!seg.wasSkipped && (
                  <View style={[seg.isNewPR ? styles.prTag : styles.offTag, { marginLeft: 8 }]}>
                    <Text style={seg.isNewPR ? styles.prTagText : styles.offTagText}>
                      {seg.isNewPR
                        ? `🏆 PR · −${Math.abs(seg.gapToPreSeconds)}s`
                        : `+${seg.gapToPreSeconds}s`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Expanded splits */}
              {expanded && seg.splits && (
                <View style={styles.splitsArea}>
                  <Text style={styles.splitsTitle}>Split comparison · Today vs PR</Text>
                  {seg.splits.map((split, i) => (
                    <View key={i} style={styles.splitRow}>
                      <Text style={styles.splitLabel}>{split.label}</Text>
                      <View style={styles.splitTrack}>
                        <View style={styles.splitBarPR} />
                        {/* TODO: animate today bar width based on split */}
                        <View style={[styles.splitBarToday, { width: '72%' }]} />
                      </View>
                      <Text style={[
                        styles.splitVal,
                        { color: split.gapSeconds <= 0 ? colors.success : colors.error },
                      ]}>
                        {split.gapSeconds <= 0 ? `−${Math.abs(split.gapSeconds)}s` : `+${split.gapSeconds}s`}
                      </Text>
                    </View>
                  ))}
                  {seg.cueTextPlayed && (
                    <View style={styles.cueReview}>
                      <Text style={styles.cueReviewLabel}>Coaching cue played</Text>
                      <Text style={styles.cueReviewText}>"{seg.cueTextPlayed}"</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Done */}
        <TouchableOpacity style={styles.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// Route map fills ~half the screen so the route reads clearly.
const MAP_HEIGHT = Math.round(Dimensions.get('window').height * 0.5);

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },
  mapContainer: {
    backgroundColor: colors.mapBg,
    justifyContent: 'flex-end',
    position: 'relative',
    overflow: 'hidden',
  },
  mapScrim: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 96,
    backgroundColor: 'rgba(17,17,17,0.55)',
    // TODO: swap to <LinearGradient> for a softer fade (Phase 6 polish)
  },
  mapNav: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 14,
  },
  mapDate: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  mapTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  shareBtn: {
    width: 44, height: 44, borderRadius: 999,
    backgroundColor: 'rgba(42,42,42,0.9)', borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtnText: { fontSize: 16, color: colors.textPrimary },
  prHeadline: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 16,
  },
  prCrownBadge: {
    backgroundColor: colors.gold, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  prCrownText: { fontSize: 12, fontWeight: '800', color: colors.textOnGold },
  prHeadlineSub: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 20, paddingTop: 14,
  },
  statCard: {
    width: '30%', flexGrow: 1,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 12,
  },
  statVal: {
    fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 12,
  },
  affordanceLink: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  affordanceLinkGold: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gold,
    textDecorationLine: 'underline',
  },
  hintCopy: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  segSource: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  metricsWrap: { marginTop: 16 },
  summaryWrap: { marginTop: 16 },
  audioCtaWrap: { paddingHorizontal: 20, marginTop: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 1.2,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10,
  },
  segCard: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14,
  },
  segCardPR: {
    borderColor: colors.goldBorderStrong,
    backgroundColor: colors.goldDim,
  },
  segCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  segName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  segTime: {
    fontSize: 15, fontWeight: '700', color: colors.textPrimary,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  segCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segNote: { fontSize: 12, color: colors.textMuted },
  prTag: {
    backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  prTagText: { fontSize: 11, fontWeight: '700', color: colors.gold },
  offTag: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderMuted,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  offTagText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  splitsArea: {
    marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 14,
  },
  splitsTitle: { fontSize: 11, fontWeight: '600', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  splitLabel: { fontSize: 12, fontWeight: '500', color: colors.textMuted, width: 36 },
  splitTrack: { flex: 1, height: 6, backgroundColor: colors.surfaceDim, borderRadius: 999, position: 'relative' },
  splitBarPR: { position: 'absolute', top: 0, left: 0, height: 6, width: '70%', backgroundColor: colors.textDim, borderRadius: 999 },
  splitBarToday: { position: 'absolute', top: 0, left: 0, height: 6, backgroundColor: colors.gold, borderRadius: 999, opacity: 0.9 },
  splitVal: {
    fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right',
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  cueReview: {
    marginTop: 12, backgroundColor: colors.goldDim,
    borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 8, padding: 10,
  },
  cueReviewLabel: { fontSize: 11, fontWeight: '600', color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  cueReviewText: { fontSize: 12, color: 'rgba(240,240,240,0.6)', fontStyle: 'italic', lineHeight: 18 },
  listenBtn: {
    marginHorizontal: 20, marginTop: 12, height: 48,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  listenBtnText: { fontSize: 14, fontWeight: '600', color: colors.gold },
  doneBtn: {
    marginHorizontal: 20, marginTop: 10, height: 54,
    backgroundColor: colors.gold, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 17, fontWeight: '600', color: colors.textOnGold },
});
