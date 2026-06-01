/**
 * SyncStateBadge — the spine of the Phone-as-Coach amendment.
 *
 * A four-state inline pill that communicates where a ride's data came from.
 * Used on PostRideSummary header, every History row, and (as a static legend
 * example) inside the Settings disclosure body.
 *
 * This component is purely presentational. The parent screen owns the mapping
 * from (dataSource, importedFromStrava, reconcilerActive, hasStravaToken) →
 * SyncState. The badge just renders.
 *
 * Spec: docs/design/PhoneAsCoach_DesignSpec.md → "SyncStateBadge — Component Spec"
 */

import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../constants/colors';

export type SyncState = 'awaiting' | 'synced' | 'phone-recorded' | 'imported';

export interface SyncStateBadgeProps {
  state: SyncState;
  /** 'sm' (default) for list rows; 'md' for PostRideSummary header */
  size?: 'sm' | 'md';
}

interface StateVisual {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  /** if true, renders an ActivityIndicator instead of a static dot */
  spinner?: boolean;
  accessibilityLabel: string;
}

const STATE_VISUALS: Record<SyncState, StateVisual> = {
  awaiting: {
    label: 'Awaiting Strava…',
    bg: colors.goldDim,
    border: colors.goldBorder,
    text: colors.gold,
    dot: colors.gold,
    spinner: true,
    accessibilityLabel: 'Sync status: waiting for Strava activity',
  },
  synced: {
    label: 'Synced from Strava',
    bg: colors.successDim,
    border: colors.successBorder,
    text: colors.success,
    dot: colors.success,
    accessibilityLabel: 'Sync status: Strava authoritative data',
  },
  'phone-recorded': {
    label: 'Phone-recorded',
    bg: colors.surfaceAlt,
    border: colors.borderSubtle,
    text: colors.textSecondary,
    dot: colors.textMuted,
    accessibilityLabel: 'Sync status: recorded on this phone',
  },
  imported: {
    label: 'Imported',
    bg: colors.importedDim,
    border: colors.importedBorder,
    text: colors.imported,
    dot: colors.imported,
    accessibilityLabel: 'Sync status: imported Strava ride',
  },
};

export function SyncStateBadge({ state, size = 'sm' }: SyncStateBadgeProps) {
  const visual = STATE_VISUALS[state];
  const sizeStyle = size === 'md' ? mdSize : smSize;

  // Cross-fade on state change. The implementation here is intentionally
  // simple — the *outgoing* state isn't actually held in this component; the
  // parent re-renders with the new state and we fade the new pill in. For the
  // full "out then in" choreography described in the spec, wrap two badges
  // in a parent Animated.View pair. The single-direction fade-in covers the
  // common case and reduces complexity.
  const opacity = useRef(new Animated.Value(1)).current;
  const prevState = useRef(state);

  useEffect(() => {
    if (prevState.current !== state) {
      // TODO: honor AccessibilityInfo.isReduceMotionEnabled and skip animation
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      // Announce the new state to screen readers
      AccessibilityInfo.announceForAccessibility(visual.accessibilityLabel);
      prevState.current = state;
    }
  }, [state, opacity, visual.accessibilityLabel]);

  return (
    <Animated.View
      style={[
        styles.badge,
        sizeStyle.container,
        { backgroundColor: visual.bg, borderColor: visual.border, opacity },
      ]}
      accessibilityRole="text"
      accessibilityLabel={visual.accessibilityLabel}
    >
      {visual.spinner ? (
        <ActivityIndicator size="small" color={visual.dot} style={sizeStyle.iconPad} />
      ) : (
        <View
          style={[
            styles.dot,
            sizeStyle.dot,
            { backgroundColor: visual.dot },
          ]}
        />
      )}
      <Text
        style={[
          sizeStyle.label,
          { color: visual.text },
        ]}
        numberOfLines={1}
      >
        {visual.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: {
    borderRadius: 999,
  },
});

const smSize = StyleSheet.create({
  container: {
    height: 22,
    paddingHorizontal: 8,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
  },
  iconPad: {
    // ActivityIndicator at "small" already sits ~12px; no extra padding needed
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

const mdSize = StyleSheet.create({
  container: {
    height: 28,
    paddingHorizontal: 12,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
  },
  iconPad: {},
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default SyncStateBadge;
