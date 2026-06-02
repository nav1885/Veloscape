/**
 * RideFeedRow — primary visual unit of the unified Home feed.
 *
 * 3-line layout: title + date / stats + audio button / badge row.
 * Tap row body → PostRideSummary. Tap inline audio → play debrief without
 * leaving Home. The audio button is its own Pressable so taps don't bubble
 * to the row.
 *
 * Spec: docs/design/UnifiedHomeFeed_DesignSpec.md → "RideFeedRow — Component Spec"
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import SyncStateBadge, { type SyncState } from './SyncStateBadge';
import CoachedPill from './CoachedPill';
import InlineAudioButton, { type AudioButtonState } from './InlineAudioButton';
import RouteThumbnail from './RouteThumbnail';
import { formatDistanceKm, spokenDistanceKm } from '../utils/units';
import type { LatLng } from '../utils/polyline';

export interface RideFeedRowProps {
  rideId: string;
  title: string;
  /** Pre-formatted: "APR 11" / "TODAY" / "YESTERDAY" */
  date: string;
  distanceKm: number;
  durationSec: number;
  syncState: SyncState;
  coachedBySherpaa: boolean;
  /** True if rides.debriefText IS NOT NULL — audio button skips generating */
  hasDebriefCached: boolean;
  /** Downsampled route for the tile thumbnail; undefined → placeholder box */
  routeCoords?: LatLng[];
  audioState: AudioButtonState;
  onPress: () => void;
  onAudioPress: () => void;
  style?: ViewStyle;
}

export function RideFeedRow({
  rideId: _rideId,
  title,
  date,
  distanceKm,
  durationSec,
  syncState,
  coachedBySherpaa,
  hasDebriefCached: _hasDebriefCached,
  routeCoords,
  audioState,
  onPress,
  onAudioPress,
  style,
}: RideFeedRowProps) {
  const a11yLabel = buildA11yLabel({
    title,
    date,
    distanceKm,
    durationSec,
    syncState,
    coachedBySherpaa,
  });

  return (
    <Pressable
      onPress={onPress}
      // TODO: fire Haptics.selectionAsync() on press
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.85 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.rowWrap}>
        {/* Leading route thumbnail */}
        <RouteThumbnail coords={routeCoords} width={64} height={64} style={styles.thumb} />

        {/* Text content */}
        <View style={styles.content}>
          {/* Line 1: title + date */}
          <View style={styles.line1}>
            <Text style={styles.title} numberOfLines={1}>
              {title || `${date} ride`}
            </Text>
            <Text style={styles.date}>{date}</Text>
          </View>

          {/* Line 2: stats + audio button */}
          <View style={styles.line2}>
            <Text style={styles.stats} numberOfLines={1}>
              {formatDistance(distanceKm)}
              {'  ·  '}
              {formatDuration(durationSec)}
            </Text>
            <InlineAudioButton
              state={audioState}
              size="sm"
              onPress={onAudioPress}
            />
          </View>

          {/* Line 3: badges */}
          <View style={styles.line3}>
            <SyncStateBadge state={syncState} size="sm" />
            {coachedBySherpaa && <CoachedPill size="sm" />}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Accessibility ───────────────────────────────────────────────────────────

function buildA11yLabel(p: {
  title: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  syncState: SyncState;
  coachedBySherpaa: boolean;
}): string {
  const syncLabels: Record<SyncState, string> = {
    awaiting: 'Awaiting Strava sync',
    synced: 'Synced from Strava',
    'phone-recorded': 'Phone-recorded',
    imported: 'Imported from Strava',
  };
  const parts = [
    p.title || `${p.date} ride`,
    p.date,
    spokenDistanceKm(p.distanceKm),
    formatDurationSpoken(p.durationSec),
    syncLabels[p.syncState] + '.',
  ];
  if (p.coachedBySherpaa) parts.push('Coached by Veloscape.');
  parts.push('Tap to view details.');
  return parts.join(', ');
}

// ─── Format helpers ──────────────────────────────────────────────────────────

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

function formatDurationSpoken(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} hour${h !== 1 ? 's' : ''} ${m} minutes`;
  return `${m} minutes`;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 12,
  },
  date: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textDim,
    letterSpacing: 0.4,
  },
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stats: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginRight: 12,
  },
  line3: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
});

export default RideFeedRow;
