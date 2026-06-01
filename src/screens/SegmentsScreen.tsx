import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { colors } from '../constants/colors';
import { useSegmentStore, type Segment } from '../store/segmentStore';
import { db } from '../db/client';
import { cues } from '../db/schema';
import { useSettingsStore } from '../store/settingsStore';
import { formatTimeSec } from '../services/rideHistoryService';

type SortKey = 'name' | 'distance' | 'pr' | 'efforts';

interface SegmentRow extends Segment {
  cueCount: number;
}

export default function SegmentsScreen() {
  const segments = useSegmentStore((s) => s.starredSegments);
  const units = useSettingsStore((s) => s.units);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cueCounts, setCueCounts] = useState<Record<string, number>>({});
  const [cueDetail, setCueDetail] = useState<
    Record<string, Array<{ goalMode: string; aggressive: string; moderate: string; recovery: string }>>
  >({});

  // Load cue counts when screen focuses
  useFocusEffect(
    useCallback(() => {
      const counts: Record<string, number> = {};
      const detail: typeof cueDetail = {};
      for (const seg of segments) {
        const rows = db.select().from(cues).where(eq(cues.segmentId, seg.id)).all();
        counts[seg.id] = rows.length;
        detail[seg.id] = rows.map((r) => ({
          goalMode: r.goalMode,
          aggressive: r.aggressive,
          moderate: r.moderate,
          recovery: r.recovery,
        }));
      }
      setCueCounts(counts);
      setCueDetail(detail);
    }, [segments])
  );

  const rows = useMemo(() => {
    const enriched: SegmentRow[] = segments.map((s) => ({ ...s, cueCount: cueCounts[s.id] ?? 0 }));
    const filtered = query
      ? enriched.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
      : enriched;
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'distance':
          return b.distanceM - a.distanceM;
        case 'pr':
          // Treat null PR as worst.
          return (a.bestTimeSec ?? Infinity) - (b.bestTimeSec ?? Infinity);
        case 'efforts':
          return b.effortCount - a.effortCount;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [segments, cueCounts, query, sortKey]);

  const renderItem = ({ item }: { item: SegmentRow }) => {
    const isExpanded = expanded === item.id;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setExpanded(isExpanded ? null : item.id)}
        activeOpacity={0.75}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.segName}>{item.name}</Text>
            <Text style={styles.segMeta}>
              {formatDistance(item.distanceM, units)} · {Math.round(item.elevationM)} m elev ·{' '}
              {tendencyLabel(item.pacingTendency)}
            </Text>
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.prValue}>
              {item.bestTimeSec ? formatTimeSec(item.bestTimeSec) : '—'}
            </Text>
            <Text style={styles.prLabel}>
              {item.effortCount} {item.effortCount === 1 ? 'effort' : 'efforts'}
            </Text>
          </View>
        </View>

        <View style={styles.tagRow}>
          <View style={styles.tagSmall}>
            <Text style={styles.tagSmallText}>
              {item.cueCount > 0 ? `${item.cueCount} cue set${item.cueCount > 1 ? 's' : ''} cached` : 'No cues cached'}
            </Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expanded}>
            {(cueDetail[item.id] ?? []).length === 0 ? (
              <Text style={styles.expandedEmpty}>
                Cues will be generated when this segment appears on a planned route.
              </Text>
            ) : (
              (cueDetail[item.id] ?? []).map((c) => (
                <View key={c.goalMode} style={styles.cueBlock}>
                  <Text style={styles.cueHeader}>{goalModeLabel(c.goalMode)}</Text>
                  <CueLine variant="Aggressive" text={c.aggressive} />
                  <CueLine variant="Moderate" text={c.moderate} />
                  <CueLine variant="Recovery" text={c.recovery} />
                </View>
              ))
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Segments</Text>
        <Text style={styles.subtitle}>
          {segments.length} starred · tap to view cached cues
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search segments…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.sortRow}>
        {(['name', 'distance', 'pr', 'efforts'] as SortKey[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.sortChip, sortKey === k && styles.sortChipActive]}
            onPress={() => setSortKey(k)}
          >
            <Text style={[styles.sortChipText, sortKey === k && styles.sortChipTextActive]}>
              {sortLabel(k)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {query ? 'No matches' : 'No starred segments'}
            </Text>
            <Text style={styles.emptyText}>
              {query
                ? 'Try a different search term.'
                : 'Star segments in Strava and pull to refresh on Home.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function CueLine({ variant, text }: { variant: string; text: string }) {
  return (
    <View style={styles.cueLine}>
      <Text style={styles.cueVariant}>{variant}</Text>
      <Text style={styles.cueText}>{text}</Text>
    </View>
  );
}

function formatDistance(m: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const mi = m / 1609.34;
    return mi >= 0.1 ? `${mi.toFixed(2)} mi` : `${Math.round(m * 3.281)} ft`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function tendencyLabel(t: Segment['pacingTendency']): string {
  switch (t) {
    case 'fade':
      return 'Tends to fade';
    case 'strongStart':
      return 'Strong starter';
    case 'consistent':
      return 'Consistent';
    default:
      return 'No pattern yet';
  }
}

function goalModeLabel(g: string): string {
  if (g === 'pr') return 'PR Attempt';
  if (g === 'training') return 'Training';
  return 'Recovery';
}

function sortLabel(k: SortKey): string {
  if (k === 'name') return 'A–Z';
  if (k === 'distance') return 'Distance';
  if (k === 'pr') return 'Best time';
  return 'Efforts';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sortRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sortChipActive: { backgroundColor: colors.goldDim, borderColor: colors.goldBorderStrong },
  sortChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  sortChipTextActive: { color: colors.gold },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start' },
  segName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  segMeta: { fontSize: 12, color: colors.textSecondary },
  rightCol: { alignItems: 'flex-end', marginLeft: 12 },
  prValue: { fontSize: 16, fontWeight: '700', color: colors.gold },
  prLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: 'row', marginTop: 10, gap: 6 },
  tagSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  tagSmallText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  expanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  expandedEmpty: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  cueBlock: { marginBottom: 10 },
  cueHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.gold,
    marginBottom: 6,
  },
  cueLine: { marginBottom: 6 },
  cueVariant: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginBottom: 1 },
  cueText: { fontSize: 12, color: colors.textPrimary, lineHeight: 16 },
});
