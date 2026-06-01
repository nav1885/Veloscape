/**
 * Queue-based TTS using expo-speech.
 * Speaks one utterance at a time; queued utterances play in order.
 */
import * as Speech from 'expo-speech';
import { useSettingsStore } from '../store/settingsStore';

interface QueuedItem {
  text: string;
  onDone?: () => void;
  onStopped?: () => void;
}

const _queue: QueuedItem[] = [];
let _speaking = false;

async function _processQueue(): Promise<void> {
  if (_speaking || _queue.length === 0) return;
  _speaking = true;
  const item = _queue.shift()!;
  const { ttsRate } = useSettingsStore.getState();

  return new Promise<void>((resolve) => {
    Speech.speak(item.text, {
      language: 'en-US',
      rate: ttsRate,
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
}

/** Whether TTS is currently speaking (alias for compat with new call sites). */
export function isCurrentlySpeaking(): boolean {
  return _speaking;
}

/** Whether TTS is currently speaking. */
export function isSpeaking(): boolean {
  return _speaking;
}
