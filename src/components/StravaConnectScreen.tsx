/**
 * StravaConnectScreen — triggers Strava OAuth and backend token exchange.
 * Shown after the onboarding carousel, before the "You're all set" screen.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';

export type ConnectState = 'idle' | 'connecting' | 'error';

interface Props {
  state: ConnectState;
  errorMessage?: string;
  onConnect: () => void;
  onBack: () => void;
}

export default function StravaConnectScreen({ state, errorMessage, onConnect, onBack }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* Strava logo placeholder */}
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>S</Text>
          </View>
        </View>

        <Text style={styles.headline}>Connect Strava</Text>
        <Text style={styles.sub}>
          Veloscape reads your starred segments to build your coaching plan.
          We never post or modify your Strava data.
        </Text>

        {/* Permission bullets */}
        <View style={styles.perms}>
          {[
            'Read your athlete profile',
            'Read your starred segments',
            'Read activity data for PR tracking',
          ].map((item, i) => (
            <View key={i} style={styles.permRow}>
              <Text style={styles.permCheck}>✓</Text>
              <Text style={styles.permText}>{item}</Text>
            </View>
          ))}
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.stravaBtn, state === 'connecting' && styles.stravaBtnDisabled]}
          onPress={onConnect}
          activeOpacity={0.85}
          disabled={state === 'connecting'}
        >
          {state === 'connecting' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.stravaBtnText}>Connect with Strava</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  logoWrap: { marginBottom: 8 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: colors.stravaOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.white,
    fontStyle: 'italic',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  perms: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginVertical: 8,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permCheck: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
    width: 16,
  },
  permText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: colors.errorDim,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 18,
  },
  stravaBtn: {
    width: '100%',
    height: 56,
    backgroundColor: colors.stravaOrange,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  stravaBtnDisabled: {
    opacity: 0.6,
  },
  stravaBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.2,
  },
  backBtn: {
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 14,
    color: colors.textDim,
  },
});
