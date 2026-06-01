# Quick-Start Modes — Home Flow + In-Ride HUD Deltas — DESIGN REVIEW DRAFT

*Design pass by Stencil | 2026-05-31*
*Status: **REVIEW DRAFT** — not the final DesignSpec, not component shells. For founder review before I cut the production spec + RN shells.*
*Amends: `Sherpaa_DesignSpec.md` (Home, RouteSetup, In-Ride), `PhoneAsCoach_DesignSpec.md` (In-Ride entry + HUD), `UnifiedHomeFeed_DesignSpec.md` (Home layout above the feed).*
*Implements: `docs/amendments/QuickStartModes_Amendment.md` (THE spec — flows, screen definitions, mode semantics).*

---

## 0. Scope & locked decisions (do not re-open)

This draft covers ONLY the surfaces the amendment changes:

1. **Default Home** — mode-first layout (greeting + sync → ModeSelector → Start Ride → Plan a route → Recent Rides feed → DebriefCTA).
2. **Mode-switch interaction** — chip selected/unselected states + haptic.
3. **No-starred-segments state** — Start Ride disabled + helper + refresh.
4. **Cold-cue state** — "cues still preparing" surfacing.
5. **In-Ride HUD deltas** — persistent mode chip (esp. Recovery) + "Next nearby: {name}" copy change.

**Founder decisions baked in (locked, not re-litigated):**

- **L1 — ~~Plan a route is DEMOTED, not deleted.~~ → DELETED ENTIRELY (rev 2, founder direction 2026-05-31).** The founder directed: *"Delete the plan a route option completely. I want the app to be simple."* There is **no** "Plan a route" row on Home, and the RouteSetup screen / PreRideBrief route-path / route-matching / on-demand cue-generation screen are all removed. The mode-first Quick-Start is the **only** entry into a coached ride. **Wherever this draft below shows or describes a "Plan a route" secondary row, that element is removed.** Home layout collapses to: greeting + sync → ModeSelector → Start Ride → Recent Rides feed → DebriefCTA. The no-starred-segments state no longer offers Plan-a-route as a fallback (the only path is star + sync; the Refresh affordance covers it). Cues now come solely from background pre-gen + the non-LLM fallback line.
- **L2 — Recovery is intentionally QUIET (deliberate, not broken).** Approach cue de-escalates; end cue is gentle; `start` and all `split` cues are suppressed. The quiet is made legible by a **persistent "Recovery" chip on the in-ride HUD**.
- **L3 — Default mode:** new users → **Training**; returning users → last-used (`settingsStore.lastGoalMode`).
- **L4 — NO new Pre-Flight screen.** The engine speaks the start line at `startRideEngine`. Home → InRide directly. Any "locking GPS…" affordance is a transient overlay on InRide, never a route.

**What I am NOT touching in this draft:** RouteSetup internals, Cue Generation screen, PreRideBrief (route path), PostRideSummary, Debrief, Paywall, tab bar, the detection engine. Those are untouched by the amendment except where noted.

---

## 1. Design-system tokens reused (no new tokens introduced)

Everything below is drawn straight from `Sherpaa_DesignSpec.md`. **This feature introduces zero new color/spacing/radius tokens.** That is deliberate — the whole point is that Quick-Start feels native to the existing surface.

| Need | Existing token / style reused | Value |
|---|---|---|
| Screen background (Home) | `bg` | `#1C1C1E` |
| In-Ride background | `bgDeep` | `#111111` |
| Card / row surface | `surface` | `#2A2A2A` |
| Card border | `border` | `#363636` |
| Subtle border (pills/HUD chip) | `borderSubtle` | `#2E2E2E` |
| Primary accent | `gold` | `#F5C842` |
| Tinted accent bg (HUD mode chip) | `goldDim` / `goldBorder` | `rgba(245,200,66,0.10)` / `(…,0.20)` |
| Text on gold | `textOnGold` | `#000000` |
| Primary text | `textPrimary` | `#F0F0F0` |
| Secondary text | `textSecondary` | `#888888` |
| Muted text (timestamps, helper) | `textMuted` | `#555555` |
| Dim text (section labels, disabled) | `textDim` | `#444444` |
| Error (sync fail) | `error` / `errorDim` / `errorBorder` | `#E5484D` / tints |
| Success (synced) | `success` / `successDim` / `successBorder` | `#30A46C` / tints |

**Component styles reused verbatim:**

- **`btn-gold`** (Primary CTA) — height 52–54px, full width, `borderRadius: 999`, bg `gold`, text `textOnGold` 17px/600, activeOpacity 0.85. → This is the **Start Ride** button.
  - *Note:* the spec also defines `btn-start` (58px, 18px/700) used as the one-instance Start button on PreRideBrief. **Decision:** Quick-Start's Start Ride uses **`btn-gold` (54px)**, NOT `btn-start`. Rationale: `btn-start` lives at the bottom of a full pre-ride brief where it's the sole focus of the screen; on Home it sits in a denser stack above the feed, and a 58px/700 button there would shout over the feed and the mode chips. 54px `btn-gold` keeps confidence-through-scale while preserving Home's hierarchy. (Open Q1 flags this for the founder.)
- **`goalChip` / `goalChipSelected`** (from RouteSetup goal chips) — height 36px, `borderRadius: 10`. Unselected: `surface` bg + `border` border + `textSecondary` text. Selected: `gold` bg + `textOnGold` text. → This is the **ModeSelector** chip style, reused exactly so PR/Training/Recovery look identical to the goal chips a Plan-a-route user already knows.
- **Surface card** — `surface` bg + `border` border + 12px radius + 20px padding. → The **Plan a route** secondary row.
- **Sync label states** (Home) — idle "Last synced Xh ago" / active "Syncing…" / success "Just now" / failure "Sync failed" (4s, `error`). Reused unchanged; pre-gen does NOT add a visible sync state.
- **RefreshControl** — `tintColor: gold`, pull forces segment sync + activity refresh. Reused unchanged; pre-warm hooks in *after* the existing sync completes (invisible).
- **HUD status pills** (In-Ride) — `surfaceElevated` bg + `borderSubtle` border + 999px radius (today: GPS pill, Audio pill). → The new **mode chip** is a sibling of these pills.

**Haptics reused (from the catalogue):**

| Event | Haptic |
|---|---|
| Mode chip change (selection) | **Selection** feedback (`Haptics.selectionAsync`) — matches the catalogue's "selection on chip change" |
| Start Ride tap (Primary CTA) | **Medium impact** — amendment Flow says "medium impact on Start" (stronger than the catalogue's generic "Primary CTA tap = Light"; Start is the highest-intent action on Home, so medium is the deliberate choice). Open Q2. |
| Pull-to-refresh release | Light impact (existing) |
| Sync failure | Error notification (existing) |
| Disabled Start Ride tapped | **None** (button is non-interactive; tapping does nothing — no error haptic, see §4) |

---

## 2. (a) DEFAULT HOME — full annotated layout

State: returning user, Strava connected, ≥1 starred segment, `lastGoalMode = 'training'` (the default), cues warm. This is the canonical happy-path Home.

```
┌─────────────────────────────────────────────┐
│ SCREEN: Home (mode-first, default)          │
│ Route: MainTabs → Home tab                  │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓ STATUS BAR ~54px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME — no content
├─────────────────────────────────────────────┤   (Home paddingTop accounts for this)
│                                             │
│  Good morning, Jane.            ┌───┐       │  ← greeting: 20px/600 textPrimary
│                                 │ J │       │     avatar: 36×36, gold bg, textOnGold
│                                 └───┘       │     (UNCHANGED from existing Home)
│  12 starred segments · Last synced 2h ago   │  ← 13px/500 textMuted. Sync label
│                                             │     cycles idle/Syncing…/Just now/
│                                             │     Sync failed exactly as today.
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │  GOAL MODE                          │   │  ← section label: 11px/600 textDim,
│   │  (11px/600 textDim, ALL CAPS, ls1.2)│   │     ALL CAPS, letterSpacing 1.2
│   │                                     │   │     (matches "RECENT RIDES" label style)
│   │  ┌────────┐ ┌──────────┐ ┌────────┐ │   │
│   │  │  PR    │ │ Training │ │Recovery│ │   │  ← ModeSelector: 3× goalChip
│   │  │        │ │  ●sel●   │ │        │ │   │     height 36px, radius 10
│   │  └────────┘ └──────────┘ └────────┘ │   │     Training = goalChipSelected
│   │   chip gap: 8px · equal flex widths  │   │     (gold bg, textOnGold)
│   └─────────────────────────────────────┘   │     PR/Recovery = goalChip
│                                             │     (surface bg, border, textSecondary)
│   ┌─────────────────────────────────────┐   │
│   │            Start Ride               │   │  ← btn-gold, 54px, full width,
│   │      (btn-gold · 54px · 17/600)     │   │     radius 999. THE primary action.
│   └─────────────────────────────────────┘   │     Tap → load starred IDs → InRide.
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │  Plan a route                    ›  │   │  ← demoted secondary row (L1).
│   │  Pick a route, set a goal, brief    │   │     surface card, 12px radius, 20px pad.
│   │  (13px/400 textMuted subtitle)      │   │     Title 15px/500 textSecondary (NOT
│   └─────────────────────────────────────┘   │     gold, NOT bold) — quiet by design.
│                                             │     chevron › in textDim.
│   RECENT RIDES                              │  ← 11px/600 textDim ALL CAPS ls1.2
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ [UnifiedHomeFeed — RideFeedRow×N]   │   │  ← UNCHANGED feed. RideFeedRow with
│   │  Morning Climb to Grizzly  APR 11   │   │     SyncStateBadge + CoachedPill +
│   │  42.1 km · 1:38:24         [▶ play] │   │     InlineAudioButton — all as-is.
│   │  [Synced from Strava] [Coached]     │   │
│   │  ─────────────────────────────────  │   │
│   │  Recovery spin            APR 8     │   │
│   │  18.4 km · 0:42:30        [▶ play]  │   │
│   │  [Phone-recorded] [Coached]         │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ [DebriefCTACard — conditional]      │   │  ← UNCHANGED. Keeps its existing
│   │  [♪] Hear a past ride debriefed  ›  │   │     placement near the feed (per
│   └─────────────────────────────────────┘   │     UnifiedHomeFeed / PhoneAsCoach).
│                                             │
│   ··· (ScrollView continues — feed,         │  ← whole screen is one scrollable
│        "Load more" / "See full history →")  │     ScrollView with the existing
├─────────────────────────────────────────────┤     RefreshControl (tint gold).
│  ⌂ Home   ◈ Segs   ◷ History   ⚙ Settings   │  ← tab bar, 83px (system, MainTabs)
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME
└─────────────────────────────────────────────┘
```

**Annotations / token mapping:**

- **Greeting + avatar + sync label:** unchanged from the existing Home (`HomeScreen.tsx`). 20px/600 `textPrimary` greeting, 36×36 gold avatar (gold bg, `textOnGold` initial), 13px/500 `textMuted` sync line. The "12 starred segments · Last synced 2h ago" line is the existing copy.
- **GOAL MODE label:** new, but reuses the exact "RECENT RIDES" label recipe — 11px/600 `textDim`, ALL CAPS, letterSpacing 1.2. Keeps the page rhythm consistent. (Note RouteSetup uses "GOAL FOR THIS RIDE" / 11px textMuted; on Home I use `textDim` to match the sibling "RECENT RIDES" section label — see Open Q3 on label parity.)
- **ModeSelector:** 3 chips in a row, equal `flex: 1`, `gap: 8`. Each chip is the RouteSetup `goalChip` (unselected) / `goalChipSelected` (selected) — height 36, `borderRadius: 10`. Selected chip: `gold` bg + `textOnGold` 13px/600. Unselected: `surface` bg + `border` border + `textSecondary` 13px/500. Labels: **"PR" / "Training" / "Recovery"** (note RouteSetup's first chip is "PR Attempt" — see Open Q3 on label parity).
  - Order is PR · Training · Recovery (matches the amendment table and RouteSetup's chip order: aggressive → moderate → recovery effort gradient, left-to-right).
  - Touch target: chip visual height is 36px; wrap each in min 44×44pt tap area (invisible vertical padding) to satisfy the 44pt rule. Chips fill the row width so horizontal target is generous.
- **Start Ride (btn-gold, 54px):** the single primary action. Full width within 20px screen padding, `borderRadius: 999`, `gold` bg, `textOnGold` 17px/600, activeOpacity 0.85. Sits directly under the ModeSelector with a 16px gap — mode + action read as one unit. No icon needed (label is unambiguous and the gold fill carries the weight); if an icon is wanted it must be a real vector (Ionicons `play` filled / lucide `Play`), never a `▶` glyph (Open Q4).
- **Plan a route (demoted, L1):** a single `surface` card (12px radius, 20px padding) with title "Plan a route" 15px/500 in `textSecondary` (deliberately NOT gold, NOT 700 — it must not compete with Start Ride; see the never-do "secondary must not compete with primary"), 13px/400 `textMuted` subtitle, `›` chevron in `textDim`. This replaces the old prominent "Plan Ride" gold-leaning card. Tapping → RouteSetup (unchanged route).
- **Recent Rides feed (UnifiedHomeFeed):** entirely unchanged. `RideFeedRow`, `SyncStateBadge`, `CoachedPill`, `InlineAudioButton`, "Load more" → "See full history →" — all as specified in UnifiedHomeFeed. Quick-Start rides save `provisional` and reconcile to Strava identically (per amendment "What Doesn't Change") and are denormalized `coached_by_sherpaa = true`, so they show the `Coached` pill.
- **DebriefCTACard:** unchanged, conditional. Keeps its existing slot near the feed (per PhoneAsCoach + UnifiedHomeFeed: it sits above/within the Recent Rides region; its prominence is naturally reduced by the populated feed). The amendment explicitly says "DebriefCTA keeps its place near the feed."

**Vertical order (top→bottom), per amendment Home layout spec:**
greeting + sync → **Mode selector** → **Start Ride** → **Plan a route** → Recent Rides feed → DebriefCTA.

> **Reconciliation note (vs. prior specs):** PhoneAsCoach/UnifiedHomeFeed put the **Plan Ride card first** (above DebriefCTACard, above feed) as the prominent gold-edged element. This amendment **inverts that**: the mode-first ModeSelector + Start Ride now own the top, and the old Plan Ride card is demoted to the quiet "Plan a route" row *below* Start Ride. The DebriefCTACard keeps its relative position near the feed. This is the intended, founder-approved change (L1) and supersedes the earlier "Plan Ride is the only gold-edged element above the fold" note in UnifiedHomeFeed — now **Start Ride** is that element.

**Spacing between blocks:** 24px between greeting block and GOAL MODE label; 12px label→chips; 16px chips→Start Ride; 12px Start Ride→Plan a route; 28px Plan a route→RECENT RIDES label. (All on the 4px scale; avoids `gap:10`.)

```
→ TRANSITION: Home → In-Ride (Start Ride tapped)
   Trigger: tap Start Ride (enabled state)
   Action: handler reads loadStarredSegments() → map .id → navigate('Ride',
           {screen:'InRide', params:{ segmentIds, goalMode: lastGoalMode }})
   Animation: full-screen fade to bgDeep (#111111), 400ms ease-in
              (reuses the existing "Ride start" transition from the catalogue —
              same as PreRideBrief → In-Ride today, so Quick-Start and Plan-a-route
              enter the ride identically)
   Back gesture: none during ride (ride is a modal-style full screen; exit is the
                 End Ride hold). Standard for In-Ride.
   Note (L4): NO Pre-Flight screen. The engine speaks "GPS locked. {N} segments
              loaded. Goal: {mode}. Let's go." on mount. If a "locking GPS…"
              affordance is wanted it is a transient overlay ON InRide, not a route.
```

```
→ TRANSITION: Home → RouteSetup (Plan a route tapped)
   Trigger: tap the Plan a route secondary row
   Animation: slide left, 300ms spring (existing "push navigation" default)
   Back gesture: swipe right / system back returns to Home (unchanged)
```

**Edge cases (Default Home):**
- Sync in progress on mount → sync label shows "Syncing…"; ModeSelector + Start Ride remain fully interactive (mode selection never depends on sync). Pre-warm runs invisibly after sync.
- `lastGoalMode` not yet set (first run after install but onboarding done) → defaults to **Training** selected (L3).
- Feed empty (no rides yet) → Recent Rides shows the existing empty copy ("No rides in the last 30 days." / "Your next ride will appear here automatically." per UnifiedHomeFeed). ModeSelector + Start Ride still present and usable — this is the key new-user win: they can start a coached ride with zero history.

**Error states (Default Home):**
- Sync failure → label "Sync failed" in `error` for 4s then reverts (existing behavior). Does NOT disable Start Ride if cached starred segments exist.

**Empty state:** see §4 (no starred segments). Note: empty *feed* ≠ empty *segments* — they're independent.

**Haptics:** mode chip change → selection; Start Ride → medium impact; pull-refresh release → light (existing).

**Accessibility:**
- ModeSelector: expose as a radiogroup. Each chip `accessibilityRole="radio"`, `accessibilityState={{selected}}`, label e.g. "Recovery mode". Selected chip announces "selected".
- Start Ride: `accessibilityRole="button"`, label "Start ride in {mode} mode". When disabled, `accessibilityState={{disabled:true}}` and the helper text is associated.
- GOAL MODE / RECENT RIDES labels: `accessibilityRole="header"`.

---

## 3. (b) MODE-SWITCH INTERACTION — chip states + haptic

The ModeSelector is a pure presentational 3-chip segmented control. Selection is the only interaction.

```
UNSELECTED chip                    SELECTED chip
┌──────────┐                       ┌──────────┐
│   PR     │  surface (#2A2A2A)    │ Training │  gold (#F5C842) bg
│          │  border (#363636) 1px │   ●●●    │  textOnGold (#000) text
└──────────┘  textSecondary 13/500 └──────────┘  13px/600 (slightly heavier)
   = goalChip                          = goalChipSelected
```

**Interaction spec:**
- Exactly one chip selected at all times (radiogroup). Default = `lastGoalMode`.
- Tap an unselected chip:
  1. **Haptic:** `Haptics.selectionAsync()` (selection) — fires immediately on press-in for tactile snappiness.
  2. **Visual:** tapped chip animates surface→gold (bg + text color) over ~120ms ease-out; previously-selected chip animates gold→surface simultaneously. (Color cross-fade only; no scale/position change — keeps it calm.)
  3. **Persist:** call `settingsStore.setLastGoalMode(mode)` immediately (write-through; not deferred to Start). So if the rider switches to Recovery and backgrounds the app, next launch pre-selects Recovery.
- Tap the already-selected chip: no-op, no haptic (avoid haptic spam).
- activeOpacity on press: 0.85 (matches button convention) — brief dim on press-in before the color settles.

**Why persist on switch, not on Start:** the amendment's pre-gen warms `lastGoalMode` at sync time, and `lastGoalMode` is the next-launch default. Writing on switch (a) makes the default sticky even if the rider doesn't start a ride this session, and (b) lets the *next* sync warm the mode they actually prefer. Risk #3 in the amendment (switching → cold cache for the new mode) is accepted; this draft doesn't try to re-warm on switch (that's engine/service scope, out of design scope). Open Q10 flags persist-on-switch vs persist-on-start.

**Mode is fixed for the ride** (amendment): there is NO in-ride mode switcher. The HUD chip in §6 is a *status indicator*, not a control.

**Haptics:** selection on every actual change; none on re-tapping the current mode.
**Accessibility:** radiogroup as in §2; on change, VoiceOver announces the newly-selected chip's label + "selected".

---

## 4. (c) NO-STARRED-SEGMENTS STATE — Start disabled + helper + refresh

State: Strava connected but `getStarredSegmentCount() === 0` (new user who hasn't starred anything, or sync hasn't pulled stars yet). The amendment ties this to the existing `canStartRideDirectly` prop (false when count 0).

```
┌─────────────────────────────────────────────┐
│ SCREEN: Home — no starred segments          │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓ STATUS BAR ~54px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
├─────────────────────────────────────────────┤
│  Good morning, Jane.            ┌───┐       │
│                                 │ J │       │
│                                 └───┘       │
│  No starred segments · Last synced 2h ago   │  ← count copy reflects 0
│                                             │
│   GOAL MODE                                 │
│   ┌────────┐ ┌──────────┐ ┌────────┐        │  ← ModeSelector STILL interactive.
│   │  PR    │ │ Training │ │Recovery│        │     The rider can still pick a mode;
│   └────────┘ └──●sel●───┘ └────────┘        │     selection just can't start yet.
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │            Start Ride               │   │  ← btn-gold, DISABLED.
│   │      (opacity 0.35 · 54px)          │   │     opacity 0.35 (the spec's disabled
│   └─────────────────────────────────────┘   │     convention for the gold CTA).
│                                             │     Non-interactive: no nav, no haptic.
│   ┌─────────────────────────────────────┐   │
│   │ ⓘ  Star segments on Strava, then    │   │  ← helper card. surface bg, border,
│   │    sync to start a coached ride.    │   │     12px radius. Icon = Ionicons
│   │                                     │   │     "information-circle" (filled), 18px,
│   │              [ ⟳  Refresh ]         │   │     textSecondary. Body 13px/400
│   └─────────────────────────────────────┘   │     textSecondary.
│                                             │     Refresh = outline-compact:
│   ┌─────────────────────────────────────┐   │     transparent bg, borderStrong 1px,
│   │  Plan a route                    ›  │   │     radius 999, gold "Refresh" 14/600,
│   │  Pick a route, set a goal, brief    │   │     leading Ionicons "refresh"
│   └─────────────────────────────────────┘   │     (filled) 18px gold. minHeight 44.
│                                             │
│   RECENT RIDES                              │
│   No rides in the last 30 days.             │
│   Your next ride will appear here           │
│   automatically.                            │
├─────────────────────────────────────────────┤
│  ⌂ Home   ◈ Segs   ◷ History   ⚙ Settings   │
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────────────┘
```

**Annotations / token mapping:**
- **Start Ride disabled:** `btn-gold` at `opacity: 0.35` (the documented disabled treatment for the gold CTA on RouteSetup). `disabled` prop true → no `onPress`, no haptic, no navigation. Tapping it does nothing (no error shake, no error haptic — a disabled primary action should be inert, not punishing).
- **Helper card:** `surface` bg + `border` + 12px radius + 16px padding. Copy is built on the amendment's exact string: **"Star segments on Strava, then sync."** I expanded it slightly to "Star segments on Strava, then sync to start a coached ride." for standalone clarity (Open Q5 — confirm wording). Leading icon: Ionicons `information-circle` (filled) 18px `textSecondary` — a real vector, NOT an `ⓘ` glyph. Body 13px/400 `textSecondary`.
- **Refresh affordance:** a compact outline button inside the helper card — transparent bg, `borderStrong` 1px, `borderRadius: 999`, leading Ionicons `refresh` (filled) 18px `gold` + "Refresh" 14px/600 `gold` (mirrors `btn-listen`'s gold-on-outline treatment). minHeight 44. Tapping it triggers the SAME force-sync as pull-to-refresh (segment sync + activity refresh, bypass TTL), and the sync label transitions Syncing… → result. Gives a no-starred user an explicit "I just starred one, pull it in now" path without discovering the pull gesture.
- **ModeSelector stays live:** the rider can pre-pick a mode while empty; it persists. This means the moment a sync brings in stars, Start Ride enables with their mode already chosen — zero extra taps.
- **Plan a route still available:** L1 — planning is the fallback even with no stars (RouteSetup matches segments from a route, a different acquisition path).

**Transitions:**
- On successful refresh that finds stars → Start Ride cross-fades from opacity 0.35 → 1.0 (200ms), helper card collapses/removes (animate height collapse, 200ms `LayoutAnimation.easeInEaseOut`), count line updates ("12 starred segments · Just now").

**Edge cases:**
- Refresh tapped while already syncing → no-op (debounced; spinner already showing in sync label).
- Stars exist locally but stale (>7d cues) → this is NOT the disabled state; that's the cold-cue state (§5). Disabled is strictly count === 0.

**Error states:**
- Refresh fails → sync label "Sync failed" (`error`, 4s) + helper card remains; announce via `accessibilityLiveRegion="polite"` / iOS announcement (existing pattern).

**Empty state:** this *is* an empty state (the segment-empty case). The feed empty copy is independent and may show simultaneously.

**Haptics:** Refresh tap → light impact (matches "pull-to-refresh release" family); refresh failure → error notification (existing). Disabled Start → none.

**Accessibility:** disabled Start Ride `accessibilityState={{disabled:true}}` with hint "Star segments on Strava and sync to enable." Refresh button labelled "Refresh segments and activities."

---

## 5. (d) COLD-CUE STATE — "cues still preparing"

State: `getStarredSegmentCount() > 0` (so Start Ride is **enabled** — the ride is never blocked), BUT pre-gen hasn't produced fresh (≤7d) cue rows for the selected mode yet (new stars, mode never warmed, or pre-gen mid-flight / offline). Per amendment Risk #2 + Failure paths: the ride still starts; uncued segments fall back to the non-LLM approach line.

**Design principle:** cold cues are a *soft, non-blocking* condition. It must NOT look like an error and must NOT disable Start Ride. It is a quiet reassurance, not a warning.

**Where it surfaces:** an inline note directly **under the Start Ride button**, only when cold-for-selected-mode is true. It does not occupy the sync label (that's for sync state) and it does not gate anything.

```
   ┌─────────────────────────────────────┐
   │            Start Ride               │   ← btn-gold, ENABLED (full opacity)
   └─────────────────────────────────────┘
     ♪  Coaching cues are still preparing —     ← inline note, centered, 12px/500
        your ride will start now and cues          textMuted. Leading icon: Ionicons
        fill in shortly.                            "musical-notes" (filled) 14px gold.
                                                     NO card, NO border — just text +
                                                     icon, so it reads as a whisper.
```

**Annotations / token mapping:**
- Inline note: 12px/500 `textMuted`, centered under the button, 8px gap. Leading icon Ionicons `musical-notes` (filled) 14px `gold` (ties it to the audio/cue system; gold signals it's about coaching, not a problem). **No card, no border, no error color** — this is the lightest-weight surfacing in the design system, intentionally below the visual weight of the helper card in §4.
- Copy (amendment's intent "cues are still preparing"): **"Coaching cues are still preparing — your ride will start now and cues fill in shortly."** Tone: reassuring, forward. Avoids "missing," "error," "failed." (Open Q6 — confirm copy + whether to surface at all vs. fully silent.)
- **Switching mode can re-trigger it:** if the rider switches to a mode that's cold (Risk #3), the note appears for that mode. It disappears when the selected mode is warm. Because mode selection is instant and the note is reactive, this is honest feedback that switching to e.g. Recovery may be less-coached this session.

**Why under the button and not a banner:** a banner (sync-pending style, `goldDim` bg) would over-dramatize a non-event — the ride is fully functional. The existing "Cached cues banner" / "Sync pending" banner styles are reserved for states the user should act on. Cold-cue is not actionable (you just start). So: whisper, not banner. (Open Q6 lets the founder upgrade it to a banner if they want it louder.)

**Transitions:**
- Pre-gen completes for the selected mode while on Home → the note fades out (200ms). No layout jump (it's a single line; collapse its height).
- Mode switch to a cold mode → note fades in (200ms).

**Edge cases:**
- Partial warmth (some segments cued, some not) → still show the note (any cold segment in the selected mode triggers it). The ride mixes LLM cues + fallback lines per segment; the rider needn't know which.
- Fully warm → no note at all (the default Home in §2).
- Offline + cold → note still shows; ride still starts on fallback lines (amendment failure path). Note copy unchanged (Open Q6 asks whether offline should reword to "cues will prepare when you're back online").

**Error states:** none — cold cues are not an error. If pre-gen itself errors, it's swallowed/logged (amendment) and this same note covers it.

**Empty state:** N/A (this state requires ≥1 starred segment).

**Haptics:** none (no interaction).
**Accessibility:** note carries `accessibilityLabel="Coaching cues are still preparing. Your ride will start now and cues fill in shortly."` Not a live region (non-urgent); read in normal traversal.

---

## 6. (e) IN-RIDE HUD DELTAS — mode chip + "Next nearby" copy

The In-Ride screen (`Screen 9 — In-Ride Active`, `bgDeep` #111111) is **structurally unchanged**. Two deltas only: (1) a persistent **mode chip** in the status-pill row, and (2) the "NEXT SEGMENT" card copy changes to **"NEXT NEARBY"** to stop implying a fixed route.

```
┌─────────────────────────────────────────────┐
│ SCREEN: In-Ride Active (Recovery shown)     │
│ Route: Ride → InRide  (bgDeep #111111)      │
├─────────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓ STATUS BAR (paddingTop 54px) ▓▓▓▓▓│
├─────────────────────────────────────────────┤
│  1:04:22        [Recovery] ● GPS  ♪ On     │  ← status-pill ROW. NEW: mode chip,
│  (13px/600                                  │     leftmost of the right-aligned pills.
│   textPrimary)                              │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ NEXT NEARBY          2.4 km away    │   │  ← CHANGED copy: "NEXT NEARBY"
│   │ Hawk Hill            (22px/700 gold)│   │     (was "NEXT SEGMENT"). goldDim bg
│   └─────────────────────────────────────┘   │     + goldBorder — UNCHANGED card.
│                                             │
│                   18                        │  ← speed: 112px/800 textPrimary
│                (112px/800)                  │     (Recovery → lower numbers, but
│                  KM/H                       │     layout identical)
│                                             │
│      138    │    —    │    24.8             │  ← bpm / watts / km row UNCHANGED
│      bpm    │  watts  │     km              │
│                                             │
│              ■  End Ride                     │  ← End Ride hold, UNCHANGED
│         (outline, 2s hold, bottom 40)        │
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← SYSTEM CHROME
└─────────────────────────────────────────────┘
```

### Delta 1 — persistent mode chip

```
[ Recovery ]            (Recovery — the load-bearing case, L2)
 └ goldDim (#…0.10) bg, goldBorder (#…0.20) 1px, radius 999, height ~22px
   "Recovery" 11px/600 gold (match GPS/♪ pill caps treatment)
   leading icon: Ionicons "leaf" (filled) 12px gold  ← signals "easy/recovery"
```

- **Placement:** in the existing top status-pill row, as the **leftmost** of the right-aligned cluster `[mode] ● GPS  ♪ On`. The mode chip is the most ride-defining status, so it leads the cluster. The elapsed timer stays far-left (unchanged).
- **Style:** sibling of the GPS/Audio pills but **gold-tinted** (`goldDim` bg + `goldBorder` border) rather than the neutral `surfaceElevated`/`borderSubtle` of GPS/Audio. Gold tint = "this is a coaching mode," consistent with gold = coaching/PR/audio across the app. 11px/600 `gold` text, 999 radius, ~22px height.
- **All three modes show a chip** — PR, Training, Recovery — so the chip is a normal, expected element, which is precisely what makes Recovery's quiet read as deliberate (L2): the rider sees "Recovery" persistently, so silence = "Recovery is working," not "the app died."
- **Per-mode icon (real vectors, never glyphs):**
  - PR → Ionicons `trophy` (filled) 12px gold
  - Training → Ionicons `barbell` (filled) 12px gold (or `fitness`) — Open Q7
  - Recovery → Ionicons `leaf` (filled) 12px gold
- **Recovery emphasis:** because Recovery suppresses `start` + all `split` cues, the rider goes long stretches with no audio. The chip is the persistent visual contract that this is intentional. Optionally (Open Q8) the NEXT NEARBY card in Recovery could carry a tiny "easy" affordance, but I'd keep the card identical and let the chip do the work — less is more here.
- **Status indicator only, NOT a control** — there is no in-ride mode switch (amendment: mode is fixed for the ride). `accessibilityRole` is NOT "button"; it's read as text: "Recovery mode."

### Delta 2 — "NEXT NEARBY" copy change

- **Card label changes from "NEXT SEGMENT" → "NEXT NEARBY".** Everything else about the card is unchanged (`goldDim` bg, `goldBorder`, segment name 22px/700 gold, "X km away" right-aligned).
- **Why:** Quick-Start loads ALL starred segments with no route, so `nextSegmentId` is load-order, not route-order. "Next segment" / "next on route" implies a planned sequence that doesn't exist. **"Next nearby: {name}"** is honest — it's whichever starred segment you're physically closest to / approaching. (Amendment: copy-only change.)
- **Label format options (Open Q9):** the card today uses a label "NEXT SEGMENT" (caps, separate line) + name below. Two ways to render the new copy:
  - (a) Keep the two-line card: label "NEXT NEARBY" / name "Hawk Hill" (shown above). Cleanest, minimal change.
  - (b) Inline "Next nearby: Hawk Hill" (the amendment's literal phrasing). Breaks the existing card's label/name hierarchy.
  - **My pick: (a)** — preserves the card's glanceable hierarchy (label tiny, name huge) which matters at 30km/h on a bike mount. The amendment's "Next nearby: {name}" is the *intent*; (a) honors it within the existing card shape.
- **Applies to all modes** (PR/Training/Recovery and even Plan-a-route rides) — there's no harm in "nearby" being accurate for route rides too, and keeping one copy avoids a mode-conditional string. (Open Q9 — or keep "NEXT SEGMENT" for Plan-a-route rides only? I recommend single copy.)

**Transitions:** none new — the HUD's existing segment-active overlay rise, segment-result flash, etc. all unchanged. The mode chip is static for the whole ride.

**Edge cases:**
- No `nextSegmentId` yet (just started, haven't approached anything) → NEXT NEARBY card shows the nearest starred by distance, or is hidden until one is within range (existing behavior — unchanged; copy-only delta).
- Recovery with a long silent stretch → mode chip persists; no other change. This is the intended quiet.
- Mode chip + GPS-lost: GPS pill turns red (existing); mode chip unaffected (mode doesn't depend on GPS).

**Error states:** unchanged from In-Ride (GPS loss, end-ride). The mode chip adds none.
**Empty state:** N/A (in-ride).
**Haptics:** unchanged (segment geofence = medium, PR = heavy+success). Recovery still fires the approach + end cues, so its existing approach geofence haptic (medium) still fires — another deliberate-quiet signal that the app is alive.
**Accessibility:** mode chip `accessibilityLabel="{Mode} mode"`, role text (not button). NEXT NEARBY card label updated in its `accessibilityLabel` ("Next nearby segment, Hawk Hill, 2.4 kilometers away"). In-ride safety rules unchanged (only End Ride is interactive).

---

## 7. Cross-cutting consistency notes

- **Plan-a-route parity (L1):** RouteSetup's goal chips already write `goalMode`; per amendment they now ALSO write `settingsStore.setLastGoalMode(mode)`. So a rider who plans a route in PR mode returns to a Home with PR pre-selected. The two entry paths share one source of truth. No design change to RouteSetup chips themselves — they're already `goalChip`/`goalChipSelected`.
- **No new tokens, no new core components** beyond `ModeSelector` (a thin wrapper over existing `goalChip`) and the in-HUD `ModeChip` (a thin gold-tinted variant of the existing status pill). Both are presentational.
- **Provisional/Strava reconcile + Coached pill (PhoneAsCoach + UnifiedHomeFeed):** Quick-Start rides save `provisional`, are `coached_by_sherpaa = true`, and show the SyncStateBadge + CoachedPill + InlineAudioButton in the feed exactly like Plan-a-route rides. No design delta — called out so the founder knows the feed behaves identically regardless of entry path.
- **Icons are real vectors everywhere** (project rule + design-system "Design Issues #1" flags the tab bar's glyph icons as debt): every icon in this feature is Ionicons filled — `information-circle`, `refresh`, `musical-notes`, `trophy`, `barbell`/`fitness`, `leaf`, optional `play`. **No Unicode/emoji glyphs** (`▶ ⟳ ♪ ⓘ 🏆`) in the shipped shells. (The ASCII wireframes above use glyphs purely as drawing placeholders — they map to the named vector icons.)

---

## 8. OPEN QUESTIONS for the founder

1. **Start Ride button weight — `btn-gold` (54px/17px/600) vs `btn-start` (58px/18px/700)?** I chose `btn-gold` so it doesn't overpower the feed on a denser Home. `btn-start` (the bigger PreRideBrief button) would read as more confident/primary but risks shouting over the mode chips + feed. Keep 54px, or go 58px for maximum "press me"?

2. **Start Ride haptic — Medium impact (amendment) vs Light (design-system "Primary CTA tap")?** The amendment Flow says "medium impact on Start." The catalogue says primary CTA tap = light. I went with **medium** (Start is the highest-intent action on Home). Confirm medium, or align to the catalogue's light?

3. **Mode chip labels — "PR / Training / Recovery" vs RouteSetup's "PR Attempt / Training / Recovery"?** RouteSetup's first chip is "PR Attempt." For the compact 3-up Home selector I shortened to "PR" (fits 3 equal chips cleanly, reads fine). Also: section label "GOAL MODE" (Home, `textDim`) vs RouteSetup's "GOAL FOR THIS RIDE" (`textMuted`). Accept the shorter Home variants, or unify labels across both surfaces?

4. **Icon on the Start Ride button — yes/no?** I'd ship it label-only (cleanest, label is unambiguous). If you want an icon it'll be a real vector (Ionicons `play` filled), never a `▶` glyph. Add the play icon, or label-only?

5. **No-starred helper copy.** Amendment string is "Star segments on Strava, then sync." I expanded to "Star segments on Strava, then sync to start a coached ride." for standalone clarity. Keep the expanded version or the terse original?

6. **Cold-cue surfacing — whisper, banner, or silent?** I chose a quiet inline line under Start Ride ("Coaching cues are still preparing — your ride will start now and cues fill in shortly"), no card/border. Options: (a) keep the whisper [my pick], (b) upgrade to a `goldDim` "Sync pending"-style banner (louder), (c) say nothing at all (fully silent, trust the fallback line). Also: should the **offline** variant reword to "cues will prepare when you're back online"?

7. **Training mode chip icon — `barbell` vs `fitness` (Ionicons)?** Both read as "structured effort." Which do you prefer? (PR=`trophy`, Recovery=`leaf` are settled unless you object.)

8. **Recovery extra affordance on the NEXT NEARBY card?** I deliberately kept the card identical across modes and let the persistent "Recovery" HUD chip carry the "this is intentionally easy" message. Want anything extra on the card in Recovery (e.g., a tiny "take it easy" subtext), or keep it clean (my pick)?

9. **"NEXT NEARBY" rollout — all rides, or Quick-Start only?** I recommend the single copy "NEXT NEARBY" for every ride (it's accurate even for route rides and avoids a mode-conditional string). Alternative: keep "NEXT SEGMENT" for Plan-a-route rides and only switch Quick-Start rides. Single copy, or conditional? Also confirm the two-line card format (label "NEXT NEARBY" + big name) over the literal inline "Next nearby: {name}".

10. **Mode persistence on switch vs on Start.** I persist `lastGoalMode` the instant a chip is tapped (sticky default even without starting a ride, and next sync warms the preferred mode). Acceptable, or only persist when a ride actually starts?

---

*End of review draft. On approval (and answers to the open questions) I'll fold these into `Sherpaa_DesignSpec.md` deltas and cut the RN component shells (`ModeSelector`, repurposed Home, `ModeChip` for the HUD).*
