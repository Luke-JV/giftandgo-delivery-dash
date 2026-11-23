/**
 * The festive event. `auto` follows the calendar (1 December to 6 January in the player's local time), `on` and `off`
 * force it either way. Everything it changes is cosmetic, so the leaderboard ceilings in supabase/ are unaffected.
 */
export type FestiveSetting = 'auto' | 'on' | 'off';
export const FESTIVE_SETTINGS: readonly FestiveSetting[] = ['auto', 'on', 'off'];
export const isFestiveSetting = (value: unknown): value is FestiveSetting => FESTIVE_SETTINGS.some(setting => setting === value);

/**
 * The setting used when the host page passes none: the manual switch for the event. It is forced `on` for the 2026 season;
 * set it to `off` to end the event (or `auto` to let the calendar decide from then on). `?festive=` still overrides it.
 */
export const FESTIVE_DEFAULT: FestiveSetting = 'on';

/** Query parameter that overrides the host page's setting, for checking either look on a live build. */
export const FESTIVE_QUERY_PARAM = 'festive';
/** The season runs from FESTIVE_START (inclusive) through to the end of FESTIVE_END, as [month 0-11, day]. */
export const FESTIVE_START = [11, 1] as const;
export const FESTIVE_END = [0, 6] as const;

export const isFestiveDate = (date: Date): boolean => {
  const month = date.getMonth(), day = date.getDate();
  return (month === FESTIVE_START[0] && day >= FESTIVE_START[1]) || (month === FESTIVE_END[0] && day <= FESTIVE_END[1]);
};

/** The query parameter wins over the host's setting; `auto` then asks the calendar. */
export const resolveFestive = (setting: FestiveSetting, search: string, date: Date): boolean => {
  let override: string | null = null;
  try { override = new URLSearchParams(search).get(FESTIVE_QUERY_PARAM); } catch {}
  const chosen = isFestiveSetting(override) ? override : setting;
  return chosen === 'auto' ? isFestiveDate(date) : chosen === 'on';
};

/** Colours the scenery is painted with. The standard theme is exactly the everyday look. */
export interface SeasonTheme {
  festive: boolean;
  /** Ground bands from the horizon down. */
  grass: readonly string[];
  /** Verge patches (dark, light), flower stems and the two flower heads. */
  patches: readonly [string, string];
  stem: string;
  flowers: readonly [string, string];
  treeShadow: string;
  /** River bands from far to near, its two streak colours and the bank. */
  water: readonly string[];
  ripples: readonly [string, string];
  bank: string;
}

export const STANDARD_THEME: SeasonTheme = {
  festive: false,
  grass: ['#A4B397', '#96AA84', '#899F73', '#7C9465', '#70875C'],
  patches: ['#819A69', '#A0AF7B'],
  stem: '#C5CD91',
  flowers: ['#F1E6B0', '#DDAC58'],
  treeShadow: '#586F49',
  water: ['#A6C3C3', '#8CAFB9', '#709FAB', '#608C9B', '#537D90'],
  ripples: ['#99BAC1', '#BAD1CE'],
  bank: '#C7C6A3',
};

export const FESTIVE_THEME: SeasonTheme = {
  festive: true,
  grass: ['#EEF2F8', '#E4EAF3', '#D9E1EC', '#CFD8E6', '#C4CFDF'],
  patches: ['#B9C6D8', '#FFFFFF'],
  stem: '#8D9B86',
  flowers: ['#D9381E', '#2F7D4A'],
  treeShadow: '#AEBBCD',
  water: ['#E2EDF3', '#D4E4EC', '#C5DAE5', '#B7CFDD', '#A9C4D5'],
  ripples: ['#FFFFFF', '#F1F7FB'],
  bank: '#F4F7FB',
};

/** Snowfall: flakes on screen, their fall speed range in pixels a second and how far they sway. */
export const SNOW_FLAKES = 64;
export const SNOW_FALL = [14, 34] as const;
export const SNOW_SWAY = 6;

/** Santa's sleigh crosses the sky this often (seconds, random within the range), never in the first few seconds of a run. */
export const SLEIGH_FIRST_SECONDS = [10, 18] as const;
export const SLEIGH_GAP_SECONDS = [25, 45] as const;
export const SLEIGH_CROSS_SECONDS = 7;
/** Share of flybys that run right to left and drop a present behind the hills. */
export const SLEIGH_REVERSE_CHANCE = 0.25;

/** Baubles on the snowy roadside pine (green foliage between the snow), in pixels of the pine's window in the festive trees atlas, and the star at its tip. */
export const PINE_BAUBLES: readonly (readonly [number, number])[] = [[20, 12], [22, 19], [18, 22], [26, 22], [23, 34], [30, 43], [22, 44]];
export const PINE_STAR: readonly [number, number] = [20, 0];
export const BAUBLE_COLOURS: readonly string[] = ['#D9381E', '#FFD24A', '#4FA3E0', '#B06BE0'];
