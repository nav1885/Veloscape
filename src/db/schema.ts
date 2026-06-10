import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ─── Rider ────────────────────────────────────────────────────────────────────

export const riders = sqliteTable('riders', {
  id: text('id').primaryKey(), // UUID
  stravaAthleteId: text('strava_athlete_id').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  subscriptionTier: text('subscription_tier', { enum: ['free', 'pro', 'elite'] }).notNull().default('free'),
  subscriptionExpiresAt: integer('subscription_expires_at'), // unix timestamp
  createdAt: integer('created_at').notNull(), // unix timestamp
  updatedAt: integer('updated_at').notNull(),
});

// ─── Segment ──────────────────────────────────────────────────────────────────

export const segments = sqliteTable(
  'segments',
  {
    id: text('id').primaryKey(), // UUID
    stravaSegmentId: text('strava_segment_id').notNull().unique(),
    name: text('name').notNull(),
    distanceM: real('distance_m').notNull(),
    elevationM: real('elevation_m').notNull().default(0),
    startLat: real('start_lat').notNull(),
    startLng: real('start_lng').notNull(),
    endLat: real('end_lat').notNull(),
    endLng: real('end_lng').notNull(),
    polyline: text('polyline'), // encoded polyline string
    isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(true),
    lastFetchedAt: integer('last_fetched_at').notNull(),
    detailFetchedAt: integer('detail_fetched_at'), // unix ts; null = detail never fetched
  },
  (t) => ({
    stravaIdIdx: index('idx_segments_strava_id').on(t.stravaSegmentId),
  })
);

// ─── Ride ─────────────────────────────────────────────────────────────────────

export const rides = sqliteTable('rides', {
  id: text('id').primaryKey(), // UUID
  riderId: text('rider_id').notNull().references(() => riders.id),
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(), // unix timestamp
  endedAt: integer('ended_at').notNull(),
  distanceM: real('distance_m').notNull(),
  elevationM: real('elevation_m').notNull().default(0),
  avgHrBpm: integer('avg_hr_bpm'),
  avgWatts: integer('avg_watts'),
  gpxTrack: text('gpx_track'), // JSON-encoded array of {lat, lng, timestamp}
  stravaActivityId: text('strava_activity_id'),
  stravaSynced: integer('strava_synced', { mode: 'boolean' }).notNull().default(false),
  debriefText: text('debrief_text'),
  goalMode: text('goal_mode', { enum: ['pr', 'training', 'recovery'] }).notNull(),
  createdAt: integer('created_at').notNull(),
  // Phone-as-Coach amendment
  dataSource: text('data_source', { enum: ['provisional', 'strava'] }).notNull().default('provisional'),
  importedFromStrava: integer('imported_from_strava', { mode: 'boolean' }).notNull().default(false),
  lastReconcileAttemptAt: integer('last_reconcile_attempt_at'),
  // Unified Home Feed amendment
  coachedBySherpaa: integer('coached_by_sherpaa', { mode: 'boolean' }).notNull().default(false),
  summaryGeneratedAt: integer('summary_generated_at'),
  summaryModel: text('summary_model'),
  // Deferred summary for a backgrounded (lock-screen) End — shown on next open.
  summaryViewed: integer('summary_viewed', { mode: 'boolean' }).notNull().default(false),
});

// ─── Cue Log (Phone-as-Coach) ────────────────────────────────────────────────

export const cueLogEntries = sqliteTable(
  'cue_log_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rideId: text('ride_id').notNull().references(() => rides.id),
    segmentId: text('segment_id').notNull(),
    cueType: text('cue_type', { enum: ['approach', 'start', 'split25', 'split50', 'split75', 'end'] }).notNull(),
    variant: text('variant', { enum: ['aggressive', 'moderate', 'recovery'] }),
    text: text('text').notNull(),
    firedAt: integer('fired_at').notNull(),
  },
  (t) => ({
    rideIdIdx: index('idx_cue_log_ride_id').on(t.rideId),
  })
);

// ─── Segment Effort ───────────────────────────────────────────────────────────

export const segmentEfforts = sqliteTable(
  'segment_efforts',
  {
    id: text('id').primaryKey(), // UUID
    segmentId: text('segment_id').notNull().references(() => segments.id),
    rideId: text('ride_id').notNull().references(() => rides.id),
    riderId: text('rider_id').notNull().references(() => riders.id),
    timeSec: integer('time_sec').notNull(),
    avgWatts: integer('avg_watts'),
    avgHrBpm: integer('avg_hr_bpm'),
    wasSkipped: integer('was_skipped', { mode: 'boolean' }).notNull().default(false),
    // Split checkpoints: gap to PR at 25/50/75/100% of segment distance
    split25GapSec: integer('split_25_gap_sec'),
    split50GapSec: integer('split_50_gap_sec'),
    split75GapSec: integer('split_75_gap_sec'),
    cueVariantPlayed: text('cue_variant_played', { enum: ['aggressive', 'moderate', 'recovery'] }),
    cueTextPlayed: text('cue_text_played'),
    isNewPR: integer('is_new_pr', { mode: 'boolean' }).notNull().default(false),
    gapToPreSeconds: integer('gap_to_pre_seconds').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    segmentIdIdx: index('idx_efforts_segment_id').on(t.segmentId),
    rideIdIdx: index('idx_efforts_ride_id').on(t.rideId),
    riderIdIdx: index('idx_efforts_rider_id').on(t.riderId),
  })
);

// ─── Cue ──────────────────────────────────────────────────────────────────────

export const cues = sqliteTable(
  'cues',
  {
    id: text('id').primaryKey(), // UUID
    segmentId: text('segment_id').notNull().references(() => segments.id),
    goalMode: text('goal_mode', { enum: ['pr', 'training', 'recovery'] }).notNull(),
    aggressive: text('aggressive').notNull(),
    moderate: text('moderate').notNull(),
    recovery: text('recovery').notNull(),
    generatedAt: integer('generated_at').notNull(), // unix timestamp
  },
  (t) => ({
    segmentGoalIdx: index('idx_cues_segment_goal').on(t.segmentId, t.goalMode),
  })
);

// ─── Cached Activities ───────────────────────────────────────────────────────

export const cachedActivities = sqliteTable(
  'cached_activities',
  {
    stravaId: integer('strava_id').primaryKey(),
    name: text('name').notNull(),
    distance: real('distance').notNull(),
    movingTime: integer('moving_time').notNull(),
    startDate: text('start_date').notNull(),
    summaryPolyline: text('summary_polyline').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    // Unified Home Feed amendment
    totalElevationGain: real('total_elevation_gain').notNull().default(0),
    averageHeartrate: integer('average_heartrate'),
    averageWatts: integer('average_watts'),
    activityType: text('activity_type').notNull().default('Ride'),
  }
);

export type CachedActivity = typeof cachedActivities.$inferSelect;

// ─── Pacing Model ─────────────────────────────────────────────────────────────

export const pacingModels = sqliteTable(
  'pacing_models',
  {
    id: text('id').primaryKey(), // UUID
    segmentId: text('segment_id').notNull().references(() => segments.id).unique(),
    tendency: text('tendency', { enum: ['fade', 'strongStart', 'consistent', 'unknown'] }).notNull().default('unknown'),
    confidenceScore: real('confidence_score').notNull().default(0), // 0.0–1.0
    effortCount: integer('effort_count').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    segmentIdIdx: index('idx_pacing_segment_id').on(t.segmentId),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type Rider = typeof riders.$inferSelect;
export type NewRider = typeof riders.$inferInsert;
export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type Ride = typeof rides.$inferSelect;
export type NewRide = typeof rides.$inferInsert;
export type SegmentEffort = typeof segmentEfforts.$inferSelect;
export type NewSegmentEffort = typeof segmentEfforts.$inferInsert;
export type Cue = typeof cues.$inferSelect;
export type NewCue = typeof cues.$inferInsert;
export type PacingModel = typeof pacingModels.$inferSelect;
export type NewPacingModel = typeof pacingModels.$inferInsert;
export type CueLogEntry = typeof cueLogEntries.$inferSelect;
export type NewCueLogEntry = typeof cueLogEntries.$inferInsert;
