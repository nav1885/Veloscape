/**
 * InlineAudioButton — first-class audio playback affordance.
 *
 * Used on RideFeedRow (sm), on PostRideSummary inline (md), and as the primary
 * "Play debrief" CTA on PostRideSummary (lg). Sized large enough that the user
 * explicitly sees it — audio is the product's differentiator and the user
 * asked for it to feel primary.
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "InlineAudioButton — Component Spec"
 *
 * This shell handles layout, sizing, and visual state. Business logic — calling
 * rideSummaryService, invoking expo-speech, subscribing to the playback bus —
 * is wired by the parent through `state` and `onPress`.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '../constants/colors';

export type AudioButtonState = 'idle' | 'generating' | 'playing' | 'error';

export interface InlineAudioButtonProps {
  state: AudioButtonState;
  /** 'sm' = 36×36 in list rows; 'md' = 48×48 inline; 'lg' = full-width 56px CTA */
  size?: 'sm' | 'md' | 'lg';
  onPress: () => void;
  /** lg only: override default label per state */
  label?: string;
  style?: ViewStyle;
}

const DEFAULT_LG_LABELS: Record<AudioButtonState, string> = {
  idle: 'Play debrief',
  generating: 'Preparing…',
  playing: 'Stop',
  error: 'Try again',
};

const ACCESSIBILITY_LABELS: Record<AudioButtonState, string> = {
  idle: 'Play debrief',
  generating: 'Preparing debrief',
  playing: 'Stop debrief',
  error: "Couldn't load debrief — try again",
};

export function InlineAudioButton({
  state,
  size = 'sm',
  onPress,
  label,
  style,
}: InlineAudioButtonProps) {
  const isLg = size === 'lg';
  const visual = visualForState(state);
  const sizeStyle = isLg ? lgSize : size === 'md' ? mdSize : smSize;

  const content = (() => {
    if (state === 'generating') {
      return (
        <ActivityIndicator
          size={isLg ? 'small' : 'small'}
          color={visual.iconColor}
        />
      );
    }
    return (
      <Text style={[sizeStyle.icon, { color: visual.iconColor }]}>
        {visual.glyph}
      </Text>
    );
  })();

  return (
    <Pressable
      onPress={onPress}
      // TODO: fire Haptics.selectionAsync() on press
      hitSlop={size === 'sm' ? { top: 4, bottom: 4, left: 8, right: 8 } : undefined}
      style={({ pressed }) => [
        styles.base,
        sizeStyle.container,
        {
          backgroundColor: visual.bg,
          borderColor: visual.border,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={ACCESSIBILITY_LABELS[state]}
      accessibilityState={{ busy: state === 'generating' }}
    >
      {isLg ? (
        <View style={lgSize.row}>
          {content}
          <Text style={[lgSize.label, { color: visual.iconColor }]}>
            {label ?? DEFAULT_LG_LABELS[state]}
          </Text>
        </View>
      ) : (
        content
      )}
    </Pressable>
  );
}

// ─── Visual state mapping ────────────────────────────────────────────────────

function visualForState(state: AudioButtonState): {
  bg: string;
  border: string;
  iconColor: string;
  glyph: string;
} {
  switch (state) {
    case 'playing':
      return {
        bg: colors.gold,
        border: colors.gold,
        iconColor: colors.textOnGold,
        glyph: '■',
      };
    case 'error':
      return {
        bg: colors.errorDim,
        border: colors.errorBorder,
        iconColor: colors.error,
        glyph: '↻',
      };
    case 'generating':
      return {
        bg: colors.goldDim,
        border: colors.goldBorder,
        iconColor: colors.gold,
        glyph: '',
      };
    case 'idle':
    default:
      return {
        bg: colors.goldDim,
        border: colors.goldBorder,
        iconColor: colors.gold,
        glyph: '▶',
      };
  }
}

// ─── Sizes ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const smSize = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    borderRadius: 999,
  },
  icon: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
    // glyph is centered via container alignItems/justifyContent
    marginLeft: 1, // optical centering for ▶ glyph
  },
});

const mdSize = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: 999,
  },
  icon: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
    marginLeft: 1,
  },
});

const lgSize = StyleSheet.create({
  container: {
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default InlineAudioButton;
