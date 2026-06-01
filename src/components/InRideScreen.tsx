import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { distanceUnit, speedUnit, formatDistanceKm, formatSpeedKmh } from '../utils/units';
import { GoalMode, GOAL_LABELS } from '../types/goalMode';
// TODO: implement 2-second hold with LongPressGestureHandler from react-native-gesture-handler

interface NextSegment {
  name: string;
  distanceKm: number;
}

interface Props {
  elapsedTime: string;       // formatted "1:04:22"
  speedKmh: number;
  heartRateBpm?: number;
  powerWatts?: number;
  distanceKm: number;
  gpsLocked: boolean;
  audioActive: boolean;
  goalMode: GoalMode;        // shown as a persistent HUD chip (esp. for quiet Recovery)
  nextSegment?: NextSegment; // undefined when no more segments ahead
  onEndRide: () => void;     // called after 2-second hold confirmed
}

export default function InRideScreen({
  elapsedTime,
  speedKmh,
  heartRateBpm,
  powerWatts,
  distanceKm,
  gpsLocked,
  audioActive,
  goalMode,
  nextSegment,
  onEndRide,
}: Props) {
  return (
    <SafeAreaView style={styles.container}>

      {/* Status bar row */}
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
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>On</Text>
            </View>
          )}
        </View>
      </View>

      {/* Next segment pill */}
      {nextSegment ? (
        <View style={styles.nextSegPill}>
          <View>
            <Text style={styles.nextSegLabel}>Next nearby</Text>
            <Text style={styles.nextSegName}>{nextSegment.name}</Text>
          </View>
          <View style={styles.nextSegDistWrap}>
            <Text style={styles.nextSegDist}>{formatDistanceKm(nextSegment.distanceKm).split(' ')[0]}</Text>
            <Text style={styles.nextSegDistLabel}>{distanceUnit()} away</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.nextSegPill, { opacity: 0.5 }]}>
          <Text style={styles.nextSegName}>No more segments · {formatDistanceKm(distanceKm)} ridden</Text>
        </View>
      )}

      {/* Speed — hero element */}
      <View style={styles.speedWrap}>
        <Text style={styles.speed}>{formatSpeedKmh(speedKmh).split(' ')[0]}</Text>
        <Text style={styles.speedUnit}>{speedUnit()}</Text>

        {/* Secondary metrics */}
        <View style={styles.metricsRow}>
          {heartRateBpm !== undefined && (
            <>
              <View style={styles.metric}>
                <Text style={styles.metricVal}>{heartRateBpm}</Text>
                <Text style={styles.metricLabel}>bpm</Text>
              </View>
              <View style={styles.metricDivider} />
            </>
          )}
          {powerWatts !== undefined && (
            <>
              <View style={styles.metric}>
                <Text style={styles.metricVal}>{powerWatts}</Text>
                <Text style={styles.metricLabel}>watts</Text>
              </View>
              <View style={styles.metricDivider} />
            </>
          )}
          <View style={styles.metric}>
            <Text style={styles.metricVal}>{formatDistanceKm(distanceKm).split(' ')[0]}</Text>
            <Text style={styles.metricLabel}>{distanceUnit()}</Text>
          </View>
        </View>
      </View>

      {/* End Ride — requires 2-second hold */}
      {/* TODO: replace TouchableOpacity with LongPressGestureHandler (minDurationMs: 2000) */}
      <TouchableOpacity style={styles.endRideBtn} onLongPress={onEndRide} delayLongPress={2000} activeOpacity={0.7}>
        <Text style={styles.endRideText}>■  End Ride</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  elapsed: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  statusPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pillAudio: {
    fontSize: 11,
    color: colors.gold,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
  },
  nextSegPill: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextSegLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  nextSegName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nextSegDistWrap: { alignItems: 'flex-end' },
  nextSegDist: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: -0.5,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  nextSegDistLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  speedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  speed: {
    fontSize: 112,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -6,
    lineHeight: 112,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  speedUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 40,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  metric: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 4,
  },
  metricVal: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as const },
      android: { fontFamily: 'monospace' },
    }),
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.surface,
  },
  endRideBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endRideText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
