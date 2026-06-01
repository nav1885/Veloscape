/**
 * Ride Summary Service — Unified Home Feed amendment.
 *
 * Lazy-generates a narrative summary the first time a PostRideSummary screen
 * mounts for a ride, then caches it forever in rides.debriefText.
 *
 * The summary now leans into trends — HR/power/speed/distance vs trailing
 * baselines, segment PR performance, and a "what's working / what to improve"
 * voice. Sent to the Railway LLM endpoint as rich context; falls back to a
 * deterministic narrative if the endpoint is unreachable.
 */

import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { rides, segmentEfforts, segments, type Ride } from '../db/schema';
import { API_URL } from '../constants/config';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistanceMeters, formatElevationMeters, spokenDistanceMeters } from '../utils/units';

const SUMMARY_TIMEOUT_MS = 4000;
const BASELINE_WINDOW_DAYS = 28;
const BASELINE_MIN_RIDES = 5;
const FALLBACK_MODEL_TAG = 'fallback-v2';   // bump to invalidate cached fallbacks
const LLM_MODEL_TAG = 'claude-haiku-v2';

export type SummaryStatus = 'cached' | 'generated' | 'fallback';

export interface RideSummaryResult {
  text: string;
  status: SummaryStatus;
}

export interface RideMetricRow {
  label: string;
  value: string;
  delta?: { direction: 'up' | 'down' | 'flat'; pct?: number };
}

export interface RideMetricsView {
  headline: string;
  rows: RideMetricRow[];
  baselineBuildingCount?: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getOrGenerateSummary(
  rideId: string,
  jwt: string | null,
  options?: { allowLLM?: boolean; forceRegenerate?: boolean },
): Promise<RideSummaryResult> {
  const ride = db.select().from(rides).where(eq(rides.id, rideId)).get();
  if (!ride) return { text: 'Ride not found.', status: 'fallback' };

  // Cache is valid only if the model tag matches current version
  const cachedValid =
    ride.debriefText &&
    !options?.forceRegenerate &&
    (ride.summaryModel === LLM_MODEL_TAG || ride.summaryModel === FALLBACK_MODEL_TAG);
  if (cachedValid) {
    return { text: ride.debriefText!, status: 'cached' };
  }

  const context = buildSummaryContext(ride);
  const userAllows = useSettingsStore.getState().summariesEnabled || ride.coachedBySherpaa;
  const allowLLM = (options?.allowLLM ?? true) && userAllows;

  if (allowLLM && jwt) {
    try {
      const text = await callRailwaySummary(context, jwt);
      persistSummary(rideId, text, LLM_MODEL_TAG);
      return { text, status: 'generated' };
    } catch (err) {
      console.warn('[summary] LLM call failed, falling back:', err);
    }
  }

  const text = verboseDeterministicFallback(context);
  persistSummary(rideId, text, FALLBACK_MODEL_TAG);
  return { text, status: 'fallback' };
}

// ─── Metrics view (for MetricsBlock UI) ──────────────────────────────────────

export function computeMetricsForRide(ride: Ride): RideMetricsView {
  const ctx = buildSummaryContext(ride);
  const durationSec = ride.endedAt - ride.startedAt;
  const headline = `${formatDistanceMeters(ride.distanceM)} · ${formatHHMMSS(durationSec)} · ${formatElevationMeters(ride.elevationM)}`;

  const rows: RideMetricRow[] = [];

  if (ride.avgHrBpm != null) {
    rows.push({
      label: 'Avg HR',
      value: `${ride.avgHrBpm} bpm`,
      delta: ctx.hr.baseline != null ? deltaSpec(ride.avgHrBpm, ctx.hr.baseline, 'lower-is-better') : undefined,
    });
  }
  if (ride.avgWatts != null) {
    rows.push({
      label: 'Avg Power',
      value: `${ride.avgWatts} W`,
      delta: ctx.power.baseline != null ? deltaSpec(ride.avgWatts, ctx.power.baseline, 'higher-is-better') : undefined,
    });
  }
  if (ctx.weeklyDistance.previousKm > 0) {
    rows.push({
      label: 'This week',
      value: formatDistanceMeters(ctx.weeklyDistance.currentKm * 1000),
      delta: deltaSpec(ctx.weeklyDistance.currentKm, ctx.weeklyDistance.previousKm, 'higher-is-better'),
    });
  }

  const view: RideMetricsView = { headline, rows };
  if (ctx.baselineCount < BASELINE_MIN_RIDES) {
    view.baselineBuildingCount = ctx.baselineCount;
  }
  return view;
}

export const BASELINE_TARGET = BASELINE_MIN_RIDES;

// ─── Segment effort trend (sparkline) ────────────────────────────────────────

export interface SegmentTrendPoint {
  rideStartedAt: number;
  timeSec: number;
}

export function loadSegmentEffortTrend(
  segmentId: string,
  riderId: string,
  beforeRideStartedAt: number,
  n = 5,
): SegmentTrendPoint[] {
  const rows = db
    .select({ timeSec: segmentEfforts.timeSec, startedAt: rides.startedAt })
    .from(segmentEfforts)
    .innerJoin(rides, eq(segmentEfforts.rideId, rides.id))
    .where(
      and(
        eq(segmentEfforts.segmentId, segmentId),
        eq(segmentEfforts.riderId, riderId),
        lt(rides.startedAt, beforeRideStartedAt),
      ),
    )
    .orderBy(desc(rides.startedAt))
    .limit(n)
    .all();
  return rows.map((r) => ({ rideStartedAt: r.startedAt, timeSec: r.timeSec })).reverse();
}

// ─── Rich context (used by both fallback + LLM payload) ──────────────────────

interface SegmentLine {
  name: string;
  timeSec: number;
  isNewPR: boolean;
  gapToPreSeconds: number;
  trendImproving: boolean; // last 3 efforts trending faster
}

interface SummaryContext {
  ride: Ride;
  durationSec: number;
  speedKmh: number;            // avg ride speed
  hr: { current: number | null; baseline: number | null };
  power: { current: number | null; baseline: number | null };
  speed: { baselineKmh: number | null };
  weeklyDistance: { currentKm: number; previousKm: number };
  fourWeekDistance: { currentKm: number; previousKm: number };
  baselineCount: number;
  segments: SegmentLine[];
  prCount: number;
  bestSegmentImprovement: SegmentLine | null;  // biggest gain vs PR
  worstSegmentGap: SegmentLine | null;         // biggest gap behind PR
}

function buildSummaryContext(ride: Ride): SummaryContext {
  const durationSec = ride.endedAt - ride.startedAt;
  const speedKmh = durationSec > 0 ? (ride.distanceM / 1000) / (durationSec / 3600) : 0;

  // Baseline rides — last 28 days, strava-authoritative, before this ride
  const cutoff = ride.startedAt - BASELINE_WINDOW_DAYS * 86400;
  const baselineRides = db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.riderId, ride.riderId),
        gte(rides.startedAt, cutoff),
        lt(rides.startedAt, ride.startedAt),
        eq(rides.dataSource, 'strava'),
      ),
    )
    .all();

  const hrBaseline = avg(baselineRides.map((r) => r.avgHrBpm).filter((v): v is number => v != null));
  const wBaseline = avg(baselineRides.map((r) => r.avgWatts).filter((v): v is number => v != null));
  const speedBaseline = avg(
    baselineRides
      .filter((r) => r.endedAt > r.startedAt)
      .map((r) => (r.distanceM / 1000) / ((r.endedAt - r.startedAt) / 3600)),
  );

  // Weekly + 4-week distance trends
  const oneWeekAgo = ride.startedAt - 7 * 86400;
  const twoWeeksAgo = ride.startedAt - 14 * 86400;
  const fourWeeksAgo = ride.startedAt - 28 * 86400;

  const weekKm = (filterStart: number, filterEnd: number) =>
    baselineRides
      .filter((r) => r.startedAt >= filterStart && r.startedAt < filterEnd)
      .reduce((sum, r) => sum + r.distanceM / 1000, 0);

  const thisWeekKm = weekKm(oneWeekAgo, ride.startedAt) + ride.distanceM / 1000;
  const lastWeekKm = weekKm(twoWeeksAgo, oneWeekAgo);
  const recent2WeekKm = weekKm(twoWeeksAgo, ride.startedAt) + ride.distanceM / 1000;
  const prior2WeekKm = weekKm(fourWeeksAgo, twoWeeksAgo);

  // Segment efforts on this ride + per-segment trend
  const efforts = db
    .select({
      timeSec: segmentEfforts.timeSec,
      isNewPR: segmentEfforts.isNewPR,
      gapToPreSeconds: segmentEfforts.gapToPreSeconds,
      segmentId: segmentEfforts.segmentId,
      segmentName: segments.name,
    })
    .from(segmentEfforts)
    .innerJoin(segments, eq(segmentEfforts.segmentId, segments.id))
    .where(eq(segmentEfforts.rideId, ride.id))
    .all();

  const segmentLines: SegmentLine[] = efforts.map((e) => {
    const trend = loadSegmentEffortTrend(e.segmentId, ride.riderId, ride.startedAt, 3);
    const trendImproving = trend.length >= 2
      ? trend[trend.length - 1].timeSec < trend[0].timeSec
      : false;
    return {
      name: e.segmentName,
      timeSec: e.timeSec,
      isNewPR: e.isNewPR,
      gapToPreSeconds: e.gapToPreSeconds,
      trendImproving,
    };
  });

  const prCount = segmentLines.filter((s) => s.isNewPR).length;
  const withGap = segmentLines.filter((s) => !s.isNewPR);
  const bestSegmentImprovement = segmentLines
    .filter((s) => s.gapToPreSeconds < 0)
    .sort((a, b) => a.gapToPreSeconds - b.gapToPreSeconds)[0] ?? null;
  const worstSegmentGap = withGap.length > 0
    ? withGap.reduce((a, b) => (a.gapToPreSeconds > b.gapToPreSeconds ? a : b))
    : null;

  return {
    ride,
    durationSec,
    speedKmh,
    hr: { current: ride.avgHrBpm, baseline: hrBaseline },
    power: { current: ride.avgWatts, baseline: wBaseline },
    speed: { baselineKmh: speedBaseline },
    weeklyDistance: { currentKm: thisWeekKm, previousKm: lastWeekKm },
    fourWeekDistance: { currentKm: recent2WeekKm, previousKm: prior2WeekKm },
    baselineCount: baselineRides.length,
    segments: segmentLines,
    prCount,
    bestSegmentImprovement,
    worstSegmentGap,
  };
}

// ─── Railway call ────────────────────────────────────────────────────────────

async function callRailwaySummary(ctx: SummaryContext, jwt: string): Promise<string> {
  const payload = {
    schemaVersion: 2,
    ride: {
      name: ctx.ride.name,
      distanceKm: ctx.ride.distanceM / 1000,
      durationSec: ctx.durationSec,
      elevationM: ctx.ride.elevationM,
      avgHrBpm: ctx.ride.avgHrBpm,
      avgWatts: ctx.ride.avgWatts,
      avgSpeedKmh: ctx.speedKmh,
      coachedBySherpaa: ctx.ride.coachedBySherpaa,
      dataSource: ctx.ride.dataSource,
    },
    trends: {
      hrVs28d: ctx.hr.baseline ? pctDelta(ctx.hr.current, ctx.hr.baseline) : null,
      powerVs28d: ctx.power.baseline ? pctDelta(ctx.power.current, ctx.power.baseline) : null,
      speedVs28d: ctx.speed.baselineKmh ? pctDelta(ctx.speedKmh, ctx.speed.baselineKmh) : null,
      weeklyDistanceKm: ctx.weeklyDistance.currentKm,
      lastWeekDistanceKm: ctx.weeklyDistance.previousKm,
      fourWeekDistanceKm: ctx.fourWeekDistance.currentKm,
      priorFourWeekDistanceKm: ctx.fourWeekDistance.previousKm,
      baselineRideCount: ctx.baselineCount,
      baselineSufficient: ctx.baselineCount >= BASELINE_MIN_RIDES,
    },
    segments: ctx.segments.map((s) => ({
      name: s.name,
      timeSec: s.timeSec,
      isNewPR: s.isNewPR,
      gapToPreSeconds: s.gapToPreSeconds,
      trendImproving: s.trendImproving,
    })),
    units: useSettingsStore.getState().units,
    instructions: [
      'Write a 4-6 sentence ride debrief that a cycling coach would deliver.',
      'Open with a one-line verdict on the ride (strong/steady/struggle/recovery).',
      'Explicitly call out 1-2 trends doing well (e.g., HR lower vs baseline, speed up, weekly volume rising).',
      'Explicitly call out 1-2 things to work on (e.g., dropping off late in segments, fading power, weekly volume slipping).',
      'Reference specific segment names where relevant.',
      'Avoid filler ("good job"); coach-tone, direct, specific. No emojis.',
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/v1/ride-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Summary endpoint ${res.status}`);
    const data = (await res.json()) as { text: string };
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Verbose deterministic fallback ──────────────────────────────────────────

function verboseDeterministicFallback(ctx: SummaryContext): string {
  const r = ctx.ride;
  const dist = spokenDistanceMeters(r.distanceM);
  const mins = Math.round(ctx.durationSec / 60);

  if (r.dataSource === 'provisional' && r.avgHrBpm == null) {
    return `Phone-tracked ride. ${dist} in ${mins} minutes. No heart-rate or power data — connect a head unit for a richer summary.`;
  }

  const lines: string[] = [];

  // ── 1. Opening verdict line based on the overall arc
  lines.push(openingVerdict(ctx, dist, mins));

  // ── 2. What's working (positive trends)
  const wins = collectWins(ctx);
  if (wins.length > 0) {
    lines.push(`What's working: ${wins.join('; ')}.`);
  }

  // ── 3. What to work on (gaps + concerns)
  const work = collectWork(ctx);
  if (work.length > 0) {
    lines.push(`To work on: ${work.join('; ')}.`);
  }

  // ── 4. Segment callouts
  const segLine = segmentCallout(ctx);
  if (segLine) lines.push(segLine);

  // ── 5. Volume context
  const volLine = volumeContext(ctx);
  if (volLine) lines.push(volLine);

  // ── 6. Baseline-building reminder
  if (ctx.baselineCount < BASELINE_MIN_RIDES) {
    lines.push(`Trends sharpen after ${BASELINE_MIN_RIDES - ctx.baselineCount} more ride${BASELINE_MIN_RIDES - ctx.baselineCount === 1 ? '' : 's'} in the rolling window.`);
  }

  return lines.join(' ');
}

function openingVerdict(ctx: SummaryContext, dist: string, mins: number): string {
  const hrUp = ctx.hr.baseline && ctx.hr.current && pctDelta(ctx.hr.current, ctx.hr.baseline) > 5;
  const speedUp = ctx.speed.baselineKmh && pctDelta(ctx.speedKmh, ctx.speed.baselineKmh) > 3;
  const powerUp = ctx.power.baseline && ctx.power.current && pctDelta(ctx.power.current, ctx.power.baseline) > 3;
  const hrDown = ctx.hr.baseline && ctx.hr.current && pctDelta(ctx.hr.current, ctx.hr.baseline) < -3;

  if (ctx.prCount > 0) return `Strong ${mins}-minute, ${dist} effort — ${ctx.prCount} new ${ctx.prCount === 1 ? 'PR' : 'PRs'} on the board.`;
  if (powerUp && hrDown) return `Efficient ${dist} ride — power up while HR stayed down. That's the sweet spot.`;
  if (powerUp && !hrUp) return `Powerful ${dist} effort, ${mins} minutes — held strong watts without burning the engine.`;
  if (speedUp && !hrUp) return `Quick ${dist} day — average speed above your recent norm with HR in check.`;
  if (hrUp && !powerUp) return `Tough ${dist} ride — HR ran high for the output. Heat, sleep, or fatigue could be the culprit.`;
  if (hrDown) return `Easy-feeling ${dist} ride — HR comfortably below your recent average.`;
  return `Steady ${dist} ride, ${mins} minutes.`;
}

function collectWins(ctx: SummaryContext): string[] {
  const wins: string[] = [];
  if (ctx.hr.baseline && ctx.hr.current) {
    const d = pctDelta(ctx.hr.current, ctx.hr.baseline);
    if (d < -3) wins.push(`heart rate ${Math.abs(d).toFixed(0)}% below your 4-week average`);
  }
  if (ctx.power.baseline && ctx.power.current) {
    const d = pctDelta(ctx.power.current, ctx.power.baseline);
    if (d > 3) wins.push(`average power ${d.toFixed(0)}% above baseline (${ctx.power.current}W)`);
  }
  if (ctx.speed.baselineKmh) {
    const d = pctDelta(ctx.speedKmh, ctx.speed.baselineKmh);
    if (d > 3) wins.push(`speed up ${d.toFixed(0)}% vs recent`);
  }
  if (ctx.prCount > 0) {
    wins.push(`${ctx.prCount} segment PR${ctx.prCount === 1 ? '' : 's'}`);
  }
  if (ctx.bestSegmentImprovement && !ctx.bestSegmentImprovement.isNewPR) {
    const gap = Math.abs(ctx.bestSegmentImprovement.gapToPreSeconds);
    if (gap > 2) wins.push(`closed in on ${ctx.bestSegmentImprovement.name} (${gap}s under PR pace)`);
  }
  const improvingSegs = ctx.segments.filter((s) => s.trendImproving && !s.isNewPR);
  if (improvingSegs.length >= 2) {
    wins.push(`trending faster on ${improvingSegs.length} segments`);
  }
  return wins;
}

function collectWork(ctx: SummaryContext): string[] {
  const items: string[] = [];
  if (ctx.hr.baseline && ctx.hr.current) {
    const d = pctDelta(ctx.hr.current, ctx.hr.baseline);
    if (d > 5) items.push(`HR ${d.toFixed(0)}% above baseline — watch for fatigue or under-recovery`);
  }
  if (ctx.power.baseline && ctx.power.current) {
    const d = pctDelta(ctx.power.current, ctx.power.baseline);
    if (d < -5) items.push(`power off ${Math.abs(d).toFixed(0)}% vs recent — could be a recovery day or low motivation`);
  }
  if (ctx.worstSegmentGap && ctx.worstSegmentGap.gapToPreSeconds > 10) {
    items.push(`${ctx.worstSegmentGap.name} ran ${ctx.worstSegmentGap.gapToPreSeconds}s slow`);
  }
  const fadingSegs = ctx.segments.filter((s) => !s.trendImproving && !s.isNewPR && s.gapToPreSeconds > 5);
  if (fadingSegs.length >= 2) {
    items.push(`pace slipping on ${fadingSegs.length} starred segments — consider freshness before your next hard day`);
  }
  return items;
}

function segmentCallout(ctx: SummaryContext): string | null {
  if (ctx.segments.length === 0) return null;
  if (ctx.prCount > 0) {
    const prs = ctx.segments.filter((s) => s.isNewPR).map((s) => s.name);
    if (prs.length === 1) return `PR on ${prs[0]}.`;
    return `PRs on ${prs.slice(0, 2).join(' and ')}${prs.length > 2 ? ` and ${prs.length - 2} more` : ''}.`;
  }
  return null;
}

function volumeContext(ctx: SummaryContext): string | null {
  const w = ctx.weeklyDistance;
  if (w.previousKm <= 0) return null;
  const d = pctDelta(w.currentKm, w.previousKm);
  const fmtCur = formatDistanceMeters(w.currentKm * 1000);
  const fmtPrev = formatDistanceMeters(w.previousKm * 1000);
  if (d > 15) return `This week's ${fmtCur} is ${d.toFixed(0)}% above last week's ${fmtPrev} — solid volume bump.`;
  if (d < -15) return `Volume cooled — ${fmtCur} this week vs ${fmtPrev} last week.`;
  return `Volume steady — ${fmtCur} this week.`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function persistSummary(rideId: string, text: string, model: string): void {
  db.update(rides)
    .set({
      debriefText: text,
      summaryGeneratedAt: Math.floor(Date.now() / 1000),
      summaryModel: model,
    })
    .where(eq(rides.id, rideId))
    .run();
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pctDelta(current: number | null, baseline: number | null): number {
  if (current == null || baseline == null || baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function deltaSpec(
  current: number,
  baseline: number,
  direction: 'higher-is-better' | 'lower-is-better',
): RideMetricRow['delta'] {
  if (baseline === 0) return { direction: 'flat' };
  const pct = ((current - baseline) / baseline) * 100;
  const absPct = Math.abs(pct);
  if (absPct < 1) return { direction: 'flat', pct: absPct };
  const isPositive = direction === 'higher-is-better' ? pct > 0 : pct < 0;
  return { direction: isPositive ? 'up' : 'down', pct: absPct };
}

function formatHHMMSS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
