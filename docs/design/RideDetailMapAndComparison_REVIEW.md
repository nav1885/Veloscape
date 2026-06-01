# Ride Detail — Route Map + Starred-Segment Performance vs the Past
## DESIGN REVIEW DRAFT

*Reviewing: `docs/amendments/RideDetailMapAndComparison_Amendment.md`*
*Upgrades the existing `PostRideSummaryScreen` (`Ride/PostRideSummary`) — both the live post-ride path and the replay (history) path.*
*Status: REVIEW DRAFT for founder sign-off. Not the final DesignSpec. No component shells yet.*

---

## 0. Read this first — what this review is and isn't

This is a **focused design pass on three internals of one existing screen**, not a screen redesign. The amendment and the locked decisions are explicit: we are upgrading `PostRideSummaryScreen`, the same component used by both the live "you just finished" path and the replay path (tap a ride from Home feed or History). Everything outside the three changed regions stays exactly as the `UnifiedHomeFeed_DesignSpec` already specified.

**The ONLY three things that change:**

1. **The map block** — the 200px `mapPlaceholder` `View` becomes a real `react-native-maps` `MapView` drawing the ride's GPS track as a gold polyline, auto-fit to bounds, with a marker at the start of each starred segment hit. The existing date/title + share button re-anchor as an absolute overlay on top of the live map.
2. **The segment-row note** — replay rows that said **"No history"** now read **"PR: 4:12"** (point-in-time PR) or **"First effort"**, with the gap pill, PR crown, and sparkline now mutually consistent.
3. **The sparkline body** — `SegmentEffortSparkline` becomes a real SVG trajectory (`react-native-svg`, being added) instead of the ASCII `╲•`/`─•`/`╱•` glyph. Geometry math is already written; only the render swaps.

**Everything else is UNCHANGED and shown only for context:** `MetricsBlock`, `SummaryText` (lazy LLM shimmer→loaded), the `InlineAudioButton size="lg"` CTA, the `SyncStateBadge` + `CoachedPill` badge row, the "Wrong activity?"/"Check again" affordances, the PR headline, and the 54px gold `Done` button. We do **not** restyle, re-pin, or re-token any of those. The locked decision "match the existing screen exactly" overrides any generic design-system default (e.g. we do NOT bump `Done` to 56px or pin it to a sticky footer — it stays the inline 54px `doneBtn` at the end of the scroll, as shipped).

**Tokens** referenced throughout are from `src/constants/colors.ts`: `gold` `#F5C842`, `goldDim` `rgba(245,200,66,0.10)`, `goldBorder` `rgba(245,200,66,0.20)`, `goldBorderStrong` `rgba(245,200,66,0.30)`, `mapBg` `#1A2030`, `mapRoad` `#243040`, `surface` `#2A2A2A`, `border` `#363636`, `borderSubtle` `#2E2E2E`, `textPrimary` `#F0F0F0`, `textSecondary` `#888888`, `textMuted` `#555555`, `textDim` `#444444`, `textOnGold` `#000000`, `success` `#30A46C`, `error` `#E5484D`.

**Existing style names** referenced are the actual `StyleSheet` keys in `src/components/PostRideSummaryScreen.tsx` (e.g. `mapPlaceholder`, `mapNav`, `mapDate`, `mapTitle`, `shareBtn`, `segCard`, `segCardPR`, `segNote`, `prTag`, `offTag`, `splitsArea`, `cueReview`) and the geometry in `src/components/SegmentEffortSparkline.tsx`.

---

## 1. Design intent — why these three changes look the way they do

**The founder's sentence has three verbs:** *see the map*, *see the segments I starred in the ride*, *see how I did vs the past*. Today the screen answers all three at half strength — the map is a flat placeholder, and on the replay path the comparison literally contradicts itself ("No history" sitting next to a 5-point trend line). This pass closes the gap with the smallest possible surface change.

**The map is the emotional anchor of "that was my ride."** A rider scrolling at the kitchen table the next morning wants the shape of the route to confirm the memory before any number does. So the map leads (it already does, at 200px) and the route is drawn in the single accent color the whole app reserves for performance — `gold`. The polyline is the ride; the markers are the moments that mattered (starred segments). Nothing else goes on the map. No distance label, no elevation chart, no mileage ticks — those live in `MetricsBlock` directly below and would only clutter the one glanceable shape.

**The comparison must be internally consistent at a glance.** The entire bug this amendment kills is "the text says one thing, the chart says another." So the three comparison signals in a segment row — the **PR-time note**, the **gap pill**, and the **sparkline's dashed PR baseline** — must all derive from the same point-in-time PR (`prTimeSec = timeSec − gapToPreSeconds`). Designed correctly, the eye can verify them against each other: the gold end-dot sits below the dashed line exactly when the gap pill is negative and exactly when the note's PR time is slower than today's time. That coherence *is* the design.

**Restraint on motion and chrome.** This is a recall surface, not a celebration surface (the live PR celebration already happened on the in-ride result screen). The map fades in once, the sparkline is a static glance object, and there is no new haptic. We borrow zero new attention.

---

## ⚠️ Top design tensions flagged for the founder (full list in §7)

Three things in the amendment create real design friction that I'm calling out up front because they affect how the screens above look:

- **T1 — Apple Maps tiles are LIGHT; the app is DARK.** The amendment picks `react-native-maps` with the default Apple Maps provider (to dodge the Google Maps API-key requirement). But RouteSetup deliberately uses **dark** CartoDB tiles via a Leaflet WebView precisely because Sherpaa is a dark, OLED-first, outdoor app — and because Google Maps SDK crashes on Android without a key. A bright Apple-Maps basemap with a gold polyline, sitting directly above `bgDeep`/`bg` dark surfaces, is a genuine aesthetic break and a brightness/eye-strain regression in the exact dawn/dusk conditions the color philosophy optimizes for. **Design response below assumes a dark map** (iOS `userInterfaceStyle="dark"` on `MapView`, or a custom dark `mapType`/style JSON). This is open question **Q1** and the highest-priority decision in this review — it may even reopen the provider choice (Leaflet-in-WebView for visual parity with RouteSetup vs `react-native-maps`).
- **T2 — Emoji-as-icons already ship on this screen.** `🏆` (PR crown) and `↑` (share) are Unicode/emoji today. The persona/design-system rule is "never emoji as icons." But migrating the whole screen to a vector icon library is **out of scope** for a map+comparison amendment and would touch unchanged regions. **Decision: leave existing `🏆`/`↑` as-is, log the debt (Q5).** The exception: the **net-new map segment markers are new design**, so they follow the icon rule properly (a real bold pin / gold dot, never an emoji) — see Q3.
- **T3 — Sparkline "down = faster" is counterintuitive but locked to code.** The shipped geometry (`SegmentEffortSparkline.tsx:61`) plots faster efforts LOWER on the chart, so "below the dashed PR line = faster than PR." The amendment's parenthetical ("faster=higher") contradicts this but explicitly defers to the existing spec. **We design to the code (down = faster).** Raised as Q4 because "down = better" reads backwards to most riders and is worth a founder ruling.

---

## (a) Replay ride detail — full top-to-bottom annotated layout

This is the screen reached by tapping a ride in the Home feed (`HomeTab.tsx`) or History (`HistoryScreen.tsx`) → `navigate('Ride', { screen: 'PostRideSummary', params: { rideId } })`. It is the founder's primary ask. Shown full-length; **CHANGED** regions are marked, everything else is annotated "unchanged."

```
┌─────────────────────────────────────────────┐
│ Ride/PostRideSummary  (history / replay mode) │
├─────────────────────────────────────────────┤
│▓▓▓▓▓ STATUS BAR ~44–54dp ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← SYSTEM CHROME. Map bleeds full-width
│                                              │   UNDER this zone; NO interactive content
├──────────────────────────────────────────── │   sits in it. Overlay controls (below)
│                                              │   are inset to safe-area top.
│  ╔═══════════════════════════════════════╗  │ ◄━━ CHANGED ━━ MAP BLOCK (was mapPlaceholder)
│  ║   [ real MapView — DARK basemap ]      ║  │   height 200 (unchanged from `mapPlaceholder`)
│  ║   ╭─╮                                  ║  │   • react-native-maps MapView, full-bleed
│  ║   │◉│ ← segment start marker (gold)    ║  │   • Route = <Polyline> stroke=colors.gold,
│  ║   ╰─╯      ～～╲                        ║  │     strokeWidth 3, lineCap round,
│  ║        ～～～    ╲    gold route        ║  │     auto-fit via fitToCoordinates(pts,
│  ║      ╭─╮          ╲～～～               ║  │     {edgePadding: top56/left24/right24/
│  ║      │◉│            ～～╲               ║  │     bottom24, animated:false})
│  ║      ╰─╯               ╲～～～◉         ║  │   • Markers: one at each hit segment's
│  ║                                        ║  │     start (gold pin / dot, see Q3)
│  ║··········· scrim gradient ············ ║  │   • SCRIM: LinearGradient, top→bottom,
│  ║  APR 11                      ┌──────┐  ║  │     transparent → rgba(17,17,17,0.85),
│  ║  (mapDate 11/600 textMuted)  │  ↑   │  ║  │     bottom ~96px. Makes overlay legible
│  ║  Morning Climb to Grizzly    │44×44 │  ║  │     over ANY map tiles. (replaces the
│  ║  (mapTitle 17/700 textPrim)  └──────┘  ║  │     `mapNav` flex row, now absolute)
│  ╚═══════════════════════════════════════╝  │   • date/title = existing `mapDate`/
│    ↑ overlay: ABSOLUTE, bottom-anchored,     │     `mapTitle`. Share = existing `shareBtn`
│      inset 20px H / 14px bottom (= old        │     (44×44, ↑ glyph — UNCHANGED, Q5/T2).
│      `mapNav` padding). Pannable/zoomable     │     `onShare` still no-op (out of scope).
│      but lightweight (Q2).                    │
│                                              │
│  🏆 1 New PR   Hawk Hill                     │   UNCHANGED — `prHeadline`/`prCrownBadge`.
│  (gold badge + textSecondary sub)            │   Emoji 🏆 stays (T2/Q5). Renders only when
│                                              │   prCount>0.
│                                              │
│  ── MetricsBlock ─────────────────────────── │   UNCHANGED — per UnifiedHomeFeed spec.
│  ┌────────────────────────────────────────┐ │   distance · duration · elevation row +
│  │ 42.1 km · 1:38:24 · 612 m              │ │   HR/power/trend rows. surface cards,
│  └────────────────────────────────────────┘ │   `metricsWrap` marginTop 16.
│  ┌────────────────────────────────────────┐ │
│  │ AVG HR    142 bpm              ▲ 4%    │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ── SummaryText ───────────────────────────  │   UNCHANGED — lazy LLM. In replay, if
│  Strong climb today. You held 287 W through  │   debriefText IS NOT NULL → state='loaded'
│  the false flat — 4% below your recent HR.   │   instantly (no shimmer). `summaryWrap`
│  (15/400 textPrimary, lineHeight 22)         │   marginTop 16.
│                                              │
│  ┌────────────────────────────────────────┐ │   UNCHANGED — InlineAudioButton size='lg'.
│  │      ▶  Play debrief                    │ │   `audioCtaWrap`. NO auto-speak on replay
│  │  gold bg pill, 56px, textOnGold         │ │   (spokenRef guard, wrappers.tsx:388).
│  └────────────────────────────────────────┘ │
│                                              │
│  [SyncStateBadge md] [🎙 Coached]            │   UNCHANGED — `badgeRow`. CoachedPill only
│                                              │   if coachedBySherpaa. "Wrong activity?"
│                                              │   link per syncState (unchanged).
│                                              │
│  SEGMENTS                                    │   UNCHANGED label (`sectionLabel`, 11/600
│  (11/600 textDim ALL CAPS letterSp 1.2)      │   textDim ALL CAPS).
│                                              │
│  ┌────────────────────────────────────────┐ │ ◄━━ CHANGED ━━ SEGMENT ROW (`segCardPR`)
│  │ Hawk Hill                  4:08   [🏆PR]│ │   PR row: bg goldDim, border
│  │ (segName 15/700)  (segTime 15/700 gold) │ │   goldBorderStrong (existing `segCardPR`).
│  │                                         │ │   Time turns gold when isNewPR (existing).
│  │ PR: 4:12              ╱╲___◉   [🏆 PR · −4s]│  ► note CHANGED: was "No history",
│  │ (segNote 12/textMuted)  60×20 SVG  prTag│ │     now "PR: m:ss" from prTimeSec =
│  │ via Strava                              │ │     timeSec − gapToPreSeconds. Gap pill +
│  │ (segSource 11/textMuted italic)         │ │     crown UNCHANGED (already correct).
│  └────────────────────────────────────────┘ │   ► sparkline CHANGED: real SVG (see §sparkline),
│  ┌────────────────────────────────────────┐ │     now draws a dashed PR baseline because
│  │ Paradise Loop              5:30    +8s  │ │     prSec is finally defined on replay.
│  │ PR: 5:22                ___╱╲   [+8s]   │ │   Non-PR row: plain `segCard`, `offTag`
│  │ via Strava                              │ │     (surfaceAlt bg, textMuted "+8s").
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌──────────────── Done ──────────────────┐ │   UNCHANGED — `doneBtn` 54px gold, inline
│  │  gold bg, 999px, textOnGold 17/600      │ │   at end of scroll (NOT a sticky footer —
│  └──────────────────────────────────────── ┘ │   matches shipped; do not "fix" to 56px).
│                                              │
│  [scrollContent paddingBottom 40]            │
├─────────────────────────────────────────────┤
│▓▓▓▓ HOME INDICATOR ~34dp ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← SYSTEM CHROME. `SafeAreaView` + 40px
└─────────────────────────────────────────────┘   scroll bottom padding clear it.
```

**Safe area notes:**
- Top inset: handled by the map bleeding full-width to y=0 behind the status bar (deliberate, magazine-style). The map is non-interactive in that zone; the **overlay controls** (date/title/share) are bottom-anchored within the 200px block, far clear of the top inset. (If `SafeAreaView edges` excludes top so the map reaches the device edge, the share button's 44×44 tap target must still sit below `insets.top + 8` — it does, since it's pinned to the map's bottom.)
- Bottom inset: existing `SafeAreaView` from `react-native-safe-area-context` + `scrollContent.paddingBottom: 40` keeps `Done` and the last segment row clear of the home indicator.
- All interactive content (share, audio CTA, segment rows, Done) confirmed within safe bounds. Verified mentally at iPhone SE (small — map still 200px, content scrolls) and 15 Pro Max (Dynamic Island — overlay is bottom-anchored so the Island never overlaps it).

**What changed vs today (explicit):**
| Region | Today (shipped) | After this pass |
|---|---|---|
| Map | `mapPlaceholder` flat `mapBg` View; `// TODO: replace with MapView` | Real `MapView`, gold `Polyline`, segment-start `Marker`s, auto-fit |
| Map overlay | `mapNav` flex row child of placeholder | Same date/title/share, re-anchored ABSOLUTE over `MapView` + scrim gradient |
| Segment note (replay) | `'No history'` (because `prTimeSec: undefined` hardcoded, wrappers.tsx:324) | `'PR: 4:12'` from derived `prTimeSec`; or `'First effort'` (case c) |
| Sparkline | ASCII glyph `╲•`/`─•`/`╱•` (`SegmentEffortSparkline.tsx:78–84`) | Real SVG `<Polyline>` + dashed PR `<Line>` + gold `<Circle>` end-dot |

**Transition in:** Home/History → PostRideSummary — slide left 300ms spring (tension 100, friction 20), per base catalogue. The `MapView` mounts and `fitToCoordinates(animated:false)` is called on layout so the route is correctly framed on first paint (no visible pan-into-place). Polyline + markers fade in 200ms once the map's `onMapReady` fires (covers tile load latency; avoids a "naked basemap" flash).
**Transition out:** swipe-right pops to Home/History (slide right 250ms spring). `Speech.stop()` fires on unmount if audio was playing (existing cleanup).

**Edge cases (this screen):**
- No route data → see **(b)** Map empty-state.
- First-ever effort on a segment → see **(c)**.
- Zero segment efforts on the ride → per the amendment (§100), the SEGMENTS label stays and renders a single note **"No starred segments on this ride"** (`segNote` style, 12/`textMuted`, centered, paddingH 20) beneath it — the **route map still draws above**. (Note: this overrides the older UnifiedHomeFeed behavior at §661, which hid the section entirely; this amendment is the governing doc and explicitly specs the copy. Flagged as Q10 in case the founder prefers the hide behavior.)

```
  SEGMENTS                                       ← `sectionLabel` (unchanged)
  No starred segments on this ride               ← segNote 12/textMuted, centered
```

- `>30-day` ride opened from History with empty efforts but a `strava_activity_id` → existing one-shot detail fetch + "Loading segment details…" row (unchanged behavior).

**Haptics:** none new. Row tap-to-expand keeps no haptic (existing). Done keeps `Haptics.selectionAsync()` (existing). The map intentionally adds no haptic.

**Accessibility:** map gets `accessibilityRole="image"`, `accessibilityLabel="Route map of your ride. N starred segments marked."`. Each marker is `accessible` with its segment name. Sparkline keeps its parent-supplied trajectory label. VoiceOver focus order unchanged: back/map → date → title → PR headline → metrics → summary → play → badges → segments → Done.

---

## (b) Map empty-state — "Route not recorded"

Triggered when there is no drawable geometry: phone-GPS was denied (empty `gpxTrack` = `"[]"`), OR a Strava-imported/promoted ride that never had a phone track AND has no decodable `summaryPolyline`. The guard is `points.length >= 2` inside `RideRouteMap` — **we never mount `MapView` with < 2 coordinates** (Risk #1 in the amendment). Only the map block changes; the rest of the screen renders normally.

```
  ╔═══════════════════════════════════════╗  ← MAP BLOCK, empty-state variant
  ║                                        ║    height 200 (same), bg = colors.mapBg
  ║                                        ║    (the original dark map base — so it
  ║              ╭─────────╮               ║    reads as "a map that's empty," not a
  ║              │  [pin]  │ ← muted icon  ║    broken View). NO MapView mounted.
  ║              ╰─────────╯               ║
  ║          Route not recorded            ║    • Icon: a single map-pin glyph, 28dp,
  ║          (13/600 textSecondary)        ║      colors.textDim (real vector pin, Q3 —
  ║                                        ║      NOT emoji). Centered.
  ║··········· scrim gradient ············ ║    • Label "Route not recorded": 13/600
  ║  APR 11                      ┌──────┐  ║      textSecondary, centered above scrim.
  ║  Morning Climb to Grizzly    │  ↑   │  ║    • SAME overlay (date/title/share) still
  ║                              └──────┘  ║      renders over the mapBg tile + scrim —
  ╚═══════════════════════════════════════╝      so the block height & layout are
                                                  identical to (a); only the map content
                                                  is replaced. Share still no-op.
```

**Annotations:**
- Background: `colors.mapBg` `#1A2030` (the amendment's named empty-state token), so the block is visually continuous with the real map — calm, not alarming.
- Center content vertically in the upper ~60% so the bottom scrim + overlay still read.
- This is **compact and non-crashing** by construction: it is a plain `View`, no native map instantiated, zero crash surface. Test fixture: a saved ride with `gpxTrack = "[]"` (called out in amendment Risk #1).
- **Transition:** no fade-in of route/markers (there are none); the empty tile is static.
- **Accessibility:** `accessibilityLabel="Route not recorded for this ride"`. The pin icon is decorative (`accessibilityElementsHidden`).
- Everything below the map (PR headline, metrics, summary, segments, Done) is **identical to (a)** — a route-less ride can still have segment efforts and a full comparison.

---

## (c) First-ever effort on a segment — "First effort"

Triggered per-segment when `isNewPR && gapToPreSeconds === 0` (the rider's first recorded effort on that segment — there is no prior best to beat). Only the affected **segment row** changes; show the changed region only.

```
  ┌────────────────────────────────────────┐  ← SEGMENT ROW, first-effort variant
  │ Twin Peaks Blvd            6:14   [🏆PR]│    Row is `segCardPR` (it IS a PR — first
  │ (segName)        (segTime gold)   prTag │    effort is trivially a PR). Crown stays.
  │                                         │
  │ First effort                  ◉         │  ► note CHANGED: NOT "No history",
  │ (segNote 12/textMuted)   single gold dot│    NOT "PR: 6:14". Literal "First effort".
  │ via Strava                              │  ► sparkline: SINGLE gold dot at the
  └────────────────────────────────────────┘    rightmost x, NO line, NO PR baseline.
```

**Annotations — the critical wiring nuance:**
- Note text: `'First effort'` in `segNote` (12/`textMuted`), replacing today's `'No history'`. This is the correct phrasing — the rider DID do an effort (that's why there's a row); they just have no prior to compare against.
- **The row must pass NO `prSec` to the sparkline when `gap === 0`.** Because `prTimeSec = timeSec − gapToPreSeconds` and here `gapToPreSeconds === 0`, the derived PR equals today's time exactly — so a baseline would land *on* the dot and read as a false "tied your PR" line. The wrapper should send `prSec={undefined}` (or omit it) for first efforts. The sparkline already handles `recentEffortsSec.length === 1` by drawing a single dot with no line and no baseline (`SegmentEffortSparkline` edge-case spec + `points` math at line 59). So: single `gold` `<Circle r=3>` at `x = width − 3`, nothing else.
- The gap pill: the amendment keeps the persisted crown for first efforts. **Open Q6:** showing `🏆 PR · −0s` on a first effort reads oddly (−0s). Options: show crown with no gap number, or a neutral "1st" chip. Flagged, not decided.
- **Why this can't misfire on un-starred segments:** `prTimeSec` is derived from the effort row itself, not a `segmentStore` lookup, so a segment with no effort row simply produces no row (amendment §Failure paths).
- Everything else on the screen unchanged.

---

## (d) Segment row EXPANDED — splits + coaching cue, coexisting with the sparkline

Tapping a non-skipped segment row toggles `expandedSegId` (existing `toggleExpand`). The collapsed row — including the **sparkline** — stays visible; the splits area + coaching-cue review animate open below it. This is existing behavior; the only new element in the collapsed portion is the real SVG sparkline, so the design question is "do they fight?" Answer: no — the sparkline is a 60×20 glance object on the metadata line; the splits are a full-width block below the row's `borderTop`. Different visual registers, no collision.

```
  ┌────────────────────────────────────────┐  ← EXPANDED segment row (`segCardPR` + splitsArea)
  │ Hawk Hill                  4:08   [🏆PR]│    Collapsed portion UNCHANGED, including the
  │ PR: 4:12              ╱╲___◉   [🏆PR·−4s]│    sparkline ◉ — it stays on the metadata line.
  │ via Strava                              │
  │ ─────────────────────────────────────  │  ← `splitsArea`: borderTop borderMuted, pad 14
  │ SPLIT COMPARISON · TODAY vs PR          │    `splitsTitle` 11/600 textDim ALL CAPS
  │                                         │
  │ 25%  ▓▓▓▓▓▓▓▓░░░░░░░░░░         −1s     │  ← splitRow: label (textMuted, w36) +
  │ 50%  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░         −2s     │    track (`splitTrack` surfaceDim) with
  │ 75%  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░         −3s     │    PR bar (`splitBarPR` textDim) + today
  │ End  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░         −4s     │    bar (`splitBarToday` gold) + gap val
  │                                         │    (success if ≤0, error if >0)
  │ ┌────────────────────────────────────┐ │
  │ │ COACHING CUE PLAYED                 │ │  ← `cueReview`: goldDim bg, goldBorder,
  │ │ "Hawk Hill in 500m. You faded the   │ │    8px radius. Label `cueReviewLabel`
  │ │  final 400m last time — hold form." │ │    gold 11/600 ALL CAPS; text
  │ └────────────────────────────────────┘ │    `cueReviewText` italic rgba(F0F0F0,0.6)
  └────────────────────────────────────────┘
```

**Annotations:**
- The expanded block is **entirely unchanged** from shipped (`splitsArea`, `splitsTitle`, `splitRow`, `splitTrack`, `splitBarPR`, `splitBarToday`, `splitVal`, `cueReview`, `cueReviewLabel`, `cueReviewText`). On replay, `cueTextPlayed` comes from `loadRideDetail` (persisted, `schema.ts:88–107`); splits come from `split25/50/75GapSec` if surfaced (note: today's wrapper does NOT pass `splits` on the replay path — see Q7; if splits are absent the splitsArea simply shows only the cue review).
- **Coexistence with the sparkline:** the sparkline (trend across *rides*) and the splits (gap *within this effort* at 25/50/75/end) answer different questions — "am I getting faster over time?" vs "where in the effort did I gain/lose vs PR?" Keeping both is intentional and non-redundant. The sparkline stays on the compact metadata row; the splits own the expanded block. Visually they never overlap because the sparkline is inline-right and the splits are full-width below the divider.
- **Transition:** card expand = spring scale in-place, 250ms (base catalogue "Card expand (splits)"). `LayoutAnimation` not required since the card is a single `TouchableOpacity` that grows.
- **Haptics:** none on expand (existing).
- **Accessibility:** expanded splits are individually focusable rows; cue review reads as the quoted cue text.

---

## (e) Live-vs-replay parity — both paths now look identical

After this pass, the live "you just finished" screen and the replay screen are **the same pixels** for the map and the comparison. The only difference is the data source, normalized inside one new component so neither the screen nor the wrapper branches on it.

**`RideRouteMap` (new component) — the parity seam:**
- **Live path:** route comes from `rideStore.gpxTrackPoints` (`wrappers.tsx:173`) — already in memory, **no DB round-trip**. The map renders as soon as the screen mounts post-ride.
- **Replay path:** route comes from `JSON.parse(persisted.ride.gpxTrack)` → else `decodePolyline(cachedActivities.summaryPolyline)` (`utils/polyline.ts`) → else the **(b)** empty-state.
- **Key normalization (why they look identical):** `gpxTrack` and `gpxTrackPoints` are `{lat, lng, timestamp}`, but `react-native-maps` `Polyline`/`Marker` want `{latitude, longitude}`. `RideRouteMap` does the `{lat,lng}` → `{latitude,longitude}` remap **internally** (amendment API note), so callers pass their native shape and the component emits identical geometry regardless of origin. Both paths therefore produce the same gold polyline framed by the same `fitToCoordinates`.

**The comparison parity:**
- **Live:** `prTimeSec` already flows from `completedSegments` (`wrappers.tsx:344`) — was always correct.
- **Replay:** stop hardcoding `prTimeSec: undefined` (`wrappers.tsx:324`); derive `prTimeSec = e.timeSec − e.gapToPreSeconds` from the persisted effort row. This is the **point-in-time PR** (best as of that ride), so the replayed numbers reproduce *exactly* what the rider saw live — same PR note, same gap pill, same dashed baseline position. No "current all-time PR" drift, no contradiction with the persisted `isNewPR` crown.
- **Segment markers on the map** need each hit segment's start lat/lng. Source: either augment `loadRideDetail`/`RideEffortRow` to return `segmentStartLat/Lng` (amendment API change), or read from the already-loaded `segmentStore` by `segmentId` (`wrappers.tsx:175`). Either yields the same marker set on both paths.

**Net:** one component, one screen, two data sources, identical output. The "live looks better than replay" asymmetry the amendment diagnosed is fully closed.

---

## The SVG sparkline — render spec (the `SegmentEffortSparkline` body swap)

The geometry is already computed in `SegmentEffortSparkline.tsx:46–65` and is **kept exactly**. Only the placeholder `<View>`/ASCII (`lines 78–84`) is replaced with `react-native-svg` primitives. Designed to the **shipped orientation** (faster = lower y; T3/Q4).

```
  default 60 × 20, inline-right on the segment metadata row
  ┌──────────────────────────────┐
  │  ╲                           │  y=0 (top)  = SLOWER efforts
  │    ╲      ╱──╲                │
  │ ┄┄┄┄╲┄┄┄╱┄┄┄┄╲┄┄┄┄┄┄┄┄┄┄┄┄┄  │ ← PR baseline: <Line> dashed, colors.textDim,
  │      ╲ ╱       ╲              │   strokeDasharray "2,2", strokeWidth 1, at y=prY.
  │       ╳         ╲___◉         │   "Below this line = faster than PR."
  │                      ↑        │  y=height (bottom) = FASTER efforts
  └──────────────────────────────┘
       gold polyline 1.5px        gold end-dot r=3 = TODAY
```

- **`<Polyline>`** — `points` from the existing `points[]` array, `stroke=colors.gold`, `strokeWidth=1.5`, `fill="none"`, `strokeLinejoin="round"`.
- **`<Line>` (PR baseline)** — only when `prSec !== undefined`; at `y = _prY` (already computed, line 65), `stroke=colors.textDim`, `strokeDasharray="2,2"`, `strokeWidth=1`.
- **`<Circle>` (today)** — at `lastPoint`, `r=3`, `fill=colors.gold`. Anchors "today" and shows at a glance whether today was the best/worst of the recent set.
- **Edge cases kept from spec:** 1 effort → single dot, no line, no baseline (case c). 2 efforts → one segment. All-flat → y-range padded `max(5%, 2s)` so a flat trajectory still reads as a flat line, not a dot smear (`SegmentEffortSparkline.tsx:51–52`).
- **Tokens:** `gold` line + dot, `textDim` dashed baseline — exactly as the `UnifiedHomeFeed_DesignSpec` "SegmentEffortSparkline" table specifies. No new tokens.
- **Reduced Motion / static:** the sparkline is already static (no animation) — nothing to suppress.
- **Small-device reflow:** on phones < 360pt the row already wraps the sparkline to its own line below "via Strava" (`flexWrap`, UnifiedHomeFeed spec) — unchanged.

---

## Transitions touched by this pass (additions to the catalogue)

```
→ TRANSITION: Home / History → PostRideSummary (replay)
   Trigger: ride card / row tap
   Animation: slide left, 300ms spring (tension 100, friction 20)   [existing — unchanged]
   Map detail: fitToCoordinates(animated:false) on layout; route + markers
               fade in 200ms on onMapReady (covers tile load, avoids naked-basemap flash)
   Back gesture: swipe right → pop (250ms spring)

→ TRANSITION: segment row collapsed → expanded
   Trigger: tap row body
   Animation: spring scale in-place, 250ms   [existing — unchanged]
```

No new haptics. No new color tokens. No layout-order changes.

---

## §7. OPEN QUESTIONS for the founder (numbered)

1. **Map provider & basemap brightness (HIGHEST PRIORITY — T1).** The amendment specifies `react-native-maps` + default **Apple Maps** (light) to avoid a Google Maps API key. But the app is dark/OLED-first and RouteSetup already uses **dark CartoDB tiles via Leaflet** for exactly that reason (plus Android Google-Maps-without-key crashes, per `docs/test-reports/android-phase-1-report.md`). Do we (a) force a **dark MapView** (iOS `userInterfaceStyle="dark"` / custom dark style JSON; Android needs a dark style or it stays light), accepting a light fallback on platforms that don't honor it; (b) **reuse the Leaflet-in-WebView dark map** from RouteSetup for full visual parity and one map stack across the app; or (c) accept a light basemap on the detail screen? My strong recommendation: dark, and seriously consider (b) for consistency.

2. **Map interactivity / gestures.** The amendment says "keep gestures enabled but lightweight." Should the detail map be **pan/zoom enabled** (rider can explore the route), or **locked/static** (a snapshot — `scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}`)? A static map is calmer and avoids accidental drags while scrolling the page; an interactive one lets the rider inspect a climb. Recommendation: **static by default** (it's a recall surface), reconsider if users ask to zoom.

3. **Segment marker style.** Net-new design (follows the icon rule, NOT emoji — T2). Options: (a) a **gold filled dot** (`colors.gold`, ~12dp, matches the RouteSetup segment-start markers and the app's dot language); (b) a **gold map pin** (more "location," but heavier and competes with the route line); (c) a **numbered** dot/pin (1,2,3 matching segment order). PR-segment markers could get a subtle ring/crown to distinguish them. Recommendation: **gold filled dot, PR segments get a 1px gold ring**, for parity with RouteSetup.

4. **Sparkline axis orientation (T3).** Shipped code = **faster is LOWER** on the chart ("below the dashed PR line = faster than PR"). The amendment's parenthetical says the opposite (faster = higher). "Down = better" is counterintuitive for most riders (we read "up and to the right" as improvement). Keep **down = faster** (matches code, matches "below PR line = faster", zero code churn), or **flip to up = faster** (more intuitive, requires inverting the y math)? Recommendation: this is genuinely a UX call — I lean **flip to up = faster** for intuitiveness, but it's the founder's call since it touches the locked "per existing spec" note.

5. **Emoji-as-icon debt (`🏆` crown, `↑` share) — T2.** Out of scope to fix here, but should I log a follow-up to replace these (and the tab-bar Unicode glyphs) with a real vector icon set in a dedicated icon pass? Recommendation: **yes, separate pass** — don't bloat this amendment.

6. **First-effort gap pill (case c).** On a first-ever effort, `isNewPR=true` and `gap=0`, so the pill would read `🏆 PR · −0s`. Show the crown with **no gap number**, a neutral **"1st"** chip, or suppress the pill entirely and let "First effort" carry it? Recommendation: crown + no number ("🏆 PR"), or "1st" chip.

7. **Splits on the replay path.** The expanded row's split bars need `split25/50/75GapSec` (persisted, `schema.ts`). Today's replay wrapper (wrappers.tsx:317–327) does **not** pass `splits`, so a replayed expanded row would show only the coaching cue, no split bars. Should this pass also surface persisted splits on replay (small `loadRideDetail` addition), or is "cue only on replay, full splits only live" acceptable for now? Recommendation: surface splits on replay too — it's the same low-cost read-side fix as the PR derivation and completes the parity story.

8. **Map overlay content — distance/elevation?** The amendment asks whether to put distance/elevation on the map overlay. Recommendation: **no** — `MetricsBlock` sits directly below with exactly those numbers; duplicating them on the map clutters the one glanceable shape. Keep the overlay to date + title + share only.

9. **`onShare` is still a no-op.** Out of scope per amendment, but flag: once there's a real map, a shareable route snapshot becomes compelling. Wire share in a follow-up? Recommendation: defer, note as a natural next step.

10. **Zero-segments empty-state — spec conflict.** This amendment (§100) says: render **"No starred segments on this ride"** with the route map still showing. The older UnifiedHomeFeed_DesignSpec (§661) says: **hide the SEGMENTS section entirely**. I designed to the amendment (it governs this feature). Confirm we want the visible empty-state copy, not the hide behavior? Recommendation: **show the copy** — a route with no starred segments is a meaningful, non-error state worth labeling.

---

*End of REVIEW DRAFT — `docs/design/RideDetailMapAndComparison_REVIEW.md`*
