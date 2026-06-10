/**
 * Lock-screen ride controls via expo-notifications.
 *
 * The primary control surface for a pocketed phone: a persistent notification with
 * Mute/Unmute + End (with a confirm step) that work WITHOUT unlocking. Actions map to
 * the SAME muteCoaching/unmuteCoaching/endRideAndSave the in-app buttons call.
 *
 * Cycle-free by design: this module imports the engine/control handlers (one
 * direction). It NEVER imports back into them. The InRide wrapper drives
 * postRideNotification() from a state effect; the engine/control layer stays unaware
 * of notifications.
 *
 * ⚠️ R3 (needs an on-device spike): expo-location's foreground service posts its OWN
 * notification, so during a ride this control notification may appear ALONGSIDE it
 * (double-notification). The spike decides whether to demote/group the FG-service
 * notification. Until verified on-device, treat the lock-screen UX as UNCONFIRMED.
 */
import * as Notifications from 'expo-notifications';
import { useRideStore } from '../store/rideStore';
import { muteCoaching, unmuteCoaching } from './rideEngine';
import { endRideAndSave } from './rideControl';

const NOTIF_ID = 'veloscape-ride';
const CAT_ON = 'vs-ride-on';
const CAT_MUTED = 'vs-ride-muted';
const CAT_CONFIRM = 'vs-ride-confirm';
const END_CONFIRM_REVERT_MS = 8000;

let _endConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let _initialized = false;
// Set by the app shell so a notification End (backgrounded) can route to the summary
// when the app is next foregrounded. Kept here to avoid importing navigation.
let _onRideSavedFromNotification: (() => void) | null = null;
export function setOnRideSavedFromNotification(fn: (() => void) | null): void {
  _onRideSavedFromNotification = fn;
}

/** One-time setup at app init: categories, handler, response listener. */
export async function setupRideNotifications(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  await Notifications.setNotificationCategoryAsync(CAT_ON, [
    { identifier: 'mute', buttonTitle: 'Mute', options: { opensAppToForeground: false } },
    { identifier: 'end', buttonTitle: 'End', options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(CAT_MUTED, [
    { identifier: 'unmute', buttonTitle: 'Unmute', options: { opensAppToForeground: false } },
    { identifier: 'end', buttonTitle: 'End', options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(CAT_CONFIRM, [
    { identifier: 'end-cancel', buttonTitle: 'Keep riding', options: { opensAppToForeground: false } },
    { identifier: 'end-confirm', buttonTitle: 'End ride', options: { opensAppToForeground: false, isDestructive: true } },
  ]);

  Notifications.addNotificationResponseReceivedListener(onResponse);
}

async function present(category: string, title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: { title, body, categoryIdentifier: category, sticky: true, autoDismiss: false },
      trigger: null, // immediate, in-place re-present of the same id
    });
  } catch (e) {
    console.warn('[rideNotification] present failed:', e);
  }
}

/** Post/refresh the live ride control notification reflecting current state. */
export async function postRideNotification(): Promise<void> {
  const rs = useRideStore.getState();
  if (!rs.isRideActive) return;
  const done = rs.completedSegments.length;
  const total = rs.routeSegmentIds.length;
  const km = rs.distanceKm.toFixed(1);
  const status = rs.cuesMuted ? 'Muted' : 'Coaching on';
  await present(rs.cuesMuted ? CAT_MUTED : CAT_ON, 'Veloscape · riding', `${status} · ${km} · ${done} of ${total}`);
}

export async function dismissRideNotification(): Promise<void> {
  clearRevert();
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch { /* not present */ }
}

async function postRideSaved(segCount: number): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Ride saved', body: `${segCount} segments coached · tap to see your debrief` },
      trigger: null,
    });
  } catch { /* non-fatal */ }
}

function armRevert(): void {
  clearRevert();
  _endConfirmTimer = setTimeout(() => {
    _endConfirmTimer = null;
    postRideNotification().catch(() => {}); // unconfirmed End → revert to live controls
  }, END_CONFIRM_REVERT_MS);
}
function clearRevert(): void {
  if (_endConfirmTimer) { clearTimeout(_endConfirmTimer); _endConfirmTimer = null; }
}

async function onResponse(resp: Notifications.NotificationResponse): Promise<void> {
  const action = resp.actionIdentifier;
  clearRevert();
  switch (action) {
    case 'mute':
      muteCoaching();
      await postRideNotification();
      break;
    case 'unmute':
      unmuteCoaching();
      await postRideNotification();
      break;
    case 'end':
      // First tap: show the confirm step (anti-pocket-tap). Auto-reverts after 8s.
      await present(CAT_CONFIRM, 'End this ride?', 'Tap "End ride" to confirm · saves automatically');
      armRevert();
      break;
    case 'end-cancel':
      await postRideNotification();
      break;
    case 'end-confirm': {
      const segCount = useRideStore.getState().completedSegments.length;
      await endRideAndSave('notification');
      await dismissRideNotification();
      await postRideSaved(segCount);
      _onRideSavedFromNotification?.(); // route to summary if app is/!becomes foreground
      break;
    }
    default:
      // Body tap (DEFAULT_ACTION) — opens the app; the live In-Ride screen shows.
      break;
  }
}
