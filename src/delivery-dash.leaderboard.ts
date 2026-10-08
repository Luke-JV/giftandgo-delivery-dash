import { RunResult } from './delivery-dash.engine';

/** v0.2 ranks on score and is the default board; v0.1 (ranked on distance) keeps its own table and stays viewable. */
export type BoardVersion = 'v02' | 'v01';
export interface ScoreRow { id: number; nickname: string; score?: number; distance: number; gifts: number; rank: number; }

// The anon key is public by design; Row Level Security blocks direct writes and
// submit_score validates every run server-side, and v0.2 runs are timed by the server via start_run.
const SUPABASE_URL = 'https://jrfblescrprjndybqkog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZmJsZXNjcnByam5keWJxa29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTczMzYsImV4cCI6MjEwNjg3MzMzNn0.gkr5RDt8qcqTN2juJP0dxSW4DVPyRMkjTuj84g6gDMM';
const REQUEST_TIMEOUT_MS = 8000;

// Long, unambiguous words match anywhere in the name; short ones only as whole words
// so names like "Grapes" or "Dickens" stay allowed. Keep in sync with is_clean_name in Supabase.
const BLOCKED_SUBSTRINGS = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'pussy', 'bollock', 'retard', 'asshole', 'dickhead', 'cocksuck', 'motherf', 'bastard', 'hitler', 'porn', 'http'];
const BLOCKED_WORDS = ['rape', 'rapist', 'nazi', 'dick', 'cock', 'slut', 'tit', 'tits', 'ass', 'cum', 'anal', 'sex', 'fag', 'paki', 'coon', 'kike', 'spic', 'twat', 'piss', 'wank'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '+': 't', '|': 'i' };

export const MIN_SUBMIT_SCORE = 100;
export const BOARD_PAGE_SIZE = 25;

export const formatScore = (score: number): string => Math.floor(score).toLocaleString('en-US');

/** Display only: stored distances stay in whole metres. */
export const formatDistance = (metres: number): { value: string; unit: string } => {
  if (metres < 1000) return { value: String(Math.floor(metres)), unit: 'm' };
  const kilometres = metres / 1000;
  const decimals = kilometres < 10 ? 2 : kilometres < 1000 ? 1 : 0;
  return { value: kilometres.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), unit: 'km' };
};

export const distanceLabel = (metres: number): string => {
  const { value, unit } = formatDistance(metres);
  return `${value}${unit}`;
};

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status}): ${await response.text().catch(() => '')}`);
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

const BOARD_SOURCES: Record<BoardVersion, { table: string; ranked: string; columns: string; order: string }> = {
  v02: { table: 'scores_v02', ranked: 'scores_v02_ranked', columns: 'id,nickname,score,distance,gifts', order: 'score.desc,created_at.asc' },
  v01: { table: 'scores', ranked: 'scores_ranked', columns: 'id,nickname,distance,gifts', order: 'distance.desc,created_at.asc' },
};

// PostgREST turns every * into the like wildcard and cannot escape it, so it is dropped; % and _ are escaped.
const nicknamePattern = (query: string): string => encodeURIComponent(`*${query.replace(/\*/g, '').replace(/[\\%_]/g, '\\$&')}*`);

/** One page of a board, best first. Searches read the ranked view (leaderboard-search.sql) so matches keep their overall rank. */
export const fetchScores = async (version: BoardVersion, query: string, offset: number): Promise<ScoreRow[]> => {
  const source = BOARD_SOURCES[version];
  const page = `limit=${BOARD_PAGE_SIZE}&offset=${offset}`;
  if (query) return (await request(`${source.ranked}?select=${source.columns},rank&nickname=ilike.${nicknamePattern(query)}&order=rank.asc&${page}`)).json();
  const rows: Omit<ScoreRow, 'rank'>[] = await (await request(`${source.table}?select=${source.columns}&order=${source.order}&${page}`)).json();
  return rows.map((row, index) => ({ ...row, rank: offset + index + 1 }));
};

/** Registers a run with the server, which then times it; the id is needed to submit the run. */
export const startRun = async (): Promise<string> =>
  (await request('rpc/start_run', { method: 'POST', body: '{}' })).json();

export const submitScore = async (runId: string, nickname: string, result: RunResult): Promise<number> =>
  (await request('rpc/submit_score_v02', { method: 'POST', body: JSON.stringify({
    p_run_id: runId, p_nickname: nickname, p_score: result.score, p_distance: result.distance, p_gifts: result.gifts,
    p_points: result.giftPoints, p_duration: result.duration,
    p_max_multiplier: result.maxMultiplier, p_deliveries: result.deliveries,
  }) })).json();

/** 1-based rank on the v0.2 board: runs with a strictly higher score, plus one. */
export const fetchRank = async (score: number): Promise<number> => {
  const response = await request(`scores_v02?select=id&score=gt.${Math.floor(score)}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  return Number(response.headers.get('content-range')?.split('/')[1] ?? 0) + 1;
};
