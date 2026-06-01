# Sherpaa — Project Memory

Index of long-lived documents, conventions, and architectural decisions. Read this when joining a new session or before touching unfamiliar areas.

## Product & Design Docs

| Doc | Path | What it covers |
|---|---|---|
| Product Spec (base) | `docs/Sherpaa_ProductSpec.md` | Original product spec — user flows, screen definitions, data model. Amended by docs below. |
| Market Research | `docs/Sherpaa_Market_Research.md` | Five personas, emotional context, competitive frame. |
| Product Brief | `docs/Sherpaa_Product_Brief.md` | Top-of-funnel positioning. |
| Design Spec (base) | `docs/design/Sherpaa_DesignSpec.md` | Design system tokens, component inventory, original screen specs, transitions, accessibility. Governs everything not explicitly amended. |
| Strava Caching Amendment | `docs/amendments/StravaCaching_Amendment.md` | Activity/segment caching, `rateBudget.ts`, RouteSetup progressive map rendering. |
| **Phone-as-Coach Amendment** | `docs/amendments/PhoneAsCoach_Amendment.md` | Architectural pivot: phone = coach, Strava = recorder. Adds `data_source`/`imported_from_strava`/`last_reconcile_attempt_at` to rides, `cue_log_entries` table, `stravaReconciler.ts` service, Debrief-Only Onboarding loop. Supersedes M4/M17. |
| **Phone-as-Coach Design Spec** | `docs/design/PhoneAsCoach_DesignSpec.md` | Wireframes, state tables, transitions, haptics, accessibility, component specs for all five flows (A–E) touched by the Phone-as-Coach amendment. Defines `SyncStateBadge` and the upgrade choreography. |
| **Unified Home Feed Amendment** | `docs/amendments/UnifiedHomeFeed_Amendment.md` | Home becomes a unified 30-day feed of all rides (Sherpaa + Strava-ingested). Adds `coached_by_sherpaa` boolean, lazy LLM debrief summary for every ride, on-demand audio playback, baseline-based metrics with graceful degradation. New `homeIngestor` + `rideSummaryService` + Railway `/v1/ride-summary` endpoint. |
| **Unified Home Feed Design Spec** | `docs/design/UnifiedHomeFeed_DesignSpec.md` | Wireframes, component specs, state tables for `RideFeedRow`, `CoachedPill`, `InlineAudioButton`, `SummaryText`, `MetricsBlock`, `SegmentEffortSparkline`. Modified Home / PostRideSummary / History / Settings. No new color tokens — reuses gold for the orthogonal coached marker. |

## Conventions

- **Colors:** every component imports from `src/constants/colors.ts`. Never hardcode hex. New tokens added by the Phone-as-Coach amendment: `imported`, `importedDim`, `importedBorder`.
- **Typography:** 11px is the floor. No font below 11px anywhere.
- **Touch targets:** 44×44pt minimum. No exceptions.
- **Spacing scale:** 4 / 8 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 48 / 64. Avoid `gap: 10`.
- **Haptics:** every meaningful action gets a haptic. Catalogues in the two DesignSpecs.

## Phone-as-Coach Components (new)

Reusable shells live in `src/components/`:

- `SyncStateBadge` — four-state pill (`awaiting` / `synced` / `phone-recorded` / `imported`). Pure presentational; parent maps `dataSource` + `importedFromStrava` + reconciler state → `SyncState`.
- `WrongActivityChooser` — bottom-sheet modal listing recent Strava activities. Opens from PostRideSummary when state is `synced` and not imported.
- `DebriefCTACard` — Home screen blue CTA that opens DebriefPicker.
- `DebriefPicker` — full screen list of recent Strava activities for Debrief-Only Onboarding.
- `DisclosureRow` — Settings expandable disclosure used for "What gets synced."

All five are layout-and-style shells; business wiring is marked with `TODO` comments.

## Unified Home Feed Components (new)

Reusable shells live in `src/components/`:

- `RideFeedRow` — primary unit of the unified Home feed. 3-line layout: title+date / stats+InlineAudioButton / SyncStateBadge+CoachedPill. Tap row → PostRideSummary; tap audio → inline playback.
- `CoachedPill` — small gold pill. Sits next to `SyncStateBadge`. Orthogonal axis: provenance (badge) vs coaching (pill). No state prop — presence is the state.
- `InlineAudioButton` — first-class audio CTA. Sizes `sm` (36×36 list rows), `md` (48×48 inline), `lg` (full-width 56px primary CTA on PostRideSummary). States: `idle`/`generating`/`playing`/`error`.
- `SummaryText` — shimmer-while-generating → loaded/fallback text. Three-row shimmer with traveling highlight matches typical 3-line summary. No card chrome.
- `MetricsBlock` — 4 row stack on PostRideSummary: distance/duration/elev (always), HR + delta (if data), power + delta (if data), weekly trend OR "Building your baseline · N/5" hint. Lower-is-better delta colors for HR/watts.
- `SegmentEffortSparkline` — 60×20 inline mini chart of last 5 efforts per starred segment. Auto-scales y-axis; PR as dashed baseline; latest point gets a dot. SVG-based — TODO marker for `react-native-svg` wiring.

All six are layout-and-style shells; LLM calls, audio playback bus, SQLite reads, and SVG installation are marked with `TODO` comments.

## Notes for the next phase (Phone-as-Coach feature implementation)

Implementation order per the amendment's Migration section:

1. Data model migration (`rides` columns + `cue_log_entries` table)
2. `stravaReconciler.ts` service
3. PostRideSummary UI (wire `SyncStateBadge` + upgrade choreography + `WrongActivityChooser`)
4. Settings copy + toggle removal (wire `DisclosureRow`, drop `stravaAutoUpload` from UI)
5. History badge + pull-to-refresh reconciler
6. Debrief-Only Onboarding (`DebriefPicker` + `createSyntheticRideFromStravaActivity` + `DebriefCTACard` on Home + PostRideSummary history-mode extension for synthetic rides)

The `SyncStateBadge` is the visual spine across surfaces 3, 5, and 6 — wire it once and reuse.
