/**
 * User-tunable preferences. Persisted to AsyncStorage so they survive restarts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { GoalMode } from '../types/goalMode';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export type Units = 'metric' | 'imperial';

interface SettingsState {
  units: Units;
  ttsRate: number; // 0.5–1.5; expo-speech default ≈ 1.0
  ttsEnabled: boolean;
  // Auto-upload completed rides to Strava on ride end (M4/M17).
  stravaAutoUpload: boolean;
  // Speak the elevated-HR check-in cue (M15).
  hrCheckinEnabled: boolean;
  // Unified Home Feed amendment — LLM text summaries for non-coached rides.
  summariesEnabled: boolean;
  // Quick-Start Modes amendment — last-used ride mode, pre-selected on Home.
  lastGoalMode: GoalMode;

  setUnits: (u: Units) => void;
  setTtsRate: (r: number) => void;
  setTtsEnabled: (e: boolean) => void;
  setStravaAutoUpload: (e: boolean) => void;
  setHrCheckinEnabled: (e: boolean) => void;
  setSummariesEnabled: (e: boolean) => void;
  setLastGoalMode: (m: GoalMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'imperial',
      ttsRate: 0.95,
      ttsEnabled: true,
      stravaAutoUpload: true,
      hrCheckinEnabled: true,
      summariesEnabled: true,
      lastGoalMode: 'training',
      setUnits: (units) => set({ units }),
      setTtsRate: (ttsRate) => set({ ttsRate }),
      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setStravaAutoUpload: (stravaAutoUpload) => set({ stravaAutoUpload }),
      setHrCheckinEnabled: (hrCheckinEnabled) => set({ hrCheckinEnabled }),
      setSummariesEnabled: (summariesEnabled) => set({ summariesEnabled }),
      setLastGoalMode: (lastGoalMode) => set({ lastGoalMode }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
