/**
 * Strava OAuth flow using expo-auth-session (PKCE not required by Strava;
 * we use the Authorization Code flow).  The client_secret is never stored in
 * the app — the code→token exchange happens on our backend.
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { API_URL, APP_SCHEME, STRAVA_CLIENT_ID } from '../constants/config';

// Required: let expo-web-browser complete the session on Android.
WebBrowser.maybeCompleteAuthSession();

// ─── Strava OAuth discovery (authorization only — token exchange is server-side)

const STRAVA_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://www.strava.com/oauth/mobile/authorize',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StravaTokenResult {
  jwt: string;
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaTokenExpiresAt: number; // unix timestamp
  rider: {
    id: string;
    stravaAthleteId: string;
    name: string;
    avatarUrl?: string;
  };
}

// ─── Redirect URI ─────────────────────────────────────────────────────────────

function getRedirectUri(): string {
  const uri = AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'auth',
  });
  console.log('[stravaAuth] redirect URI:', uri);
  return uri;
}

// ─── Step 1: Open Strava browser and get an auth code ─────────────────────────

export async function promptStravaAuth(): Promise<string> {
  if (!STRAVA_CLIENT_ID) {
    throw new Error('MISSING_STRAVA_CLIENT_ID');
  }
  const redirectUri = getRedirectUri();

  // Strava requires comma-separated scopes, not space-separated.
  // Pass scope manually via extraParams to bypass expo-auth-session's
  // default space-joining behaviour.
  const request = new AuthSession.AuthRequest({
    clientId: STRAVA_CLIENT_ID,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    extraParams: {
      scope: 'read,activity:read,profile:read_all',
      approval_prompt: 'auto',
    },
  });

  const result = await request.promptAsync(STRAVA_DISCOVERY);

  if (result.type === 'success') {
    return result.params.code;
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('CANCELLED');
  }

  throw new Error(result.type === 'error' ? (result.error?.message ?? 'OAuth error') : 'OAuth failed');
}

// ─── Step 2: Exchange auth code for tokens via our backend ────────────────────
// The backend holds the client_secret, exchanges with Strava, creates/updates
// the rider row, and returns a signed JWT + the Strava tokens.

export async function exchangeStravaCode(code: string, redirectUri: string): Promise<StravaTokenResult> {

  const res = await fetch(`${API_URL}/auth/strava/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Backend token exchange failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<StravaTokenResult>;
}

// ─── Step 3 (optional): Refresh an expired Strava access_token ───────────────
// Requires a valid Veloscape JWT — the backend will 401 otherwise.

export async function refreshStravaToken(
  refreshToken: string,
  jwt: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(`${API_URL}/auth/strava/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status})`);
  }

  const data = (await res.json()) as { accessToken: string; expiresAt: number };
  return data;
}
