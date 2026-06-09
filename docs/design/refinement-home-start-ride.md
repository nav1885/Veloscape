# Refinement — Home & Start → Background Handoff

*Design pass by Stencil | 2026-06-09*
*Flow owner: Home + START RIDE → background handoff (the "start moment")*
*Status: **HEADLESS DESIGN PASS** — decisive calls made; founder reviews after. Not yet folded into the master DesignSpec or RN shells.*

*Grounds on (authoritative → supporting):*
- `docs/amendments/InRideSingleGlanceAndLockScreenControls_Amendment.md` — **authoritative.** Single-glance In-Ride, lock-screen Mute/End, ride notification, `cuesMuted`, mute gating, `endRideAndSave`, `summary_viewed`.
- `docs/design/QuickStartModes_HomeFlow_REVIEW.md` — the **prior approved treatment of this exact Home flow** (mode-first layout, locked decisions L1–L4). This refinement **extends** it; it does not re-open it.
- `docs/Sherpaa_Market_Research.md` — the rider (44yo, six-figure income, performance-motivated, multi-app, bone-conduction earbuds) and the emotional core: *a voice that knows your legs.* The start moment is where that promise is either trusted or doubted.
- Source: `HomeScreen.tsx`, `HomeTab.tsx`, `InRideScreen.tsx`, `wrappers.tsx` (`InRideScreenWrapper`), `rideEngine.ts`, `rideStore.ts`, `colors.ts`, `AuthStack.tsx`.

---

## 0. The one thing this flow must get right

The product's whole bet (Market Research) is *real-time, voice-delivered coaching you don't look at.* The amendment makes the phone a **coach in your pocket, screen off.** That only works if the rider **believes** the coaching keeps running after they pocket the phone. The entire start flow exists to earn that belief in ~8 seconds:

> **Tap Start → (briefly) "finding GPS" → an honest "GPS locked — you can put your phone away" voice cue → a persistent notification the rider can see on the lock screen → pocket it.**

Everything else on Home is **already built and approved** (QuickStartModes review). This refinement spends ~90% of its weight on the **handoff moment** and the **honesty of the GPS-locked cue**, because that is the trust contract and it is currently broken in code.

### The core problem (verified in source)

`rideEngine.startRideEngine()` speaks `"GPS locked. N segments loaded…"` at **line 147** — *before* `startLocationUpdatesAsync()` at **line 152**, and long before any real fix arrives. The real lock signal is `rideStore.gpsLocked` (set true only when `accuracyM < 20`, `rideStore.ts:135`). So today the coach **lies**: it claims a lock that doesn't exist, then maybe never gets one. For a phone-in-pocket coach, a false "you can put your phone away" is the single most corrosive thing the app can say. If the rider pockets the phone and the first segment cue never comes because GPS never locked, the product has failed silently — the worst failure mode.

**This refinement re-sequences the start cue so the spoken "GPS locked — you can put your phone away" fires only on the FIRST REAL FIX.** See §6 (Service Changes) — flagged as an intentional refinement of the amendment's literal Step-1 ordering.

---

## 1. Scope

**In scope (designed here):**
1. **Home** — 3-mode picker, Start Ride, resume banner, recent-rides feed, and all its states (loading / empty-feed / no-segments / cold-cue / ride-in-progress). Documented as **reuse** (already built per QuickStartModes); deltas called out explicitly.
2. **The Start Moment** — the transition Home → InRide and the **handoff overlay** on InRide: *Acquiring GPS → GPS Locked → "pocket it" reassurance → overlay dismiss.* This is the new work.
3. **The trust cue** — the audible "GPS locked — you can put your phone away," re-sequenced to fire on the real fix.
4. **The persistent ride notification appearing** — what it says, when it posts, its Mute/End actions, platform split (Android persistent / iOS single actionable).
5. **All edge/error states of the start path** — location denied, slow/never lock, notification permission denied, start-while-ride-active.

**Out of scope (adjacent, owned elsewhere):**
- The **In-Ride single-glance screen layout** (between-segments + ActiveCard) — amendment's job, designed in the In-Ride refinement. This pass designs **up to and including the handoff overlay** that sits *on top of* InRide, and references the single-glance screen as the destination underneath.
- Mute/Unmute and End **control mechanics** beyond what the notification surfaces at the start moment.
- Onboarding / Strava connect (`AuthStack`) — except one open question on notification-permission timing.

**Locked decisions inherited from QuickStartModes (NOT re-opened):**
- **L1** — No "Plan a route." Mode-first Quick-Start is the only path into a coached ride.
- **L3** — Default mode: new users → Training; returning → `settingsStore.lastGoalMode`.
- **L4** — **No new Pre-Flight/loading *route*.** Home → InRide directly. Any "locking GPS" affordance is a **transient overlay on InRide, never its own screen.** → *This refinement's handoff overlay honors L4: it is an overlay on InRide, not a route.*

---

## 2. Design tokens (reused — zero new tokens)

All from `colors.ts`. This flow introduces **no new color/spacing/radius tokens** — the handoff must feel native.

| Need | Token | Value |
|---|---|---|
| Home background | `bg` | `#1C1C1E` |
| In-Ride / handoff overlay background | `bgDeep` | `#111111` |
| Card / surface | `surface` | `#2A2A2A` |
| Card border | `border` | `#363636` |
| Strong border (outline buttons) | `borderStrong` | `#3A3A3A` |
| Primary accent | `gold` | `#F5C842` |
| Tinted accent bg / border | `goldDim` / `goldBorder` | `rgba(245,200,66,.10)` / `(…,.20)` |
| Text on gold | `textOnGold` | `#000000` |
| Primary text | `textPrimary` | `#F0F0F0` |
| Secondary text | `textSecondary` | `#888888` |
| Muted text | `textMuted` | `#555555` |
| Dim (section labels, disabled) | `textDim` | `#444444` |
| GPS-locked / success | `success` / `successDim` / `successBorder` | `#30A46C` / tints |
| GPS-lost / error | `error` / `errorDim` / `errorBorder` | `#E5484D` / tints |
| Notification accent (already in `rideEngine`) | hard-coded `#F5C518` | matches gold family |

> **Note:** the foreground-service notification color is hard-coded `#F5C518` in `rideEngine.ts:162`. The token is `gold = #F5C842`. These differ by a hair. **Open Q5** — align the notification color to the `gold` token.

**Haptics (reused from catalogue + QuickStartModes):**

| Event | Haptic |
|---|---|
| Mode chip change | Selection (`selectionAsync`) |
| Start Ride tap | Medium impact (QuickStartModes Open Q2; kept) |
| **GPS lock acquired (handoff success)** | **Success notification (`notificationAsync(Success)`)** — NEW; the tactile half of the trust cue |
| **GPS lock timeout / degraded** | **Warning notification** — NEW |
| Resume banner tap | Light impact |
| Disabled Start tapped | None |

---

## 3. HOME — full annotated layout (REUSE; documented, deltas flagged)

State: returning rider, Strava connected, ≥1 starred segment, cues warm, `lastGoalMode = 'training'`, **no ride in progress.** This is the canonical Home and it is **already shipped** (`HomeScreen.tsx`). Reproduced for completeness; the only NET-NEW design in this pass is the handoff (§5) and the notification (§7).

```
┌─────────────────────────────────────────────┐
│ SCREEN: Home (mode-first)                   │
│ Route: MainTabs → Home tab                  │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓ STATUS BAR ~54px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME — no content
├─────────────────────────────────────────────┤   (SafeAreaView edges={['top']}, exists)
│                                             │
│  Good morning, Jane.            ┌───┐       │  ← greeting 20px/600 textPrimary
│  12 starred segments ·          │ J │       │     avatar 36×36 gold, textOnGold
│  Last synced 2h ago             └───┘       │     sync line 13px/500 textMuted
│                                             │
│  GOAL MODE                                  │  ← 11px/600 textDim, CAPS, ls1.2
│  ┌────────┐ ┌──────────┐ ┌──────────┐       │  ← 3× goalChip, h36, radius10, gap8
│  │  PR    │ │ Training │ │ Recovery │       │     Training = goalChipSelected
│  └────────┘ └──●sel●───┘ └──────────┘       │     (gold bg / textOnGold)
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │              Start Ride               │ │  ← btn-gold, h54, full-width, r999
│  └───────────────────────────────────────┘ │     THE primary action. gold/textOnGold 17/600
│                                             │
│  RECENT RIDES                               │  ← 11px/600 textDim CAPS ls1.2
│  ┌───────────────────────────────────────┐ │
│  │ Morning Climb to Grizzly      APR 11  │ │  ← UnifiedHomeFeed RideFeedRow×N
│  │ 42.1 km · 1:38:24            [▶ play] │ │     SyncStateBadge + Coached + audio
│  │ [Synced from Strava] [Coached]        │ │     — entirely UNCHANGED
│  └───────────────────────────────────────┘ │
│  ··· (scrollable; "Load more" / history)    │  ← one ScrollView, RefreshControl(gold)
├─────────────────────────────────────────────┤
│  ⌂ Home   ◈ Segs   ◷ History   ⚙ Settings   │  ← tab bar (MainTabs system)
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME
└─────────────────────────────────────────────┘

Safe area notes:
- Top inset: SafeAreaView edges={['top']} (existing). Greeting paddingTop 16 sits below it.
- Bottom inset: handled by the MainTabs tab bar (83px incl. home indicator). Feed is the scroll body.
- All interactive content within safe bounds — verified against the shipped HomeScreen.

Transition in: Home is a tab root — fade/instant on tab focus (existing).
Transition out: see §5 (Start Ride → handoff).

Haptics: mode chip → selection; Start → medium; pull-refresh → light.
Accessibility: ModeSelector = radiogroup; Start = button "Start ride in {mode} mode"; section labels = header. (All present in HomeScreen.tsx.)
```

### 3.1 Reuse vs. change — explicit ledger

| Element | Status | Notes |
|---|---|---|
| Greeting + avatar + sync line | **Reuse** | `HomeScreen.tsx` header block, unchanged |
| ModeSelector (3 chips) | **Reuse** | `goalChip` / `goalChipSelected`, write-through to `setLastGoalMode`, unchanged |
| Start Ride button | **Reuse visual; CHANGE behavior** | Same `btn-gold` 54px. Behavior changes: tap must trigger the new **handoff sequence** (§5), and must guard against double-start when a ride is already active (§4 edge). |
| Recent-rides feed | **Reuse** | UnifiedHomeFeed `RideFeedRow` etc., unchanged |
| Resume banner ("Ride in progress") | **Reuse; CHANGE copy/role** | Already built (`HomeScreen.tsx:173`). This flow promotes it (§4.5) and adds a launch-time path for the amendment's "ended-while-backgrounded summary." |
| Empty-feed / no-segments / cold-cue states | **Reuse** | Per QuickStartModes §4–§5; unchanged |
| **Handoff overlay on InRide** | **NEW** | §5 |
| **Ride notification (Mute/End actions)** | **NEW** | §7 (amendment surface) |

---

## 4. HOME — every state (reuse, enumerated for completeness)

### 4.1 Loading (cold launch, feed not yet in SQLite)
3 shimmer ghost rows under RECENT RIDES (`ShimmerRow`, exists). Sync line: "Loading your rides…". ModeSelector + Start fully interactive — **starting a ride never waits on the feed.**

### 4.2 Empty feed (connected, ≥1 segment, no rides in 30d)
"No rides in the last 30 days." / "Your next ride will appear here automatically." Start Ride **enabled** — the new-user win: coach a ride with zero history. (`HomeScreen.tsx:98`.)

### 4.3 No starred segments (`canStartRideDirectly === false`)
Start Ride at `opacity 0.35`, inert (no nav, no haptic). Helper card: "Star segments on Strava, then sync to start a coached ride." + Refresh button (force-sync). ModeSelector stays live. (QuickStartModes §4; `HomeScreen.tsx:214`.)

### 4.4 Cold-cue whisper (`cuesPreparing === true`)
Start Ride **enabled** (full opacity). Inline whisper under it: "Coaching cues are still preparing — your ride starts now, cues fill in shortly." No card, no border, no error color. (QuickStartModes §5; `HomeScreen.tsx:221`.)

### 4.5 Ride in progress (`rideStore.isRideActive === true`) — the resume case
The amendment makes the ride **survive backgrounding** (engine independent of the screen). Home surfaces it so the rider can re-attach.

```
│  ┌───────────────────────────────────────┐ │
│  │ ● Ride in progress    Tap to resume → │ │  ← resumeBanner (EXISTS, HomeScreen.tsx:173)
│  └───────────────────────────────────────┘ │     goldDim bg, gold 1.5px border, r12
```
- **Placement:** above GOAL MODE (existing). `●` = a real animated `gold` dot (`resumeDot`), pulsing slowly to read "live."
- **Tap → re-attach, not restart.** `handleResumeRide` (`HomeTab.tsx:291`) navigates to InRide with the live `routeSegmentIds`/`goalMode`; the engine guard (`InRideScreenWrapper`, `wrappers.tsx:86`) re-attaches because `isRideActive` is already true. **No second ride starts.**
- **DELTA — Start Ride while a ride is active:** today both the banner AND an enabled Start button can show at once, and tapping Start would call `handleStartRide` → `navigate('InRide', …)`, which the engine guard *also* treats as re-attach (it won't start a second engine). That's *safe* but *confusing* (two ways to "start" when one is really "resume"). **Decision:** when `isRideActive`, the Start Ride button relabels to **"Resume Ride"** and routes through `handleResumeRide`. One verb for one state. (See §6 behavior note; **Open Q1** for whether to instead disable Start and rely only on the banner.)

### 4.6 NEW launch-time state — "ended while backgrounded" (amendment)
Per the amendment, a ride ended from the lock-screen notification is **saved silently** (`endRideAndSave` + `summary_viewed = 0`) and **its summary is shown next time the app opens.** This flow specifies the **Home-side entry**:

- On Home focus / app foreground, the launch-time router (amendment §"Launch-time summary router") checks for the most-recent ride with `summary_viewed = 0` AND a real end time.
- If found → **route to that ride's PostRideSummary (history mode)** and speak the debrief there. Idempotent (don't double-navigate if already open).
- **Home does NOT show a competing banner for this** — the summary takes over directly, which is the least-surprising behavior (the rider ended the ride; seeing its summary is expected). If routing is deferred (e.g. mid-sync), Home shows a one-line tappable note under the greeting: "Your last ride is ready — tap to see the summary →" (`goldDim`, dismiss-on-tap). **Open Q2** — auto-route vs. always-banner.

---

## 5. THE START MOMENT — Home → InRide handoff (NEW, the core of this pass)

This is the designed sequence from tapping **Start Ride** to the rider confidently pocketing the phone. It honors **L4** (no new route; the GPS-acquiring affordance is a **transient overlay on InRide**).

### 5.1 Sequence overview

```
[Home: tap Start Ride]
      │  medium haptic
      ▼
TRANSITION: fade to bgDeep, 400ms
      │
      ▼
[InRide mounts → engine starts → HANDOFF OVERLAY shown over the single-glance screen]
      │
      ├─ State A: ACQUIRING GPS   (gpsLocked === false)
      │      "Finding GPS…" + animated locator, no false promise spoken
      │
      ▼  first real fix: rideStore.gpsLocked flips true
      │      success haptic + speak "GPS locked. N segments loaded. Goal: X. You can put your phone away."
      │
      ├─ State B: GPS LOCKED      (confirmation, ~1.8s)
      │      green check + "Locked — pocket it. I'll call your segments."
      │
      ▼  auto-dismiss
      │
[InRide single-glance screen, between-segments layout — ride is live, screen can go off]
```

### 5.2 State A — ACQUIRING GPS (overlay on InRide)

Shown the instant InRide mounts and the engine is starting, while `gpsLocked === false`.

```
┌─────────────────────────────────────────────┐
│ SCREEN: In-Ride  (HANDOFF OVERLAY — State A) │
│ Route: Ride → InRide   (bgDeep #111111)     │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓ STATUS BAR ~54px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│              ◎  ← animated GPS locator      │  ← Ionicons "locate" (filled) 48px gold,
│             (pulsing rings)                 │     concentric pulse rings (gold @ 12% → 0)
│                                             │
│           Finding GPS                       │  ← 24px/700 textPrimary
│                                             │
│      Acquiring a fix. Don't pocket yet —    │  ← 15px/400 textSecondary, center,
│      I'll tell you the moment it's locked.  │     max-width 280, lineHeight 22
│                                             │
│      ┌─────────────────────────────────┐    │
│      │ [Training]  · 12 segments loaded │    │  ← context chip row: mode chip (goldDim)
│      └─────────────────────────────────┘    │     + "N segments loaded" 13px textMuted
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │            Cancel                      │ │  ← ghost/outline, h48, borderStrong,
│  └───────────────────────────────────────┘ │     textSecondary 15/600. Single tap.
├─────────────────────────────────────────────┤     (anti-trap: lets you back out before
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│      committing — see edge cases)
└─────────────────────────────────────────────┘

Safe area notes:
- Top inset: SafeAreaView (InRide uses default edges = all). Overlay content centered in safe area.
- Bottom inset: Cancel button sits ABOVE the home indicator (paddingBottom = inset + 16).
- Interactive content (Cancel only) confirmed within safe bounds.

Transition in: the overlay is rendered ON the single-glance screen (which is mounting
   underneath) — overlay fades in over the bgDeep, 200ms, as the Home→InRide fade completes.
Transition out: cross-fade to State B on lock (see 5.4), OR fade back to Home on Cancel.

Edge cases: see §5.6.
Haptics: none on entry (the medium impact already fired on the Home Start tap).
Accessibility: "Finding GPS. Acquiring a fix. We'll announce when locked." as a
   polite live region; the spoken cue is NOT yet played (no false lock).
```

**Why an overlay, not a screen (L4):** the engine is already running underneath; the single-glance In-Ride screen is mounted and live. The overlay is purely a *confidence veil* over the first few seconds. Dismissing it reveals a ride that's already in progress — no extra navigation, no PreRide route. This is exactly the "transient overlay on InRide" L4 sanctions.

**Why "Don't pocket yet":** the honesty cuts both ways. Telling the rider explicitly *not* to pocket until lock makes the eventual "now you can" land as a real, trusted signal — not boilerplate. Market-research rider is experienced and impatient; a vague spinner reads as "is this thing working?" A specific instruction reads as "the coach is on it."

### 5.3 The re-sequenced trust cue (the heart of the fix)

When `rideStore.gpsLocked` flips to **true for the first time** (first fix with `accuracyM < 20`):

1. **Success haptic** (`notificationAsync(Success)`) — the tactile half, felt even if earbuds aren't in yet.
2. **Speak (ungated by mute at start unless `cuesMuted` — see §6):**
   > *"GPS locked. {N} segments loaded. Goal: {mode}. You can put your phone away."*
   - The added clause **"You can put your phone away"** is the explicit trust line. It is the audible contract.
   - Mode spoken: "P R" / "Training" / "Recovery" (existing pronunciation handling, `rideEngine.ts:147`).
3. Overlay cross-fades A → B.

> **This re-sequencing is an intentional refinement of the amendment's literal Step 1**, which lists the engine speaking "GPS locked…" *at start*. The amendment's intent is the trust cue; firing it on a *false* lock defeats that intent (Risk: the rider pockets the phone, GPS never locks, no segment cue ever fires, product fails silently). **Flagged, not silently changed.** See §6 + Open Q3.

### 5.4 State B — GPS LOCKED (confirmation, ~1.8s)

```
┌─────────────────────────────────────────────┐
│ SCREEN: In-Ride  (HANDOFF OVERLAY — State B) │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓ STATUS BAR ~54px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────────────────┤
│                                             │
│              ✓  ← Ionicons checkmark-circle  │  ← filled, 56px, success (#30A46C)
│             (spring scale-in)               │     spring pop (scale 0.6→1, 280ms)
│                                             │
│           GPS locked                        │  ← 24px/700 textPrimary
│                                             │
│      Pocket it. I'll call your segments     │  ← 15px/400 textSecondary, center.
│      and coach you the whole way.           │     Mirrors the spoken line.
│                                             │
│      ┌─────────────────────────────────┐    │
│      │ 🔔 Controls are on your lock     │    │  ← reassurance chip: Mute/End live
│      │    screen — Mute or End anytime  │    │     from the notification.
│      └─────────────────────────────────┘    │     Ionicons "notifications" (filled)
│                                             │     14px gold. 13px textMuted.
│                                             │     (Android: persistent. iOS: present
│                                             │      while the notification shows.)
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │            Got it                     │ │  ← optional dismiss (or auto after 1.8s)
│  └───────────────────────────────────────┘ │     ghost, h48. Tap = dismiss now.
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────────────┘

Transition in: cross-fade from A, 200ms; check pops with spring.
Transition out: auto fade-out after 1.8s (or on "Got it") → reveals the live single-glance
   In-Ride screen underneath. 250ms fade. No nav (overlay just unmounts).
Haptics: success notification fired at lock (5.3), not re-fired here.
Accessibility: "GPS locked. Pocket your phone — coaching is active. Mute and End are
   on your lock screen." as an assertive live region.
```

**Why a confirmation beat at all (and why short):** the rider needs *one* unmistakable "it worked" before committing the phone to a jersey pocket. 1.8s is long enough to register, short enough not to nag. The **lock-screen-controls reassurance chip** is the bridge to the amendment's pocket-control model: it tells the rider, at the exact moment they pocket the phone, that they retain control without unlocking. That sentence is what makes pocketing feel safe rather than like losing the remote.

### 5.5 After dismiss → live single-glance In-Ride (destination, owned by In-Ride refinement)

Overlay gone, the rider sees the amendment's **between-segments single-glance layout** (elapsed / distance / "0 of N done" / coaching-active indicator / Mute + End). The screen can now go off; coaching continues via the foreground service. **This screen's layout is designed in the In-Ride refinement, not here.** This pass only guarantees the handoff lands the rider on it with a live ride and a live notification.

### 5.6 Start-moment transitions (precise)

```
→ TRANSITION: Home → InRide handoff (Start Ride tapped)
   Trigger: tap Start Ride (enabled, not already in a ride)
   Action: handleStartRide → loadStarredSegments → navigate('Ride',{screen:'InRide',
           params:{segmentIds, goalMode}}). InRideScreenWrapper mounts → startRideEngine.
   Animation: full-screen fade Home(bg #1C1C1E) → InRide(bgDeep #111111), 400ms ease-in
              (reuses the existing "Ride start" transition). Handoff overlay (State A)
              fades in over the top as the fade completes.
   Duration: 400ms (screen) + 200ms (overlay in)
   Back gesture: none into the ride; Cancel button is the only out before lock.

→ TRANSITION: State A → State B (first GPS fix)
   Trigger: rideStore.gpsLocked flips true (first accuracyM < 20 fix)
   Animation: cross-fade A→B 200ms; check pops spring (scale 0.6→1, 280ms)
   + success haptic + the re-sequenced spoken trust cue (§5.3)

→ TRANSITION: State B → live In-Ride (handoff complete)
   Trigger: 1.8s elapsed OR "Got it" tap
   Animation: overlay fades out 250ms, revealing single-glance screen underneath
   Back gesture: standard In-Ride (back keeps ride running — wrappers.tsx; engine
                 has no unmount cleanup)
```

### 5.7 Edge cases — the start moment

- **Cancel during State A (before lock):** single tap on Cancel → `stopRideEngine()` + `rideStore.resetRide()` + dismiss the notification + fade back to Home. **Rationale:** before a fix, nothing is recorded; backing out must be clean and one-tap (it's not an End — no confirm needed, nothing to lose). Distinguish from in-ride End (which is a 2s hold) because *pre-lock there is no ride to protect.*
- **GPS slow to lock (5–15s):** stay in State A. After **10s** with no lock, soften the copy to: "Still finding a signal — head into the open if you can. The ride's already recording; I'll lock on shortly." + a **warning haptic** (once). The engine *is* running (distance accrues off any fixes); we just haven't crossed the `accuracyM < 20` threshold. Do **not** auto-advance to State B — never speak "locked" without a lock.
- **GPS never locks (e.g. underground start, dense canyon):** State A persists with the 10s degraded copy. Add a secondary affordance after **25s**: a quiet "Start anyway" ghost link under Cancel → dismisses the overlay to the live In-Ride screen with the GPS indicator showing **unlocked (red)**. The spoken cue in this case is the **honest degraded variant**: "Ride started. GPS is still weak — I'll coach your segments as soon as I can see you." (Never the false "you can put your phone away.") **Open Q4** — is "Start anyway" desirable, or should we hold the overlay indefinitely until lock?
- **Tap Start while a ride is already active (4.5):** Start relabels to "Resume Ride" and routes to `handleResumeRide` → re-attach (no overlay, no second engine). If somehow Start is tapped, the engine guard (`wrappers.tsx:86`) still prevents a double-start.
- **Backgrounding during State A (rider pockets too early despite the warning):** the overlay is just UI; the engine runs regardless. On next foreground, if `gpsLocked` is now true, skip straight to State B's reassurance (or, if >5s since lock, dismiss the overlay entirely to the live screen — the moment has passed). The spoken trust cue still fires once on the first real lock, even if it happened while backgrounded.

### 5.8 Error states — the start moment

- **Foreground location permission DENIED** (`startRideEngine` returns `false`; today the rider lands on a dead InRide screen — `wrappers.tsx:98` only logs). **Designed recovery:** the handoff overlay shows an **error variant** instead of State A:
  ```
  ⚠  (Ionicons "location-outline" → use filled "navigate-circle", error color, 48px)
  Location access is off
  Veloscape needs your location to coach segments as you ride.
  ┌─────────────────────────────────┐
  │        Open Settings            │   ← btn-gold (primary), → Linking.openSettings()
  └─────────────────────────────────┘
  ┌─────────────────────────────────┐
  │        Not now                  │   ← ghost → resetRide + back to Home
  └─────────────────────────────────┘
  ```
  Spoken: nothing (no cue without a ride). `error`-tinted icon, no green. Recovery path is explicit and one-tap to Settings. **This closes a real current gap** (dead screen on denial).
- **Notification permission DENIED** (Android 13+ / iOS): the ride is **NOT blocked** (amendment failure path). State A → State B proceed normally, but State B's reassurance chip changes to: "Lock-screen controls are off — Mute and End live on-screen here." (points the rider at the in-app Tier-1 controls). The notification simply doesn't post; the foreground-service notification (Android, no actions) may still show. **Open Q6** — whether to nudge enabling notifications post-ride rather than at the calm start moment.
- **Engine throws / `startLocationUpdatesAsync` rejects:** overlay shows a generic retry: "Couldn't start tracking. [Try again] / [Back]." `Try again` re-invokes `startRideEngine`; `Back` → resetRide → Home.

---

## 6. SERVICE / BEHAVIOR CHANGES required by this flow

These are design-driven requirements for eng; they refine (and one explicitly amends the *ordering* of) the amendment.

1. **Re-sequence the start cue (the trust fix) — [INTENTIONAL REFINEMENT of amendment Step 1].**
   - Today: `startRideEngine` speaks `"GPS locked…"` (`rideEngine.ts:147`) *before* GPS starts.
   - Change: move the spoken trust cue to fire on the **first** `gpsLocked === true` transition (first `accuracyM < 20` fix). Gate it through the amendment's `shouldFireCue`/`cuesMuted` so muting before start stays silent (amendment §"start-of-ride cue … gate it too").
   - New copy includes the explicit clause: **"You can put your phone away."**
   - If no lock within the degraded window, fire the **honest degraded variant** instead (§5.7), never the false "pocket it" line.

2. **[BLOCKER] `startRide` must reset `gpsLocked: false`.** Verified gap: `rideStore.startRide` (`rideStore.ts:109–122`) does **not** reset `gpsLocked`, and neither does `endRide` (`:207`) — only `resetRide` (`:209`) clears it. The amendment's backgrounded-End → history-mode summary path does **not** call `resetRide` (`PostRideSummaryScreen.handleDone` gates `resetRide` on `!isHistoryMode`, `wrappers.tsx:557`). So `gpsLocked` carries **stale `true`** from ride 1 into ride 2's mount. Consequence: on the second ride of a session the overlay **skips "Finding GPS" and jumps straight to "GPS locked — pocket it" before any real fix** — the exact false promise this whole flow exists to kill. The first-lock latch (item 3 below) does NOT save this: if `gpsLocked` is already true at mount there's no transition to latch onto; a subsequent poor fix flipping it false produces a B→A→B flicker. **Fix (one line): add `gpsLocked: false` to the `startRide` set().** This must land for §5.3 / §6.1 to be correct.

3. **Expose a "first lock" signal for the overlay state machine.** The overlay watches `rideStore.gpsLocked`. The store sets it on fixes (`rideStore.ts:135`). The overlay needs a one-shot "lockedOnce" latch so State B and the spoken cue fire exactly once per ride (not on every fix). Suggest a derived ref in `InRideScreenWrapper` or a `lockedOnce: boolean` on `rideStore` reset in `startRide`. **Note:** the latch alone is insufficient — it depends on item 2 (clean `gpsLocked: false` at start) to have a real `false → true` transition to latch on. **Open Q7** — ref vs. store flag.

4. **Gate the re-sequenced trust cue OUT of the simulated-ride path.** `startSimulatedRide` feeds synthetic fixes at `accuracy: 5` (`rideEngine.ts:267`), so `gpsLocked` flips true and the overlay state machine runs in sim too — but sim speaks "Simulated ride…", not the trust cue. If the re-sequenced "GPS locked — you can put your phone away" is wired generically off the first-lock transition, it will also fire during a foreground sim test (long-press Start). Gate it on `!simulate` so the eng handoff stays clean; the overlay visuals may still run in sim (harmless) but the spoken trust cue must not.

5. **`handleStartRide` guard + relabel (4.5).** When `isRideActive`, Home's primary button reads "Resume Ride" and routes to `handleResumeRide`. Prevents the two-verbs-for-one-state confusion. (Pure wrapper logic in `HomeTab.tsx`.)

6. **Notification posts at the start moment.** The persistent ride notification (FG-service today; Mute/End actions per amendment) should be **established by the time State B shows**, so the State-B reassurance chip is truthful. The FG-service notification already posts in `startLocationUpdatesAsync` (`rideEngine.ts:158`); the amendment's actionable notification (expo-notifications) is posted alongside it at engine start.

7. **Cancel path = clean teardown** (`stopRideEngine` + `resetRide` + dismiss notification). New affordance; no existing handler (the only teardown today is the 2s-hold End).

8. **Launch-time summary router entry on Home (4.6).** Per amendment; this flow specifies the Home-side UX (auto-route to PostRideSummary; optional fallback note).

---

## 7. THE RIDE NOTIFICATION at the start moment (NEW surface — amendment)

The task explicitly calls for "the persistent ride notification appearing." Here is its **start-moment** content and behavior. (Full Mute/End interaction mechanics belong to the In-Ride / notification refinement; this specifies what appears *as the ride starts*.)

### 7.1 Content (Android — persistent ongoing)

```
┌─ Android notification (ongoing, lock screen) ───────┐
│ ◎ Veloscape · ride in progress                      │  ← small icon (app), accent gold
│ Training · 12 segments · coaching live              │  ← title 1 line
│ 0 of 12 done · 0.0 km                               │  ← body, updates live
│ ┌──────────┐ ┌──────────┐                           │
│ │  Mute    │ │  End      │                           │  ← actions (amendment)
│ └──────────┘ └──────────┘                           │
└─────────────────────────────────────────────────────┘
```
- **Title:** "Veloscape · ride in progress" (refine from current "Veloscape — ride in progress", `rideEngine.ts:160`).
- **Sub/body:** "{Mode} · {N} segments · coaching live" then live "{done} of {N} done · {km}". (Current body: "Tracking your route and coaching your segments." — **DELTA:** make it carry live state + mode so the lock screen is glanceable.)
- **Accent color:** gold (align `#F5C518` → `gold` token, Open Q5).
- **Actions:** **Mute** (single tap, reversible; relabels Mute↔Unmute) and **End** (→ confirm step; never one-tap end). Per amendment control model.
- **Persistent / ongoing / not swipe-dismissible** while the ride is active.

### 7.2 Content (iOS — single actionable local notification)
Same copy and the same two actions, but **not a persistent control panel** (iOS has no ongoing-notification primitive; amendment Risk 5). It's the floor: Mute/End usable from the lock screen when the notification is present. Live Activity / ActivityKit is a noted follow-up, **out of scope.**

### 7.3 When it appears in the start sequence
- The FG-service notification posts when `startLocationUpdatesAsync` runs (engine start, during/just after State A). The actionable notification (expo-notifications, amendment) posts at the same engine-start point.
- By **State B** ("Pocket it"), the notification is live — which is *why* the State-B reassurance chip can honestly say "controls are on your lock screen."

### 7.4 Notification edge/error states (start-relevant)
- **Notification permission denied** → §5.8 (ride not blocked; State-B chip points to in-app controls).
- **Double-notification risk (amendment Risk 3, UNRESOLVED build-time spike):** if the expo-location FG-service notification cannot host actions, a *separate* expo-notifications notification carries Mute/End and the FG-service notification is kept minimal so the pair reads as one. **This spec does NOT promise a single unified notification** and **does not write UI copy that asserts "one notification."** The State-B chip says "controls are on your lock screen," which is true under either outcome.

---

## 8. Accessibility (start moment)

- **Acquiring (State A):** polite live region "Finding GPS. We'll announce when locked." Cancel button labelled "Cancel and return home."
- **Locked (State B):** assertive live region "GPS locked. Pocket your phone — coaching is active. Mute and End are on your lock screen." The spoken cue + the live region are redundant on purpose (earbuds may not be in).
- **Contrast:** gold on `bgDeep` = 10.5:1 (AAA); success green and error red used only on large icons + as accents, paired with text labels (never color-only).
- **Touch targets:** Cancel / Got it / Open Settings all ≥48dp height. Overlay never traps focus behind it (it's the topmost interactive layer until dismissed).
- **VoiceOver order in State A:** heading ("Finding GPS") → instruction → context chip → Cancel.

---

## 9. Emotional design rationale (tone, from Market Research)

The rider is a 44-year-old, time-pressed, performance-motivated, multi-app cyclist with bone-conduction earbuds in. They have been promised *a voice that knows their legs.* The start moment must read as **a competent coach taking the wheel**, not a phone booting up:

- **Calm, not busy.** One locator, one line of copy, one action. No spinner-soup, no progress bars racing.
- **Honest before reassuring.** "Don't pocket yet" → "Now you can." The withheld promise is what makes the granted one credible. This rider has been burned by Strava's 12-year-unshipped audio cues (Market Research) — they don't trust vague.
- **The voice is the product.** The spoken trust cue is the hero, not the screen. The screen exists to be *put away.* Every visual choice serves "you'll trust this enough to not look at it."
- **Confidence through restraint.** Gold appears only on the locator and the live notification accent; the success check is the one green moment. The design says: the important thing isn't this screen — it's the road ahead and the voice in your ear.

---

## 10. OPEN QUESTIONS for the founder

1. **Resume vs. disable.** When a ride is active, I relabel Start → "Resume Ride." Alternative: disable Start (opacity 0.35) and force resume only via the banner. Relabel (my pick) keeps one obvious primary action.
2. **Ended-while-backgrounded entry.** Auto-route straight to PostRideSummary on next open (my pick — least surprising), or always show a tappable Home banner first?
3. **Re-sequenced start cue (the big one).** I move "GPS locked / you can put your phone away" to fire on the *first real fix*, refining the amendment's literal start-time ordering. Confirm this refinement (it fixes a real trust bug) — the alternative is keeping the cue at start and accepting it can be a false promise.
4. **"Start anyway" after 25s of no lock.** Include the escape hatch (with the honest degraded cue), or hold the overlay until a real lock?
5. **Notification accent color** `#F5C518` (hard-coded) vs `gold #F5C842` token — align to the token?
6. **Notification-permission timing.** Don't request it at the calm start moment. Request during onboarding/Connected (`AuthStack`), or lazily after the first ride? (I lean onboarding so the very first ride already has lock-screen controls — but it must not interrupt the handoff.)
7. **First-lock latch** — derive in the wrapper (a ref) vs. add `lockedOnce` to `rideStore` (reset in `startRide`). Ref is lighter; store flag is more robust across remounts.
8. **State B duration** — 1.8s auto-dismiss (my pick) vs. require an explicit "Got it" tap (more deliberate, but adds a tap right when the rider wants to ride). Or make it a setting.

---

## 11. New / changed components (for the eventual RN shells)

| Component | Type | Notes |
|---|---|---|
| `HandoffOverlay` | **NEW** | The transient overlay on InRide. Props: `state: 'acquiring' \| 'locked' \| 'denied' \| 'error'`, `mode`, `segmentCount`, `degraded`, `onCancel`, `onOpenSettings`, `onRetry`, `onDismiss`. Renders over the single-glance screen (L4-compliant). Owns the A→B animation + the lock-screen reassurance chip. |
| `HomeScreen` Start button | **CHANGED** | Relabel + reroute when `isRideActive` (Resume). |
| `InRideScreenWrapper` | **CHANGED** | Drive `HandoffOverlay` state from `gpsLocked` + a first-lock latch; fire the re-sequenced spoken cue + success haptic; wire Cancel teardown. |
| Ride notification (`rideEngine` + expo-notifications) | **CHANGED/NEW** | Live mode + counts in copy; Mute/End actions (amendment); token-aligned accent. |
| Resume banner | **REUSE** | Existing; promoted role. |
| Launch-time summary router (Home side) | **NEW (small)** | Auto-route to PostRideSummary for `summary_viewed = 0` (amendment). |

*All icons in shells = real vectors (Ionicons filled): `locate`, `checkmark-circle`, `notifications`, `navigate-circle`. No Unicode/emoji glyphs. ASCII glyphs in the wireframes above (◎ ✓ 🔔 ⚠ ●) are drawing placeholders mapping to those named vectors.*

---

*End of refinement pass. On approval (+ Open Q answers) I'll fold the handoff into the master DesignSpec and cut the `HandoffOverlay` RN shell + the `InRideScreenWrapper`/`rideEngine` wiring notes.*
