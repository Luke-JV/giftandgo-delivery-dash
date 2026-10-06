import { RunResult } from './delivery-dash.engine';

export interface ScoreRow { id: number; nickname: string; distance: number; gifts: number; }

// The anon key is public by design; Row Level Security blocks direct writes and
// submit_score validates every run server-side.
const SUPABASE_URL = 'https://jrfblescrprjndybqkog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZmJsZXNjcnByam5keWJxa29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTczMzYsImV4cCI6MjEwNjg3MzMzNn0.gkr5RDt8qcqTN2juJP0dxSW4DVPyRMkjTuj84g6gDMM';
const REQUEST_TIMEOUT_MS = 8000;
const BLOCKED_WORDS = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'whore', 'slut', 'dick', 'cock', 'pussy'];

export const MIN_SCORE_DISTANCE = 20;

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
    return response;
  } finally { clearTimeout(timer); }
};

export const cleanNickname = (raw: string): string | null => {
  const nickname = raw.replace(/\s+/g, ' ').trim();
  if (nickname.length < 2 || nickname.length > 16 || !/^[\p{L}\p{N} ._-]+$/u.test(nickname)) return null;
  const squashed = nickname.toLowerCase().replace(/[^a-z]/g, '');
  return BLOCKED_WORDS.some(word => squashed.includes(word)) ? null : nickname;
};

export const fetchTopScores = async (limit = 5): Promise<ScoreRow[]> =>
  (await request(`scores?select=id,nickname,distance,gifts&order=distance.desc,created_at.asc&limit=${limit}`)).json();

export const submitScore = async (nickname: string, result: RunResult): Promise<number> =>
  (await request('rpc/submit_score', { method: 'POST', body: JSON.stringify({
    p_nickname: nickname, p_distance: result.distance, p_gifts: result.gifts,
    p_points: result.giftPoints, p_duration: result.duration,
  }) })).json();

/** 1-based rank of a distance: runs strictly further than it, plus one. */
export const fetchRank = async (distance: number): Promise<number> => {
  const response = await request(`scores?select=id&distance=gt.${Math.floor(distance)}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  return Number(response.headers.get('content-range')?.split('/')[1] ?? 0) + 1;
};
