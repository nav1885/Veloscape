/**
 * SummaryText — renders the LLM-generated (or fallback) ride summary.
 *
 * Three states: 'loading' shows a 3-row shimmer; 'loaded' shows the text;
 * 'fallback' shows the text plus a subtle "Basic summary" microcopy that
 * communicates without alarming that the rich path failed.
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "SummaryText — Component Spec"
 *
 * This component does not own the fetch — the parent screen owns the call to
 * rideSummaryService.generateOrLoadSummary and passes `state` and `text`.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '../constants/colors';

export type SummaryTextState = 'loading' | 'loaded' | 'fallback';

export interface SummaryTextProps {
  state: SummaryTextState;
  text?: string;
  /** Default: 'Basic summary' — only shown when state === 'fallback' */
  fallbackHint?: string;
  style?: ViewStyle;
}

const SHIMMER_ROW_WIDTHS = ['100%', '96%', '62%'] as const;

export function SummaryText({
  state,
  text,
  fallbackHint = 'Basic summary',
  style,
}: SummaryTextProps) {
  // TODO: honor AccessibilityInfo.isReduceMotionEnabled — disable sweep animation
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'loading') return;
    const anim = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => {
      anim.stop();
      sweep.setValue(0);
    };
  }, [state, sweep]);

  if (state === 'loading') {
    return (
      <View
        style={[styles.container, style]}
        accessibilityLabel="Generating ride summary"
        accessibilityState={{ busy: true }}
      >
        {SHIMMER_ROW_WIDTHS.map((w, i) => (
          <ShimmerRow key={i} width={w} sweep={sweep} marginTop={i === 0 ? 0 : 8} />
        ))}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, style]}
      accessibilityLabel={
        text ? (state === 'fallback' ? `${text}. Basic summary.` : text) : undefined
      }
    >
      <Text style={styles.text}>{text ?? ''}</Text>
      {state === 'fallback' && (
        <Text style={styles.fallbackHint}>{fallbackHint.toUpperCase()}</Text>
      )}
    </View>
  );
}

// ─── Shimmer row ─────────────────────────────────────────────────────────────

function ShimmerRow({
  width,
  sweep,
  marginTop,
}: {
  width: string;
  sweep: Animated.Value;
  marginTop: number;
}) {
  // Sweep moves a highlight band from -50% to 150% of the row width
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ['-50%', '150%'],
  });

  return (
    <View style={[styles.shimmerRow, { width: width as any, marginTop }]}>
      <Animated.View
        style={[
          styles.shimmerHighlight,
          // @ts-ignore RN supports percentage translateX with new arch
          { transform: [{ translateX }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No card chrome — surrounding screen provides it
  },
  text: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  fallbackHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  shimmerRow: {
    height: 15,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  shimmerHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '60%',
    backgroundColor: colors.surfaceElevated,
    opacity: 0.9,
  },
});

export default SummaryText;
