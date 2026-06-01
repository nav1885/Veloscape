import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore, type Units } from '../store/settingsStore';
import { speak, stop as stopSpeech } from '../services/ttsService';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { db } from '../db/client';
import { cues, cachedActivities } from '../db/schema';
import DisclosureRow from '../components/DisclosureRow';
import type { RootStackParamList } from '../navigation/types';

export default function SettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const rider = useAuthStore((s) => s.rider);
  const subscriptionTier = useAuthStore((s) => s.subscriptionTier);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const lastSegmentSyncAt = useAuthStore((s) => s.lastSegmentSyncAt);
  const lastActivityFetchAt = useAuthStore((s) => s.lastActivityFetchAt);

  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const hrCheckinEnabled = useSettingsStore((s) => s.hrCheckinEnabled);
  const setHrCheckinEnabled = useSettingsStore((s) => s.setHrCheckinEnabled);
  const summariesEnabled = useSettingsStore((s) => s.summariesEnabled);
  const setSummariesEnabled = useSettingsStore((s) => s.setSummariesEnabled);

  const [busy, setBusy] = useState(false);

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need to reconnect Strava to continue using Sherpaa.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => clearAuth() },
    ]);
  }

  function handleClearCueCache() {
    Alert.alert('Clear cue cache?', 'Cues will be regenerated on your next ride.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          try {
            db.delete(cues).run();
            db.delete(cachedActivities).run();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleTestVoice() {
    stopSpeech();
    speak('This is your Sherpaa coach. Two segments ahead. Ride strong.');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <Section title="Account">
          <Row label="Athlete" value={rider?.name ?? '—'} />
          <Row label="Strava ID" value={rider?.stravaAthleteId ?? '—'} />
          <Row label="Plan" value={planLabel(subscriptionTier)} />
          <Pressable label="Sign out" destructive onPress={handleSignOut} />
        </Section>

        <Section title="Units">
          <SegmentedControl
            options={[
              { value: 'metric', label: 'Metric (km)' },
              { value: 'imperial', label: 'Imperial (mi)' },
            ]}
            value={units}
            onChange={(v) => setUnits(v as Units)}
          />
        </Section>

        <Section title="Voice & Audio">
          <ToggleRow label="Voice cues" value={ttsEnabled} onChange={setTtsEnabled} />
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Speech rate</Text>
            <View style={styles.rateButtons}>
              {[0.8, 0.95, 1.1, 1.25].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rateBtn, ttsRate === r && styles.rateBtnActive]}
                  onPress={() => setTtsRate(r)}
                >
                  <Text style={[styles.rateBtnText, ttsRate === r && styles.rateBtnTextActive]}>
                    {r === 0.8 ? 'Slow' : r === 0.95 ? 'Normal' : r === 1.1 ? 'Fast' : 'Faster'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Pressable label="Test voice" onPress={handleTestVoice} />
          <ToggleRow
            label="Generate text summaries for non-coached rides"
            sublabel="Off saves LLM cost. Default is on."
            value={summariesEnabled}
            onChange={setSummariesEnabled}
          />
        </Section>

        <Section title="Coaching">
          <ToggleRow
            label="Elevated-HR check-ins"
            sublabel="Get a brief between-segment cue if HR stays high"
            value={hrCheckinEnabled}
            onChange={setHrCheckinEnabled}
          />
        </Section>

        <Section title="Strava" subtitle="Sherpaa coaches. Your watch records.">
          <Row label="Last segment sync" value={formatRelative(lastSegmentSyncAt)} />
          <Row label="Last activity fetch" value={formatRelative(lastActivityFetchAt)} />
          <DisclosureRow label="What gets synced">
            When your watch uploads to Strava, Sherpaa pulls the authoritative
            distance, elevation, heart rate, and segment effort times. Phone
            GPS is only used for live cue timing during the ride.{'\n\n'}
            If you ride without a head unit, your rides will stay phone-recorded.
            Sherpaa still coaches and debriefs you the same way.
          </DisclosureRow>
          <Pressable
            label="Reconnect Strava"
            onPress={() => navigation.navigate('Auth', { screen: 'StravaConnect' })}
          />
        </Section>

        <Section title="Storage">
          <Pressable
            label={busy ? 'Clearing…' : 'Clear cue & activity cache'}
            onPress={handleClearCueCache}
            disabled={busy}
          />
        </Section>

        <Text style={styles.footer}>Sherpaa · v0.4 · {new Date().getFullYear()}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel && <Text style={styles.rowSub}>{sublabel}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.gold }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function Pressable({
  label,
  onPress,
  destructive,
  disabled,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
    >
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.segmentedItem, value === opt.value && styles.segmentedItemActive]}
        >
          <Text
            style={[
              styles.segmentedText,
              value === opt.value && styles.segmentedTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function planLabel(t: 'free' | 'pro' | 'elite'): string {
  return t === 'free' ? 'Free' : t === 'pro' ? 'Pro' : 'Elite';
}

function formatRelative(ts: number | null): string {
  if (!ts) return 'Never';
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (ageSec < 60) return 'Just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 16,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    paddingHorizontal: 4,
    marginTop: -4,
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowValue: { fontSize: 14, color: colors.textSecondary, maxWidth: 180 },
  chevron: { fontSize: 22, color: colors.textMuted },
  rateRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  rateLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 10 },
  rateButtons: { flexDirection: 'row', gap: 8 },
  rateBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  rateBtnActive: { backgroundColor: colors.goldDim, borderColor: colors.goldBorderStrong },
  rateBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  rateBtnTextActive: { color: colors.gold },
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentedItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  segmentedItemActive: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.goldBorderStrong },
  segmentedText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  segmentedTextActive: { color: colors.gold },
  footer: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
