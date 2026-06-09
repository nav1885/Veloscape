# Veloscape — Refinement Build Plan

*Prioritized, build-oriented sequence for the In-Ride Single-Glance + Lock-Screen Controls refinement.*
*Grounds on `InRideSingleGlanceAndLockScreenControls_Amendment.md` (authoritative, esp. its Risks & QA Gate) + the five refinement specs + `Veloscape_EndToEnd_Workflows.md` (companion).*
*2026-06-09.*

---

## 0. Sequencing principle (and an explicit override of the amendment's order)

The amendment's Migration/Rollout lists **single-glance UI as step 2** (before notifications + the save refactor). **This build plan deliberately reorders: prove the background-reliability core + lock-screen controls ON-DEVICE before any cosmetic polish.**

**Why override:** the two **High-severity** risks — Risk 1 (mute must gate ALL cue sites) and Risk 4 (a backgrounded End must actually save) — are the ones that silently break the product, and **both are verifiable in-app via the existing simulated ride (long-press Start) with NO new native dependency.** De-risk those first, cheaply, before touching `expo-notifications` or redrawing screens. The single-glance redesign, `HandoffOverlay`, hold-fill, icon swaps, and FTUE primers are all **cosmetic/UI** relative to "does the coach keep coaching, respect mute, and never lose a ride when the screen is off" — and that question is the whole reason this refinement exists. Nothing is called done until the **#1 QA gate** (a real screen-off ride) passes.

This is a conscious reordering of the amendment's step order, not an oversight. The amendment's *content* (every risk, every flagged site) is fully honored.

---

## 1. The five risks this plan is built around (from the amendment)

| # | Risk | Severity | Where it bites |
|---|---|---|---|
| **R1** | Mute "at the same sites Recovery uses" leaves **approach + result + GPS-locked cues firing** while muted | **High** | `rideEngine` cue sites — Phase 1 |
| **R2** | The "Coaching muted" confirmation gets swallowed by the mute it confirms | Medium | Gate at cue *sites*, never inside `speak()` — Phase 1 |
| **R3** | expo-location FG-service notification may not host actions → **double-notification** | Medium | The screen-off spike — Phase 3 |
| **R4** | A backgrounded notification-End **never saves the ride** (save only runs in PostRideSummary mount) | **High** | `endRideAndSave` refactor — Phase 2 |
| **R5** | iOS has **no persistent lock-screen control surface** (Live Activity out of scope) | Medium (scope) | Android-first; iOS = single actionable notification floor — Phase 3 |

---

## 2. Build phases (sequenced)

### Phase 0 — preconditions (do first, no risk, unblocks the rest)
- **Add `gpsLocked: false` to `rideStore.startRide`** (Home spec §6 BLOCKER). One line. Without it, ride 2 of a session carries stale `gpsLocked: true` and the handoff falsely jumps to "GPS locked — pocket it" with no real fix.
- **`cuesMuted` + `setCuesMuted` in `rideStore`**, reset `false` in `startRide` and `resetRide` (amendment Data Model). Ephemeral; no SQLite.
- **Fix the notification accent token:** `rideEngine.ts` `notificationColor: '#F5C518'` → `colors.gold` (`#F5C842`). Both notification branches must tint identically.

### Phase 1 — Mute gating (R1 + R2) — the #1 correctness item, verifiable in-app today
- Put the mute check at the **top of `shouldFireCue`** so it returns `false` for **any** `cueType` when `cuesMuted`:
  ```
  if (useRideStore.getState().cuesMuted) return false;   // gates ALL cue types
  if (goalMode === 'recovery' && (cueType === 'start' || cueType.startsWith('split'))) return false;
  return true;
  ```
- **Add `shouldFireCue` to the sites that currently bypass it** (this is the part "gate where Recovery checks" misses):
  - `fireApproachCue` — wrap in `if (shouldFireCue(_goalMode, 'approach'))`
  - `exitSegment` — wrap the result `speak()` in `if (shouldFireCue(_goalMode, 'end'))`
  - the start-of-ride "GPS locked. N segments loaded…" cue in the engine — gate it too
  - `enterSegment` (start) + `fireSplitCue` already call `shouldFireCue` — automatic
- **Do NOT gate inside `speak()`** (R2). Mute sequence: set `cuesMuted=true` → `stopTTS()` (kill in-flight) → `speak("Coaching muted")` (rides the ungated path on purpose). Unmute: `cuesMuted=false` → `speak("Coaching on")`.
- Add exported `muteCoaching()` / `unmuteCoaching()` — the single code path both the in-app `MuteToggle` and the notification listener will call.
- **Self-test (no device, no native dep):** simulated ride (long-press Start) → mute → ride past a segment → **silence except the "Coaching muted" confirmation.**

### Phase 2 — Save path + deferred summary (R4) — verifiable in-app today
- **Extract `endRideAndSave(reason)`** as the sole end-of-ride entry point: `stopRideEngine()` → `endRide()` → `saveRide(...)` (writes the SQLite row + `summary_viewed=0` **before any teardown**) → dismiss notification → `resetRide()` → return `{ rideId }`.
- **In-app End** calls `endRideAndSave('in-app')` then `navigate('PostRideSummary', { rideId, speakDebrief: true })`. **Notification End-confirm** calls `endRideAndSave('notification')` and stops (no nav).
- **PostRideSummary: render-from-SQLite-always + explicit `speakDebrief` flag** (end-postride §7-A). Replace the inferred `isHistoryMode` boolean (it couples render-source + save + speak). Delete/hard-guard the mount-effect save (no-double-save). Speak gate = `speakDebrief && settingsStore.ttsEnabled` (+ the ≤30-min freshness deviation per workflows §4-G).
- `ALTER TABLE rides ADD COLUMN summary_viewed INTEGER NOT NULL DEFAULT 0` (safe constant default). **Cap the launch router to the single most-recent unviewed ride** so the migration doesn't pop every old ride's summary.
- **Launch-time summary router** on Home focus/foreground (idempotent; coexists with the PhoneAsCoach reconciler — router navigates first, reconciler attaches to the on-screen ride).
- **Self-test (no native dep):** in-app End saves + navigates + speaks; **kill the app immediately after End → relaunch → the row is durable and the summary routes exactly once.**

### Phase 3 — `expo-notifications` + lock-screen controls (R3 + R5) — first native dependency
- `npx expo install expo-notifications`; add to `app.json` plugins. Declare `POST_NOTIFICATIONS` (Android 13+) + `ACCESS_BACKGROUND_LOCATION` in the manifest.
- Register category **`veloscape-ride`** with **5 actions** `mute`/`unmute`/`end`/`end-confirm`/`end-cancel` (canonical scheme — see workflows §4-B). Confirm via **in-place re-present of the same notification id**. All actions `opensAppToForeground: false`. Body tap → live In-Ride.
- **Notification response listener at app init** → maps actions to the **same** `muteCoaching` / `unmuteCoaching` / `endRideAndSave` from Phases 1–2. Arm the **8s auto-revert** for an unconfirmed End (canonical — see workflows §4-A; lockscreen spec said 6s — settle on 8s in code).
- **Backgrounded End posts a non-ongoing "Ride saved · N segments coached" notification** (end-postride §4) as the trust signal.
- **R3 spike (the build-time decision):** does the installed expo-location `foregroundService` config accept action buttons / a category?
  - **Branch A (target):** yes → the FG-service notification IS the control surface; one notification, no expo-notifications notification posted.
  - **Branch B (likely fallback):** no → expo-notifications notification = the control surface at DEFAULT importance, `ongoing`, `onlyAlertOnce`; the FG-service notification demoted to a MIN-importance stub with no actions; **both share group key `veloscape-ride`** so the shade collapses them into one entry.
- **R5 / iOS:** single actionable local notification (the floor), re-posted on each meaningful state change with the same id. No `ongoing` equivalent; Live Activity out of scope. Do not fake persistence.

### Phase 4 — Cosmetic / UI polish (ONLY after the #1 QA gate passes — §3)
- **In-Ride single-glance redesign:** cut the ScrollView roster / `SegmentRow` / "SEGMENTS" header; between-segments centered metric block (distance hero + "N of M done"); `ActiveCard` conditional + centered; `CoachingIndicator` (replaces `♪`); `MuteToggle`; `EndHoldButton` (2s hold + progress fill); Reanimated between↔active cross-fade.
- **`HandoffOverlay`** on InRide (State A "Finding GPS" → State B "pocket it"); re-sequenced trust cue on first real fix (gated out of `simulate`); first-lock latch; Cancel teardown; location-denied error variant.
- **Icon system fix:** all Unicode-as-icon glyphs (`♪ ✓ ○ ■`) → `@expo/vector-icons` Ionicons filled. (Verify `@expo/vector-icons` resolves at build or `npx expo install` it.)
- **FTUE primers:** AuthSuccess refactor + LocationPrimer (2-phase, platform-branched) + NotificationPrimer + SyncProgress + ZeroStarred + ReadyHandoff; relocate `setAuth` + `riders` upsert to the final handoff. Carousel "Pocket your phone" slide. StravaConnect icon defect fix.
- **Notification copy/cosmetics:** live mode + counts in body; token-aligned accent (already done Phase 0); monochrome status + action drawables.

---

## 3. The #1 QA GATE (non-negotiable — gates everything in Phase 4)

**Before ANY of this is called done, run a real screen-off ride (or closest real-device equivalent) and watch the `[bgtask]` logs:**

1. **Locations keep arriving** with the screen locked; `trackers > 0`.
2. **Cues fire** screen-off (approach / enter / split / exit), AND **respect mute** (tap notification Mute → subsequent cues silent → "Coaching muted" plays → Unmute restores). This is the R1 acceptance criterion verified on-device.
3. **Notification-End gate:** screen off → End → confirm → the **SQLite row exists** (verify directly) with `summary_viewed=0` → the **summary appears on next app open** → **no data loss** (R4 on-device).
4. **Double-notification gate (R3):** in the final build there is **not** a confusing pair — Branch A shows one; Branch B shows one grouped/single-actionable entry with the service stub demoted.

The first three are **the original reason single-glance + pocket controls exist.** They must be re-verified after the engine/save refactor, not assumed. Cosmetic polish (Phase 4) does not begin until this gate is green.

---

## 4. Recommended build sequence (summary)

```
Phase 0  preconditions (gpsLocked reset, cuesMuted store, notif color)   [no risk]
   ▼
Phase 1  mute gates ALL cue sites (R1+R2)            [verify in sim, no native dep]
   ▼
Phase 2  endRideAndSave + SQLite summary + router (R4) [verify in sim, no native dep]
   ▼
Phase 3  expo-notifications + lock controls + R3 spike (R3+R5)  [first native dep]
   ▼
══ #1 QA GATE: real screen-off ride, [bgtask] logs, mute+End on-device ══
   ▼
Phase 4  cosmetic polish: single-glance UI, HandoffOverlay, icons, FTUE primers
```

---

## 5. The first 3 concrete steps

1. **Make mute actually mute everything (R1+R2).** Add `cuesMuted` + `setCuesMuted` to `rideStore` (reset false on `startRide`/`resetRide`), and add the one-line `gpsLocked: false` to `startRide`. Put the mute check at the **top of `shouldFireCue`**, and add `shouldFireCue` calls to `fireApproachCue`, `exitSegment` (end), and the start GPS-locked cue (the sites that bypass it today — "gate where Recovery checks" is insufficient). Wire `muteCoaching()`/`unmuteCoaching()` with `stopTTS()` + the ungated confirmation phrases. **Self-test:** simulated ride → mute → ride past a segment → silence except "Coaching muted."

2. **Make a backgrounded End actually save (R4).** Extract `endRideAndSave(reason)` as the sole save path (writes the SQLite row + `summary_viewed=0` before teardown, then `resetRide()`). Change PostRideSummary to render-from-SQLite-always + take an explicit `speakDebrief` flag (gate speak on `speakDebrief && ttsEnabled`), and guard the mount-effect save off. Add the `summary_viewed` column (migration) + the launch-time router (capped to the most-recent unviewed ride). **Self-test:** in-app End saves + navigates; kill the app right after End → relaunch → row durable → summary routes exactly once.

3. **Wire the lock-screen controls (R3+R5).** `npx expo install expo-notifications` + plugin + `POST_NOTIFICATIONS`/`ACCESS_BACKGROUND_LOCATION` manifest. Register the `veloscape-ride` category (5 actions) + a notification response listener that calls the **same** `muteCoaching`/`unmuteCoaching`/`endRideAndSave` from steps 1–2, with the 8s End-confirm auto-revert. Run the **R3 spike** (can the FG-service notification host actions?) to settle Branch A vs B — then immediately proceed to the **#1 QA gate** (real screen-off ride) before any Phase-4 cosmetic work.
