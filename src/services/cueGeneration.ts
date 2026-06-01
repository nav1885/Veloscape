/**
 * Backend-proxied cue generation.
 *
 * POSTs anonymized segment stats to `/cues/generate`; the backend calls the
 * LLM and returns three spoken cue variants per segment (aggressive, moderate,
 * recovery). Never contacts the LLM directly — the API key lives on Railway.
 */

import { API_URL } from '../constants/config';
import { Segment } from '../store/segmentStore';
import { GoalMode } from '../types/goalMode';

export interface GeneratedCue {
  segmentIndex: number;
  aggressive: string;
  moderate: string;
  recovery: string;
  fallback: boolean;
}

interface GenerateResponse {
  cues: GeneratedCue[];
}

export async function generateCuesForSegments(
  segments: Segment[],
  goalMode: GoalMode,
  jwt: string,
): Promise<GeneratedCue[]> {
  if (segments.length === 0) return [];

  const payload = {
    goalMode,
    segments: segments.map(s => ({
      name: s.name,
      distanceM: s.distanceM,
      elevationM: s.elevationM,
      bestTimeSec: s.bestTimeSec,
      effortCount: s.effortCount,
      pacingTendency: s.pacingTendency,
    })),
  };

  const res = await fetch(`${API_URL}/cues/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cue generation failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GenerateResponse;
  return data.cues;
}
