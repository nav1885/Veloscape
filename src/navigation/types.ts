import { NavigatorScreenParams } from '@react-navigation/native';
import { GoalMode } from '../types/goalMode';

// ─── Auth Stack ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Welcome: undefined;
  Carousel: undefined;
  StravaConnect: undefined;
  Connected: {
    athleteName: string;
    avatarUrl?: string;
    stravaAthleteId: string;
    riderId: string;
    jwt: string;
    stravaAccessToken: string;
    stravaRefreshToken: string;
    stravaTokenExpiresAt: number;
  };
};

// ─── Ride Stack (modal on top of Main tabs) ───────────────────────────────────

export type RideStackParamList = {
  InRide: { segmentIds: string[]; goalMode: GoalMode; simulate?: boolean };
  SegmentResult: {
    segmentId: string;
    segmentName: string;
    finalTimeSec: number;
    isNewPR: boolean;
    gapToPreSeconds: number;
    prTimeSec?: number;
  };
  PostRideSummary: { rideId: string };
  Paywall: { triggerSource: 'segment_gate' | 'feature_gate' };
};

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  Segments: undefined;
  History: undefined;
  Settings: undefined;
};

// ─── Root Stack ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Ride: NavigatorScreenParams<RideStackParamList>;
};

// ─── Type helpers ─────────────────────────────────────────────────────────────

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
