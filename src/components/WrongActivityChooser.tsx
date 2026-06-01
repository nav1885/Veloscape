/**
 * WrongActivityChooser — bottom-sheet modal for re-mapping a ride to a
 * different Strava activity.
 *
 * Opened from PostRideSummary when the rider taps "Wrong activity?" — only
 * available when dataSource='strava' AND importedFromStrava=false.
 *
 * Spec: docs/design/PhoneAsCoach_DesignSpec.md → "WrongActivityChooser"
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';

export interface CandidateActivity {
  id: number;
  name: string;
  /** unix seconds; used to render local time + sort by closeness to ride start */
  startedAt: number;
  distanceM: number;
  elapsedSec: number;
}

export interface WrongActivityChooserProps {
  visible: boolean;
  /** id of activity currently mapped to this ride; rendered with gold treatment */
  currentlyMappedId: number | null;
  /** up to 10 candidates, sorted by closeness to ride start time */
  candidates: CandidateActivity[];
  onPick: (activityId: number) => void;
  onUnmap: () => void;
  onDismiss: () => void;
}

export function WrongActivityChooser({
  visible,
  currentlyMappedId,
  candidates,
  onPick,
  onUnmap,
  onDismiss,
}: WrongActivityChooserProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      // TODO: iOS — set presentationStyle="overFullScreen" via wrapper if needed
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss" />

      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View
          style={styles.sheet}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Pick the right activity</Text>
          <Text style={styles.subtitle}>
            Sorted by closest start time to your ride.
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {candidates.map((a) => {
              const isCurrent = a.id === currentlyMappedId;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.row, isCurrent && styles.rowCurrent]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPick(a.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}. ${formatTime(a.startedAt)}. ${formatDistance(
                    a.distanceM,
                  )}. ${formatDuration(a.elapsedSec)}.${isCurrent ? ' Currently mapped.' : ''}`}
                >
                  <View
                    style={[
                      styles.rowDot,
                      { backgroundColor: isCurrent ? colors.gold : colors.textMuted },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, isCurrent && styles.rowNameCurrent]}>
                      {a.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatTime(a.startedAt)} · {formatDistance(a.distanceM)} ·{' '}
                      {formatDuration(a.elapsedSec)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {candidates.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  No recent Strava activities found.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.unmapBtn}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onUnmap();
            }}
            accessibilityRole="button"
            accessibilityLabel="Unmap this ride from any Strava activity"
          >
            <Text style={styles.unmapText}>None of these — unmap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// TODO: move these into a shared formatters util once SyncStateBadge integration lands
function formatDistance(m: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../utils/units').formatDistanceMeters(m);
}
function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}
function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgOverlay,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  rowCurrent: {
    backgroundColor: colors.goldDim,
    borderBottomColor: 'transparent',
  },
  rowDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowNameCurrent: {
    color: colors.gold,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: 12,
  },
  unmapBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  unmapText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.error,
  },
});

export default WrongActivityChooser;
