# Veloscape — End-to-End Workflows

*Single coherent walkthrough of the whole product as connected journeys.*
*Synthesizes: the authoritative `InRideSingleGlanceAndLockScreenControls_Amendment.md` + the five refinement specs — `refinement-ftue-onboarding.md`, `refinement-home-start-ride.md`, `refinement-inride-single-glance.md`, `refinement-lockscreen-notification.md`, `refinement-end-postride.md`.*
*2026-06-09 | Headless synthesis pass. Decisive where the specs agree; flags every spec-vs-spec conflict and every flagged spec-vs-amendment deviation in §4.*

---

## The product in one sentence

Pick a mode, tap Start, **pocket your phone screen-off**, and a voice that knows your last 90 days on each starred Strava segment coaches you in your ear — and you can **Mute or End from the lock screen without unlocking.** After the ride, a spoken debrief and a full segment-by-segment summary.

---

## 0. Consistency glossary (locked names — use these everywhere, both journeys)

These are fixed so journeys A and B never drift. Any spec that used a different name is reconciled to this list (see §4).

| Concept | Canonical name | Notes |
|---|---|---|
| Coaching live/muted status (read-only, glanceable) | **`CoachingIndicator`** | In-app status-row element. Gold pulsing dot = live; grey mute icon = muted. The **notification mirrors it as text** ("Coaching on" / "Muted") — same source of truth. |
| Mute control (single tap, reversible) | **`MuteToggle`** | In-app, bottom-left, 56dp. Notification mirror = the `mute`/`unmute` action. |
| In-app End control (2s hold) | **`EndHoldButton`** | One name. (The end-postride spec called it `EndRideHoldButton` — **reconciled to `EndHoldButton`**, §4-C.) |
| Transient "finding GPS → locked" veil at ride start | **`HandoffOverlay`** | An **overlay on InRide, not a route** (honors locked decision L4). |
| The lock-screen control surface | **the ride notification** | Exactly **one** logical ride notification with multiple *states* — never "two notifications." (Coordination of the FG-service + expo-notifications notification into one perceived surface is §4-B / build-plan.) |
| Modes | **PR / Training / Recovery** | Spoken "P R" / "Training" / "Recovery". Default: new user → Training; returning → `settingsStore.lastGoalMode`. |
| Ride-scoped coaching mute flag | **`cuesMuted`** (in `rideStore`) | NOT `settingsStore.ttsEnabled`. Reset `false` on `startRide`/`resetRide`. Single source for both in-app `MuteToggle`/`CoachingIndicator` and the notification mute state. |
| Auth-success screen | **AuthSuccess** | Route name `Connected` kept for param compat. |
| Single end+save function | **`endRideAndSave()`** | Sole save path for all three End entry points. |

---

# JOURNEY A — First-Time User

*Install → Welcome → Strava connect → permissions → first sync → first ride → background coaching → end → summary.*

```
 INSTALL
   │
   ▼
┌──────────┐   Get Started   ┌──────────┐  Connect Strava  ┌───────────────┐
│ Welcome  │────────────────▶│ Carousel │─────────────────▶│ StravaConnect │
└──────────┘                 │ (4 slides│                  │  OAuth in     │
   "I have an account"────────┐ +Pocket) │                  │  browser      │
                              └──────────┘                  └───────┬───────┘
                                                      success │     │ cancel→idle / error→banner
                                                              ▼
                                                      ┌──────────────┐
                                                      │ AuthSuccess  │  (no permission work here;
                                                      │  (lean)      │   no setAuth yet)
                                                      └──────┬───────┘
                                                  Continue   │
                                                             ▼
                                              ┌────────────────────────────┐
                                              │ LocationPrimer   (Step 1/3) │  rationale →
                                              │ A: foreground → B: "Allow   │  OS foreground prompt →
                                              │ all the time" upgrade        │  iOS dialog / Android Settings
                                              └──────────────┬──────────────┘
                                                 any outcome │ (never blocks)
                                                             ▼
                                              ┌────────────────────────────┐
                                              │ NotificationPrimer (2/3)    │  "ride remote control" →
                                              │ faux lock-screen preview     │  expo-notifications prompt +
                                              └──────────────┬──────────────┘  register `veloscape-ride` category
                                                 any outcome │
                                                             ▼
                                              ┌────────────────────────────┐
                                              │ SyncProgress  (3/3)         │  syncStarredSegments(listOnly)
                                              └───────┬──────────────┬──────┘
                                              ≥1 seg  │              │ 0 starred
                                                      ▼              ▼
                                              ┌──────────────┐  ┌──────────────┐
                                              │ ReadyHandoff │  │ ZeroStarred  │  teach + re-sync loop
                                              │ setAuth() ✦  │◀─│ (recover)    │  (commits auth on continue)
                                              └──────┬───────┘  └──────────────┘
                                                     │ "Start riding"  → root swaps AuthStack → MainTabs
                                                     ▼
                                                ── HOME (see Journey B from here) ──
                                                     │ pick mode, tap Start
                                                     ▼
                                         ┌──────────────────────────────────┐
                                         │ InRide + HandoffOverlay           │
                                         │  A: "Finding GPS…" (no false       │
                                         │     promise spoken)                │
                                         │  ── first real fix (accuracyM<20) ─│
                                         │  B: success haptic + speak         │
                                         │     "GPS locked. N segments. Goal  │
                                         │     X. You can put your phone away."│
                                         └────────────────┬───────────────────┘
                                                          ▼   pocket it, screen off
                                         ┌──────────────────────────────────┐
                                         │ Background coaching (FG service)   │
                                         │  approach/enter/split/exit cues    │
                                         │  ride notification on lock screen  │
                                         │  [Mute] [End] — single source       │
                                         │  cuesMuted gates ALL cue sites      │
                                         └────────────────┬───────────────────┘
                                                          ▼  End (in-app 2s hold OR notif End→confirm)
                                                  endRideAndSave() → SQLite row + summary_viewed=0
                                                          ▼
                                              PostRideSummary (debrief speaks; full detail)
```

### A1 — Welcome → Carousel → StravaConnect
- **Welcome** (reuse): one value claim — *"The only coach who was there last time."* Get Started → Carousel; "I already have an account" → StravaConnect (skip carousel).
- **Carousel** (reuse + 1 new slide): 4 slides. The NEW slide #2 **"Pocket your phone"** ("The coach rides in your ear. Screen off, phone away — the voice does the work.") primes the background-first permission asks two screens later so they feel expected, not intrusive.
- **StravaConnect** (reuse OAuth/deep-link): honest scope ("We never post or modify your Strava data"). OAuth opens the system browser; `veloscape://connected?...` deep-link returns to AuthSuccess. Cancel → idle (no error). `error=...` → red banner, retry stays live. Defect fix: replace text `"S"` glyph + `"✓"` text-checks with the real Strava mark and filled Ionicons.

### A2 — The permission gauntlet (the make-or-break of the whole product)
The as-built `Connected` screen did sync + foreground-only location + status inline, cold, with `setAuth` firing mid-flow. **This is replaced by a sequenced, primed flow; `setAuth` now commits only at the very end** (ReadyHandoff / ZeroStarred), so the rider stays inside the welcoming `AuthStack` chrome through priming. (Structural note: `RootNavigator` switches purely on `isAuthenticated`; the fix is to relocate the existing `setAuth` + `riders` upsert from `ConnectedWrapper.handleContinue` to the final handlers — no navigator change, no new flag.)

- **AuthSuccess** (lean): "You're connected" + a one-line roadmap ("three quick permissions next, so the coach can ride with you — pocketed, screen off"). No count here (sync runs after), no permission work. Continue → LocationPrimer.
- **LocationPrimer (Step 1/3)** — the highest-stakes screen. Two phases:
  - **Phase A (rationale → foreground):** "Let the coach follow your position — even in your pocket." `Location.requestForegroundPermissionsAsync()`. Reassurance: *"We never track you off the bike. Location is used only during an active ride."*
  - **Phase B (upgrade to Always):** shown only after foreground granted. **iOS** → `requestBackgroundPermissionsAsync()` (in-dialog). **Android 11+** → `Linking.openSettings()` with an inline "How to do it" steps card; `AppState` re-check on return. "Keep while using" is an honest off-ramp (coaching works screen-*on*; a Home nudge offers the upgrade later).
- **NotificationPrimer (Step 2/3):** reframes notifications as the **ride remote control**, with a **faux lock-screen preview card** showing the exact `[Mute] [End]` controls. `Notifications.requestPermissionsAsync()` + register `veloscape-ride` category. "No marketing. No daily pings. Only your live ride." Denied → Tier-2 lock-screen controls unavailable, **Tier-1 in-app controls still work, ride not blocked.**

### A3 — First sync → fork
- **SyncProgress (Step 3/3):** runs `syncStarredSegments(token, onProgress, { listOnly: true })` on mount; live "N found" count; narrated ("This is the only network call before you ride"). On complete: `total ≥ 1` → ReadyHandoff; `total === 0` → ZeroStarred. Sync error **degrades, never dead-ends** → ReadyHandoff with "Segments will sync on your first ride."
- **ZeroStarred fork:** teach-and-recover (gold star, *not* a red error). "Open Strava to star" (deep-link), "I've starred some — re-sync" (in-place loop), "Continue without segments" (commits auth → Home empty state). The product is genuinely useless with 0 segments, but the install is never trapped.
- **ReadyHandoff:** "You're ready. {N} segments loaded. Pop in your earbuds, pick a mode, and hit start." Final status card: granted = green checks; missing-but-non-blocking (background not Always, notifications off) = neutral "Turn on" rows, **never red.** **"Start riding" runs `setAuth` + `riders` upsert → root swaps `AuthStack` → `MainTabs`.**

### A4 — First ride start (the trust moment) → background coaching
This is shared with Journey B from the tap on Start onward — see **§ The Start Moment** below. The first-timer's version is identical; the only first-time difference is they have just been told (Carousel slide 2 + primers) that the phone goes in the pocket, so the "you can put your phone away" cue lands as the promised payoff.

### A5 — End → summary
First-timer most likely ends **in-app** (phone in hand, learning). 2s hold on `EndHoldButton` → `endRideAndSave('in-app')` → push to PostRideSummary, debrief speaks (if `ttsEnabled`). The full segment-by-segment record, map, sparklines, sync badge are all on this one rich screen. (Backgrounded End is fully supported too — see Journey B.)

---

# JOURNEY B — Returning User

*Open → pick mode → start → pocket / screen-off → Mute or End from the lock screen → post-ride.*

```
 OPEN APP
   │
   ├─ launch router: most-recent ride with summary_viewed=0 + real endedAt?
   │        └─ yes → fade in to its PostRideSummary (deferred), speak debrief if fresh+ttsEnabled
   ▼ no
┌────────────────────────────────────────────┐
│ HOME (mode-first)                            │
│  greeting · N starred · last synced          │
│  GOAL MODE  [PR] [Training●] [Recovery]      │  default = lastGoalMode
│  [ Start Ride ]   ← relabels "Resume Ride"    │
│                     when isRideActive          │
│  RECENT RIDES feed (TODAY row = last ride)    │
└───────────────────┬──────────────────────────┘
        tap Start    │  medium haptic
                     ▼
        ── THE START MOMENT (shared with Journey A) ──
   fade Home(#1C1C1E) → InRide(#111111), 400ms
                     ▼
┌────────────────────────────────────────────┐
│ InRide + HandoffOverlay                      │
│  State A "Finding GPS…"  (gpsLocked=false)    │  "Don't pocket yet — I'll tell you."
│    ↓ first real fix (accuracyM<20)            │  success haptic + spoken trust cue
│  State B "GPS locked — pocket it."  ~1.8s     │  chip: "Controls are on your lock screen"
└───────────────────┬──────────────────────────┘
                    ▼  overlay dismisses → live single-glance screen; screen can go off
┌────────────────────────────────────────────┐         ┌──────────────────────────────────┐
│ IN-RIDE single-glance (Tier 1, in-app)       │ ◀────▶  │ RIDE NOTIFICATION (Tier 2, lock)   │
│  Between: elapsed · distance(hero) · N of M  │ shared  │  State1 between: "Coaching on·t"   │
│   done · CoachingIndicator · [Mute][EndHold] │ cues    │   "{dist}·N of M done" [Mute][End] │
│  Active: ActiveCard (timer, vs-PR, progress) │ Muted   │  State2 in-seg: "{seg}·{t}"        │
│  cuesMuted gates ALL cue sites; mute drains  │ flag    │   "+4s vs PR" [Mute][End]          │
│   gold→grey, stops pulse, "Coaching muted"   │         │  State3 muted: "Muted" [Unmute]    │
└───────────────────┬──────────────────────────┘         │  State4 End→confirm:[End ride]     │
                    │                                     │   [Keep riding] (auto-revert)      │
        End (either surface)                              └──────────────────────────────────┘
        ├─ in-app: 2s hold EndHoldButton → endRideAndSave('in-app') → push PostRideSummary
        └─ notif: [End]→confirm [End ride] → endRideAndSave('notification') → SILENT stop+save
                    │                                          (app NOT force-opened)
                    ▼
        SQLite row written BEFORE teardown + summary_viewed=0 + dismiss notif
        (backgrounded End also posts a non-ongoing "Ride saved · N segments coached" notif)
                    │
                    ▼  next time app opens → launch router → PostRideSummary (deferred, fade-in)
                PostRideSummary: full detail; debrief speaks if fresh(≤30min)+ttsEnabled
```

### B1 — Open & Home
- Launch router runs first on foreground: if a ride ended-while-backgrounded awaits viewing (`summary_viewed = 0` + real `endedAt`), **auto-route (fade-in) to its PostRideSummary** before Home is interactive. Idempotent; capped to the single most-recent unviewed ride.
- **Home** (reuse, already shipped): mode-first picker, Start Ride, recent-rides feed. States: loading (shimmer; Start never waits on feed), empty-feed (Start enabled — coach a ride with zero history), no-segments (Start inert at 0.35 opacity + helper card), cold-cue whisper (Start enabled, "cues fill in shortly"), **ride-in-progress** → Start relabels to **"Resume Ride"** and re-attaches (no second engine).

### B2 — The Start Moment (shared by both journeys)
Tap Start → medium haptic → fade to InRide → `HandoffOverlay` mounts over the (already-live) single-glance screen:
- **State A — Finding GPS:** while `gpsLocked === false`. Animated locator, "Finding GPS / Acquiring a fix. Don't pocket yet — I'll tell you the moment it's locked." A single-tap **Cancel** cleanly tears down (`stopRideEngine` + `resetRide` + dismiss notif) — pre-lock there's nothing to protect, so no hold needed. No spoken cue yet (no false promise).
- **First real fix** (`rideStore.gpsLocked` flips true, `accuracyM < 20`): success haptic + speak the **trust cue** *"GPS locked. {N} segments loaded. Goal: {mode}. You can put your phone away."* (gated by `cuesMuted`; gated OUT of the `simulate` path).
- **State B — GPS locked (~1.8s):** green check, "Pocket it. I'll call your segments." + a chip: *"Controls are on your lock screen — Mute or End anytime."* Auto-dismisses to the live screen.
- **Degraded / error variants:** slow lock (>10s) softens copy + one warning haptic, never auto-advances to a false "locked"; no-lock-ever offers an honest "Start anyway" with the degraded cue (never "pocket it"); **location denied** → error variant with Open Settings (closes a real current dead-screen gap); notification denied → State-B chip points to in-app controls; engine throw → retry/back.

### B3 — In-ride: the two coordinated control surfaces
**Tier 1 (in-app single-glance screen)** and **Tier 2 (ride notification)** are two renderings of one ride state. Both read/write the same `cuesMuted` and call the same `muteCoaching()` / `unmuteCoaching()` / `endRideAndSave()` — so they can never disagree.

- **Between segments (default, most-seen):** in-app shows elapsed (status row) + **distance hero (64sp)** + **"N of M done" (34sp)** + `CoachingIndicator` + `[MuteToggle] [EndHoldButton]`. Notification State 1 mirrors it as text. No roster, no scroll. The `approaching` state renders here (audio cue only; optional "Approaching: …" line); the ActiveCard appears only on segment *entry*.
- **Active segment:** in-app swaps the center to the existing `ActiveCard` (timer, vs-PR gap, progress, stats) via a ~250ms cross-fade + light haptic + count-up; status row + controls persist. Notification State 2 mirrors it (`{seg} · {timer}` / `+4s vs PR`).
- **Mute:** single tap, reversible. Sets `cuesMuted = true` → `stopTTS()` (kills in-flight cue) → speaks **"Coaching muted"** (ungated — it's the trust signal). In-app: gold drains to grey, pulse stops, screen goes quiet. Notification: title → "Muted", action → "Unmute". **`cuesMuted` gates EVERY cue site** — start GPS-locked cue, approach, enter/start, splits, exit/result. (This is amendment Risk 1, the #1 correctness item.)
- **The ActiveCard never mutes** — its gold live-dot reflects *segment* live-ness (the effort is being timed), only the `CoachingIndicator` flips. Two true facts at once.

### B4 — End from the lock screen (the primary pocket case)
- Notification **[End]** does NOT end — it transforms the notification to a confirm state: **[End ride] [Keep riding]** (anti-pocket-tap; the notification-native equivalent of the in-app 2s hold). Unconfirmed → auto-reverts silently (**timeout value: see §4-A — canonical 8s**). 
- **[End ride]** → `endRideAndSave('notification')`: silent `stopRideEngine()` → `endRide()` → `saveRide(...)` writing the SQLite row + `summary_viewed = 0` **before any teardown** → `resetRide()` → dismiss the ride notification. **The app is NOT force-opened.** A brief non-ongoing **"Ride saved · N segments coached"** notification posts as the trust signal.
- Durable: an OS kill between confirm and next launch loses nothing (row written first).

### B5 — Post-ride (deferred)
Next app open → launch router fades into the just-ended ride's **PostRideSummary** (content unchanged: metrics, map, segment detail, sparklines, debrief, sync badge). Render-source is **SQLite-by-`rideId` in all modes**; the debrief auto-speaks gated on **`speakDebrief && ttsEnabled` and a ≤30-min freshness window** (see §4-G deviation). After Done/close → Home, where the ride is the top TODAY feed row. The Strava reconciler treats it as `provisional` like any other.

---

# §4 — Cross-flow reconciliation (conflicts found; canonical choices made)

Two buckets. **(A–C) are spec-vs-spec conflicts the synthesis resolves to one canonical value and flags.** **(D–G) are spec-vs-amendment deviations the specs already flagged — carried forward, NOT silently dropped, pending founder confirm.** Founder-level open product questions (resume-vs-disable, "Next:" line, State-B duration, etc.) are NOT re-decided here; they remain open in their source specs and are listed in §5.

### A. Notification End-confirm auto-revert timeout — **6s vs 8s** [RESOLVED + FLAG]
- `refinement-lockscreen-notification.md` State 6 says **6 seconds**. `refinement-end-postride.md` §3 + §8 matrix say **8 seconds (Android)**.
- **Canonical for both journeys: 8 seconds.** (Chosen for consistency with the end-postride flow which owns the End semantics end-to-end; the 6s rationale — self-heal before the next pocket-tap — still holds at 8s given the required *second deliberate tap*.) **Flag:** the two specs disagree; one value must be set in code. Either is defensible; build settles on 8s unless the founder prefers the tighter 6s anti-mistap window.

### B. Notification category / action config — **three divergent schemes** [RESOLVED + FLAG — real wiring fork]
- **Amendment:** category `veloscape-ride`, **4** actions (`mute`/`unmute`/`end`/`end-confirm`).
- **Lockscreen spec:** **5** actions (adds `end-cancel` = "Keep riding"), **single category**, confirm via **in-place action-row swap** on the same notification id.
- **End-postride spec:** confirm via a **separate `veloscape-ride-confirm` category** (`setNotificationCategoryAsync` swap).
- **Canonical: single category `veloscape-ride` with 5 actions** (`mute`/`unmute`/`end`/`end-confirm`/`end-cancel`), confirm via **in-place re-present of the same notification id** (the lockscreen-spec scheme). Rationale: one category is simpler to register and reason about; an explicit `end-cancel`/"Keep riding" is better UX than relying on swipe-dismiss; in-place swap keeps it one notification. **Flag:** the category-swap-to-`veloscape-ride-confirm` mechanism (end-postride §3, plus its iOS fallback) is the alternative; the build plan must pick one wiring before implementing the response listener. (iOS may still need a category swap if in-place re-present is unreliable on a given iOS version — that's the iOS confirm fallback, not a second scheme for Android.)

### C. Component name drift — **`EndHoldButton` vs `EndRideHoldButton`** [RESOLVED]
- In-ride spec §1/§5 = `EndHoldButton`; end-postride spec §9 = `EndRideHoldButton`. Same component. **Canonical: `EndHoldButton`** (shorter, used in the screen that owns the control's layout). Synthesis + glossary use it throughout.

### D. GPS-locked trust cue — **re-sequenced to first real fix** vs amendment's at-start firing [FLAGGED DEVIATION — carry forward, pending founder]
- Amendment Step 1 lists the engine speaking "GPS locked…" *at start* (`rideEngine.ts:147`, before GPS even starts at `:152`). The Home spec (§5.3/§6.1) **re-sequences it to fire only on the first real fix** (`gpsLocked` true), because a false "you can put your phone away" before any lock is the single most corrosive thing a pocket-coach can say (rider pockets → GPS never locks → silent failure).
- **This is the single most important behavioral divergence and it appears in BOTH journeys' Start Moment.** The walkthrough depicts the **refined** behavior. **Flag:** pending founder confirm (Home Open Q3). Hard dependency: `startRide` must reset `gpsLocked: false` (see §4-H) or ride 2 of a session falsely jumps to "locked."

### E. Start-cue copy — **"You can put your phone away" vs "Let's go"** [RESOLVED to refined + FLAG]
- Amendment: *"GPS locked. N segments loaded. Goal: …. Let's go."* Home spec: *"…Goal: {mode}. You can put your phone away."*
- **Canonical: "You can put your phone away"** — it is the explicit audible trust contract that makes pocketing feel safe, the entire point of the re-sequenced cue. **Flag:** it's a copy change from the amendment's "Let's go"; bundled with the §4-D founder confirm.

### F. In-ride Mute/End visual hierarchy — **inverted** from amendment [FLAGGED DEVIATION — carry forward]
- Amendment: Mute "left/**secondary**", End "the existing bottom **pill**" (prominent). In-ride spec (§11 Q3) inverts: **Mute dominant, End the quietest element** (End is destructive + hold-gated, so it should never shout; Mute is the frequent pocket action). Both still side-by-side at 56dp.
- **Walkthrough uses the inverted hierarchy.** **Flag:** real divergence from the authoritative doc; founder confirm (in-ride Open Q3). Pure style swap if reverted.

### G. Deferred-summary auto-speak — **gated on ≤30min + ttsEnabled** vs amendment's unconditional speak [FLAGGED DEVIATION — carry forward]
- Amendment: on next open, "route to PostRideSummary **and speak the debrief**" (unconditional). End-postride spec (§5) honors the **route** unconditionally but gates the **audio** on a ≤30-min freshness window AND `settingsStore.ttsEnabled` — so opening the app 6 hours later for an unrelated reason doesn't get ambushed by a talking summary, and a voice-off rider is never blasted.
- **Walkthrough uses the gated-audio behavior.** **Flag:** explicit deviation (end-postride §5); founder reverts to literal by deleting the freshness check. The `ttsEnabled` half is non-negotiable per the amendment's own "ttsEnabled still governs the debrief" line.

### H. Cross-cutting engineering preconditions surfaced by multiple specs (not conflicts — shared load-bearing facts)
- **`startRide` must add `gpsLocked: false`** (Home §6 BLOCKER). Today only `resetRide` clears it; the backgrounded-End path skips `resetRide` historically, so stale `true` carries into ride 2 → handoff falsely skips "Finding GPS." Required for §4-D to be correct.
- **`endRideAndSave()` must be the sole save path** (end-postride §7, lockscreen, amendment Risk 4). Today `saveRide` runs only in PostRideSummary's mount effect → a backgrounded End never saves.
- **PostRideSummary must render-from-SQLite-always + take an explicit `speakDebrief` flag** (end-postride §7-A) — the inferred `isHistoryMode` boolean can't express "SQLite-sourced but speaks." Plus no-double-save guard + `summary_viewed` column + migration cap.
- **`cuesMuted` must gate ALL cue sites** (amendment Risk 1) — not just Recovery's start+split. Add the mute check at the top of `shouldFireCue`, and add `shouldFireCue` calls to `fireApproachCue`, `exitSegment` (end), and the start GPS-locked cue.
- **Notification accent color bug:** `rideEngine.ts` `notificationColor: '#F5C518'` ≠ token `colors.gold = #F5C842`. Align so the FG-service notification and the expo-notifications notification tint identically (matters for the coordinated-pair reading as one).

---

# §5 — Open product questions carried forward (NOT decided in synthesis)

Listed so the founder sees the full decision surface in one place. Each lives in its source spec.

- **FTUE:** notification ask in FTUE vs JIT-at-Start; confirm amendment supersedes ProductSpec line 196 ("don't ask Always first"); ZeroStarred non-blocking vs hard blocker; AuthSuccess starred count; iOS provisional auth; 9-screens-vs-extreme-simplicity (9→7 collapse path documented).
- **Home/Start:** resume vs disable Start when active; ended-while-backgrounded auto-route vs banner; **confirm the re-sequenced cue (§4-D, the big one)**; "Start anyway" escape hatch; notification accent token (§4-H); notification-permission timing; first-lock latch (ref vs store flag); State-B duration (1.8s vs explicit "Got it").
- **In-ride:** keep the "Next:" line; distance vs elapsed hero (chose distance); **confirm the inverted Mute/End hierarchy (§4-F)**; VoiceOver End fallback; verify `@expo/vector-icons` resolves at build.
- **Notification:** Android chronometer flag (live vs stale timer); Risk-3 spike A vs B; second-action vs OS-dialog confirm per OEM; iOS non-durable-notification acceptance.
- **End/post-ride:** named `presentation` enum vs `{rideId, speakDebrief}` (synthesis is agnostic; load-bearing requirement is render-from-SQLite-always + separate speak flag).

---

*End. The two journeys above are consistent in component names, mode naming, the single ride-notification surface, and the `cuesMuted`/`CoachingIndicator`/`MuteToggle` source-of-truth model. Every spec-vs-spec conflict is resolved to one canonical value (§4-A/B/C); every spec-vs-amendment deviation is depicted in its refined form but flagged for founder confirm (§4-D/E/F/G).*
