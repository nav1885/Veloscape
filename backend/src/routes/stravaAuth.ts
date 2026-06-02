/**
 * Strava OAuth routes.
 *
 * GET  /oauth/callback
 *   Strava redirects here after the user authorizes.
 *   Exchanges the code, signs a JWT, then deep-links back to the app:
 *   veloscape://connected?jwt=...&accessToken=...&...
 *
 * POST /auth/strava/refresh
 *   Body: { refreshToken: string }
 *   Refreshes an expired Strava access_token.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth';

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID ?? '';
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
const JWT_EXPIRES_IN = '90d';
const APP_SCHEME = 'veloscape';

// ─── Strava token exchange ────────────────────────────────────────────────────

interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
  };
}

async function exchangeWithStrava(code: string, redirectUri: string): Promise<StravaTokenResponse> {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<StravaTokenResponse>;
}

async function refreshWithStrava(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{ access_token: string; expires_at: number }>;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function stravaAuthRoutes(app: FastifyInstance) {

  // GET /oauth/callback  ← Strava redirects here after user authorizes
  app.get(
    '/oauth/callback',
    async (
      req: FastifyRequest<{ Querystring: { code?: string; error?: string; state?: string } }>,
      reply: FastifyReply,
    ) => {
      const { code, error } = req.query;

      if (error || !code) {
        const errMsg = error ?? 'missing_code';
        app.log.error('Strava OAuth error in callback: ' + errMsg);
        return reply.redirect(`${APP_SCHEME}://connected?error=${encodeURIComponent(errMsg)}`);
      }

      // Railway terminates TLS at the edge — req.protocol is always 'http' internally.
      // Use x-forwarded-proto to get the real scheme, defaulting to https.
      const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
      const redirectUri = `${proto}://${req.hostname}/oauth/callback`;
      app.log.info({ redirectUri }, 'OAuth callback received, exchanging code');

      let stravaData: StravaTokenResponse;
      try {
        stravaData = await exchangeWithStrava(code, redirectUri);
      } catch (err: any) {
        app.log.error(err, 'Strava token exchange error');
        return reply.redirect(`${APP_SCHEME}://connected?error=${encodeURIComponent(err.message ?? 'exchange_failed')}`);
      }

      const athlete = stravaData.athlete;
      const riderId = randomUUID();

      const jwtToken = jwt.sign(
        { sub: riderId, stravaAthleteId: String(athlete.id) },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
      );

      // Deep-link back to the app with all credentials as query params
      const params = new URLSearchParams({
        jwt: jwtToken,
        accessToken: stravaData.access_token,
        refreshToken: stravaData.refresh_token,
        expiresAt: String(stravaData.expires_at),
        riderId,
        stravaAthleteId: String(athlete.id),
        name: `${athlete.firstname} ${athlete.lastname}`.trim(),
        avatarUrl: athlete.profile ?? '',
      });

      return reply.redirect(`${APP_SCHEME}://connected?${params.toString()}`);
    },
  );

  // POST /auth/strava/refresh  ← requires a valid Sherpaa JWT
  app.post<{ Body: { refreshToken: string } }>(
    '/auth/strava/refresh',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return reply.status(400).send({ error: 'refreshToken is required' });
      }

      try {
        const data = await refreshWithStrava(refreshToken);
        return reply.send({ accessToken: data.access_token, expiresAt: data.expires_at });
      } catch (err: any) {
        app.log.error(err, 'Strava refresh error');
        return reply.status(502).send({ error: err.message ?? 'Refresh failed' });
      }
    },
  );
}
