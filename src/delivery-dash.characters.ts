/** Who is driving: the Gift&Go van (the original truck) or Joe in his silver Ferrari. */
export type CharacterId = 'van' | 'joe';
export const CHARACTER_IDS: readonly CharacterId[] = ['van', 'joe'];

/**
 * What a driver changes on the road. Boost and recharge stay inside the leaderboard's distance ceiling
 * (supabase/leaderboard-v0.2.sql allows about 0.6 × 45% of the run in extra boost distance): the van's best case is
 * 0.6 × 6/14, Joe's is 0.7 × 5/14, so neither needs the SQL changed. Cargo only scales the shop wallet, never score.
 */
export interface CharacterRules {
  /** How much faster boosting goes than the road. */
  boostFactor: number;
  /** Nitro tank in seconds before any shop upgrades. */
  nitroBase: number;
  /** Seconds for an empty tank to refill. */
  rechargeSeconds: number;
  /** Seconds to slide one lane across. */
  laneSeconds: number;
  /** Share of each gift's points that reaches the shop wallet. */
  cargo: number;
  /** Shields fitted at the start of a run. */
  startShields: number;
}

export interface CharacterStat { label: string; value: number; note: string; }

export interface CharacterDefinition {
  name: string;
  /** Sprite keys in DELIVERY_DASH_ASSETS: the select portrait, the player sprite and the oncoming rival. */
  portrait: string;
  sprite: string;
  rival: string;
  rivalName: string;
  accent: string;
  rules: CharacterRules;
  /** Out of STAT_MAX, shown as bars on the select screen. */
  stats: readonly CharacterStat[];
}

export const STAT_MAX = 10;

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  van: {
    name: 'GnG Van',
    portrait: 'portraitVan', sprite: 'truck', rival: 'ferrari', rivalName: 'Joe',
    accent: '#ED8B00',
    rules: { boostFactor: 1.6, nitroBase: 3, rechargeSeconds: 8, laneSeconds: 0.16, cargo: 1, startShields: 1 },
    stats: [
      { label: 'Top speed', value: 6, note: '1.6× boost' },
      { label: 'Nitro', value: 7, note: '3s tank' },
      { label: 'Handling', value: 5, note: 'Steady lane changes' },
      { label: 'Cargo', value: 10, note: 'Full gift points for shops' },
      { label: 'Armour', value: 8, note: 'Starts with a shield' },
      { label: 'Swagger', value: 4, note: 'Very professional' },
    ],
  },
  joe: {
    name: 'Joe',
    portrait: 'portraitJoe', sprite: 'ferrariRear', rival: 'vanFront', rivalName: 'GnG Van',
    accent: '#D9381E',
    rules: { boostFactor: 1.7, nitroBase: 2, rechargeSeconds: 9, laneSeconds: 0.12, cargo: 0.5, startShields: 0 },
    stats: [
      { label: 'Top speed', value: 9, note: '1.7× boost' },
      { label: 'Nitro', value: 4, note: '2s tank, slow refill' },
      { label: 'Handling', value: 9, note: 'Snappy lane changes' },
      { label: 'Cargo', value: 4, note: 'Half gift points for shops' },
      { label: 'Armour', value: 2, note: 'No shield, just hair gel' },
      { label: 'Swagger', value: 10, note: 'Off the chart' },
    ],
  },
};

export const isCharacterId = (value: unknown): value is CharacterId => CHARACTER_IDS.some(id => id === value);

export const SELECT_COPY = { eyebrow: 'CHOOSE YOUR DRIVER', title: 'Who\'s driving?', drive: 'Drive!', back: 'Back', change: 'Change driver', rival: 'Watch out for' };
