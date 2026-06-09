# Refinement — End Ride & Post-Ride Handoff

*Design spec | Veloscape | Flow owner: End & post-ride across all entry points*
*Grounds on: `InRideSingleGlanceAndLockScreenControls_Amendment.md` (authoritative), existing `wrappers.tsx` / `rideEngine.ts` / `rideService.ts` / `HomeScreen.tsx` / `HomeTab.tsx`.*
*Headless pass — decisive calls made; founder reviews after.*

---

## 0. Scope & principle

This flow covers **ending a ride and what the rider sees afterward**, across the three entry points the amendment defines:

1. **In-app End** — 2-second long-press on the single-glance In-Ride screen (phone in hand). Already implemented as `onLongPress` `delayLongPress={2000}`; formalized + given a real "hold" affordance here.
2. **Notification End** — End action on the lock-screen ride notification, gated by a **confirm** step (anti-pocket-tap). Foreground service keeps JS alive, so the handler runs without opening the app.
3. **Backgrounded End** — the End-confirm fires while the app is backgrounded/locked. Chosen default: **silent stop + save**, no force-open. The summary is **deferred** and shown on **next app open**.

**Overriding principle: extreme simplicity, background-first.** The rider should be able to end a ride from their pocket with two deliberate taps and trust that nothing is lost — without ever looking at the screen. The post-ride summary is the one rich artifact, and it should arrive calmly, not ambush the rider.

Everything here is **dark-mode native** (the app has no light mode — `colors.bgDeep #111111` for ride/debrief surfaces, gold `#F5C842` as the single accent). All icons are **`@expo/vector-icons` Ionicons, filled variant** — never Unicode glyphs. (The current `InRideScreen` uses `■` and `♪` text glyphs; this spec replaces them, consistent with the project's own anti-Unicode design rule.)

---

## 1. The three End paths — one save function, SQLite-rendered summary

### The save path today (verified)

`saveRide()` runs **only** inside `PostRideSummaryScreenWrapper`'s mount effect (`savedRef`). The in-app `handleEndRide` just does `stopRideEngine()` → `endRide()` → `navigate('PostRideSummary')`; the *navigation* is what triggers the save. **A backgrounded End never mounts that screen → the ride is never saved.** This is the amendment's Risk 4 and the headline engineering implication.

### The fix (flagged for build — §7)

Extract **`endRideAndSave()`** as the single end-of-ride entry point:

```
endRideAndSave(reason: 'in-app' | 'notification') -> { rideId }
  1. stopRideEngine()                  // stops GPS, timer, TTS, FG service
  2. rideStore.endRide()               // isRideActive=false, lastRideEndedAt=now
  3. const rideId = saveRide({...live store snapshot...})   // SQLite row written HERE, before any teardown
  4. mark rides.summary_viewed = 0 for rideId   // "awaiting view" signal
  5. dismiss / replace the ride notification
  6. rideStore.resetRide()             // see §7-B — clears live store so next-open infers SQLite
  return { rideId }
```

- **In-app End** calls `endRideAndSave('in-app')` — which returns `rideId` *after* the synchronous `saveRide` and `resetRide` — then `navigate('PostRideSummary', { rideId, speakDebrief: true })`. The screen loads SQLite by that `rideId`, so the just-reset store is irrelevant.
- **Notification End-confirm** calls `endRideAndSave('notification')` and **stops** — no navigation. The deferred summary is shown next open via the launch router (§5).

### The screen needs explicit params, not the inferred boolean (FLAG)

`PostRideSummary` today infers its mode: `isHistoryMode = completedSegments.length === 0 && !rideStartedAt`, and that single boolean couples **render-source + save? + speak?**. The deferred path is a combination the boolean cannot express — *render from SQLite, do NOT re-save, but DO speak the debrief.* Replace the inference with explicit params.

**Decisive call: ALL presentations render from SQLite by `rideId`.** Because `saveRide()` is synchronous, `endRideAndSave` writes the row and returns the `rideId` *before* navigation, so `loadRideDetail(rideId)` works immediately even for the in-app (`live`) path. This is what lets `endRideAndSave` safely `resetRide()` the live store (§7-B) without blanking the in-hand summary — the screen never depends on live-store residue. It also collapses the model to two real axes:

| Entry | Render source | Saves on mount? | Speaks debrief on mount? | Transition |
|---|---|---|---|---|
| In-app End (`live`) | SQLite by `rideId` | no — `endRideAndSave` already saved | yes (if `ttsEnabled`) | push from right |
| Launch router (`deferred`) | SQLite by `rideId` | no — already saved | yes (if `ttsEnabled`) | fade in |
| History tap / feed tap (`history`) | SQLite by `rideId` | no | **no** | push from right |

So a single nav param suffices: **`speakDebrief: boolean`** (true for live + deferred, false for history) plus the existing `rideId`. `live` and `deferred` are now **data-identical**; their only difference is the entry transition (push vs fade), handled by the navigator, not the screen. The screen always loads SQLite and seeds `savedRideId` from the route param so the reconciler attaches in every mode. (`presentation: 'live' | 'history' | 'deferred'` is an acceptable equivalent if eng prefers a named enum — but the load-bearing change is: render-from-SQLite always + a separate speak flag.) Speak is additionally gated on `settingsStore.ttsEnabled` (§7-A).

---

## 2. In-app End — 2-second hold (phone in hand)

The In-Ride single-glance screen (designed in the sibling in-ride refinement) carries two bottom controls: **Mute** (left, single tap) and **End (hold)** (right). This spec owns the End control's interaction.

```
┌─────────────────────────────────┐
│ IN-RIDE — single glance         │
│ Route: /ride/in-ride            │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ~24dp ▓▓▓▓▓▓▓│  ← system chrome
├─────────────────────────────────┤
│  1:04:22   ◉ GPS   ◉ Coaching   │  ← status row (elapsed · gps dot · coach dot)
│                                 │
│         (between-segments       │
│          metrics block —        │
│          owned by in-ride spec) │
│                                 │
│   ···                           │
│                                 │
├─────────────────────────────────┤
│  ┌───────────┐  ┌────────────┐  │  ← bottom controls — thumb zone
│  │ (vol-off) │  │ ▣ Hold to  │  │
│  │   Mute    │  │  End Ride  │  │
│  └───────────┘  └────────────┘  │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓│  ← system chrome
└─────────────────────────────────┘
```

### The End control — resting state

- Pill, right-aligned in the bottom control row. **Min height 56dp** (primary-action floor), `borderRadius: 999`.
- Quiet by default — `backgroundColor: colors.bgOverlay`, `borderColor: colors.border`, label `colors.textSecondary`. End is destructive-adjacent; it must not compete with the gold accent or the live ActiveCard. It is *findable*, not *loud*.
- Icon: Ionicons `stop` (filled square), 24dp, `colors.textSecondary`, leads the label.
- Label: **"Hold to End Ride"** — `15 / 600`. The word "Hold" is load-bearing: it tells the rider a single tap does nothing.

### The hold interaction (the anti-pocket-tap confirm)

A bare `delayLongPress={2000}` gives the rider **no feedback** that a hold is in progress — they can't tell a tap from a too-short hold. Add a visible **progress fill** so the hold is legible:

```
   Press down (t=0)
   ┌────────────────────────────┐
   │ ▣  Hold to End Ride        │   ← fill begins sweeping L→R behind the label
   └────────────────────────────┘
   t=1.0s  (50%)
   ┌────────────────────────────┐
   │ ███████▣  Ending…          │   ← fill at 50%, label swaps to "Ending…"
   └────────────────────────────┘
   t=2.0s  (100%) → fires
   ┌────────────────────────────┐
   │ ████████████ ✓ Ride saved  │   ← fill complete, success flash, then navigate
   └────────────────────────────┘
```

- **0 → 2000ms:** a gold (`colors.gold`, 18% opacity) fill animates L→R behind the label, driven by an `Animated.Value` timed to the 2s threshold. Border brightens to `colors.goldBorderStrong`.
- **Crosses ~40%:** label swaps "Hold to End Ride" → **"Ending…"**.
- **Release before 2s:** fill springs back to 0 (200ms spring), label reverts. Nothing happens. **No haptic** on abort (silence = "that did nothing").
- **Reaches 2s:** fires `endRideAndSave('in-app')`. Fill completes, brief `colors.success` flash + "Ride saved" for ~400ms, **heavy haptic** (`Haptics.notificationAsync(Success)`), then push to PostRideSummary.

**Haptics during hold:** a light tick (`Haptics.selectionAsync()`) at the *start* of a valid press so the rider knows the hold registered; the success notification haptic only on completion. No medium pulse mid-hold — keep it calm.

→ **TRANSITION: In-Ride → PostRideSummary (live)**
   Trigger: hold completes (2s)
   Animation: push from right (going deeper into the record), standard 300ms, spring
   Back gesture: from PostRideSummary, swipe-right / hardware-back → Home (existing `handleDone` / `BackHandler`), `resetRide()` already runs

**Accessibility:** the hold is a barrier for motor-impaired and VoiceOver users. Provide an a11y action: when a screen reader is active, expose End as a standard button with `accessibilityRole="button"`, `accessibilityLabel="End ride"`, and route its activation through a **confirm Alert** (`"End this ride?" / Cancel / End`) instead of requiring a 2s hold. The hold is a sighted-pocket affordance; the confirm dialog is the equivalent gate for AT users.

---

## 3. Notification End — two-step confirm (lock screen, foreground service alive)

The persistent ride notification carries two actions: **Mute/Unmute** (single, reversible — owned by the mute flow) and **End**. End must never fire on one accidental tap. The notification's equivalent of the 2s hold is a **two-step confirm**: tapping End does not end — it *transforms the notification* into a confirm state.

### Android — persistent ongoing notification (primary surface)

```
RESTING (ongoing, not dismissable)
┌───────────────────────────────────────────┐
│ ◉ Veloscape — ride in progress            │
│ 1:04:22 · 18.2 km · 2 of 5 segments       │  ← live-ish body (best-effort; updated on cue events)
│ ───────────────────────────────────────── │
│  [ (vol-off) Mute ]      [ (stop) End ]   │  ← two action buttons
└───────────────────────────────────────────┘

After tapping "End" → notification UPDATES IN PLACE (no new notification):
┌───────────────────────────────────────────┐
│ ◉ Veloscape — End this ride?              │
│ Your ride will be saved.                  │
│ ───────────────────────────────────────── │
│  [ Keep riding ]      [ (checkmark) End ride ] │  ← confirm; distinct labels
└───────────────────────────────────────────┘

→ tap "End ride" → fires endRideAndSave('notification')
→ tap "Keep riding" OR ~8s timeout → reverts to RESTING (ride continues)
```

- Implementation: the response listener for action id `end` does **not** end — it `setNotificationCategoryAsync` / re-presents the same notification id with the confirm category (actions `end-confirm` + `mute` relabeled "Keep riding"). Action id `end-confirm` is the only one that calls `endRideAndSave`.
- The **8-second auto-revert** prevents a stuck "are you sure" notification if the rider taps End by accident and walks away. On revert, no cue, no haptic — silent.
- The body line is best-effort live (Android allows notification updates from the FG service / a 30s tick). If live updates aren't cheap, a static "Tap to control coaching" body is acceptable — the *actions* are the point, not the metrics.

### iOS — single actionable local notification (floor; no persistent ongoing surface)

iOS has no Android-style ongoing notification. The floor (per amendment Risk 5; Live Activity is explicit follow-up, out of scope) is a local notification carrying the same two actions. iOS expandable notification actions ARE the confirm surface:

```
LOCK SCREEN (long-press / expand the Veloscape notification)
┌───────────────────────────────────────────┐
│ Veloscape · now                           │
│ Ride in progress — 1:04:22                │
│ ───────────────────────────────────────── │
│  Mute coaching                            │  ← notification action (tap)
│  End ride…                                │  ← note the ellipsis: "this opens a confirm"
└───────────────────────────────────────────┘

Tap "End ride…" → iOS re-presents the notification with confirm actions
(category swap), OR a textInput/options action sheet:
┌───────────────────────────────────────────┐
│ Veloscape · End this ride?                │
│  Keep riding                              │
│  End & save ride                          │  ← destructive style (red)
└───────────────────────────────────────────┘
```

- iOS confirm uses a **second action set via category swap** (preferred — `expo-notifications` `setNotificationCategoryAsync` with a `veloscape-ride-confirm` category), marking "End & save ride" with `options: { isDestructive: true }`.
- If category swap proves unreliable on a given iOS version (spike, Risk 3), the acceptable fallback is the OS confirm: the End action opens the app to a **confirm sheet** (§4) rather than ending silently. iOS already lets the floor degrade to "open app to confirm" without data loss.

→ **TRANSITION: notification End-confirm → (nothing visible)**
   Trigger: `end-confirm` action
   Animation: notification dismisses (the dismissal is itself the first half of the "saved" signal — see §4)
   The app is NOT brought to the foreground. Per the chosen default.

**Edge — End tapped, never confirmed:** ride continues; notification reverts after 8s (Android) / stays expandable (iOS). No save, no teardown.

**Edge — End fired mid-active-segment:** the in-flight effort is **discarded, not saved as a partial**. A segment effort only counts when `exitSegment` completes it; ending mid-segment means that segment is treated as **skipped** (it lands in PostRideSummary's skipped list, consistent with the existing skipped-segment handling in the wrapper). No partial/garbage time is written. (Build note in §7.)

---

## 4. "Ride saved" feedback — the silent-End confirmation (DECISIVE CALL)

The backgrounded End has **no on-screen moment** (phone pocketed, no force-open). The rider needs a trust signal that their two taps worked, without unlocking. Decision:

**Use a two-part signal: notification dismissal + a brief, non-ongoing "Ride saved" notification.**

1. The **ongoing ride notification dismisses** immediately on `endRideAndSave` — the persistent "ride in progress" surface vanishing is the primary "it ended" cue.
2. In its place, post a **single, dismissable, low-priority** notification:

```
┌───────────────────────────────────────────┐
│ (checkmark-circle, gold)  Veloscape       │
│ Ride saved · 1:08:40 · 3 segments coached │
│ Tap to see your summary                   │
└───────────────────────────────────────────┘
```

- Not ongoing, no actions, auto-expires (or is cleared when the summary is viewed). Tapping it deep-links to that ride's PostRideSummary in `deferred` presentation — the same destination the launch router would reach, just triggered by tap.
- **Rationale:** an ongoing→gone transition alone is ambiguous (did it crash? did the battery die?). A positive "Ride saved · N segments coached" line converts ambiguity into confidence in one glance, costs nothing (it's a local notification we're already wired for), and gives the rider an *optional* fast path to the summary without forcing it.
- **No audio** at silent-End time. The debrief speaks when the summary is actually presented (next open or tap), never blasting out of a pocketed locked phone unprompted.

**In-app End** doesn't need this notification — the rider is looking at the screen and gets the "Ride saved" fill flash + immediate navigation. The "Ride saved" notification is **backgrounded-End only**.

---

## 5. The deferred summary — next-open experience (DECISIVE CALL)

### Launch router

On app foreground/launch, a launch-time router checks SQLite for the **single most-recent** ride with `summary_viewed = 0` AND a real `endedAt`. If found, it **auto-routes** into that ride's PostRideSummary, fading in. The ride is marked `summary_viewed = 1` the moment the summary is first **displayed**, so it routes exactly once.

> **DEVIATION FROM AMENDMENT — flagged for founder veto.**
> The amendment mandates, *unconditionally*, "route to PostRideSummary **and speak the debrief**" on next open. This spec honors the **route** unconditionally but gates the **auto-audio** on freshness:
>
> **Auto-speak the debrief only if the ride ended ≤ 30 min ago AND `ttsEnabled`.** If it ended longer ago, route to the summary silently — the rider still lands on the full record, but the screen does **not** start talking. The "Listen to debrief" button is right there if they want it.
>
> **Why deviate (the narrow part):** auto-audio is right when continuous with the ride ("ended, pocketed, pulled the phone out 90 seconds later"). It is *hostile* when the rider opens the app six hours later for an unrelated reason and gets ambushed by a summary that starts talking — the exact failure mode §4/§10 guard against. The *screen* appearing is fine (it's a record, not a sound); the *audio* is the ambush. So we gate only the audio, not the navigation. This keeps the deviation minimal, preserves "always route," and avoids a whole new Home-surface code path (more aligned with the overriding simplicity principle than a 30-min-branch-to-a-card design would be). Founder can revert to literal amendment behavior by deleting the freshness check on the speak gate.

### Idempotency & coexistence

- **App already foregrounded when notification End fires** (rare — rider had app open behind lock): the router must not double-navigate. Guard: only auto-route if not already on a PostRideSummary route for that rideId, and the `summary_viewed` flip makes a second pass a no-op.
- **Coexistence with PhoneAsCoach's existing launch-time reconciler:** the reconciler resolves provisional→strava sync; the summary router resolves "unviewed ended ride." Ordering: **summary router runs first** (it owns navigation), the reconciler then attaches to whatever ride is on screen (the existing PostRideSummary reconciler effect already starts on `savedRideId`). They don't conflict — one navigates, the other syncs the thing navigated to. A deferred-ended ride is `provisional` like any other and the reconciler picks it up on the summary screen exactly as today.

### Deferred PostRideSummary screen

```
┌─────────────────────────────────┐
│ POST-RIDE SUMMARY (deferred)    │
│ Route: /ride/post  speakDebrief=true (if fresh+ttsEnabled) │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ~24dp ▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│  Morning Ride          (close)  │
│  Jun 9, 2026 · 1:08:40          │
│                                 │
│  ┌───────────────────────────┐  │
│  │  18.2 km   1:08:40   +210m │  │  ← headline metrics (existing)
│  └───────────────────────────┘  │
│                                 │
│  [ map with highlighted        │
│    segment slices — existing ]  │
│                                 │
│  ◉ Coached by Veloscape         │  ← coachedBySherpaa pill (existing)
│  ┌───────────────────────────┐  │
│  │ (play) Listen to debrief   │  │  ← audio CTA (existing, AudioButton)
│  └───────────────────────────┘  │
│                                 │
│  SEGMENTS (3)                   │
│  ┌───────────────────────────┐  │
│  │ Oak Climb   4:12   PR      │  │  ← existing SegmentRow detail + sparklines
│  └───────────────────────────┘  │
│   ··· (scrollable)              │
│                                 │
├─────────────────────────────────┤
│  [ Done — 56dp ]                │  ← returns to Home
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓│
└─────────────────────────────────┘
```

- **The screen content is UNCHANGED** from the existing `PostRideSummaryScreen` — it already renders metrics, map, segment detail, sparklines, debrief, sync badge. The only difference is **how it's reached and that it renders from SQLite while still speaking the debrief** (`speakDebrief: true`).
- **Debrief auto-speaks once** on mount (the `spokenRef` guard), gated by **`speakDebrief && ttsEnabled && endedWithin30min`** — so a deferred summary opened within 30 min of a voice-on ride speaks; a stale or voice-off open stays silent. See §5 deviation + §7-A.
- **Top-right is a `close` (Ionicons `close`, 28dp), not a back-chevron** — this summary wasn't pushed from a live ride, it was routed-to at launch; "close" reads as "dismiss this and go to Home," which is the correct mental model.
- Tapping Done / close / hardware-back → Home. Does **not** `resetRide()` (the store was already reset by `endRideAndSave`; in deferred mode there is no live ride to reset).

→ **TRANSITION: launch → deferred summary**
   Trigger: launch router finds an unviewed ride ended ≤30 min ago
   Animation: **fade in** (300ms), NOT a push — there's no "from" screen spatially; the summary simply *is there* when the app opens. A push-from-right would imply the rider navigated, which they didn't.
   Back gesture: close/back → Home (fade out)

**Edge — debrief degrades (zero or no completed segments):** a ride ended with 0 coached segments (rider ended before reaching any, or all skipped) still saves and still shows a summary — **distance + duration only**, segment list empty-state ("No segments completed on this ride"), and the debrief text degrades to a short generic line (`generateDebrief` already handles an empty `completedSegments` array). The "Ride saved" notification in this case reads "Ride saved · 1:08:40" (drops the "N segments coached" clause when N=0).

---

## 6. Home's treatment of the just-finished ride

The just-finished ride must appear on Home regardless of how it ended.

### Already-built behavior we reuse

- Home's feed (`loadHomeFeed` → `RideFeedRow`) loads from SQLite on focus (`useFocusEffect(reloadFeed)`). Because `endRideAndSave` writes the SQLite row **before** any navigation, the finished ride is already in the feed the next time Home focuses — **no new wiring needed for the feed itself.** It appears as a **TODAY** row with the `phone-recorded` sync badge and `coachedBySherpaa` pill, exactly like an in-app-ended ride.
- The existing **"Ride in progress" resume banner** (`rideInProgress && <resumeBanner>`) must NOT show after a backgrounded End — and it won't, because `endRideAndSave` calls `endRide()` (sets `isRideActive=false`) and `resetRide()`. Verified against `HomeScreen`'s `rideInProgress` prop wiring.

### No new Home surface is needed

Because the launch router **always auto-routes** to the deferred summary on next open (§5), there is no "summary ready" Home card and no new Home component. After the rider closes that summary (→ Home), the just-finished ride is simply the top **TODAY** row in the existing Recent Rides feed — tappable again (in `history` presentation, silent) anytime. This is the simplest possible treatment and honors the overriding simplicity principle: the finished ride shows up exactly where every other ride shows up, plus the one-time auto-route the moment they reopen the app.

The existing resume banner (`isRideActive` + gold dot + "Tap to resume") correctly never shows after a backgrounded End, because `endRideAndSave` clears `isRideActive` and calls `resetRide()`.

---

## 7. Engineering implications to flag for build

These go to the founder/eng as the build-time work this design assumes. The first two are the load-bearing flags.

### 7-A. PostRideSummary: render-from-SQLite always + explicit `speakDebrief` flag (FLAG — beyond `endRideAndSave`)

Today the screen *infers* `isHistoryMode = completedSegments.length === 0 && !rideStartedAt`, and that one boolean couples **render-source + save? + speak?**. The deferred path is "render-from-SQLite **but speak**" — a combination the boolean cannot express. Required change:

- **All paths render from SQLite** via `loadRideDetail(rideId)`. `saveRide` is synchronous and `endRideAndSave` returns the `rideId` before nav, so this is valid even for the in-app path. This removes the screen's dependence on live-store residue and is what makes `resetRide()` in `endRideAndSave` safe (§7-B). Drop the live-store render branch.
- Add **`speakDebrief: boolean`** to route params (true for in-app End + deferred launch-route; false for History/feed tap). The legacy inferred `isHistoryMode` can be retained only as the default for existing call sites during migration (`speakDebrief = !isHistoryMode`), then removed.
- **Save effect: delete it / hard-guard it.** Once `endRideAndSave` is the sole save path, the screen must **never** save (no-double-save guard the amendment requires). If a `rideId` is present in params (always now), skip the save effect entirely.
- **Speak effect: gate on `speakDebrief && settingsStore.ttsEnabled`** (today: `if (isHistoryMode ...)`). The `ttsEnabled` check is REQUIRED — the amendment keeps `ttsEnabled` as the global voice on/off that "still governs the debrief." Without it, a voice-off rider opening the deferred summary gets ambushed by audio — the exact failure §4/§10 guard against.
- Set `rides.summary_viewed = 1` on **first display** in every mode (harmless on history re-views).

### 7-B. `endRideAndSave` must reset the live store, or the inference re-fires (FLAG)

`endRide()` sets only `isRideActive=false` + `lastRideEndedAt`; it does **not** clear `completedSegments`/`rideStartedAt` (only `resetRide` does). After a backgrounded End, if the store still looks "live," the deferred summary's inference would compute `isHistoryMode=false` and try to **re-save → double-count**. Decision: **`endRideAndSave` calls `resetRide()` after `saveRide` succeeds** (step 6 in §1). All routes then render purely from SQLite by `rideId`, with no live-store residue. (Belt-and-suspenders: §7-A makes the screen load SQLite regardless of store state — either fix alone closes the double-save risk; we do both.)

### 7-C. `summary_viewed` migration & router cap

- `ALTER TABLE rides ADD COLUMN summary_viewed INTEGER NOT NULL DEFAULT 0` (safe constant default).
- **Cap the launch router to the single most-recent unviewed ride ended after this version ships** (or simply LIMIT 1 ordered by `endedAt DESC`), so the migration doesn't make every pre-existing ride (all default `summary_viewed=0`) try to pop a summary. One ride routes/surfaces; the rest stay silent.

### 7-D. Notification confirm + FG-service spike (Risk 3 dependency)

- Notification End is a **two-step** (action `end` re-presents confirm category; only `end-confirm` calls `endRideAndSave`). Build on `expo-notifications` categories `veloscape-ride` / `veloscape-ride-confirm`.
- Whether the actions live on the existing expo-location FG-service notification or a coordinated separate `expo-notifications` notification is the **build-time spike**. This design is agnostic: the *feature* (End from lock screen, with confirm) ships either way. Avoid a confusing double-notification in the final build.
- The "Ride saved" notification (§4) is a separate, non-ongoing local notification posted on backgrounded End only.

### 7-E. Mid-segment End discards the in-flight effort

Ending mid-active-segment must not write a partial effort. `endRideAndSave` snapshots `completedSegments` only (efforts completed by `exitSegment`); the active segment is left out → it appears as **skipped** in the summary (existing skipped-segment path). Confirm `stopRideEngine` doesn't flush a partial.

### 7-F. iOS confirm fallback

If iOS category-swap confirm is unreliable on a target OS version, the End action **opens the app to a confirm sheet** (native `Alert`: "End this ride? / Keep riding / End & save") rather than ending silently. Acceptable degradation; no data loss path.

---

## 8. State & edge-case matrix

| Condition | Behavior |
|---|---|
| In-app End, hold released < 2s | Fill springs back, label reverts, nothing fires, no haptic |
| In-app End, hold completes | `endRideAndSave('in-app')` → success flash + heavy haptic → push to PostRideSummary (`live`) |
| Notification End tapped, confirm tapped | `endRideAndSave('notification')` → silent stop+save → notification dismiss + "Ride saved" notif → no force-open |
| Notification End tapped, never confirmed | 8s auto-revert (Android) / stays expandable (iOS); ride continues |
| Backgrounded End, app reopened ≤ 30 min later | Launch router auto-routes to deferred summary; speaks debrief (if `ttsEnabled`); marks viewed |
| Backgrounded End, app reopened > 30 min later | Launch router still auto-routes to the summary, but **silently** (no auto-audio); "Listen to debrief" button available; marks viewed (deviation, §5) |
| App killed between End and next launch | SQLite row written before teardown → durable; router finds via `summary_viewed=0` |
| App already foregrounded when notif End fires | Idempotent — no double-nav; `summary_viewed` flip makes 2nd pass a no-op |
| End mid-active-segment | In-flight effort discarded → segment shown as skipped in summary; no partial time written |
| Zero / no completed segments | Summary shows distance+duration only; segment list empty-state; debrief degrades to generic line; "Ride saved" notif drops the "N segments" clause |
| Notification permission denied | No notification End surface (Tier 2 unavailable); in-app 2s hold (Tier 1) still ends the ride; ride not blocked |
| Reconciler + router on same launch | Router navigates first; reconciler attaches to the summary screen (existing effect on `savedRideId`); no conflict — deferred ride is `provisional` like any other |
| Debrief audio + pocketed locked phone | Never auto-plays at silent-End; only on summary display, gated by freshness (≤30min) AND `ttsEnabled` |
| Voice-off rider (`ttsEnabled=false`) opens any summary | No auto-audio in any mode; "Listen to debrief" still works on demand |

---

## 9. Components — new / changed / reused

**New**
- `EndRideHoldButton` — the 2s-hold control with animated progress fill, "Hold to End Ride" → "Ending…" → "Ride saved" states, Ionicons `stop` icon, heavy-haptic on complete, AT confirm-Alert fallback. (Replaces the inline `endRideBtn` `TouchableOpacity` + `■` glyph in `InRideScreen`.)
- (none) — no new Home component; the launch router always auto-routes, so the deferred ride needs no card.

**Changed**
- `PostRideSummaryScreenWrapper` — render from SQLite by `rideId` in all modes; accept `speakDebrief` param; speak gate = `speakDebrief && ttsEnabled` (§7-A); delete/hard-guard the save effect; set `summary_viewed=1` on display.
- `rideEngine` / new `endRideAndSave` — single end+save path; `resetRide()` after save (§7-B); dismiss ride notif + post "Ride saved" notif (backgrounded only).
- `rideStore.endRide` — unchanged signature; behavior unchanged (`endRideAndSave` owns reset). `resetRide` already clears live state.
- `HomeTab` — launch router: most-recent ride with `summary_viewed=0` → auto-route to summary; auto-speak only if ended ≤30min ago and `ttsEnabled`.
- `colors` — no new tokens needed (gold / success / surfaces all exist).

**Reused unchanged**
- `PostRideSummaryScreen` (presentational) — full content unchanged.
- `RideFeedRow`, `SyncStateBadge`, `AudioButton`, the Home feed `loadHomeFeed` path — the finished ride lands in the feed for free (SQLite written before nav).
- Reconciler, sync badges, debrief generation (`generateDebrief` already empty-array-safe).

---

## 10. Accessibility & motion summary

- **End hold** has an AT-equivalent confirm Alert (no 2s motor requirement for screen-reader users).
- **Notification confirm** is the AT-equivalent of the hold for the pocket case — two discrete taps, both fully labeled actions.
- **Deferred auto-route** respects "calm": fade-in not push, debrief speakable not auto-blasting on a locked phone, 30-min gate prevents ambush.
- **Contrast:** gold on `bgDeep` = 10.5:1 (AAA); `textSecondary #888` on `bgDeep` = 4.6:1 (AA body); success/error semantic colors per existing tokens.
- **Haptics:** light selection tick on valid End-press start; success notification haptic on End completion; none on abort or notification auto-revert (silence communicates "nothing happened").
- All icons Ionicons filled variant, ≥24dp, never Unicode — replacing the existing `■`/`♪`/`✓`/`○` text glyphs flagged by the project's own design rule.
```
