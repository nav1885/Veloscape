/**
 * DisclosureRow — Settings-style expandable row.
 *
 * Used in Settings "What gets synced" disclosure for the Phone-as-Coach
 * amendment. Collapsed by default; tap rotates the chevron and reveals an
 * inset body card. State is local (re-collapses on cold launch — this is
 * informational, not a setting).
 *
 * Spec: docs/design/PhoneAsCoach_DesignSpec.md → "Flow D — DisclosureRow"
 */

import React, { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DisclosureRowProps {
  label: string;
  /** Body content — text or arbitrary nodes */
  children: React.ReactNode;
  /** initial expanded state — default false */
  defaultExpanded?: boolean;
}

export function DisclosureRow({
  label,
  children,
  defaultExpanded = false,
}: DisclosureRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotation = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const toggle = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    Animated.timing(rotation, {
      toValue: expanded ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setExpanded(!expanded);
  };

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View>
      <TouchableOpacity
        style={styles.row}
        onPress={toggle}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={label}
        accessibilityHint={expanded ? 'Tap to collapse' : 'Tap to expand'}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate }] }]}>
          ›
        </Animated.Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.bodyWrap}>
          <View style={styles.body}>
            {typeof children === 'string' ? (
              <Text style={styles.bodyText}>{children}</Text>
            ) : (
              children
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  chevron: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: '300',
  },
  bodyWrap: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  body: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bodyText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 19,
  },
});

export default DisclosureRow;
