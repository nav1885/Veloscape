/**
 * Queue-based TTS using expo-speech.
 * Speaks one utterance at a time; queued utterances play in order.
 *
 * Audio ducking: expo-speech on Android requests NO audio focus, so cues won't
 * lower the user's music on their own. While a cue is speaking we play a tiny
 * silent expo-av clip — with the ride's audio mode (interruptionModeAndroid:
 * DuckOthers) that grabs transient duck focus, so background music dips while the
 * cue plays and returns after. On iOS, `useApplicationAudioSession: false` lets
 * the system duck for us.
 */
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { useSettingsStore } from '../store/settingsStore';

interface QueuedItem {
  text: string;
  onDone?: () => void;
  onStopped?: () => void;
}

const _queue: QueuedItem[] = [];
let _speaking = false;

// ─── Duck focus (silent clip) ────────────────────────────────────────────────
let _duckSound: Audio.Sound | null = null;
let _duckLoading: Promise<void> | null = null;

async function ensureDuckLoaded(): Promise<void> {
  if (_duckSound) return;
  if (!_duckLoading) {
    _duckLoading = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { sound } = await Audio.Sound.createAsync(require('../../assets/silent.wav'), {
          isLooping: true,
          volume: 0,
        });
        _duckSound = sound;
      } catch {
        _duckSound = null; // ducking is best-effort; never block cues
      }
    })();
  }
  await _duckLoading;
}

function startDuck(): void {
  ensureDuckLoaded()
    .then(() => _duckSound?.playFromPositionAsync(0))
    .catch(() => {});
}

function stopDuck(): void {
  _duckSound?.stopAsync().catch(() => {});
}

async function _processQueue(): Promise<void> {
  if (_speaking) return;
  if (_queue.length === 0) {
    stopDuck(); // queue drained → release duck focus, music returns
    return;
  }
  _speaking = true;
  startDuck(); // music dips while we speak (idempotent if already ducking)
  const item = _queue.shift()!;
  const { ttsRate } = useSettingsStore.getState();

  return new Promise<void>((resolve) => {
    Speech.speak(item.text, {
      language: 'en-US',
      rate: ttsRate,
      useApplicationAudioSession: false, // iOS: let the system duck other audio
      onDone: () => {
        _speaking = false;
        item.onDone?.();
        resolve();
        _processQueue();
      },
      onError: () => {
        _speaking = false;
        resolve();
        _processQueue();
      },
      onStopped: () => {
        _speaking = false;
        item.onStopped?.();
        resolve();
      },
    });
  });
}

/** Queue a text utterance. Plays immediately if nothing else is speaking. */
export function speak(
  text: string,
  callbacks?: { onDone?: () => void; onStopped?: () => void },
): void {
  if (!useSettingsStore.getState().ttsEnabled) return;
  _queue.push({ text, onDone: callbacks?.onDone, onStopped: callbacks?.onStopped });
  _processQueue();
}

/** Stop current speech and clear the queue. */
export function stop(): void {
  _queue.length = 0;
  _speaking = false;
  Speech.stop();
  stopDuck();
}

/** Whether TTS is currently speaking (alias for compat with new call sites). */
export function isCurrentlySpeaking(): boolean {
  return _speaking;
}

/** Whether TTS is currently speaking. */
export function isSpeaking(): boolean {
  return _speaking;
}
