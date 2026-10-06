import { RunResult } from './delivery-dash.engine';

export interface ScoreRow { id: number; nickname: string; distance: number; gifts: number; }

// The anon key is public by design; Row Level Security blocks direct writes and
// submit_score validates every run server-side.
const SUPABASE_URL = 'https://jrfblescrprjndybqkog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZmJsZXNjcnByam5keWJxa29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTczMzYsImV4cCI6MjEwNjg3MzMzNn0.gkr5RDt8qcqTN2juJP0dxSW4DVPyRMkjTuj84g6gDMM';
const REQUEST_TIMEOUT_MS = 8000;

// Long, unambiguous words match anywhere in the name; short ones only as whole words
// so names like "Grapes" or "Dickens" stay allowed. Keep in sync with is_clean_name in Supabase.
const BLOCKED_SUBSTRINGS = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'pussy', 'bollock', 'retard', 'asshole', 'dickhead', 'cocksuck', 'motherf', 'bastard', 'hitler', 'porn', 'http'];
const BLOCKED_WORDS = ['rape', 'rapist', 'nazi', 'dick', 'cock', 'slut', 'tit', 'tits', 'ass', 'cum', 'anal', 'sex', 'fag', 'paki', 'coon', 'kike', 'spic', 'twat', 'piss', 'wank'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '+': 't', '|': 'i' };

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

const squashRepeats = (text: string): string => text.replace(/(.)\1+/g, '$1');

const normalise = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[0134578@$!+|]/g, character => LEET[character] ?? character);

export const isProfane = (text: string): boolean => {
  const normalised = normalise(text);
  const letters = normalised.replace(/[^a-z]/g, '').replace(/scunthorpe/g, '');
  // Stretched letters ("fuuuck") and separators ("s.h.i.t") are both caught.
  const squashed = squashRepeats(letters);
  if (BLOCKED_SUBSTRINGS.some(word => letters.includes(word) || squashed.includes(squashRepeats(word)))) return true;
  return normalised.split(/[^a-z]+/).some(word => BLOCKED_WORDS.includes(word));
};

/** Any characters are allowed (any language, emoji); profanity and control characters are not. */
export const cleanNickname = (raw: string): string | null => {
  const nickname = raw.replace(/\s+/g, ' ').trim();
  const length = Array.from(nickname).length;
  if (length < 2 || length > 16 || /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u.test(nickname) || isProfane(nickname)) return null;
  return nickname;
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
