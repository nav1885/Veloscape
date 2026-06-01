/**
 * MetricsBlock — compact 4-row metrics block on PostRideSummary.
 *
 * Each row is independently rendered if its data is present; absent rows are
 * simply omitted. When the rider has < 5 rides in the trailing 28d, HR/watts
 * deltas are suppressed and the fitness-trend row is replaced with a
 * "Building your baseline · N/5 rides" hint.
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "MetricsBlock — Component Spec"
 *
 * Pure presentational. Parent computes baseline + deltas (see
 * rideSummaryService and ride_summary_baseline in the amendment) and passes
 * the formatted shape.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import {
  formatDistanceKm,
  formatElevationMeters,
  distanceUnit,
} from '../utils/units';

export interface MetricsBlockProps {
  distanceKm: number;
  durationSec: number;
  elevationM: number;
  avgHrBpm?: number;
  avgHrDeltaPct?: number; // signed: +5 means 5% above baseline
  avgWatts?: number;
  avgWattsDeltaPct?: number;
  fitnessTrend?: {
    weeklyDistanceKm: number;
    direction: 'up' | 'down' | 'flat';
  };
  /** When set (< 5 rides in trailing 28d), HR/watts deltas suppressed and
   *  fitness trend replaced with baseline-building hint */
  baselineProgress?: { current: number; required: number };
  style?: ViewStyle;
}

export function MetricsBlock({
  distanceKm,
  durationSec,
  elevationM,
  avgHrBpm,
  avgHrDeltaPct,
  avgWatts,
  avgWattsDeltaPct,
  fitnessTrend,
  baselineProgress,
  style,
}: MetricsBlockProps) {
  const baselineBuilding = !!baselineProgress;

  return (
    <View style={[styles.wrap, style]}>
      {/* Row 1: always */}
      <View style={styles.row}>
        <Text style={styles.coreValues}>
          {formatDistance(distanceKm)}
          <Text style={styles.dot}>  ·  </Text>
          {formatDuration(durationSec)}
          <Text style={styles.dot}>  ·  </Text>
          {formatElevation(elevationM)}
        </Text>
      </View>

      {/* Row 2: HR */}
      {avgHrBpm !== undefined && (
        <View
          style={styles.row}
          accessibilityRole="text"
          accessibilityLabel={a11yForMetricRow('Average heart rate', avgHrBpm, 'beats per minute', avgHrDeltaPct, baselineBuilding, /*goodIsDown*/ true)}
        >
          <Text style={styles.label}>AVG HR</Text>
          <Text style={styles.value}>
            {avgHrBpm}
            <Text style={styles.valueUnit}> bpm</Text>
          </Text>
          {!baselineBuilding && avgHrDeltaPct !== undefined ? (
            <DeltaArrow deltaPct={avgHrDeltaPct} goodIsDown={true} />
          ) : (
            <Text style={styles.deltaPlaceholder}>—</Text>
          )}
        </View>
      )}

      {/* Row 3: Power */}
      {avgWatts !== undefined && (
        <View
          style={styles.row}
          accessibilityRole="text"
          accessibilityLabel={a11yForMetricRow('Average power', avgWatts, 'watts', avgWattsDeltaPct, baselineBuilding, /*goodIsDown*/ true)}
        >
          <Text style={styles.label}>AVG POWER</Text>
          <Text style={styles.value}>
            {avgWatts}
            <Text style={styles.valueUnit}> W</Text>
          </Text>
          {!baselineBuilding && avgWattsDeltaPct !== undefined ? (
            <DeltaArrow deltaPct={avgWattsDeltaPct} goodIsDown={true} />
          ) : (
            <Text style={styles.deltaPlaceholder}>—</Text>
          )}
        </View>
      )}

      {/* Row 4: trend or baseline-building */}
      {baselineBuilding ? (
        <View
          style={[styles.row, styles.baselineRow]}
          accessibilityRole="text"
          accessibilityLabel={`Building your baseline. ${baselineProgress!.current} of ${baselineProgress!.required} rides recorded.`}
        >
          <Text style={styles.baselineText}>
            Building your baseline · {baselineProgress!.current}/{baselineProgress!.required} rides
          </Text>
        </View>
      ) : fitnessTrend ? (
        <View
          style={styles.row}
          accessibilityRole="text"
          accessibilityLabel={`This week, ${formatDistanceKm(fitnessTrend.weeklyDistanceKm)}. Trend ${fitnessTrend.direction}.`}
        >
          <Text style={styles.label}>THIS WEEK</Text>
          <Text style={styles.value}>
            {formatDistanceKm(fitnessTrend.weeklyDistanceKm).split(' ')[0]}
            <Text style={styles.valueUnit}> {distanceUnit()}</Text>
          </Text>
          <TrendArrow direction={fitnessTrend.direction} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Delta arrows ────────────────────────────────────────────────────────────

function DeltaArrow({
  deltaPct,
  goodIsDown,
}: {
  deltaPct: number;
  goodIsDown: boolean;
}) {
  // Neutral band: |delta| < 2%
  if (Math.abs(deltaPct) < 2) {
    return (
      <Text style={[styles.deltaArrow, { color: colors.textSecondary }]}>
        ▸ {Math.abs(deltaPct).toFixed(0)}%
      </Text>
    );
  }
  const isDown = deltaPct < 0;
  // "Good" direction depends on the metric:
  // - HR/Watts: lower = better (more efficient) → goodIsDown = true
  // - Distance/Trend: higher = better → goodIsDown = false
  const isGood = goodIsDown ? isDown : !isDown;
  const color = isGood ? colors.success : colors.error;
  const glyph = isDown ? '▼' : '▲';
  return (
    <Text style={[styles.deltaArrow, { color }]}>
      {glyph} {Math.abs(deltaPct).toFixed(0)}%
    </Text>
  );
}

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') {
    return <Text style={[styles.deltaArrow, { color: colors.textSecondary }]}>▸</Text>;
  }
  const color = direction === 'up' ? colors.success : colors.error;
  const glyph = direction === 'up' ? '▲' : '▼';
  return <Text style={[styles.deltaArrow, { color }]}>{glyph}</Text>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDistance(km: number): string {
  return formatDistanceKm(km);
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

function formatElevation(m: number): string {
  return formatElevationMeters(m);
}

function a11yForMetricRow(
  label: string,
  value: number,
  unit: string,
  deltaPct: number | undefined,
  baselineBuilding: boolean,
  _goodIsDown: boolean,
): string {
  const base = `${label} ${value} ${unit}`;
  if (baselineBuilding || deltaPct === undefined) return base;
  const direction = deltaPct >= 0 ? 'above' : 'below';
  return `${base}, ${Math.abs(deltaPct).toFixed(0)} percent ${direction} baseline`;
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  coreValues: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  dot: {
    color: colors.textDim,
    fontWeight: '500',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    width: 100,
  },
  value: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  valueUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  deltaArrow: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'right',
  },
  deltaPlaceholder: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textDim,
    minWidth: 56,
    textAlign: 'right',
  },
  baselineRow: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
  },
  baselineText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default MetricsBlock;
