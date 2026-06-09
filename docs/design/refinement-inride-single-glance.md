# Refinement — In-Ride Single-Glance Screen

*Design spec | flow owner: In-Ride screen | 2026-06-09*
*Authoritative source: `docs/amendments/InRideSingleGlanceAndLockScreenControls_Amendment.md`*
*Supersedes: the in-ride visuals in `Sherpaa_ProductSpec.md` Flow 3, the scrolling segment roster in `InRideScreen.tsx`, and the "InRideScreen visual layout: Unchanged" line in PhoneAsCoach.*

This spec covers ONLY the in-app In-Ride screen (Tier 1 controls). The notification surface (Tier 2) is a separate flow and is referenced here only where the two must stay consistent (label wording, mute state, confirm semantics).

---

## 0. Orientation

- **Actor:** Authenticated rider, route loaded, cues generated. Phone is **in a jersey pocket, screen off, ~95% of the ride.** They are physically exerting, possibly mid-sprint, eyes on the road. When they DO look, it is a sub-2-second glance, one-handed, in full sun, on a bumpy road.
- **Emotional state:** Two distinct moments.
  1. **Between segments** — relaxed, occasionally curious: *"how far in am I, how many segments left, is the coach still on?"* This is the **default and most-seen** state. It must answer those questions instantly and otherwise get out of the way.
  2. **In a segment** — high arousal, effort, wants ONE number: *am I ahead of my PR?* This is the rich `ActiveCard`, already built and good. We elevate it, we do not redesign it.
- **Overriding principle:** extreme simplicity. The screen is a glance, not a dashboard. If an element doesn't survive a half-second look on a bouncing bike, it is cut.

### Design rationale — why this layout

Color: unchanged from the established Veloscape system. Gold (`#F5C842`, AAA on `#111111`) is the single accent and is **reserved** for the live coaching signal and the active-segment card — the two things that mean "the coach is working." Mute deliberately **drains gold to neutral grey** so a half-second glance reads coach-state by *color presence*, not by reading a label. Red (`#E5484D`) appears only for GPS-lost and the End confirm — never decoratively. In the **between-segments** state there is exactly one gold element (the live dot) and we never place two gold elements adjacent. In the **active** state gold is intentionally concentrated (mode pill + coach dot + ActiveCard) because that IS the "you're on it, the coach is working" moment — the one time the screen is allowed to be loud.

Typography: the between-segments state shows **at most three numbers** (distance, segments-done, elapsed). The active state shows the timer as the hero. No card carries more than two type sizes in its primary read.

---

## 1. Component inventory — reuse vs. new vs. cut

| Component | Status | Notes |
|---|---|---|
| `ActiveCard` (in `InRideScreen.tsx`) | **REUSE — unchanged internals** | Lifted out of the ScrollView, rendered conditionally only when `currentSegment.state === 'active'`. Now the sole rich in-ride element. |
| Status row (elapsed + GPS + audio pills) | **CHANGE** | `♪` audio pill is **removed/absorbed** into the new `CoachingIndicator`. Mode pill + GPS pill stay. |
| 3-up metric strip | **CHANGE** | Repurposed. "segments" cell becomes the primary **"N of M done"**; speed cell **removed** between segments (speed is an active-only metric, already in ActiveCard); distance promoted. |
| `SegmentRow` | **CUT from this screen** | Component may remain in the file for post-ride reuse, but is **not rendered in-ride**. Wrapper stops building done/upcoming rows. |
| `ScrollView` board + `boardHeader` ("SEGMENTS") + `empty` text | **CUT** | Screen no longer scrolls. |
| `endRideBtn` (2s long-press) | **CHANGE** | Keep `delayLongPress={2000}`; add a visible **hold-progress fill** affordance + "Hold to End" label. |
| `CoachingIndicator` | **NEW** | Two-state (live / muted) glanceable indicator. Replaces the `♪` pill. |
| `MuteToggle` | **NEW** | Single-tap, large target (≥56dp), label+icon reflect state, haptic on tap. |
| `EndHoldButton` | **NEW (extract)** | The 2s-hold control with progress fill — formalizes existing behavior into a self-contained component. |
| Icon system | **NEW (system-wide fix)** | All Unicode glyphs (`♪ ✓ ○ ■`) replaced with `@expo/vector-icons` **Ionicons** filled variants. See §7. |

### `rideStore` additions consumed by this screen (per amendment Data Model)
```
cuesMuted: boolean              // ride-scoped; reset false on startRide/resetRide
setCuesMuted: (muted) => void
```
Engine actions the controls call (per amendment): `muteCoaching()`, `unmuteCoaching()`, `endRideAndSave()`.

---

## 2. STATE A — Between segments (DEFAULT, most-seen)

This is the primary screen. Design it as the hero, not a fallback.

> **The `approaching` state renders here.** `rideStore.SegmentState` has `'approaching'` (currentSegment is set ~500m out, state ≠ `'active'`). The render keys the ActiveCard on `state === 'active'`, so **approaching deliberately falls through to this between-segments layout** — it is audio-only (the approach cue, if not muted); no card appears until *entry*. Optionally, while approaching, the "Next: …" line flips to **"Approaching: Old Mill Climb · 480 m"** in gold, a glance signal that reinforces the spoken approach cue. The ActiveCard appears only on actual segment entry (§6).

```
┌─────────────────────────────────┐
│ IN-RIDE — BETWEEN SEGMENTS       │
│ Route: /ride/in-ride             │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ~24dp ▓▓▓▓▓▓▓│  ← SYSTEM CHROME — no interactive content
├─────────────────────────────────┤
│                                 │
│  0:42:18      [PR]  ●GPS  ●Coach│  ← Status row (see below)
│                                 │
│                                 │
│                                 │
│            12.4                 │  ← DISTANCE — hero metric
│             km                  │     64sp / 800 / textPrimary, mono
│                                 │
│         ───────────             │  ← hairline divider, colors.border
│                                 │
│           2 of 5                │  ← "N of M done" — second metric
│         segments done           │     34sp / 800 / textPrimary, mono
│                                 │
│                                 │
│   Next: Old Mill Climb · 1.2 km │  ← optional context line (see edge cases)
│                                 │     13sp / 600 / textSecondary
│                                 │
│  ···  (NO scroll — fixed)       │
│                                 │
├─────────────────────────────────┤
│  ┌──────────────┐ ┌──────────┐  │  ← Thumb-zone control row
│  │ 🔊  Coaching │ │ ■ Hold   │  │
│  │     on       │ │  to End  │  │
│  └──────────────┘ └──────────┘  │
│   MuteToggle 56dp   EndHold 56dp│
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓│  ← SYSTEM CHROME — no interactive content
└─────────────────────────────────┘
```

**Status row (top)** — single horizontal line, left-to-right:
- `elapsed` — `0:42:18`, 15sp / 700 / textPrimary, mono (tabular-nums). Always present; ride-total time.
- spacer (flex)
- **Mode pill** — `[PR]` / `[TRAINING]` / `[RECOVERY]`. Reuse existing `modePill` style (goldDim bg, goldBorder, 12sp/700/gold caps). Read-only.
- **GPS pill** — dot + "GPS". Reuse existing `pill`. Dot/text `success` when `gpsLocked`, `error` when not.
- **CoachingIndicator** — NEW, see §4. Sits rightmost (it is the most ride-relevant status). Live = gold animated dot + "Coach". Muted = grey muted-icon + "Muted".

**Center — two stacked metrics, vertically centered in the content area:**
- **DISTANCE** is the hero (largest). Rationale: between segments, "how far am I" is the dominant question and the number changes continuously, so a frozen/zero value (early ride) still reads fine. 64sp / 800 / textPrimary / letterSpacing -2 / mono. Unit (`km`/`mi`) below at 13sp / 600 / textMuted caps.
- **"N of M done"** second. `2 of 5` at 34sp / 800 / mono; label `segments done` 11sp / 600 / textMuted caps. This is the progress-through-route signal the cut roster used to carry.
- A 1px hairline (`colors.border`, ~40% width, centered) separates them. This is the ONLY divider; no cards, no boxes around the metrics — whitespace is the structure.

> Three numbers total on screen (elapsed in status row, distance, segments). Per amendment's "≤ 3 numbers" constraint. Speed is intentionally **absent** between segments — it belongs to effort, and effort lives in the ActiveCard.

**Bottom — control row (thumb zone), two controls side by side:**
- **MuteToggle** (left) — 56dp min height, ~48% width. Single tap. See §4 for states.
- **EndHoldButton** (right) — 56dp min height, ~48% width. 2s long-press with fill. See §5.
- `gap: 12` between them. Both inside bottom safe-area inset.
- Rationale for two-up (vs. the old single centered pill): both are now first-class pocket controls and both must be one-handed reachable. Mute is the more frequent action, so it gets the dominant left/thumb-natural position; End is gated behind a hold so adjacency is safe (no accidental destructive tap).

```
Safe area notes:
- Top inset: useSafeAreaInsets().top (Dynamic Island ~59pt / notch ~47pt / Android status ~24dp). Status row starts BELOW it.
- Bottom inset: useSafeAreaInsets().bottom (home indicator ~34pt / Android gesture ~48dp). Control row sits ABOVE it; never behind.
- Background: colors.bgDeep (#111111 OLED black) — minimizes burn-in + battery on the most-seen screen, maximizes sun contrast.
- All interactive content (2 controls) confirmed within safe bounds.

Transition in (from PreRideBrief → InRide): slide from right, standard 300ms (stack push). Status row + center fade up 200ms after mount.
Back gesture: swipe right / hardware back → leaves screen, RIDE KEEPS RUNNING (engine is independent; existing behavior, do not change).

Empty state (ride with 0 segments):
- Center shows DISTANCE + "0 of 0 — no segments" (segment metric reads "0 of 0", label "no segments on route").
- No roster, no "No segments loaded" body. Controls still present and functional.
- CoachingIndicator still shows live/muted (the coach can still speak ride start/end + debrief).

Loading state (first ~3s, GPS not yet locked):
- DISTANCE shows "0.0". GPS pill shows error-red "GPS". CoachingIndicator shows live (engine starts coaching prep).
- No spinner — the metrics simply read zero. A spinner would imply something is wrong; it isn't.

Haptics:
- None on passive viewing. (Haptics are reserved for the explicit control actions, §4/§5.)
Accessibility:
- Distance + segments grouped as one accessibilityElement: "12.4 kilometers, 2 of 5 segments done".
- Status row each pill labeled: "PR mode", "GPS locked"/"GPS searching", "Coaching on"/"Coaching muted".
- Contrast: textPrimary on bgDeep = 14:1; gold on bgDeep = 10.5:1; success/error pills ≥ 4.5:1. All pass.
```

---

## 3. STATE B — In a segment (ActiveCard elevated)

When `currentSegment.state === 'active'`, the center metric block is **replaced** by the existing `ActiveCard`. The status row and control row **remain** (the rider can still mute/end mid-segment).

```
┌─────────────────────────────────┐
│ IN-RIDE — ACTIVE SEGMENT         │
│ Route: /ride/in-ride             │
├─────────────────────────────────┤
│▓▓▓▓▓▓ STATUS BAR ~24dp ▓▓▓▓▓▓▓│
├─────────────────────────────────┤
│                                 │
│  0:42:18      [PR]  ●GPS  ●Coach│  ← Status row — UNCHANGED, persists
│                                 │
│  ┌───────────────────────────┐  │
│  │ ● ACTIVE   Old Mill Climb  │  │  ← ActiveCard (existing component)
│  │                           │  │
│  │  1:24            −3s       │  │  ← timer (52sp) | vs-PR gap (30sp)
│  │  elapsed       vs PR pace  │  │
│  │  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░       │  │  ← progress bar (gold fill)
│  │                           │  │
│  │  1.2km  6.4%  78m   2:31   │  │  ← stat row: dist/grade/elev/PR·efforts
│  └───────────────────────────┘  │
│                                 │
│  ···  (NO scroll — card fixed)  │
│                                 │
├─────────────────────────────────┤
│  ┌──────────────┐ ┌──────────┐  │  ← Control row — UNCHANGED, persists
│  │ 🔊  Coaching │ │ ■ Hold   │  │
│  │     on       │ │  to End  │  │
│  └──────────────┘ └──────────┘  │
├─────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓│
└─────────────────────────────────┘
```

- `ActiveCard` renders **exactly as built** (goldDim bg, gold border, live dot, 52sp timer, gap colored success/error, progress fill, 4-stat row). No internal change. It now occupies the content area that distance/segments held.
- **Muted while in a segment:** tracking and the live timer continue, so the **ActiveCard is unchanged — including its gold live-dot** (it reflects *segment* live-ness, not coach audio). Only the status-row CoachingIndicator flips to "Muted". This is intentional: a glancing rider sees a live gold card (the effort is being timed) AND a muted indicator (the voice is off) — two different facts, each true. The card never mutes; the coach does.
- The card is **vertically centered** in the content area (it was previously the first scroll item). On iPhone SE the card + status row + control row all fit without scroll (card is ~220dp; SE content area ~500dp). Confirmed at extremes.
- `gapToPreSeconds` color: ahead (≤0) = `success`, behind (>0) = `error`. If segment has no PR (`prTimeSec == null`), the gap block is hidden (existing behavior) — timer is then the sole hero, centered.
- **GPS-lost while active:** the ActiveCard timer keeps running off `enteredAt` (existing). The GPS pill flips red. The card does NOT error or freeze — a climb in a tunnel still times. (Per amendment failure path.)

```
Transition in: appears when segment is entered (see §6). Do NOT scroll the user — it cross-fades into the center region.
Back gesture: swipe right → leaves screen, ride + segment detection keep running.
Empty/edge: covered in §6 (entry/exit) and §8.
Haptics: a single light haptic on segment ENTRY (the screen just changed under their glance) — see §6.
Accessibility: ActiveCard labeled "Active segment Old Mill Climb, elapsed 1 minute 24 seconds, 3 seconds ahead of PR pace, 60 percent complete". Live region updates the gap on change (politeness: low, to avoid chatter — TTS already speaks splits).
```

---

## 4. CoachingIndicator + MuteToggle (the coach-state surface)

These two NEW components together answer "is the coach on?" and let the rider change it. They must be **visually linked**: the indicator reports state, the toggle changes it. Color is the carrier — gold = live, grey = muted.

### CoachingIndicator (status row, read-only, glanceable)

| State | Visual | Spec |
|---|---|---|
| **Live** | gold dot (gently pulsing) + "Coach" | dot 6dp `colors.gold`; pulse opacity 1→0.4→1 over ~1.6s (Reanimated `withRepeat`). Text 11sp/600 `gold`. Pill: `goldDim` bg, `goldBorder`. |
| **Muted** | filled mute icon + "Muted" | Ionicon `volume-mute` 14dp `colors.textSecondary`; text 11sp/600 `textSecondary`. Pill: `surfaceElevated` bg, `border`. **No gold anywhere.** |

The pulse is the *only* motion in the between-segments state. It signals "alive" without a number changing. When muted, motion stops entirely — the screen goes visually quiet, mirroring the audio going quiet. That stillness IS the muted affordance.

### MuteToggle (control row, bottom-left, single tap)

| State (`cuesMuted`) | Label | Icon | Fill / border |
|---|---|---|---|
| **false (live)** | "Coaching on" | `volume-high` (filled) | bg `surface`, border `border`, icon+text `textPrimary` |
| **true (muted)** | "Muted — tap to resume" | `volume-mute` (filled) | bg `surfaceElevated`, border `borderStrong`, icon+text `textSecondary`; a thin `gold` left-edge accent (2dp) hints "tap to bring the coach back" |

- **Single tap toggles.** No confirm (low stakes, reversible — per amendment).
- On tap → calls `muteCoaching()` / `unmuteCoaching()` (engine; sets `cuesMuted`, `stopTTS()`, speaks "Coaching muted" / "Coaching on"). The screen reacts to the store flag; it does not own the logic.
- **Icon-leads, label-confirms.** The `volume-high` vs `volume-mute` glyph is sufficient alone; the label is reassurance for the pocket-glance.
- Min height **56dp**, horizontal padding ≥20dp, icon 24dp. Touch target ≥ 56×N — exceeds 44/48 floor.

```
Flow — Mute (matches amendment "Mute / Unmute" flow):
  tap MuteToggle
    → light-impact haptic (immediate, fires before audio so the pocket-tap registers)
    → muteCoaching(): cuesMuted=true, stopTTS() kills in-flight cue, speak("Coaching muted")
    → MuteToggle flips to muted style; CoachingIndicator flips to "Muted"; pulse stops
  tap again (Unmute)
    → light-impact haptic
    → unmuteCoaching(): cuesMuted=false, speak("Coaching on")
    → both flip back to live; pulse resumes; cues fire on next trigger

Edge cases:
- Cue already queued when muted → stopTTS() clears queue + current utterance; only "Coaching muted" plays. Rider never hears a stale cue after muting. (Amendment failure path.)
- Rapid double-tap (mute→unmute fast) → store settles on final state; each transition still speaks its confirm; haptic per tap. Acceptable (it's reversible).
- Muted state PERSISTS across the between↔active transition and across screen unmount/remount (it's in rideStore, not local). Re-entering the screen mid-ride shows the correct mute state.
- Notification Mute (Tier 2) toggles the SAME cuesMuted → this screen's indicator + toggle update reactively with zero extra wiring. Single source of truth.

Haptics: Haptics.impactAsync(Light) on every tap, BEFORE the audio confirm.
Accessibility: role "switch", accessibilityState {checked: cuesMuted}, label "Coaching", value "on"/"muted". One toggle, not two buttons — VoiceOver announces the flip.
```

---

## 5. EndHoldButton — in-app End (2s long-press, anti-pocket-tap)

Formalizes the existing `delayLongPress={2000}`. The amendment requires it visibly communicate "hold" so a single tap obviously does nothing.

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│  ■  Hold     │  hold  │ ▓▓▓▓▓▓░░░░░  │  2s →  │  ■  Ending…  │
│   to End     │  ───►  │   Ending…    │  ───►  │              │
└──────────────┘        └──────────────┘        └──────────────┘
   idle (rest)            holding (fill grows)      complete → nav
```

- **Idle:** label "Hold to End", `stop` Ionicon (filled square `stop`) 24dp. bg `bgOverlay`, border `border`, text `textMuted`. Deliberately the QUIETEST element on screen — it must never compete with Mute or the gold coach signal. Destructive intent stays low-key until engaged.
- **On press-in:** a fill (`colors.error` at low opacity, `errorDim`→solid edge) animates left-to-right over **2000ms** (Reanimated `withTiming`, linear so the rider can time it). Label changes to "Hold to End… keep holding". Border tints `errorBorder`.
- **Fill reaches 100% at 2s →** `delayLongPress` fires → `Haptics.notificationAsync(Success)` (firm confirm) → `handleEndRide()`.
- **Release before 2s →** fill springs back to 0 (200ms), label resets. **Nothing happens.** (Amendment failure path: "Press released before 2s → nothing happens.")
- A single tap (no hold) is a press-in + immediate release → fill barely moves → resets. Visibly does nothing. This is the anti-pocket-tap guarantee.

```
Flow — End in-app (matches amendment "End Ride — In-App"):
  press & hold 2s
    → fill animates, label "keep holding"
    → at 2s: success haptic
    → handleEndRide(): endRideAndSave() [stopRideEngine → endRide → saveRide → set summary_viewed signal → dismiss notification]
    → navigate('PostRideSummary', {rideId})  [in-app path navigates; notification path does not]

Transition out (End → PostRideSummary): slide from right, standard 300ms (existing nav). Debrief speaks on PostRideSummary mount.

Edge cases:
- Pressed while IN a segment → still works; ends the ride mid-segment. The in-progress effort is handled by the engine's exit logic on stop (unchanged).
- App backgrounded mid-hold → press is cancelled by OS; fill resets; no end. Rider must use the notification End (Tier 2) when backgrounded.

Haptics: Haptics.notificationAsync(Success) ONLY at the 2s completion. No haptic on press-in (would imply the action fired). The growing fill is the press-in feedback.
Accessibility: label "End ride", hint "Double-tap and hold for two seconds to end the ride". (VoiceOver users: also expose a standard confirm via accessibilityActions {name:'end'} → present a confirm alert, since a timed hold is hard with VoiceOver. This is the a11y fallback for the hold gesture.)
```

---

## 6. TRANSITION — Between ↔ Active (the core animation)

This is the one transition that must feel right, because it happens under a glance and the amendment calls for "a quick cross-fade/slide, not a jarring full-screen swap."

```
→ TRANSITION: Between-segments → Active segment
   Trigger: rideStore.currentSegment.state becomes 'active' (engine, on segment entry GPS event)
   Animation: center region cross-fades. Distance+segments block fades out + scales 0.96 (150ms);
              ActiveCard fades in + scales 1.0 from 0.96 (220ms, spring, slight overlap).
              Status row + control row DO NOT move — they are the stable frame.
   Duration: ~250ms total, spring (damping ~18). Physical, not linear.
   Back gesture: n/a (state-driven, not nav).
   Haptic: Haptics.impactAsync(Light) on entry — the screen changed; a glance lands on something new.
   Audio: start cue fires here (if not muted, per mode). The haptic + visual + voice are one coordinated "you're on it" beat.

→ TRANSITION: Active segment → Between-segments
   Trigger: currentSegment cleared (engine, on segment exit) → completedSegments incremented
   Animation: ActiveCard fades out + scales 0.96 (150ms); distance+segments fades back in (220ms spring).
              "N of M done" increments — the new number animates: a quick count-up tick (e.g. 1→2) over 300ms so the glance catches that progress was made.
   Duration: ~250ms.
   Haptic: none here (the result cue + the count-up carry it; avoid over-buzzing).
   Audio: result cue fires (if not muted).
```

Implementation note: both blocks live in the same fixed content container; they are siblings whose opacity/scale are driven by `currentSegment` presence via Reanimated `withTiming`/`withSpring`. There is no `ScrollView` and no navigation — the swap is purely local state. This is cheaper to render than the old roster (no off-screen rows re-rendering) — a stated battery goal of the amendment.

---

## 7. Icon system (system-wide correction — REQUIRED by design system)

The current screen uses Unicode glyphs as icons: `♪` (audio pill), `✓`/`○` (segment dots), `■` (end button). **These are banned** — they render thin, vary by platform/font, don't scale, carry no weight (the exact Sherpaa failure the system flags). Every glyph below becomes an `@expo/vector-icons` **Ionicons** component (ships with Expo SDK; `react-native-svg` already installed; no new dep beyond `@expo/vector-icons` which is already transitively present in Expo apps).

| Old glyph | Where | New Icon (Ionicons, filled) | Size | Color |
|---|---|---|---|---|
| `♪` audio pill | status row | **removed** → replaced by CoachingIndicator dot/icon | — | — |
| (new) live dot | CoachingIndicator | `ellipse` (filled) or styled View dot | 8dp | gold |
| (new) muted | CoachingIndicator + MuteToggle | `volume-mute` | 14 / 24dp | textSecondary |
| (new) live audio | MuteToggle | `volume-high` | 24dp | textPrimary |
| `■` end | EndHoldButton | `stop` | 24dp | textMuted → error on hold |
| GPS dot | status row | keep styled View dot (not a glyph — fine) | 6dp | success/error |
| `✓`/`○` SegmentRow | (cut from this screen) | n/a — roster removed | — | — |

> Even though the roster is cut, the icon fix is called out so the wider InRideScreen file ships zero Unicode-as-icon glyphs. The mode pill text (`PR`/`TRAINING`) is real text, not an icon — fine as-is.

---

## 8. Consolidated edge / error / empty states

| Condition | Behavior |
|---|---|
| **0 segments on route** | Between-segments layout only; "0 of 0 — no segments"; controls present; CoachingIndicator live (start/end cues + debrief still work). No roster, no scroll body. |
| **GPS lost, between segments** | Distance freezes at last value (does not error); GPS pill → red. CoachingIndicator unaffected (coach logic is independent). No modal, no toast — a frozen number on a glance screen is self-explanatory; a popup would be worse. |
| **GPS lost, active segment** | ActiveCard timer keeps running off `enteredAt`; gap may stall; GPS pill red. Card does not error. (Amendment.) |
| **Muted at ride start** | Start "GPS locked, N segments…" cue is gated (engine `shouldFireCue` mute check). Screen shows live metrics, CoachingIndicator "Muted". |
| **Notification permission denied** | Tier 2 unavailable; Tier 1 (this screen's MuteToggle + EndHold) fully functional; ride not blocked. No in-screen error — the in-app controls are the floor. |
| **Notification Mute toggled (Tier 2)** | `cuesMuted` flips → indicator + toggle update reactively. No special handling needed in this screen. |
| **Backgrounded End fired (Tier 2), app later opened** | This screen never re-shows for that ride; launch-time router opens PostRideSummary (per amendment). Not this screen's concern beyond: if End fired while this screen is mounted (rare), the `isRideActive` flip should pop us to summary — guard so we don't double-navigate. |
| **Remount mid-ride (back then re-enter)** | Screen re-attaches to running engine (existing guard `isRideActive`); reads current `cuesMuted` + `currentSegment` from store → renders correct state. No restart. |
| **PR == null on active segment** | Gap block hidden; timer centered as sole hero (existing ActiveCard behavior). |
| **Very long segment name** | `numberOfLines={1}` + ellipsize (existing). |

---

## 9. Device-extreme checks

- **iPhone SE (small, no notch):** content area ~500dp. Between: status row (~32) + centered metrics (~180) + control row (~72) + insets → fits, generous whitespace. Active: status (~32) + ActiveCard (~220) + control (~72) → fits without scroll. Confirmed.
- **iPhone 15 Pro Max (Dynamic Island):** top inset ~59pt; status row clears it. Bottom inset ~34pt; control row sits above. Large whitespace in center — distance hero scales up gracefully (it's the biggest element by design).
- **Android 3-button nav:** bottom inset from `useSafeAreaInsets` (~48dp) keeps controls above the nav bar. `POST_NOTIFICATIONS` already requested by engine.
- **Android gesture nav:** ~24–48dp inset honored. Swipe-from-edge back = leave screen, ride continues.
- All four: controls remain one-handed thumb-reachable (bottom row), no interactive element in chrome zones.

---

## 10. Wrapper changes (`src/screens/wrappers.tsx` — `InRideScreenWrapper`)

The wrapper currently builds the full `board: BoardSegment[]` (done/active/upcoming) and computes `distanceAwayM` per upcoming segment. Per amendment, the roster is cut.

- **Stop building done/upcoming rows.** The wrapper needs only: `activeSegment` (or null), `doneCount`, `totalCount`, and optionally the `nextSegment` name+distance for the context line.
- New props passed to `InRideScreen`:
  - `activeSegment: BoardSegment | null` (only the active card's data, or null)
  - `doneCount: number`, `totalCount: number`
  - `nextSegmentName?: string`, `nextSegmentDistanceM?: number` (for the optional "Next: …" line; cheap haversine to next only, not all)
  - `cuesMuted: boolean`, `onToggleMute: () => void` (calls engine mute/unmute), `onEndRide` (unchanged, calls `endRideAndSave` then navigates)
  - keep `elapsedTime`, `distanceKm`, `gpsLocked`, `goalMode`
  - **drop** `speedKmh` from between-state (still passed to ActiveCard which uses it), **drop** `audioActive` (absorbed by CoachingIndicator driven by `cuesMuted`), **drop** `board`.
- `onEndRide` should call the new `endRideAndSave()` path (amendment §API) rather than the inline save-on-mount, but that refactor is engine/data scope — this screen just calls the handler.

---

## 11. Open questions for founder review

1. **"Next: …" context line** — I included an optional one-line next-segment hint (name + distance-to). It's the one piece of the old roster that arguably still earns its place on a glance ("what's coming"). Cut it for maximum purity, or keep it? My call: **keep it, single line, secondary color** — it's the rider's one forward-looking anchor and it's cheap. Flagging because it's the only non-amendment-mandated element.
2. **Distance vs. elapsed as the hero number.** I made **distance** the hero (continuous, answers "how far am I"). Elapsed lives smaller in the status row. Alternative: promote elapsed. Distance won because the cut roster's job was spatial progress, not time. Confirm.
3. **I inverted the amendment's Mute/End hierarchy — please confirm.** The amendment specifies Mute as "left/**secondary**" and End as "**the existing bottom pill**." I made **Mute the dominant control** and **End the quietest element on screen.** This is a real divergence from the authoritative doc, not just a reflow: my reasoning is (a) End is destructive + hold-gated, so it should never shout, and (b) Mute is the frequent pocket action and deserves the dominant, thumb-natural left position. Both still side-by-side at 56dp. If the founder wants the amendment's literal hierarchy (Mute quieter, End the prominent pill), it's a style swap. Flagging explicitly so the call is informed.
4. **Mute persists across the active transition** (it's ride-scoped store state) — confirmed correct per amendment, noting it so it's not mistaken for a bug.
5. **VoiceOver End fallback** — a 2s timed hold is hostile to VoiceOver; I specified an `accessibilityAction` → confirm-alert fallback. Confirm that's acceptable (it's the only place the in-app End deviates from a pure hold).
6. **Icon library** — specifying `@expo/vector-icons` Ionicons. It is bundled with `expo` but was **not** an explicit `package.json` entry in my check — verify it resolves at build, or add it (`npx expo install @expo/vector-icons`). If the team prefers `lucide-react-native`, names map 1:1 (`volume-2`/`volume-x`/`square`). Flagging the system-wide Unicode-glyph removal as in-scope cleanup for this file.

---

## 12. Summary of changes to ship (this screen)

- **Cut:** `ScrollView` board, `SegmentRow` rendering, `boardHeader`, `empty`, speed cell + `♪` audio pill between segments.
- **Add:** `CoachingIndicator` (live/muted), `MuteToggle` (single-tap, haptic, store-driven), `EndHoldButton` (2s fill), between-segments centered metric block, Reanimated cross-fade between states.
- **Keep:** `ActiveCard` (unchanged internals, now conditional + centered), status row (mode + GPS pills), 2s long-press End semantics, engine-independent back behavior, all color tokens.
- **Fix:** all Unicode-as-icon glyphs → Ionicons filled.
```

