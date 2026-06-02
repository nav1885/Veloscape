/**
 * CoachedPill — gold pill that sits next to SyncStateBadge.
 *
 * Indicates a ride was coached live by Veloscape (cue log exists for the ride).
 * Orthogonal to SyncStateBadge: provenance (where the data came from) and
 * coaching (whether Veloscape coached the ride) are independent axes.
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "CoachedPill — Component Spec"
 *
 * Pure presentational. Presence of the component is the state — no boolean prop.
 * The parent decides whether to render it based on `ride.coached_by_sherpaa`.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

export interface CoachedPillProps {
  /** 'sm' (default) for list rows; 'md' for PostRideSummary header */
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function CoachedPill({ size = 'sm', style }: CoachedPillProps) {
  const s = size === 'md' ? mdSize : smSize;
  return (
    <View
      style={[styles.pill, s.container, style]}
      accessibilityRole="text"
      accessibilityLabel="Coached by Veloscape"
    >
      {/* TODO: swap emoji glyph for a proper SVG mic icon during icon-system pass */}
      <Text style={[s.icon]} allowFontScaling={false}>
        🎙
      </Text>
      <Text style={s.label} numberOfLines={1}>
        Coached
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
});

const smSize = StyleSheet.create({
  container: {
    height: 20,
    paddingHorizontal: 7,
    gap: 4,
  },
  icon: {
    fontSize: 11,
    color: colors.gold,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
    letterSpacing: 0.3,
  },
});

const mdSize = StyleSheet.create({
  container: {
    height: 26,
    paddingHorizontal: 10,
    gap: 6,
  },
  icon: {
    fontSize: 13,
    color: colors.gold,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gold,
    letterSpacing: 0.2,
  },
});

export default CoachedPill;
