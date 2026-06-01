// Sherpaa design tokens — single source of truth
// All components must import colors from here, not hardcode hex values

export const colors = {
  // ─── Backgrounds ───────────────────────────────────────────────────────────
  // bg: main screen background — iOS dark mode base
  bg: '#1C1C1E',
  // bgDeep: in-ride and debrief screens — maximum contrast, OLED black
  bgDeep: '#111111',
  // bgOverlay: canvas / page background layer
  bgOverlay: '#1A1A1A',
  // surface: cards, list items, bottom sheets
  surface: '#2A2A2A',
  // surfaceAlt: alternate rows, condensed cards, inset areas
  surfaceAlt: '#242424',
  // surfaceDim: deeper inset — metric cards in overlays
  surfaceDim: '#222222',
  // surfaceElevated: slightly lighter than surface, for layered cards
  surfaceElevated: '#1E1E1E',

  // ─── Borders ───────────────────────────────────────────────────────────────
  // borderSubtle: lightest separation — map overlays, pill borders over dark bg
  borderSubtle: '#2E2E2E',
  // border: standard card and input border
  border: '#363636',
  // borderMuted: tab bars, section dividers
  borderMuted: '#333333',
  // borderStrong: active elements, focused inputs, strong dividers
  borderStrong: '#3A3A3A',

  // ─── Accent — Gold ─────────────────────────────────────────────────────────
  // Rationale: gold signals performance and achievement across all cycling culture.
  // It reads at distance on a bike mount in full sun. It differentiates sharply
  // from Strava orange (#FC4C02), Garmin red, and Wahoo blue. On a #111111 bg,
  // contrast ratio is 10.5:1 — WCAG AAA. Used only on: primary CTAs, active states,
  // PR highlights, and audio indicators. Never decorative.
  gold: '#F5C842',
  // goldDim: tinted card backgrounds — always paired with goldBorder
  goldDim: 'rgba(245,200,66,0.10)',
  // goldBorder: standard tinted border
  goldBorder: 'rgba(245,200,66,0.20)',
  // goldBorderStrong: emphasis border for selected states and PR cards
  goldBorderStrong: 'rgba(245,200,66,0.30)',
  // goldGlow: radial bg for PR result screens — restrained, not decorative
  goldGlow: 'rgba(245,200,66,0.12)',

  // ─── Text ──────────────────────────────────────────────────────────────────
  // textPrimary: headings, primary content — high contrast on all bg variants
  textPrimary: '#F0F0F0',
  // textSecondary: supporting labels, metadata that still needs to be read
  textSecondary: '#888888',
  // textMuted: timestamps, secondary metadata
  textMuted: '#555555',
  // textDim: section labels, inactive tab labels, faint states
  textDim: '#444444',
  // textFaint: ghost button text, ultra-low emphasis
  textFaint: 'rgba(240,240,240,0.40)',
  // textOnGold: text rendered on top of gold surfaces — always black
  textOnGold: '#000000',

  // ─── Semantic ──────────────────────────────────────────────────────────────
  // success: GPS lock confirmed, ahead of PR pace, Strava sync complete
  success: '#30A46C',
  successDim: 'rgba(48,164,108,0.08)',
  successBorder: 'rgba(48,164,108,0.20)',
  // error: OAuth failure, payment failure, GPS lost
  error: '#E5484D',
  errorDim: 'rgba(229,72,77,0.10)',
  errorBorder: 'rgba(229,72,77,0.20)',

  // ─── Imported (Phone-as-Coach amendment) ───────────────────────────────────
  // Used by SyncStateBadge "Imported" state — rides created via Debrief-Only
  // Onboarding (importedFromStrava = true). Blue is deliberately distinct from
  // gold (achievement) and green (live-ride synced); imported rides are neither
  // a PR moment nor a phone-recorded ride — they are an imported artifact.
  // Contrast on bg (#1C1C1E) = 6.1:1 WCAG AA; on bgDeep (#111111) = 6.9:1.
  imported: '#4DA3FF',
  // importedDim: tinted card backgrounds for Imported badge and Debrief CTA
  importedDim: 'rgba(77,163,255,0.10)',
  // importedBorder: standard tinted border for Imported surfaces
  importedBorder: 'rgba(77,163,255,0.22)',

  // ─── Brand partners ────────────────────────────────────────────────────────
  // stravaOrange: Strava badge ONLY — never used as a UI accent color
  stravaOrange: '#FC4C02',

  // ─── Map ───────────────────────────────────────────────────────────────────
  // mapBg: simulated dark map base tile
  mapBg: '#1A2030',
  // mapRoad: road lines rendered on map tiles
  mapRoad: '#243040',

  // ─── Pure ──────────────────────────────────────────────────────────────────
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof colors;
