# Refinement Design Spec — FTUE & Permissions (Background-First Onboarding)

*Flow: First-Time User Experience + critical permission priming*
*Author: UX Architect pass (headless) | 2026-06-09*
*Grounds on: `InRideSingleGlanceAndLockScreenControls_Amendment.md` (authoritative), `Sherpaa_ProductSpec.md` Flow 1, `Sherpaa_Market_Research.md` personas, and the as-built `AuthStack.tsx` / `WelcomeScreen` / `CarouselScreen` / `StravaConnectScreen` / `ConnectedScreen` / `segmentSync.ts`.*

---

## 0. Why this refinement exists

The FTUE is **the make-or-break setup for the entire background-first experience.** The amendment reframed the product: pick a mode → Start Ride → **phone goes in pocket, screen off** → a voice coaches your starred Strava segments → control coaching (Mute / End) from the **lock screen** without unlocking.

That product cannot function if the rider lands on Home with the wrong permissions. Specifically:

- **Background location ("Allow all the time").** The coach follows your GPS with the screen off. iOS and Android 11+ both make "Allow all the time" a *deliberate, multi-step* grant — Android 11+ will not even show "Allow all the time" in the runtime dialog; the user must be sent to **Settings** to upgrade from "While using" to "Allow all the time." If we don't earn this, the coach goes silent the moment the screen locks.
- **Notifications (`POST_NOTIFICATIONS`, Android 13+; iOS authorization).** The lock-screen ride controls (Mute / End) and the persistent foreground-service notification both live on the notification surface. No notification permission → no Tier-2 lock-screen controls, and on Android 13+ the foreground-service notification itself is suppressed from view.

### What the as-built FTUE gets wrong (the gap this spec closes)

`ConnectedWrapper` today does three heavy things on one screen, silently and out of order:
1. Marks "Strava connected."
2. Kicks off `syncStarredSegments(..., { listOnly: true })`.
3. Fires **`Location.requestForegroundPermissionsAsync()`** — *foreground only*, with **no rationale screen**, and **never requests background ("Always") at all**, and **never requests notifications at all.**

That is a foreground-app onboarding bolted onto a background-first product. The OS prompt appears with zero context; if denied, the only recovery is a small amber banner. There is no notification priming anywhere in `AuthStack`.

**This spec replaces the single `Connected` screen with a sequenced, primed permission flow**, reusing the existing Welcome / Carousel / StravaConnect screens largely as-is, and turning `ConnectedScreen` into a lean auth-success handoff that no longer does permission work inline.

---

## 1. Actor & emotional state (per flow stage)

Primary persona (Market Research): **38–51, $140K–$290K HHI, owns a Garmin + Shokz bone-conduction earbuds, already pays for 2–3 cycling apps, performance-motivated, skeptical of yet another app.** They have starred segments already. They are *evaluating*, not delighted-by-default.

| Stage | Emotional state | Design job |
|---|---|---|
| Welcome | Curious, slightly guarded ("another cycling app?") | One sharp value claim. No friction. |
| Carousel | Patient but skimming | Earn the Strava tap in 3 slides; let them skip. |
| Strava connect | Cautious about data access | Honest scope. "We never post." Already good in as-built. |
| **Location primer** | Wary of "Allow all the time" — this is the single highest-drop-off moment | Explain *why background, screen-off* before the OS asks. Make the grant feel reasonable, not creepy. |
| **Notification primer** | Mild fatigue ("notifications, ugh") | Reframe: these aren't marketing pings — they're your **ride remote control.** |
| Sync | Mild anticipation | Show progress; never a dead spinner. |
| 0-starred fork | Confusion / mild disappointment | Don't dead-end. Teach the one action that unlocks the app. |
| Ready handoff | Ready to ride | Confidence. One tap to Home. |

**Overriding principle (from the brief): extreme simplicity.** Every permission screen earns its place because the product literally does not work without that grant. Nothing decorative. One idea per screen.

---

## 2. Design tokens used (from `src/constants/colors.ts`)

This is a **dark** product (`bg #1C1C1E`, `bgDeep #111111`). Gold (`#F5C842`) is the sole accent — primary CTAs and "granted" emphasis only. Green `success #30A46C` for confirmed grants. Red `error #E5484D` for hard failures only. Strava orange `#FC4C02` is brand-locked to the Strava button/badge and used nowhere else.

- Radius: 12 (cards), 20 (illustration blocks, bottom sheets), 999 (pill buttons — matches as-built).
- Primary CTA: full-width, **height 56**, `borderRadius 999`, gold fill, `textOnGold #000`, weight 600, size 17. (Matches Welcome/Carousel/Connected as-built.)
- Type scale in use: 28/24 titles, 17 CTA, 15 body, 14 secondary, 13 caption, 11 caps-label.
- Icons: **`@expo/vector-icons` Ionicons, filled variants only** (already the project's icon lib — used in `MainTabs`). No emoji, no Unicode glyphs. The as-built `✓` text checks and the `S` text-in-circle in `StravaConnectScreen`/`ConnectedScreen` are flagged as defects to replace (see §9).

---

## 3. Flow map (happy path + forks)

```
                         ┌─────────────┐
                         │  Welcome    │  (reuse, light edit)
                         └──────┬──────┘
              Get Started       │        "I already have an account"
              ┌──────────────────┴───────────────┐
              ▼                                   ▼
      ┌─────────────┐                      (skip carousel)
      │  Carousel   │  (reuse, +1 slide)         │
      └──────┬──────┘                            │
             │ Connect Strava                    │
             ▼                                   ▼
      ┌──────────────────────────────────────────────┐
      │  StravaConnect  (reuse) → OAuth browser →     │
      │  deep-link return veloscape://connected?...   │
      └──────┬───────────────────────────────┬───────┘
       success│                          cancel / error
             ▼                                │
      ┌─────────────┐                         ▼
      │ AuthSuccess │  (was "Connected",  back to StravaConnect
      │  — lean)    │   permission work removed)   (error banner)
      └──────┬──────┘
             │ Continue
             ▼
      ┌──────────────────┐   NEW
      │ LocationPrimer    │  rationale → OS foreground prompt
      │ (background-first)│  → if granted, upgrade-to-Always step
      └──────┬───────────┘
             │ (granted Always / While-using / Denied — all continue)
             ▼
      ┌──────────────────┐   NEW
      │ NotificationPrimer│  rationale → OS notif prompt
      │ (lock-screen ctl) │  (granted / denied — both continue)
      └──────┬───────────┘
             ▼
      ┌──────────────────┐   NEW (replaces inline sync on old Connected)
      │ SyncProgress      │  syncStarredSegments(listOnly)
      └──┬───────────┬───┘
   ≥1 seg│           │ 0 starred
         ▼           ▼
   ┌──────────┐  ┌──────────────────┐  fork
   │  Ready   │  │ ZeroStarred       │  "star segments in Strava"
   │  Handoff │  │  (deep-link out)  │
   └────┬─────┘  └────────┬─────────┘
        │  Start riding   │  "I starred some" → re-sync
        └────────┬────────┘
                 ▼
              MainTabs / Home
```

**Navigation model:** all FTUE screens live in `AuthStack` (header hidden, `slide_from_right`). The new permission screens are added as Stack screens after `Connected`. **Auth is committed (`setAuth`) at the *end* of the flow — on the Ready/ZeroStarred handoff — not on the AuthSuccess screen.** Rationale below in §4 (AuthSuccess) — this keeps the rider inside the welcoming dark `AuthStack` chrome through the permission gauntlet instead of dumping them into `MainTabs` mid-priming.

> **Implementation note vs. as-built (verified against source):** the root gate is `RootNavigator.tsx`, which switches purely on `useAuthStore.isAuthenticated` — there is **no separate `onboarded` flag**. `setAuth(jwt, rider, strava)` sets `isAuthenticated: true`, so the instant it's called the root unmounts `AuthStack` and mounts `MainTabs`. Today `setAuth` is called in `ConnectedWrapper.handleContinue` (the "Let's Go" tap), which is *one screen in* — that's exactly why the as-built flow can't run primers after it. The fix is purely to **move the `setAuth` call (and the co-located `db.insert(riders)...onConflictDoUpdate` upsert) out of `handleContinue` and into the final `ReadyHandoff` "Start riding" handler (and the `ZeroStarred` "Continue" handler).** No `RootNavigator` change, no new flag, no new dependency — just relocating the existing call to the end of the stack.

---

## 4. Screens

Common spec for every FTUE screen:
- Wrapped in `SafeAreaView` from `react-native-safe-area-context` (already the project convention).
- Top inset: status bar / Dynamic Island. Bottom inset: home indicator / Android gesture bar. Primary CTA sits **above** the bottom inset.
- Background `colors.bg` (`#1C1C1E`) unless noted.

---

### 4.1 Welcome (REUSE — light edit)

```
┌─────────────────────────────────┐
│ WELCOME                          │
│ Route: AuthStack/Welcome         │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ~24dp ▓▓▓▓▓▓▓│  system chrome
├─────────────────────────────────┤
│                                 │
│   [ hero-mtb.png, full bleed,   │
│     dark gradient bottom→up ]   │
│                                 │
│                                 │
│                                 │
│         VELOSCAPE               │  ← logo, 32/700, gold, +4 letter-spacing
│   The only coach who was there  │  ← tagline 14/400, textFaint
│            last time.           │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │      Get Started          │  │  ← gold pill, 56dp, → Carousel
│  └───────────────────────────┘  │
│   I already have an account     │  ← ghost text 15/500, → StravaConnect
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓│  system chrome
└─────────────────────────────────┘
```

- **Reuse as-built `WelcomeScreen.tsx`.** Content lives in a `SafeAreaView` over a full-bleed `ImageBackground` + `LinearGradient` — already correct.
- **Edit:** the tagline is good; no change. Confirm the gradient bottom stop reaches full opaque `#1C1C1E` so the CTA never floats on a busy image (it does — `locations` end at `1`).
- Safe area: top inset — hero bleeds *under* the status bar intentionally (image only, no interactive content there — compliant). Bottom — CTA group has `paddingBottom: 48` inside `SafeAreaView`, above the home indicator. Compliant.

**Transition in:** none (root). **Transition out → Carousel:** `slide_from_right`, 300ms.
**Edge cases:** none — purely presentational.
**Empty/error/loading:** N/A.
**Haptics:** light selection on "Get Started".
**A11y:** logo + tagline grouped as one heading for VoiceOver; CTA labeled "Get Started". Contrast of `textFaint` tagline over the opaque gradient base meets 4.5:1 for the size.

---

### 4.2 Carousel (REUSE — add 1 slide)

```
┌─────────────────────────────────┐
│ CAROUSEL                Skip →   │  ← Skip top-right, textMuted 15/500
│ Route: AuthStack/Carousel        │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│      ┌─────────────────┐        │
│      │  [illustration] │        │  260×210, surface card, radius 20
│      └─────────────────┘        │
│                                 │
│        Pocket your phone        │  ← headline 26/700 (slide 2, NEW)
│   The coach rides in your ear.  │  ← body 15/400, textSecondary
│   Screen off, phone away — the  │
│   voice does the work.          │
│                                 │
│          ● ● ○ ○                │  ← dots, active = gold, 4 slides now
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │          Next             │  │  ← gold pill 56dp (last slide: "Connect Strava")
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **Reuse as-built `CarouselScreen.tsx`.** It already supports N slides, dots, Skip, and "Connect Strava" on the last slide.
- **Edit — insert a new slide #2 that sells the background-first mechanic** (the whole reason the permissions ahead are reasonable). New 4-slide set:
  1. **"Knows your history"** — "Every cue is built from your last 90 days on that segment — not a generic script." *(as-built)*
  2. **"Pocket your phone"** *(NEW)* — "The coach rides in your ear. Screen off, phone away — the voice does the work." *(primes background location + notifications honestly, before we ask)*
  3. **"Ready before you roll"** — "Coaching cues are generated before your ride. Zero network calls mid-effort." *(as-built)*
  4. **"Your debrief, spoken"** — "After every ride, hear exactly what happened — segment by segment." *(as-built)*

  Why add the slide: it makes the Location and Notification primers two screens later feel *expected* rather than intrusive. The rider has already been told the phone goes in the pocket.
- **Replace placeholder illustrations** (`[ Illustration N ]`) with real per-slide artwork or, at minimum, a large filled Ionicon centered in the card (e.g. slide 2 → `phone-portrait`/`headset`). No emoji placeholders shipped.

**Transition in:** slide_from_right. Inter-slide: cross-fade or horizontal swipe (200ms) — content swap, not a screen push. **Out → StravaConnect:** slide_from_right.
**Edge cases:** Skip jumps straight to StravaConnect (preserve as-built). Swipe-back gesture returns to Welcome.
**Empty/error/loading:** N/A.
**Haptics:** light selection on Next / dot advance.
**A11y:** each slide announces "Slide N of 4, [headline]. [body]". Skip is a labeled button. Dots are decorative (`accessibilityElementsHidden`).

---

### 4.3 StravaConnect (REUSE — icon fix only)

```
┌─────────────────────────────────┐
│ STRAVA CONNECT                   │
│ Route: AuthStack/StravaConnect   │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│            ┌────┐               │  Strava logo mark (orange circle)
│            │ ⌁  │               │  ← REPLACE text "S" with brand glyph/Image
│            └────┘               │
│        Connect Strava           │  ← 26/800 textPrimary
│  Veloscape reads your starred   │  ← 14/400 textMuted, centered
│  segments to build your         │
│  coaching plan. We never post   │
│  or modify your Strava data.    │
│                                 │
│  ┌───────────────────────────┐  │
│  │ [check] Read your profile │  │  ← perms card, surface + border
│  │ [check] Read starred segs │  │     check = Ionicon checkmark (success)
│  │ [check] Read activity data│  │     NOT a text "✓"
│  └───────────────────────────┘  │
│                                 │
│  (error banner if state=error)  │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │   Connect with Strava     │  │  ← STRAVA ORANGE pill, 56dp
│  └───────────────────────────┘  │     (brand-locked color; spinner when connecting)
│             Back                │  ← textDim
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **Reuse as-built `StravaConnectScreen.tsx`** + `StravaConnectWrapper`. The OAuth round-trip, deep-link listener (`veloscape://connected?...`), and `state: idle | connecting | error` are all built and correct.
- **Edit (defect fix):** replace the text `"S"` in `logoCircle` and the `"✓"` text checks with the real Strava brand mark (an `<Image>` of the official mark per Strava brand guidelines) and `Ionicons name="checkmark-circle"` (filled, `colors.success`, size 18). Text glyphs-as-icons are a shipped-failure pattern (the project's own design rule).
- Copy stays — it's honest and scoped ("We never post or modify your Strava data").

**Transition in:** slide_from_right. **OAuth out:** `WebBrowser.openBrowserAsync` opens the Strava auth page (system browser sheet, not a screen push). On deep-link return, the listener navigates to **AuthSuccess** (`Connected`).
**Edge cases / error states:**
- **User cancels in browser** (closes the sheet without authorizing): `openBrowserAsync` resolves, no deep link arrives, wrapper sets `state` back to `idle`. Screen returns to its resting state with the Connect button live again. *No error banner* — cancel is not a failure. (Matches as-built.)
- **Strava returns `error=...`** in the deep link: wrapper sets `state='error'` + `errorMessage`; the red error banner shows `Strava error: <msg>` with the Connect button still tappable to retry. (Matches as-built.)
- **Missing `STRAVA_CLIENT_ID`** in the build: immediate `state='error'`, banner explains the build is misconfigured. (Matches as-built — dev-facing.)
- **Backend `/oauth/callback` 5xx / network down:** Strava redirect carries `error`; falls into the error-banner path. If the redirect never arrives (dead network mid-flow), the sheet closes → `idle` → user retries. Add a soft 60s "Still waiting on Strava? Tap to retry." inline hint if `state==='connecting'` persists with no deep link (NEW — small resilience add).
**Loading:** `state==='connecting'` shows `ActivityIndicator` inside the orange button (as-built).
**Empty:** N/A.
**Haptics:** medium impact on successful connect (fire when AuthSuccess mounts).
**A11y:** perms card is one VoiceOver group: "Veloscape will: read your profile, read starred segments, read activity data." Connect button labeled with brand name.

---

### 4.4 AuthSuccess (was "Connected" — STRIP permission work, keep as lean handoff)

```
┌─────────────────────────────────┐
│ AUTH SUCCESS                     │
│ Route: AuthStack/Connected       │  (param name kept for compat)
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│            ┌────┐               │  avatar (Strava photo or initials),
│            │ JM │◦S             │  small orange Strava badge bottom-right
│            └────┘               │
│                                 │
│        You're connected         │  ← 24/700 textPrimary
│   Jordan M · 12 starred segments│  ← 14/400 textMuted
│                                 │
│  Next, three quick permissions  │  ← 15/400 textSecondary, centered
│  so the coach can ride with you │     sets expectation for what's ahead
│  — pocketed, screen off.        │
│                                 │
│   ┌──────────────────────────┐  │
│   │ [locate] Location         │  │  preview list — 3 rows, Ionicons,
│   │ [notifications] Alerts    │  │  textSecondary, NO toggles yet
│   │ [sync] Segment sync       │  │  (just a roadmap of the next 3 steps)
│   └──────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │       Continue            │  │  ← gold pill 56dp → LocationPrimer
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **Refactor `ConnectedScreen` + `ConnectedWrapper`.** Remove from this screen: the inline `syncStarredSegments` call, the `Location.requestForegroundPermissionsAsync()` call, the `statusLines` async machinery, and the amber location-warning. Those move to dedicated primers/sync screens below.
- This screen now does one thing: **confirm Strava succeeded and set expectations for the 3 steps ahead.** A short, honest preview ("three quick permissions") removes the surprise of being asked for background location two taps later.
- **Show the real starred count if already known.** If we want the count here we'd need the list synced first — but sync runs *after* the primers (it needs nothing from them). So either (a) omit the count here and show it on Ready, or (b) fire a cheap list-only count fetch in the background. **Decision: omit the count on AuthSuccess** ("You're connected" alone) to avoid a pre-sync fetch and keep the screen instant. The "12 starred segments" line is shown later on **ReadyHandoff** where the count is real. *(Revise the wireframe subtitle to just "Jordan M · Connected to Strava".)*
- The 3-row preview list uses filled Ionicons: `location`, `notifications`, `sync`. No checks/states yet — it's a roadmap, not a status board.
- **Do NOT call `setAuth` here.** (See §3.) Auth commits on the final handoff.

**Transition in:** slide_from_right; haptic medium on mount (the "connected" payoff).
**Out → LocationPrimer:** slide_from_right.
**Edge cases:** if the rider force-quits here, on relaunch they re-enter `AuthStack` at Welcome (no auth committed yet) — acceptable; Strava re-auth is fast (`approval_prompt=auto` won't re-prompt the grant). Back gesture → returns to StravaConnect.
**Error states:** none on this screen now (errors were moved to their owning screens).
**Empty:** N/A.
**Haptics:** medium impact on mount.
**A11y:** "You're connected to Strava as Jordan M. Three quick permissions next." Preview list rows are non-interactive, grouped.

---

### 4.5 LocationPrimer (NEW — the critical screen)

This is the highest-stakes screen in the entire app's funnel. Background "Allow all the time" is what makes screen-off coaching possible. It is **a two-phase screen**: rationale → OS prompt → (on iOS/Android) an explicit "upgrade to Always" sub-step, because neither platform grants "always" in one tap.

#### Phase A — rationale (before any OS prompt)

```
┌─────────────────────────────────┐
│ LOCATION PRIMER                  │
│ Route: AuthStack/LocationPrimer  │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│   ← Back            Step 1 of 3  │  ← progress marker, textMuted 13
├─────────────────────────────────┤
│                                 │
│         ┌──────────┐            │
│         │ [navigate]│           │  large filled Ionicon "navigate" /
│         └──────────┘            │  "location", 40dp, gold in goldDim circle
│                                 │
│   Let the coach follow your     │  ← 28/700 textPrimary, left-aligned
│   position — even in your        │
│   pocket.                       │
│                                 │
│   Veloscape watches for your    │  ← 15/400 textSecondary, lineHeight 24
│   starred segments as you ride. │
│   That only works if it can see │
│   your location with the screen │
│   off and the phone away.       │
│                                 │
│   ┌───────────────────────────┐ │
│   │ [eye-off] We never track   │ │  reassurance card, surface+border
│   │  you off the bike. Location│ │  Ionicon "shield-checkmark", textSecondary
│   │  is used only during an    │ │
│   │  active ride.              │ │
│   └───────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │   Allow location          │  │  ← gold pill 56dp → triggers OS prompt
│  └───────────────────────────┘  │
│      Not now                    │  ← ghost textDim → continues, degraded
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **"Allow location"** calls `Location.requestForegroundPermissionsAsync()` first (the foreground grant is the precondition for background on both platforms). Then, based on the result, we either advance to **Phase B (upgrade to Always)** or handle denial.
- Copy is honest and specific to the mechanic: *follow your position, screen off, phone away.* No dark patterns, no "for the best experience." It names exactly what's collected and when ("only during an active ride") — which is true (the engine only tracks during a ride) and matches the persona's privacy wariness.
- **"Not now"** is a real, low-friction escape. We do not block onboarding on location. Denial is handled gracefully (the rider can ride with the screen on, or grant later from Settings / a HomeTab nudge).

#### Phase B — upgrade to "Allow all the time" (shown ONLY after foreground granted)

After foreground is granted, the rider needs **background**. We check `Location.getBackgroundPermissionsAsync()`; if not already "granted", we present the upgrade step.

```
┌─────────────────────────────────┐
│ LOCATION PRIMER — upgrade         │
├─────────────────────────────────┤
│   ← Back            Step 1 of 3  │
├─────────────────────────────────┤
│         ┌──────────┐            │
│         │[navigate] │  [check]  │  green check overlay = foreground granted
│         └──────────┘            │
│                                 │
│   One more tap: "Allow all the  │  ← 28/700
│   time."                        │
│                                 │
│   Right now Veloscape can see   │  ← 15/400 textSecondary
│   your location only while the  │
│   app is open. For screen-off   │
│   coaching, it needs "Allow all │
│   the time."                    │
│                                 │
│   ┌───────────────────────────┐ │
│   │  How to do it:            │ │  ← Android-only inline steps card
│   │  1. Tap "Open Settings"   │ │     (shown when OS won't grant always
│   │  2. Tap "Permissions ›    │ │      in a runtime dialog — Android 11+)
│   │     Location"             │ │
│   │  3. Choose "Allow all     │ │
│   │     the time"             │ │
│   └───────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  Allow all the time       │  │  ← gold pill: iOS → requestBackground..()
│  └───────────────────────────┘  │     Android 11+ → Linking.openSettings()
│      Keep "while using"         │  ← ghost → continues with foreground-only
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **Platform branch (decisive call):**
  - **iOS:** "Allow all the time" calls `Location.requestBackgroundPermissionsAsync()`. iOS shows its own "Change to Always Allow?" dialog. The inline "How to do it" steps card is **hidden** on iOS (the OS dialog is sufficient).
  - **Android 11+ (API 30+):** the runtime dialog will **not** offer "Allow all the time"; the user must go to Settings. So "Allow all the time" calls `Linking.openSettings()` and the **"How to do it" steps card is shown** so they know what to tap once there. On return to the app (`AppState` active), we re-check `getBackgroundPermissionsAsync()` and update the check/state.
  - **Android 10 / older:** `requestBackgroundPermissionsAsync()` may grant in-dialog; try it first, fall back to Settings.
- **"Keep while using"** is the honest off-ramp: the rider can proceed; coaching works *while the screen is on*, and we surface a persistent (dismissible) nudge on HomeTab + the PreRideBrief that explains screen-off coaching needs the upgrade. We do **not** trap them here.
- **Return-from-Settings detection:** subscribe to `AppState`; when it returns to `active`, re-query background permission. If now "granted," show the green check and auto-advance after a brief beat (600ms) with success haptic.

**Transition in:** slide_from_right. Phase A→B: cross-fade in place (same screen, 250ms) — not a push.
**Out → NotificationPrimer:** slide_from_right (regardless of grant outcome — never block).
**Edge cases:**
- Foreground **denied** at Phase A: skip Phase B entirely; set a `locationDenied` flag; continue to NotificationPrimer. The rider lands on Home able to use the app, with a HomeTab banner "Location off — coaching can't detect segments. Enable →" (deep-links to Settings).
- Foreground granted, background **denied / "while using" kept:** continue; set `backgroundLocationDenied`. Screen-off coaching nudge appears on Home/PreRide.
- Foreground granted, background **already granted** (returning user, or fast iOS grant): skip Phase B, brief success check, auto-advance.
- Rider sent to Settings, **backgrounds the app and never returns**: nothing breaks; on next launch the launch router re-evaluates and the Home nudge reflects current state.
**Error states:** `requestForegroundPermissionsAsync` throws (rare) → treat as denied, log, continue. No blocking error UI — a permission hiccup must never strand the rider in onboarding.
**Empty:** N/A.
**Haptics:** light on "Allow location" tap; **success** notification haptic when a grant (foreground or background) confirms; warning haptic on denial.
**A11y:** title + body are one heading group. The "How to do it" steps are an ordered list (`accessibilityRole` text, numbered). "Allow all the time" button announces "Allow location all the time, opens Settings" on Android.

---

### 4.6 NotificationPrimer (NEW)

Reframes notifications as the **ride remote control**, not marketing. This is what powers the amendment's lock-screen Mute / End.

```
┌─────────────────────────────────┐
│ NOTIFICATION PRIMER              │
│ Route: AuthStack/NotificationPrimer│
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│   ← Back            Step 2 of 3  │
├─────────────────────────────────┤
│         ┌──────────┐            │
│         │[notifica- │           │  filled "notifications" Ionicon, 40dp,
│         │  tions]   │           │  gold in goldDim circle
│         └──────────┘            │
│                                 │
│   Control the coach from your   │  ← 28/700
│   lock screen.                  │
│                                 │
│   Veloscape puts Mute and End   │  ← 15/400 textSecondary
│   right on your lock screen, so │
│   you can silence a cue or stop │
│   the ride without unlocking or │
│   pulling the phone out.        │
│                                 │
│   ┌───────────────────────────┐ │
│   │ Lock screen · now          │ │  faux lock-screen notification preview
│   │ ♪ Veloscape — Riding       │ │  (illustrative card, surface, radius 12)
│   │ 0:42 · 2.1 km · 1 of 6     │ │  shows the actual controls they'll get
│   │ [ Mute ]      [ End ]      │ │  two pill buttons inside the preview
│   └───────────────────────────┘ │
│                                 │
│   No marketing. No daily pings. │  ← 13/400 textMuted reassurance
│   Only your live ride.          │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  Turn on ride controls    │  │  ← gold pill 56dp → OS notif prompt
│  └───────────────────────────┘  │
│      Not now                    │  ← ghost textDim → continues
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- **"Turn on ride controls"** calls `Notifications.requestPermissionsAsync()` (from `expo-notifications`, the new dependency the amendment introduces). On Android 13+ this is the `POST_NOTIFICATIONS` runtime prompt; on iOS it's the authorization prompt. Register the `veloscape-ride` notification category/actions at the same time (or at app init).
- The **faux lock-screen preview card** is the persuasive core: it *shows* the rider the exact Mute/End controls they'll get, grounding the abstract "notification" ask in the concrete benefit. The `♪` here is a **real Ionicon** (`musical-note`), not a Unicode glyph, inside the illustrative card.
- Copy kills the notification-fatigue objection head-on: "No marketing. No daily pings. Only your live ride." This is true — the app only posts the ride notification.
- **"Not now"** continues. Denial means **Tier-2 lock-screen controls are unavailable**, but per the amendment the **Tier-1 in-app controls still work** and the ride is **not blocked.** We surface a soft Home nudge that lock-screen controls are off.

**Transition in:** slide_from_right. **Out → SyncProgress:** slide_from_right.
**Edge cases:**
- **Denied:** set `notificationsDenied`; continue. On Android 13+, also means the foreground-service notification won't be visible to the user (the service still runs) — note this for the in-ride spec; here we just record denial and move on. Home nudge: "Lock-screen ride controls are off. Turn on →".
- **Already granted** (returning user): brief success check, auto-advance, skip the prompt.
- **Provisional authorization (iOS):** treat as granted-enough; controls work. No special UI.
**Error states:** `requestPermissionsAsync` throws → treat as denied, continue. Never block.
**Empty:** N/A.
**Haptics:** light on tap; success haptic on grant; warning on deny.
**A11y:** the faux preview card is labeled "Example: lock-screen ride controls, Mute and End buttons." Reassurance line read after the body.

---

### 4.7 SyncProgress (NEW screen — replaces inline sync on old Connected)

The first starred-segment sync. `syncStarredSegments(token, onProgress, { listOnly: true })` — list-only here (fast, 1 API call); polyline detail fetch is deferred to ride-prep, matching the as-built `ConnectedWrapper` behavior.

```
┌─────────────────────────────────┐
│ SYNC PROGRESS                    │
│ Route: AuthStack/SyncProgress    │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│             Step 3 of 3          │  (no back — sync is committing)
├─────────────────────────────────┤
│                                 │
│                                 │
│         ┌──────────┐            │
│         │ ◠ spinner │           │  gold ring spinner (ActivityIndicator
│         └──────────┘            │  gold) OR animated count-up
│                                 │
│   Pulling your starred          │  ← 24/700 textPrimary, centered
│   segments…                     │
│                                 │
│        12 found                 │  ← live count, 17/600 gold, updates
│                                 │     from onProgress (done/total)
│                                 │
│   This is the only network call │  ← 13/400 textMuted
│   before you ride.              │
│                                 │
│                                 │
├─────────────────────────────────┤
│  (no CTA — auto-advances on      │
│   complete; sync is fast)        │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- Runs sync on mount. `onProgress` updates the live "N found" count (`progress.total` once the list returns). On `phase: 'complete'`:
  - `total >= 1` → call `setLastSegmentSyncAt(now)` (matches as-built) → auto-advance to **ReadyHandoff**.
  - `total === 0` → auto-advance to **ZeroStarred** fork.
- **No CTA.** List-only sync is ~1 API call; this screen is typically on-screen <2s. If it exceeds ~8s, show a quiet "Taking longer than usual…" sub-line (does not block).
- This is the only place a spinner is acceptable in FTUE — and it's narrated ("This is the only network call before you ride"), not a dead spinner.

**Transition in:** slide_from_right. **Out:** cross-fade to Ready or ZeroStarred (350ms) — feels like a result resolving, not a navigation.
**Edge cases:**
- **Sync error / network failure** (`phase: 'error'` or thrown): do NOT dead-end. Match as-built's graceful degrade — advance to **ReadyHandoff** with a soft note "Segments will sync on your first ride" (the engine/ride-prep re-syncs). Auth still commits; the rider is not blocked by a flaky network during onboarding.
- **Token expired during sync** (rare, just-issued token): treat as sync error → degrade path above; a 401 reconciler/refresh handles it on first ride.
- **Sync already in progress** (the service has a global lock): `syncStarredSegments` joins the existing promise — safe.
**Error states:** covered above — errors degrade to ReadyHandoff, never a hard stop.
**Empty:** the `total === 0` case is a *fork*, not an error — routed to ZeroStarred (next screen).
**Haptics:** success haptic when count first appears; success on complete.
**A11y:** live region announces "Found N segments." Spinner has `accessibilityLabel="Syncing segments"`.

---

### 4.8 ZeroStarred fork (NEW — the "0 starred" path)

The product is dead without starred segments — but this must **teach, not punish.** The rider likely doesn't know "starred segments" is the unlock.

```
┌─────────────────────────────────┐
│ ZERO STARRED                     │
│ Route: AuthStack/ZeroStarred     │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│         ┌──────────┐            │
│         │  [star]   │           │  large filled "star" Ionicon, 40dp,
│         └──────────┘            │  gold (NOT a warning — this is an
│                                 │  invitation, not an error)
│   You haven't starred any       │  ← 28/700 textPrimary
│   segments yet.                 │
│                                 │
│   Veloscape coaches the segments│  ← 15/400 textSecondary
│   you star in Strava. Star a    │
│   few of your regular climbs or │
│   sprints, then come back.      │
│                                 │
│   ┌───────────────────────────┐ │
│   │ How to star a segment:    │ │  steps card, surface+border
│   │ 1. Open a segment in      │ │
│   │    Strava                 │ │
│   │ 2. Tap the star icon ☆     │ │  (illustrative; uses Ionicon in real UI)
│   │ 3. Come back & sync       │ │
│   └───────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  Open Strava to star      │  │  ← gold pill 56dp → deep-link Strava
│  └───────────────────────────┘  │     (strava:// app, fallback web)
│   I've starred some — re-sync   │  ← ghost gold text → re-run sync
│   Continue without segments     │  ← ghost textDim → Home (limited)
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- Three actions, ranked:
  1. **"Open Strava to star"** (primary, gold) → deep-link `strava://` (try app; fall back to `https://www.strava.com/segments/starred` in browser).
  2. **"I've starred some — re-sync"** (secondary ghost gold) → re-runs `syncStarredSegments(listOnly)` *in place*; on success with `total >= 1`, routes to ReadyHandoff. This is the loop a returning rider closes after starring in Strava and switching back.
  3. **"Continue without segments"** (tertiary ghost dim) → commits auth, lands on Home. Home shows a persistent (non-dismissible until resolved) empty-state card: "No starred segments yet — Veloscape can't coach until you star some in Strava. Star segments →". This matches the original spec's empty-state intent without dead-ending the install.
- **Tone:** gold star icon, inviting copy — *not* a red error. The rider didn't do anything wrong; they just haven't set up the data source yet.

**Transition in:** cross-fade from SyncProgress. **Out:** "Open Strava" → external app (no screen transition; `AppState` listener can auto-trigger re-sync on return). Re-sync success → cross-fade to ReadyHandoff. Continue → MainTabs.
**Edge cases:**
- Returns from Strava app → on `AppState active`, optionally auto-fire re-sync (with a subtle "Checking for new stars…" inline state) so the rider doesn't have to find the re-sync button.
- Re-sync still finds 0: stay on this screen, brief inline "Still no starred segments" toast under the re-sync button. No navigation.
- Strava deep link fails (app not installed): fall back to the web URL via `Linking.openURL`.
**Error states:** re-sync network error → inline "Couldn't reach Strava — try again" under the button; stays put.
**Empty:** this screen *is* the empty state.
**Haptics:** light on each tap; warning haptic if re-sync returns 0 again.
**A11y:** title is the heading; steps are an ordered list; the three actions are clearly ranked by VoiceOver order.

---

### 4.9 ReadyHandoff (NEW — replaces old Connected's "Let's Go")

The confident close. Shows the real outcome and one tap into the product. **This is where `setAuth` commits** (and the `riders` DB upsert runs), flipping the app from `AuthStack` to `MainTabs`.

```
┌─────────────────────────────────┐
│ READY HANDOFF                    │
│ Route: AuthStack/ReadyHandoff    │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│         ┌──────────┐            │
│         │ [checkmrk]│           │  big filled "checkmark-circle" Ionicon,
│         └──────────┘            │  48dp, success green in successDim circle
│                                 │
│        You're ready             │  ← 28/700 textPrimary
│                                 │
│   12 segments loaded. Pop in     │  ← 15/400 textSecondary
│   your earbuds, pick a mode, and│
│   hit start. The coach takes it │
│   from there.                   │
│                                 │
│   ┌───────────────────────────┐ │
│   │ [check] Strava connected   │ │  final status card — only show what's
│   │ [check] 12 segments loaded │ │  GREEN/positive; degraded items get a
│   │ [info] Lock controls off   │ │  neutral info row + inline "Turn on"
│   │        (Turn on)           │ │  link, NOT a red error
│   └───────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │      Start riding         │  │  ← gold pill 56dp → setAuth() → Home
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────┘
```

- The status card summarizes the flow's outcomes. **Granted things are green checks; missing-but-non-blocking things (background location not "always", notifications off) are neutral `info`/amber rows with an inline "Turn on" / "Fix" link** — never red. The rider can ride right now; these are upgrades, not blockers. This replaces the as-built `statusLines` board, which now lives here (its final, resolved form) rather than on a screen doing live async work.
- **"Start riding"** runs the `setAuth(jwt, rider, tokens)` + `riders` upsert (moved from old `ConnectedWrapper.handleContinue`) → app root swaps `AuthStack` → `MainTabs`, lands on HomeTab.
- Copy reinforces the mental model one last time: *earbuds in, pick a mode, hit start, coach takes over.* That's the product in one sentence.

**Transition in:** cross-fade from SyncProgress (success haptic on mount). **Out:** root navigator swap to MainTabs (fade, 300ms) — feels like entering the app, not another push.
**Edge cases:**
- If both location and notifications were denied: still allow "Start riding" (coaching degraded but usable with screen on). The status card shows two neutral "Turn on" rows. We never trap a rider who declined permissions.
- If 0 segments somehow reached here (shouldn't — routed to ZeroStarred): the card shows "0 segments — star some to start coaching" with a link, and "Start riding" still works (Home empty state takes over).
**Error states:** `setAuth` / DB upsert is wrapped in try/catch (as-built already does); a failure logs and still commits the in-memory auth so the rider isn't stuck — Home tolerates a missing local rider row on the first ride's FK path (matches as-built warning-and-continue).
**Empty:** N/A.
**Haptics:** success notification haptic on mount; medium impact on "Start riding".
**A11y:** "You're ready. 12 segments loaded." Status card rows announce state ("Strava connected, done"; "Lock controls off, button: turn on"). CTA: "Start riding, enter the app."

---

## 5. Transitions catalogue (FTUE)

| From → To | Trigger | Animation | Duration | Back gesture |
|---|---|---|---|---|
| Welcome → Carousel | "Get Started" | slide_from_right | 300ms | swipe-right → Welcome |
| Welcome → StravaConnect | "I already have an account" | slide_from_right | 300ms | swipe-right |
| Carousel slide N → N+1 | "Next" / swipe | horizontal cross-fade (in-screen) | 200ms | swipe-left |
| Carousel → StravaConnect | "Connect Strava" / Skip | slide_from_right | 300ms | swipe-right |
| StravaConnect → (OAuth) | "Connect with Strava" | system browser sheet rises | OS | OS |
| (OAuth) → AuthSuccess | deep-link `veloscape://connected` | slide_from_right + medium haptic | 300ms | none (auth payoff) |
| AuthSuccess → LocationPrimer | "Continue" | slide_from_right | 300ms | swipe-right |
| LocationPrimer A → B | foreground granted | in-screen cross-fade | 250ms | — |
| LocationPrimer → NotificationPrimer | any outcome | slide_from_right | 300ms | swipe-right |
| NotificationPrimer → SyncProgress | any outcome | slide_from_right | 300ms | none (sync commits) |
| SyncProgress → Ready / ZeroStarred | sync resolves | cross-fade | 350ms | none |
| ZeroStarred → Ready | re-sync finds ≥1 | cross-fade | 350ms | none |
| Ready → MainTabs | "Start riding" | root swap, fade | 300ms | none |

All animations are spring-based where the navigator allows (per project motion principle: physical, not linear).

---

## 6. Permission state matrix (what lands on Home)

| Location FG | Location BG | Notifications | Segments | Home experience |
|---|---|---|---|---|
| ✅ | ✅ Always | ✅ | ≥1 | **Full** — screen-off coaching + lock controls. Zero nudges. |
| ✅ | ❌ while-using | ✅ | ≥1 | Coaching works screen-on; Home + PreRide nudge: "Allow all the time for screen-off coaching." |
| ✅ | any | ❌ | ≥1 | No lock-screen controls; Tier-1 in-app controls work. Home nudge: "Turn on ride controls." |
| ❌ | — | any | ≥1 | Home banner: "Location off — coaching can't detect segments." Ride start gated until enabled. |
| any | any | any | 0 | Home empty state: "Star segments in Strava to start coaching." (ZeroStarred reachable from here too.) |

**Decisive call:** only **location-foreground-denied** gates ride start (segment detection is impossible without it). Everything else degrades with an honest, dismissible nudge. We never block onboarding completion on any permission.

---

## 7. New / changed / reused components

### Reused (minimal/no change)
- `WelcomeScreen` — reuse; verify gradient + safe area (no change needed).
- `CarouselScreen` — reuse; **add 1 slide** ("Pocket your phone") + swap placeholder illustrations for real art / Ionicons.
- `StravaConnectScreen` + `StravaConnectWrapper` — reuse OAuth/deep-link logic as-is; **icon defect fix** (real Strava mark + Ionicon checks); add 60s "still waiting" hint.

### Changed
- `ConnectedScreen` → **`AuthSuccessScreen`** (rename optional; keep `Connected` route name for param compat). **Strip** inline sync + location request + `statusLines` async. Becomes a lean confirm+roadmap screen.
- `ConnectedWrapper` (`AuthStack.tsx`) — **major refactor**: remove inline `syncStarredSegments` + `requestForegroundPermissionsAsync`; **move `setAuth` + `riders` upsert** to the ReadyHandoff/ZeroStarred handlers; pass Strava token down to the new SyncProgress screen.
- `AuthStack` navigator — **add screens**: `LocationPrimer`, `NotificationPrimer`, `SyncProgress`, `ZeroStarred`, `ReadyHandoff`. Keep `Welcome`, `Carousel`, `StravaConnect`, `Connected`.

### New components
- **`LocationPrimerScreen`** — two-phase (rationale → upgrade-to-Always), platform-branched (iOS `requestBackgroundPermissionsAsync` vs Android `Linking.openSettings` + steps card), `AppState` re-check on Settings return.
- **`NotificationPrimerScreen`** — rationale + faux lock-screen-controls preview card; calls `expo-notifications` `requestPermissionsAsync` + registers `veloscape-ride` category.
- **`SyncProgressScreen`** — runs list-only sync, live count, routes to Ready vs ZeroStarred, degrades on error.
- **`ZeroStarredScreen`** — teach-and-recover empty fork; Strava deep-link + in-place re-sync loop.
- **`ReadyHandoffScreen`** — final status card + "Start riding"; commits auth.
- **`PermissionPrimer`** (shared layout primitive) — the common scaffold for Location/Notification primers: icon-in-tinted-circle, title, body, optional reassurance/steps card, primary "Allow" pill + ghost "Not now". DRY for the two primer screens.
- **`Stepper` / "Step N of 3"** marker — tiny shared header element.

### New dependency / config (per amendment)
- `expo-notifications` — added to deps + `app.json` plugins; `veloscape-ride` category with `mute`/`unmute`/`end`/`end-confirm` actions registered at app init (the NotificationPrimer triggers the permission request; the category powers the in-ride lock controls in the separate in-ride spec).
- Android: `POST_NOTIFICATIONS` (Android 13+) + `ACCESS_BACKGROUND_LOCATION` must be declared in the manifest (the latter is required for the "Allow all the time" Settings path to exist).

---

## 8. Copy bank (final, honest, decisive)

- Welcome tagline: *"The only coach who was there last time."* (keep)
- Carousel slide 2: **"Pocket your phone"** / *"The coach rides in your ear. Screen off, phone away — the voice does the work."*
- LocationPrimer A title: **"Let the coach follow your position — even in your pocket."**
- LocationPrimer A reassurance: *"We never track you off the bike. Location is used only during an active ride."*
- LocationPrimer B title: **"One more tap: 'Allow all the time.'"** / *"For screen-off coaching, Veloscape needs 'Allow all the time.'"*
- NotificationPrimer title: **"Control the coach from your lock screen."** / *"Mute a cue or end the ride without unlocking."* / footer: *"No marketing. No daily pings. Only your live ride."*
- SyncProgress: **"Pulling your starred segments…"** / *"This is the only network call before you ride."*
- ZeroStarred: **"You haven't starred any segments yet."** / *"Veloscape coaches the segments you star in Strava."*
- ReadyHandoff: **"You're ready"** / *"N segments loaded. Pop in your earbuds, pick a mode, and hit start. The coach takes it from there."*

Voice: direct, second-person, mechanic-honest. No "for the best experience," no growth-hack euphemism. The persona is a 44-year-old who pays for three apps and smells BS.

---

## 9. Defects in as-built FTUE this spec corrects

1. **Single overloaded `Connected` screen** doing sync + location + status inline → split into AuthSuccess / LocationPrimer / NotificationPrimer / SyncProgress / Ready.
2. **Foreground-only location**, never background → product can't do screen-off coaching as built. New two-phase LocationPrimer requests **"Allow all the time."**
3. **No notification priming anywhere** → no lock-screen ride controls. New NotificationPrimer + `expo-notifications`.
4. **No rationale before OS prompts** → the location dialog appears cold. Primers explain *why* first.
5. **Text glyphs used as icons** (`"S"`, `"✓"`) in StravaConnect/Connected → replace with real Strava mark `<Image>` + filled Ionicons (project rule: never Unicode/emoji as icons).
6. **`setAuth` fires mid-flow** (on Connected), bouncing the rider to MainTabs before priming → move auth commit to the final ReadyHandoff handoff so the rider stays in the welcoming AuthStack through permissions.

---

## 10. Accessibility summary

- Contrast: gold-on-bg 10.5:1 (AAA), textPrimary 13:1+, textSecondary `#888` on `#1C1C1E` ≈ 5.0:1 (AA body). Avoid putting `textMuted #555` on body copy — caption only.
- Touch targets: every CTA 56dp; ghost actions padded to ≥44dp tap height; "Step N of 3" back chevron ≥44×44.
- Each primer: title+body grouped as a heading region; steps cards as ordered lists; "Allow" buttons announce the cross-app consequence ("opens Settings").
- Live regions on SyncProgress count and grant confirmations.
- Reduce-motion: cross-fades fall back to instant; spring → ease.
- All icons are Ionicons with `accessibilityLabel`; none are decorative-only without a label except the progress dots (`accessibilityElementsHidden`).

---

## 11. Open questions (for founder review)

1. **Notification permission *timing*.** I placed it as its own primer *before* sync, inside FTUE, so the rider commits both make-or-break grants up front. Alternative: defer the notification ask to **first Start Ride** (just-in-time, highest intent). JIT often converts better — but it moves a make-or-break grant out of the controlled FTUE. **My call: ask in FTUE** (the product is explicitly background-first; better to fully equip the rider before they ride than discover dead controls mid-ride). Flag for founder: acceptable, or prefer JIT-at-Start?
2. **Background-location ask timing.** Same tension. Original `Sherpaa_ProductSpec.md` (line 196) explicitly says *"Do not request 'Always' on first prompt; request 'While Using' and upgrade to 'Always' at ride-start time."* The amendment's background-first reframe **supersedes that guidance** — screen-off coaching is now the *default* primary case, not an upgrade. I request foreground in FTUE and immediately offer the Always upgrade. **Confirm the supersession** is intended (I believe it is, per the amendment).
3. **"Continue without segments"** lands the rider on Home with a hard empty state. Acceptable, or should ZeroStarred be a soft *blocker* (no Home access until ≥1 segment)? I chose non-blocking (don't trap an install), but the product is genuinely useless with 0 segments.
4. **`AuthSuccess` starred count.** I omitted the count there (no pre-sync fetch) and show it on ReadyHandoff. If product wants the count earlier, we'd add a cheap count-only fetch on AuthSuccess.
5. **iOS notification "provisional" auth** — I treat provisional as granted-enough. Confirm we don't want the explicit (sound-bearing) authorization for the ride-control notifications to be reliably visible on the lock screen.
6. **Live Activity (iOS)** for a true persistent lock-screen control surface is out of scope per the amendment (Risk 5). FTUE here primes the *notification* path; if/when Live Activity ships, the NotificationPrimer copy ("lock screen") still holds.
7. **Screen count vs. "extreme simplicity."** The as-built FTUE is 4 screens; this spec is 9. Every added screen is task-justified (each make-or-break grant needs its own primed, single-idea moment, and the product is background-first). But the two *bookend* screens — `AuthSuccess` (the "three permissions next" roadmap) and `ReadyHandoff` (the "you're ready" summary) — are the most cuttable: a founder could reasonably ask "do I need a roadmap screen and a payoff screen wrapping the permission gauntlet?" **My call: keep both** — AuthSuccess removes the surprise of being asked for background location two taps after connecting (priming reduces denial), and ReadyHandoff is the confident close + the single place auth commits. If simplicity must win, AuthSuccess folds into a one-line subtitle on LocationPrimer and ReadyHandoff folds into a success state on SyncProgress — collapsing 9 → 7 without losing a permission step. Flagging the tradeoff explicitly since it's the most likely review note.
```
