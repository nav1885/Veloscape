import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { distanceUnit, formatDistanceKm } from '../utils/units';
import { GoalMode, GOAL_LABELS } from '../types/goalMode';

// One segment's live state on the ride (the active one drives the ActiveCard).
export interface BoardSegment {
  id: string;
  name: string;
  status: 'done' | 'active' | 'upcoming';
  distanceM: number;
  gradePercent: number;
  elevationM: number;
  prTimeSec: number | null;
  effortCount: number;
  resultTimeSec?: number;
  isNewPR?: boolean;
  gapToPreSeconds?: number;
  elapsedTimeSec?: number;
  progressPercent?: number;
  liveGapSeconds?: number;
  distanceAwayM?: number;
}

interface Props {
  elapsedTime: string;       // "1:04:22"
  speedKmh: number;
  distanceKm: number;
  gpsLocked: boolean;
  goalMode: GoalMode;
  board: BoardSegment[];
  cuesMuted: boolean;
  onToggleMute: () => void;
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
  goalMode,
  board,
  cuesMuted,
  onToggleMute,
  onEndRide,
}: Props) {
  const doneCount = board.filter((s) => s.status === 'done').length;
  const active = board.find((s) => s.status === 'active');

  return (
    <SafeAreaView style={styles.container}>
      {/* Status bar: elapsed · mode · GPS */}
      <View style={styles.statusBar}>
        <Text style={styles.elapsed}>{elapsedTime}</Text>
        <View style={styles.statusPills}>
          <View style={styles.modePill}><Text style={styles.modePillText}>{GOAL_LABELS[goalMode]}</Text></View>
          <View style={styles.pill}>
            <View style={[styles.pillDot, { backgroundColor: gpsLocked ? colors.success : colors.error }]} />
            <Text style={[styles.pillText, { color: gpsLocked ? colors.success : colors.error }]}>GPS</Text>
          </View>
        </View>
      </View>

      {/* Single-glance body: either the live segment card, or the between-segments block */}
      <View style={styles.body}>
        {active ? (
          <ActiveCard seg={active} />
        ) : (
          <View style={styles.between}>
            <CoachingIndicator muted={cuesMuted} />
            <Text style={styles.heroNum}>{formatDistanceKm(distanceKm).split(' ')[0]}</Text>
            <Text style={styles.heroUnit}>{distanceUnit()}</Text>
            <Text style={styles.progress}>{doneCount} of {board.length} segments</Text>
            {board.length > 0 && doneCount < board.length && (() => {
              const next = board.find((s) => s.status === 'upcoming');
              return next ? (
                <Text style={styles.nextHint}>
                  next: {next.name}{next.distanceAwayM != null ? ` · ${fmtDist(next.distanceAwayM)}` : ''}
                </Text>
              ) : null;
            })()}
          </View>
        )}
      </View>

      {/* Two big controls — always present, work even when the screen's been off */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.muteBtn, cuesMuted && styles.muteBtnOn]}
          onPress={onToggleMute}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={cuesMuted ? 'Unmute coaching' : 'Mute coaching'}
        >
          <Text style={[styles.muteBtnText, cuesMuted && styles.muteBtnTextOn]}>
            {cuesMuted ? '🔇  Coaching muted — tap to unmute' : '🔊  Mute coaching'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.endBtn}
          onLongPress={onEndRide}
          delayLongPress={2000}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Hold to end ride"
        >
          <Text style={styles.endBtnText}>Hold to End</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function CoachingIndicator({ muted }: { muted: boolean }) {
  return (
    <View style={[styles.coach, muted && styles.coachMuted]}>
      <View style={[styles.coachDot, { backgroundColor: muted ? colors.textMuted : colors.success }]} />
      <Text style={[styles.coachText, muted && { color: colors.textSecondary }]}>
        {muted ? 'Coaching muted' : 'Coaching on'}
      </Text>
    </View>
  );
}

function ActiveCard({ seg }: { seg: BoardSegment }) {
  const ahead = (seg.liveGapSeconds ?? 0) <= 0;
  return (
    <View style={styles.activeCard}>
      <View style={styles.activeTop}>
        <View style={styles.activeLiveDot} />
        <Text style={styles.activeLabel}>ACTIVE</Text>
        <Text style={styles.activeName} numberOfLines={1}>{seg.name}</Text>
      </View>
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
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, seg.progressPercent ?? 0))}%` as `${number}%` }]} />
      </View>
      <View style={styles.statRow}>
        <Stat val={fmtDist(seg.distanceM)} label="distance" />
        <Stat val={`${seg.gradePercent.toFixed(1)}%`} label="grade" />
        <Stat val={seg.prTimeSec != null ? fmtTime(seg.prTimeSec) : '—'} label="PR" />
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
    paddingHorizontal: 20, paddingTop: 6, marginBottom: 8,
  },
  elapsed: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, ...mono },
  statusPills: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
  },
  pillDot: { width: 6, height: 6, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '600' },
  modePill: {
    backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3,
  },
  modePillText: { fontSize: 12, fontWeight: '700', color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.5 },

  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },

  between: { alignItems: 'center', gap: 4 },
  coach: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18,
    backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7,
  },
  coachMuted: { backgroundColor: colors.surfaceDim, borderColor: colors.border },
  coachDot: { width: 8, height: 8, borderRadius: 999 },
  coachText: { fontSize: 13, fontWeight: '700', color: colors.gold },
  heroNum: { fontSize: 92, fontWeight: '800', color: colors.textPrimary, letterSpacing: -3, lineHeight: 96, ...mono },
  heroUnit: { fontSize: 14, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  progress: { fontSize: 18, fontWeight: '700', color: colors.textSecondary, marginTop: 22, ...mono },
  nextHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },

  activeCard: { backgroundColor: colors.goldDim, borderWidth: 1.5, borderColor: colors.gold, borderRadius: 18, padding: 18 },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  activeLiveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.gold },
  activeLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1 },
  activeName: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  activeTimerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  activeTimer: { fontSize: 56, fontWeight: '800', color: colors.textPrimary, letterSpacing: -2, lineHeight: 58, ...mono },
  activeGapWrap: { alignItems: 'flex-end' },
  activeGap: { fontSize: 32, fontWeight: '800', letterSpacing: -1, ...mono },
  activeTimerLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: 'hidden', marginBottom: 18 },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 999 },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, ...mono },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3 },

  controls: { paddingHorizontal: 20, paddingBottom: 28, gap: 10 },
  muteBtn: {
    height: 54, borderRadius: 999, backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  muteBtnOn: { backgroundColor: colors.surfaceDim, borderWidth: 1, borderColor: colors.border },
  muteBtnText: { fontSize: 16, fontWeight: '800', color: colors.textOnGold },
  muteBtnTextOn: { color: colors.textSecondary, fontWeight: '700' },
  endBtn: {
    height: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  endBtnText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
