// App-level configuration pulled from Expo public env vars.
// Set values in .env (never commit .env — use .env.example as a template).

export const STRAVA_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '';

// Your backend URL (Railway in prod, localhost in dev).
// Must NOT have a trailing slash.
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Deep-link scheme registered in app.json.  Used by expo-auth-session.
export const APP_SCHEME = 'veloscape';
