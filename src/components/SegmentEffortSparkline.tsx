/**
 * SegmentEffortSparkline — last-5-efforts mini chart, inline on segment rows.
 *
 * 60×20 by default. Auto-scales y-axis to make trajectory visible regardless
 * of absolute duration. Orientation is "up = faster" — a faster effort plots
 * HIGHER on the chart. PR (if provided) is a faint dashed baseline so "above
 * the line = faster than PR" reads at a glance. Latest point gets a gold dot
 * to anchor the eye to "today."
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "SegmentEffortSparkline"
 *       docs/amendments/RideDetailMapAndComparison_Amendment.md (up = faster)
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Line, Polyline as SvgPolyline, Circle } from 'react-native-svg';
import { colors } from '../constants/colors';

export interface SegmentEffortSparklineProps {
  /** Most-recent-last; durations in seconds. Up to 5 points. */
  recentEffortsSec: number[];
  /** PR effort in seconds; drawn as faint horizontal baseline if provided */
  prSec?: number;
  width?: number;
  height?: number;
  /** Optional accessibility label override; otherwise a default trajectory
   *  description is generated */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function SegmentEffortSparkline({
  recentEffortsSec,
  prSec,
  width = 60,
  height = 20,
  accessibilityLabel,
  style,
}: SegmentEffortSparklineProps) {
  if (recentEffortsSec.length === 0) return null;

  const a11y = accessibilityLabel ?? defaultA11yLabel(recentEffortsSec);

  // ─── Geometry ──────────────────────────────────────────────────────────────
  // y-range: pad by max(5%, 2 seconds) to handle near-flat trajectories
  const allValues = prSec !== undefined ? [...recentEffortsSec, prSec] : recentEffortsSec;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 2);
  const yPad = Math.max(range * 0.05, 2);
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yRange = yMax - yMin;

  const xStep = recentEffortsSec.length > 1 ? width / (recentEffortsSec.length - 1) : 0;
  const inset = 3; // keep the dot off the very edge
  const points = recentEffortsSec.map((sec, i) => {
    const x = recentEffortsSec.length === 1 ? width - inset : i * xStep;
    // "up = faster": faster (lower seconds) plots HIGHER → smaller y.
    const y = ((sec - yMin) / yRange) * height;
    return { x, y };
  });
  const lastPoint = points[points.length - 1];
  const prY = prSec !== undefined ? ((prSec - yMin) / yRange) * height : null;

  return (
    <View
      style={[{ width, height }, style]}
      accessibilityRole="image"
      accessibilityLabel={a11y}
    >
      <Svg width={width} height={height}>
        {prY !== null && (
          <Line
            x1={0} y1={prY} x2={width} y2={prY}
            stroke={colors.textDim} strokeWidth={1} strokeDasharray="2,2"
          />
        )}
        {points.length > 1 && (
          <SvgPolyline
            points={points.map(p => `${p.x},${p.y}`).join(' ')}
            stroke={colors.gold} strokeWidth={1.5} fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        <Circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={colors.gold} />
      </Svg>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultA11yLabel(efforts: number[]): string {
  if (efforts.length === 0) return 'No recent efforts';
  if (efforts.length === 1) return `One recent effort: ${fmt(efforts[0])}`;
  const first = efforts[0];
  const last = efforts[efforts.length - 1];
  const trend = last < first - 2 ? 'faster' : last > first + 2 ? 'slower' : 'consistent';
  const list = efforts.map(fmt).join(', ');
  return `Recent efforts: ${list}. Trending ${trend}.`;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} minutes ${s}`;
}

export default SegmentEffortSparkline;
