/**
 * Units helpers — read the user's preference from settingsStore and format
 * distance/elevation/speed accordingly. Use these everywhere user-visible.
 *
 * Internal data is always SI: meters, km, km/h. Conversion happens at the
 * display boundary.
 */

import { useSettingsStore } from '../store/settingsStore';

const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;
const MPH_PER_KMH = 0.621371;

function isImperial(): boolean {
  return useSettingsStore.getState().units === 'imperial';
}

/** Format meters → "12.3 mi" or "12.3 km" */
export function formatDistanceMeters(meters: number): string {
  if (isImperial()) {
    const mi = meters / M_PER_MI;
    if (Math.abs(mi) < 0.1 && meters > 0) return `${Math.round(meters / M_PER_FT)} ft`;
    return `${mi.toFixed(1)} mi`;
  }
  if (Math.abs(meters) < 1000 && meters > 0) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Format km → "12.3 mi" or "12.3 km" */
export function formatDistanceKm(km: number): string {
  return formatDistanceMeters(km * 1000);
}

/** Format meters → "612 ft" or "612 m" (elevation gain) */
export function formatElevationMeters(meters: number): string {
  if (isImperial()) return `${Math.round(meters / M_PER_FT)} ft`;
  return `${Math.round(meters)} m`;
}

/** Format km/h → "18.4 mph" or "18.4 km/h" */
export function formatSpeedKmh(kmh: number): string {
  if (isImperial()) return `${(kmh * MPH_PER_KMH).toFixed(1)} mph`;
  return `${kmh.toFixed(1)} km/h`;
}

/** Just the unit label — "mi" or "km" */
export function distanceUnit(): string {
  return isImperial() ? 'mi' : 'km';
}

export function elevationUnit(): string {
  return isImperial() ? 'ft' : 'm';
}

export function speedUnit(): string {
  return isImperial() ? 'mph' : 'km/h';
}

/** Spoken form for narration — "12.3 miles" / "12.3 kilometers" */
export function spokenDistanceMeters(meters: number): string {
  if (isImperial()) {
    const mi = meters / M_PER_MI;
    return `${mi.toFixed(1)} miles`;
  }
  return `${(meters / 1000).toFixed(1)} kilometers`;
}

export function spokenDistanceKm(km: number): string {
  return spokenDistanceMeters(km * 1000);
}
