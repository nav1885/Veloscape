import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { distanceUnit, speedUnit, formatDistanceKm, formatSpeedKmh } from '../utils/units';
import { GoalMode, GOAL_LABELS } from '../types/goalMode';

// One row of the in-ride segment board.
export interface BoardSegment {
  id: string;
  name: string;
  status: 'done' | 'active' | 'upcoming';
  distanceM: number;
  gradePercent: number;
  elevationM: number;
  prTimeSec: number | null;
  effortCount: number;
  // done
  resultTimeSec?: number;
  isNewPR?: boolean;
  gapToPreSeconds?: number;
  // active
  elapsedTimeSec?: number;
  progressPercent?: number;
  liveGapSeconds?: number;
  // upcoming
  distanceAwayM?: number;
}

interface Props {
  elapsedTime: string;       // formatted "1:04:22"
  speedKmh: number;
  distanceKm: number;
  gpsLocked: boolean;
  audioActive: boolean;
  goalMode: GoalMode;
  board: BoardSegment[];
  onEndRide: () => void;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

function gap(sec: number): string {
  const r = Math.round(sec);
  return r <= 0 ? `−${Math.abs(r)}s` : `+${r}s`;
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} ${distanceUnit()}` : `${Math.round(m)} m`;
}

export default function InRideScreen({
  elapsedTime,
  speedKmh,
  distanceKm,
  gpsLocked,
  audioActive,
  goalMode,
  board,
  onEndRide,
}: Props) {
  const doneCount = board.filter((s) => s.status === 'done').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.elapsed}>{elapsedTime}</Text>
        <View style={styles.statusPills}>
          <View style={styles.modePill} accessibilityLabel={`${GOAL_LABELS[goalMode]} mode`}>
            <Text style={styles.modePillText}>{GOAL_LABELS[goalMode]}</Text>
          </View>
          <View style={styles.pill}>
            <View style={[styles.pillDot, { backgroundColor: gpsLocked ? colors.success : colors.error }]} />
            <Text style={[styles.pillText, { color: gpsLocked ? colors.success : colors.error }]}>GPS</Text>
          </View>
          {audioActive && (
            <View style={styles.pill}>
              <Text style={styles.pillAudio}>♪</Text>
            </View>
          )}
        </View>
      </View>

      {/* Compact metric strip */}
      <View style={styles.metricStrip}>
        <View style={styles.stripMetric}>
          <Text style={styles.stripVal}>{formatSpeedKmh(speedKmh).split(' ')[0]}</Text>
          <Text style={styles.stripLabel}>{speedUnit()}</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripMetric}>
          <Text style={styles.stripVal}>{formatDistanceKm(distanceKm).split(' ')[0]}</Text>
          <Text style={styles.stripLabel}>{distanceUnit()}</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripMetric}>
          <Text style={styles.stripVal}>{doneCount}/{board.length}</Text>
          <Text style={styles.stripLabel}>segments</Text>
        </View>
      </View>

      <Text style={styles.boardHeader}>SEGMENTS</Text>

      <ScrollView style={styles.board} contentContainerStyle={styles.boardContent} showsVerticalScrollIndicator={false}>
        {board.map((seg) =>
          seg.status === 'active' ? (
            <ActiveCard key={seg.id} seg={seg} speedKmh={speedKmh} />
          ) : (
            <SegmentRow key={seg.id} seg={seg} />
          ),
        )}
        {board.length === 0 && <Text style={styles.empty}>No segments loaded for this ride.</Text>}
      </ScrollView>

      <TouchableOpacity style={styles.endRideBtn} onLongPress={onEndRide} delayLongPress={2000} activeOpacity={0.7}>
        <Text style={styles.endRideText}>■  Hold to End Ride</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Done / upcoming row ─────────────────────────────────────────────────────

function SegmentRow({ seg }: { seg: BoardSegment }) {
  const done = seg.status === 'done';
  return (
    <View style={[styles.row, done && styles.rowDone]}>
      <View style={[styles.statusDot, done ? styles.dotDone : styles.dotUpcoming]}>
        <Text style={styles.statusDotText}>{done ? '✓' : '○'}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowName, done && styles.rowNameDone]} numberOfLines={1}>{seg.name}</Text>
        <Text style={styles.rowMeta}>
          {fmtDist(seg.distanceM)} · {seg.gradePercent.toFixed(1)}%
          {seg.prTimeSec != null ? ` · PR ${fmtTime(seg.prTimeSec)}` : ' · no PR yet'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {done ? (
          <>
            <Text style={styles.rowTime}>{fmtTime(seg.resultTimeSec ?? 0)}</Text>
            {seg.isNewPR ? (
              <Text style={styles.prBadge}>PR</Text>
            ) : (
              <Text style={[styles.rowGap, { color: (seg.gapToPreSeconds ?? 0) <= 0 ? colors.success : colors.error }]}>
                {gap(seg.gapToPreSeconds ?? 0)}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.rowAway}>
            {seg.distanceAwayM != null ? `${fmtDist(seg.distanceAwayM)} away` : 'ahead'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Active segment — rich card ──────────────────────────────────────────────

function ActiveCard({ seg, speedKmh }: { seg: BoardSegment; speedKmh: number }) {
  const ahead = (seg.liveGapSeconds ?? 0) <= 0;
  return (
    <View style={styles.activeCard}>
      <View style={styles.activeTop}>
        <View style={styles.activeLiveDot} />
        <Text style={styles.activeLabel}>ACTIVE</Text>
        <Text style={styles.activeName} numberOfLines={1}>{seg.name}</Text>
      </View>

      {/* Live timer + gap */}
      <View style={styles.activeTimerRow}>
        <View>
          <Text style={styles.activeTimer}>{fmtTime(seg.elapsedTimeSec ?? 0)}</Text>
          <Text style={styles.activeTimerLabel}>elapsed</Text>
        </View>
        {seg.prTimeSec != null && (
          <View style={styles.activeGapWrap}>
            <Text style={[styles.activeGap, { color: ahead ? colors.success : colors.error }]}>
              {gap(seg.liveGapSeconds ?? 0)}
            </Text>
            <Text style={styles.activeTimerLabel}>vs PR pace</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, seg.progressPercent ?? 0))}%` as `${number}%` }]} />
      </View>

      {/* Segment stats */}
      <View style={styles.statRow}>
        <Stat val={fmtDist(seg.distanceM)} label="distance" />
        <Stat val={`${seg.gradePercent.toFixed(1)}%`} label="avg grade" />
        <Stat val={`${Math.round(seg.elevationM)} m`} label="elev gain" />
        <Stat val={seg.prTimeSec != null ? fmtTime(seg.prTimeSec) : '—'} label={`PR · ${seg.effortCount} efforts`} />
      </View>
    </View>
  );
}

function Stat({ val, label }: { val: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{val}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const mono: TextStyle = Platform.select<TextStyle>({
  ios: { fontVariant: ['tabular-nums'] },
  android: { fontFamily: 'monospace' },
}) ?? {};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDeep },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 4, marginBottom: 10,
  },
  elapsed: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, ...mono },
  statusPills: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.surface,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
  },
  pillDot: { width: 6, height: 6, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillAudio: { fontSize: 11, color: colors.gold },
  modePill: {
    backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3,
  },
  modePillText: { fontSize: 12, fontWeight: '700', color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.5 },

  metricStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 12,
    backgroundColor: colors.surfaceDim, borderRadius: 14,
  },
  stripMetric: { alignItems: 'center', flex: 1 },
  stripVal: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1, ...mono },
  stripLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  stripDivider: { width: 1, height: 32, backgroundColor: colors.surface },

  boardHeader: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1,
    marginLeft: 24, marginBottom: 8,
  },
  board: { flex: 1 },
  boardContent: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surfaceDim, borderRadius: 12, padding: 12, paddingHorizontal: 14,
  },
  rowDone: { opacity: 0.75 },
  statusDot: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.success },
  dotUpcoming: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusDotText: { fontSize: 12, fontWeight: '700', color: colors.bgDeep },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  rowNameDone: { color: colors.textSecondary },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowTime: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, ...mono },
  rowGap: { fontSize: 12, fontWeight: '600', marginTop: 2, ...mono },
  prBadge: {
    fontSize: 10, fontWeight: '800', color: colors.bgDeep, backgroundColor: colors.gold,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3, overflow: 'hidden',
  },
  rowAway: { fontSize: 12, fontWeight: '600', color: colors.gold, ...mono },

  activeCard: {
    backgroundColor: colors.goldDim, borderWidth: 1.5, borderColor: colors.gold,
    borderRadius: 16, padding: 16,
  },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  activeLiveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.gold },
  activeLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1 },
  activeName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  activeTimerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  activeTimer: { fontSize: 52, fontWeight: '800', color: colors.textPrimary, letterSpacing: -2, lineHeight: 54, ...mono },
  activeGapWrap: { alignItems: 'flex-end' },
  activeGap: { fontSize: 30, fontWeight: '800', letterSpacing: -1, ...mono },
  activeTimerLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  progressTrack: { height: 5, backgroundColor: colors.surface, borderRadius: 999, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 999 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, ...mono },
  statLabel: { fontSize: 9, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 3, textAlign: 'center' },

  endRideBtn: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: colors.bgOverlay, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12, minHeight: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  endRideText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
