/**
 * Resolve a ride's route coordinates for a thumbnail, shared by the Home feed
 * and Ride History. Source priority: phone-recorded gpxTrack → else the cached
 * Strava summary polyline (by stravaActivityId). Downsampled for cheap drawing.
 */
import { decodePolyline, type LatLng } from '../utils/polyline';
import { getActivitySummaryPolyline } from './activityService';

/** Evenly thin an array down to ~target points (keeps first + last). */
export function downsampleRoute<T>(arr: T[], target = 40): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

export function resolveRideRouteCoords(
  r: { gpxTrack: string | null; stravaActivityId: string | null },
): LatLng[] | undefined {
  if (r.gpxTrack) {
    try {
      const arr = JSON.parse(r.gpxTrack) as Array<{ lat: number; lng: number }>;
      if (arr.length >= 2) return downsampleRoute(arr.map(p => ({ lat: p.lat, lng: p.lng })));
    } catch {
      /* fall through to the Strava polyline */
    }
  }
  if (r.stravaActivityId) {
    const poly = getActivitySummaryPolyline(Number(r.stravaActivityId));
    if (poly) {
      const pts = decodePolyline(poly);
      if (pts.length >= 2) return downsampleRoute(pts);
    }
  }
  return undefined;
}
