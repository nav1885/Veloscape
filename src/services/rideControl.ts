/**
 * Ride end/save control — the SINGLE end-of-ride entry point.
 *
 * Why this exists (Risk 4): saving used to run only in PostRideSummary's mount
 * effect, so ending a ride from a backgrounded / pocketed phone (via the lock-screen
 * notification) would never render that screen and the ride would be LOST. This saves
 * the ride to SQLite BEFORE any teardown, so the row is durable regardless of which
 * surface ended the ride or whether the app is even foregrounded.
 */
import { useRideStore } from '../store/rideStore';
import { useAuthStore } from '../store/authStore';
import { saveRide } from './rideService';
import { stopRideEngine } from './rideEngine';

export type EndReason = 'in-app' | 'notification';

/**
 * End the active ride and persist it. Snapshots ride data, saves to SQLite, then
 * tears the engine down and resets the store. Returns the saved rideId (or null if
 * there was nothing to save). The sole save path — callers must NOT also save.
 */
export async function endRideAndSave(reason: EndReason): Promise<{ rideId: string } | null> {
  const rs = useRideStore.getState();
  const rider = useAuthStore.getState().rider;

  // Snapshot everything we need BEFORE teardown clears it.
  const snapshot = {
    goalMode: rs.goalMode,
    startedAt: rs.rideStartedAt ?? Date.now(),
    distanceKm: rs.distanceKm,
    completedSegments: rs.completedSegments,
    gpxTrackPoints: rs.gpxTrackPoints,
    cueLog: rs.cueLog,
  };

  await stopRideEngine();
  rs.endRide();

  let rideId: string | null = null;
  if (rider) {
    try {
      rideId = saveRide({
        riderId: rider.id,
        goalMode: snapshot.goalMode,
        startedAt: snapshot.startedAt,
        endedAt: Date.now(),
        distanceKm: snapshot.distanceKm,
        elevationM: 0,
        completedSegments: snapshot.completedSegments,
        gpxTrackPoints: snapshot.gpxTrackPoints,
        cueLog: snapshot.cueLog,
      });
      console.log(`[endRideAndSave] saved ride ${rideId} (reason=${reason})`);
    } catch (e) {
      console.error('[endRideAndSave] save failed:', e);
    }
  }

  rs.resetRide();
  return rideId ? { rideId } : null;
}
