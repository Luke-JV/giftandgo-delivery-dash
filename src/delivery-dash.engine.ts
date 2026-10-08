export type GameState = 'ready' | 'running' | 'paused' | 'reward' | 'shop' | 'crashed';
/** Coupons are free, short-lived power moments. */
export type CouponReward = 'ghost' | 'jackpot' | 'rain';
/** Shop items are bought with gift points; upgrades last for the rest of the run. */
export type ShopItem = 'shield' | 'nitro' | 'loyalty' | 'magnet' | 'freeplay';
export type GiftReward = CouponReward | ShopItem;
export const COUPON_REWARDS: readonly CouponReward[] = ['ghost', 'jackpot', 'rain'];
/** Freeplay cashes in every gift point at the current multiplier; it needs at least this many. */
export const FREEPLAY_MINIMUM = 10;
/** Coloured gifts sit in place of a plain route gift: blue pays double, green refills the nitro tank, purple pays five times, pink pays double and adds a shield. A slot machine is a rare route gift that spins for a payout or a penalty. */
export type GiftVariant = 'blue' | 'green' | 'purple' | 'pink' | 'slot';
export interface GiftVariantRule { variant: GiftVariant; chance: number; multiplier: number; }
export const GIFT_VARIANTS: readonly GiftVariantRule[] = [
  { variant: 'blue', chance: 0.1, multiplier: 2 },
  { variant: 'green', chance: 0.06, multiplier: 1 },
  { variant: 'purple', chance: 0.03, multiplier: 5 },
  { variant: 'pink', chance: 0.02, multiplier: 2 },
  { variant: 'slot', chance: 0.02, multiplier: 1 },
];
export type SlotSymbol = 'seven' | 'gift' | 'star' | 'bell' | 'coal';
export type SlotOutcome = 'jackpot' | 'cursed' | 'triple' | 'pair' | 'miss' | 'loss';
/** A win pays `payout` × the multiplier at pickup; a loss is a flat deduction from score, never below zero. */
export interface SlotOutcomeRule { outcome: SlotOutcome; chance: number; payout: number; }
export const SLOT_OUTCOMES: readonly SlotOutcomeRule[] = [
  { outcome: 'jackpot', chance: 0.03, payout: 500 },
  { outcome: 'triple', chance: 0.12, payout: 150 },
  { outcome: 'pair', chance: 0.3, payout: 50 },
  { outcome: 'miss', chance: 0.245, payout: 0 },
  { outcome: 'loss', chance: 0.3, payout: -100 },
  { outcome: 'cursed', chance: 0.005, payout: -5000 },
];
export const SLOT_SYMBOLS: readonly SlotSymbol[] = ['seven', 'gift', 'star', 'bell'];
/** Seconds after pickup at which each reel stops; the last one settles the result. */
export const SLOT_REEL_STOPS: readonly [number, number, number] = [0.9, 1.25, 1.6];
/** A slot machine is never offered again within this many seconds of the last one. */
export const SLOT_MIN_GAP = 30;
export interface SlotSpin { startedAt: number; stopAt: [number, number, number]; reels: [SlotSymbol, SlotSymbol, SlotSymbol]; outcome: SlotOutcome; amount: number; settledAt: number | null; }
export interface SlotResult { outcome: SlotOutcome; amount: number; at: number; }
export const SHIELD_LIMIT = 1;
/**
 * Speed in world units per second after t seconds driven: it climbs quickly to about 3.2× the starting pace in the
 * first minute, then creeps up for the rest of the run with no ceiling. Rows are spaced in seconds, so speed
 * sets how the game looks and scores; how hard it is to react comes from ROW_GAPS and DIFFICULTY_FROM below.
 */
export const SPEED_START = 129;
export const SPEED_RISE = 360;
export const SPEED_RISE_SECONDS = 60;
export const SPEED_CREEP = 0.9;
export const speedAt = (seconds: number): number => SPEED_START + SPEED_RISE * (1 - Math.exp(-seconds / SPEED_RISE_SECONDS)) + SPEED_CREEP * seconds;
/** Distance covered in `seconds` of driving: the integral of `speedAt`. */
export const distanceAt = (seconds: number): number => SPEED_START * seconds + SPEED_RISE * (seconds - SPEED_RISE_SECONDS * (1 - Math.exp(-seconds / SPEED_RISE_SECONDS))) + SPEED_CREEP / 2 * seconds * seconds;
/**
 * Seconds between rows at the given time into the run, linearly between these points and flat after the last.
 * Comfortable for the first minute, steadily harder to 5 minutes, and from 7 minutes on it stays at 0.32s. Rows are
 * visible seconds ahead, so the limit is timing, not spotting: an edge-to-edge jump between two blocked rows then has
 * about a 150ms window to start in (it needs 1.43 lanes, 0.23s, to clear the middle lane's hitbox), an expert
 * player's margin with nothing left over for fatigue or a slip.
 */
export const ROW_GAPS: readonly (readonly [number, number])[] = [[0, 1.2], [30, 1.0], [90, 0.8], [180, 0.6], [300, 0.45], [420, 0.32]];
export const rowGapAt = (seconds: number): number => {
  const next = ROW_GAPS.findIndex(([time]) => time > seconds);
  if (next === -1) return ROW_GAPS[ROW_GAPS.length - 1][1];
  const [fromTime, fromGap] = ROW_GAPS[next - 1], [toTime, toGap] = ROW_GAPS[next];
  return fromGap + (toGap - fromGap) * (seconds - fromTime) / (toTime - fromTime);
};
/** Seconds into the run when each tuning ramp below reaches its full value; before that it eases in from its starting value. */
const DIFFICULTY_FROM = 30;
const DIFFICULTY_FULL = 360;
/** 0 until DIFFICULTY_FROM, then rising to 1 at DIFFICULTY_FULL; scales how often the harder patterns and traps appear. */
export const difficultyAt = (seconds: number): number => Math.max(0, Math.min(1, (seconds - DIFFICULTY_FROM) / (DIFFICULTY_FULL - DIFFICULTY_FROM)));
const blend = (easy: number, hard: number, seconds: number): number => easy + (hard - easy) * difficultyAt(seconds);
/** `stalledcar` is the tunnel's obstacle, `birds` and `puddle` the bridge's. A `gantry` is an overhead lane-control signal that never collides. */
export type EntityKind = 'cone' | 'barrier' | 'drum' | 'pothole' | 'gift' | 'coupon' | 'shop' | 'delivery' | 'roadworks' | 'powerpup' | 'giftasaurus' | 'crane' | 'stalledcar' | 'gantry' | 'birds' | 'puddle' | 'ferrari';
/** An oncoming car's lane changes, as distances ahead of the truck: `lanes` is the lane it is in before each change and the one it ends in, `starts` is the depth at which each change begins moving, `moveLength` how deep it takes and `signalLength` how far ahead its indicator warns. */
export interface FerrariWeave { lanes: number[]; starts: number[]; moveLength: number; signalLength: number; }
/** `route` marks the guaranteed-lane gift; letting one go by breaks the multiplier chain. `variant` makes it a coloured gift with a different reward. `length` is how far a roadworks closure runs beyond `z`. `maintenance` makes that closure a maintenance vehicle's. `closed` is the lanes a gantry shows a red X over. `biteAt` is when a Giftasaurus bite cycle starts. `swingAt` is when a crane's wrecking ball is at the middle of its swing, heading right. */
export interface RoadEntity { id: number; row: number; lane: number; z: number; kind: EntityKind; handled: boolean; route?: boolean; variant?: GiftVariant; length?: number; maintenance?: boolean; closed?: number[]; biteAt?: number; swingAt?: number; weave?: FerrariWeave; }
/** A stretch of road, as distances from the start of the run. */
export interface ZoneSpan { start: number; end: number; }
/** The river crossing is 12 seconds long, 24 seconds into every 80 second cycle of a run driven at the plain pace. */
const BRIDGE_CYCLE_SECONDS = 80;
const BRIDGE_FROM_SECONDS = 24;
const BRIDGE_TO_SECONDS = 36;
export const bridgeSpan = (cycle: number): ZoneSpan => ({ start: distanceAt(cycle * BRIDGE_CYCLE_SECONDS + BRIDGE_FROM_SECONDS), end: distanceAt(cycle * BRIDGE_CYCLE_SECONDS + BRIDGE_TO_SECONDS) });
/** The first river crossing that ends no more than `behind` short of `distance`. */
export const nextBridge = (distance: number, behind = 0): ZoneSpan => {
  for (let cycle = 0; ; cycle++) {
    const span = bridgeSpan(cycle);
    if (span.end > distance - behind) return span;
  }
};
export const inBridge = (distance: number): boolean => {
  const span = nextBridge(distance);
  return distance >= span.start;
};
/** A tunnel appears this many seconds before the truck reaches it, is 10 to 18 seconds long, and a lane gantry warns of a closure this many seconds ahead. */
const TUNNEL_LEAD_SECONDS = 12;
const TUNNEL_FIRST_SECONDS = 170;
const GANTRY_SECONDS = 3;
/** In a tunnel or on the river crossing, this share of obstacles are the zone's own; the rest are the usual ones. */
const ZONE_HAZARD_CHANCE = 0.3;
const MAINTENANCE_MIN_SECONDS = 3.5;
const MAINTENANCE_MAX_SECONDS = 5;
/** A crosswind builds for this long, leaning the truck toward its lane, then shoves it into the lane at the peak. The lean eases at this many lanes a second. */
export const GUST_BUILD_SECONDS = 1.3;
const GUST_EASE_LANES_PER_SECOND = 3;
const GUST_FROM_SECONDS = 150;
export type Zone = 'road' | 'bridge' | 'tunnel';
/** A crosswind on the bridge: `at` is where along the run it starts to build, `direction` which way it pushes (-1 left, 1 right). `offset` is how far the truck is drawn from its lane, in lanes, and `swappedAt` is when the lane changed. */
export interface GustEvent { at: number; direction: number; startedAt: number | null; swappedAt: number | null; offset: number; clearFrom: number; clearTo: number; }
export interface RunResult { score: number; distance: number; gifts: number; giftPoints: number; coupons: number; spent: number; duration: number; maxMultiplier: number; deliveries: number; deliveriesMissed: number; }
/** `pending` holds the lane unannounced until its obstacles pass, `incoming` warns the player, `active` has a bay on the road against the clock, `expired` is a missed clock with the bay still ahead. */
export interface DeliveryRequest { lane: number; phase: 'pending' | 'incoming' | 'active' | 'expired'; spawnAt: number; deadline: number; window: number; }
export interface BonusGiftPickup { variant: GiftVariant; at: number; }
export interface DeliveryOutcome { success: boolean; amount: number; at: number; }
/** A streak that just ended: when, the multiplier it had reached and how many gifts long it was. */
export interface ChainBreak { at: number; lostMultiplier: number; chain: number; }
/** Consecutive route gifts needed for each multiplier step: x1, x2, ... x8. */
export const MULTIPLIER_TIERS: readonly number[] = [0, 5, 10, 20, 30, 40, 50, 60];
export const DELIVERY_BONUS = 100;
export const DELIVERY_PENALTY = 50;
/** The rare Snappy mascot pays this × the multiplier when the truck runs into it. */
export const POWERPUP_BONUS = 250;
/** The Dustbuster runs out after this long and reaches gifts up to this many lanes from the truck (the middle lane covers all three, an edge lane only the middle). */
export const MAGNET_SECONDS = 60;
const MAGNET_REACH_LANES = 1;
/** A crane's wrecking ball swings once across all three lanes and back every CRANE_PERIOD seconds, out to the centre of each edge lane. */
export const CRANE_PERIOD = 3.2;
export const CRANE_REACH = 1;
/** The ball hits a truck whose centre is within this many lanes of it: the truck's half width plus the ball's radius. */
const CRANE_HIT = 0.54;
/** Lanes of extra room, beyond the hit width, the swing is timed to leave around the route lane when the truck arrives. */
const CRANE_MARGIN = 0.18;
/** Giftasaurus bite cycle in seconds: lean in, clamp, pull back, rest. */
export const BITE_CYCLE: readonly number[] = [1.0, 1.2, 0.9, 0.8];
export type BiteStage = 'lean' | 'clamp' | 'pullBack' | 'rest';
/** How far the jaws reach past the road edge at full stretch, in lanes: over a truck in the outer lane, short of the middle one. */
export const BITE_REACH = 0.6;
/** Half the truck's width, in lanes, and how far past its near side the jaws must reach to bite (the head is then down on the roof). */
const TRUCK_HALF_WIDTH = 0.32;
const BITE_OVERLAP = 0.2;
/**
 * A plain obstacle stays in the hit zone for at least this long. Hitboxes leave a 0.14-lane gap between neighbouring
 * lanes, and above about 890 units/s a row would otherwise pass in under the 22ms the truck takes to cross that gap,
 * letting a lane change slip between two blocked lanes.
 */
const MIN_HIT_SECONDS = 0.026;
/** Pace trickle points per second at the starting pace, before the chain multiplier. */
export const PACE_SCORE = 1.25;
/**
 * A rare silver Ferrari comes down the road toward the truck, FERRARI_PACE times the road's own speed again, changing lane
 * three times on the way. It always ends in a lane other than the route lane (where the route gift sits), and the last
 * change is finished FERRARI_SWAPS[2] - FERRARI_SWAP_SECONDS seconds before it arrives at the normal pace, so it never leaves
 * the truck without a clear lane to reach. Each change is signalled FERRARI_SIGNAL_SECONDS ahead by its indicator.
 */
export const FERRARI_PACE = 0.64;
export const FERRARI_FLIGHT_SECONDS = 3.4;
/** Seconds before reaching the truck, at the normal pace, at which each lane change starts to move. */
export const FERRARI_SWAPS: readonly number[] = [2.7, 1.95, 1.3];
export const FERRARI_SWAP_SECONDS = 0.3;
export const FERRARI_SIGNAL_SECONDS = 0.35;
/** The truck's half width plus the car's, in lanes. */
const FERRARI_HIT = TRUCK_HALF_WIDTH + 0.3;
/** The first Ferrari is 60 to 90 seconds in; after that one comes every 55 to 100 seconds. A plan waits for the road to clear, and is dropped after FERRARI_PLAN_TIMEOUT. */
const FERRARI_FIRST_SECONDS = 60;
const FERRARI_GAP_SECONDS = 55;
const FERRARI_GAP_SPREAD = 45;
const FERRARI_RETRY_SECONDS = 12;
const FERRARI_PLAN_SECONDS = 3;
const FERRARI_PLAN_TIMEOUT = 14;
/** Seconds of warning before the bay appears, and how far inside the unboosted arrival time the clock runs out. */
export const DELIVERY_WARNING = 2.5;
export const DELIVERY_MARGIN = 0.6;
const BAY_LEAD_SECONDS = 4.8;
/** Rows keep their obstacles and gifts this far clear of either end of a roadworks closure. */
const ROADWORKS_CLEARANCE = 24;
/** One cost per level; an item is sold out once every level is bought. */
export const SHOP_ITEMS: readonly { item: ShopItem; costs: readonly number[] }[] = [
  { item: 'shield', costs: [100] },
  { item: 'nitro', costs: [150, 300, 450] },
  { item: 'loyalty', costs: [120, 240, 360] },
  { item: 'magnet', costs: [300] },
  { item: 'freeplay', costs: [FREEPLAY_MINIMUM] },
];
export const isShopItem = (reward: string): reward is ShopItem => SHOP_ITEMS.some(entry => entry.item === reward);
export const isCouponReward = (reward: string): reward is CouponReward => COUPON_REWARDS.some(entry => entry === reward);
const isHazard = (kind: EntityKind): boolean => kind === 'cone' || kind === 'barrier' || kind === 'drum' || kind === 'pothole' || kind === 'giftasaurus' || kind === 'stalledcar' || kind === 'birds' || kind === 'puddle';

/** Simulation only. Rendering and browser events live in delivery-dash.game.ts. */
export class DeliveryDashEngine {
  state: GameState = 'ready';
  score = 0;
  chain = 0;
  maxMultiplier = 1;
  deliveries = 0;
  deliveriesMissed = 0;
  delivery: DeliveryRequest | null = null;
  lastDelivery: DeliveryOutcome | null = null;
  lastGain = 0;
  lastGainAt = -100;
  lastChainBreak: ChainBreak | null = null;
  lastBonusGift: BonusGiftPickup | null = null;
  slotSpin: SlotSpin | null = null;
  lastSlotResult: SlotResult | null = null;
  private nextSlotAt = 25;
  private nextDeliveryAt = 20;
  lastPowerpupAt = -100;
  private nextPowerpupAt = 35;
  private nextGiftasaurusAt = 45;
  private nextCraneAt = 50;
  private nextFerrariAt = FERRARI_FIRST_SECONDS;
  private ferrariPlan: { since: number } | null = null;
  private ferrariRoute = 1;
  tunnel: (ZoneSpan & { maintenance: boolean }) | null = null;
  private nextTunnelAt = TUNNEL_FIRST_SECONDS;
  gust: GustEvent | null = null;
  private gustPlannedFor = -1;
  distance = 0;
  gifts = 0;
  giftPoints = 0;
  pointsEarned = 0;
  spent = 0;
  coupons = 0;
  shields = 0;
  nitroLevel = 0;
  loyaltyLevel = 0;
  magnetUntil = 0;
  jackpotUntil = 0;
  ghostUntil = 0;
  rainUntil = 0;
  sweepAt = -100;
  offer: CouponReward[] = [];
  lastRedeemed: GiftReward | null = null;
  invulnerableUntil = 0;
  lastPickupAt = -100;
  private nextCouponAt = 16;
  private nextShopAt = 26;
  shopsVisited = 0;
  shopSide = 1;
  couponPickedAt = -100;
  private pattern: 'single' | 'split' | 'slalom' | 'breather' = 'single';
  private slalomDirection = 1;
  private nextRoadworksAt = 30;
  private previousClosed = '';
  lane = 1;
  lanePosition = 1;
  elapsed = 0;
  entities: RoadEntity[] = [];
  crashLane: number | null = null;
  private spawnIn = 1.6;
  private row = 0;
  private nextId = 0;
  private safeLane = 1;

  constructor(private readonly random: () => number = Math.random) {}
  // Continuous time-based acceleration: 129 at the start, about 410 after one minute, 755 after five, 1030 after ten.
  // No speed ceiling; pause time does not count toward difficulty.
  get speed(): number { return speedAt(this.elapsed); }
  boostHeld = false;
  boostMeter = 1;
  boostLevel = 0;
  private boostLocked = false;
  static readonly BOOST_FACTOR = 1.6;
  get magnet(): boolean { return this.magnetUntil > this.elapsed; }
  get boostActive(): boolean { return this.boostHeld && !this.boostLocked && this.boostMeter > 0; }
  private get boostMultiplier(): number { return 1 + (DeliveryDashEngine.BOOST_FACTOR - 1) * this.boostLevel; }
  get pace(): number { return this.speed * this.boostMultiplier / SPEED_START; }
  private travelAfter(seconds: number): number { return distanceAt(this.elapsed + seconds) - distanceAt(this.elapsed); }
  /** Score multiplier for the current chain of route gifts. */
  get multiplier(): number { return MULTIPLIER_TIERS.filter(threshold => this.chain >= threshold).length; }
  /** Progress through the current tier, or null at the cap. */
  get chainProgress(): { have: number; need: number } | null {
    const floor = MULTIPLIER_TIERS[this.multiplier - 1], ceiling = MULTIPLIER_TIERS[this.multiplier];
    return ceiling === undefined ? null : { have: this.chain - floor, need: ceiling - floor };
  }
  get result(): RunResult {
    return {
      score: Math.floor(this.score), distance: Math.floor(this.distance), gifts: this.gifts, giftPoints: this.pointsEarned, coupons: this.coupons,
      spent: this.spent, duration: Math.round(this.elapsed * 100) / 100,
      maxMultiplier: this.maxMultiplier, deliveries: this.deliveries, deliveriesMissed: this.deliveriesMissed,
    };
  }

  start(): void {
    this.distance = this.elapsed = this.gifts = this.row = this.nextId = 0;
    this.score = this.chain = this.deliveries = this.deliveriesMissed = this.lastGain = 0;
    this.maxMultiplier = 1; this.lastChainBreak = null; this.lastBonusGift = null; this.delivery = null; this.lastDelivery = null; this.nextDeliveryAt = 20; this.lastGainAt = -100;
    this.lastPowerpupAt = -100; this.nextPowerpupAt = 35 + this.random() * 30;
    this.nextGiftasaurusAt = 30 + this.random() * 15;
    this.nextCraneAt = 40 + this.random() * 20;
    this.nextFerrariAt = FERRARI_FIRST_SECONDS + this.random() * 30; this.ferrariPlan = null;
    this.tunnel = null; this.nextTunnelAt = TUNNEL_FIRST_SECONDS + this.random() * 30; this.gust = null; this.gustPlannedFor = -1;
    this.slotSpin = null; this.lastSlotResult = null; this.nextSlotAt = 25 + this.random() * 20;
    this.spawnIn = 1.6;
    this.giftPoints = this.pointsEarned = this.spent = this.coupons = this.shields = this.nitroLevel = this.loyaltyLevel = 0;
    this.jackpotUntil = this.ghostUntil = this.rainUntil = this.invulnerableUntil = 0;
    this.magnetUntil = 0;
    this.offer = []; this.lastRedeemed = null; this.sweepAt = -100;
    this.lastPickupAt = this.couponPickedAt = -100; this.nextCouponAt = 16; this.nextShopAt = 26; this.shopsVisited = 0;
    this.pattern = 'single'; this.slalomDirection = 1; this.nextRoadworksAt = 30; this.previousClosed = '';
    this.boostMeter = 1; this.boostLevel = 0; this.boostLocked = false;
    this.lane = this.lanePosition = this.safeLane = 1;
    this.entities = [];
    this.crashLane = null;
    this.state = 'running';
    this.spawnRow(68 + this.travelAfter(2.8));
    this.spawnRow(68 + this.travelAfter(4.6));
  }

  steer(direction: number): void {
    if (this.state !== 'running') return;
    this.lane = Math.max(0, Math.min(2, this.lane + Math.sign(direction)));
  }

  setBoost(held: boolean): void { this.boostHeld = held; }

  get boostLockedOut(): boolean { return this.boostLocked; }

  pause(): void { if (this.state === 'running') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'running'; }

  get pointsPerGift(): number {
    return this.jackpotUntil > this.elapsed ? 50 : 10 + 5 * this.loyaltyLevel;
  }

  private giftMultiplier(variant: GiftVariant | undefined): number {
    return GIFT_VARIANTS.find(rule => rule.variant === variant)?.multiplier ?? 1;
  }

  private applyGiftVariant(variant: GiftVariant): void {
    if (variant === 'green') { this.boostMeter = 1; this.boostLocked = false; }
    if (variant === 'pink') this.shields = Math.min(SHIELD_LIMIT, this.shields + 1);
    if (variant === 'slot') this.startSlotSpin();
    this.lastBonusGift = { variant, at: this.elapsed };
  }

  /** One roll per route gift; a shield gift is never offered to a full set of shields, and a slot machine only once its timer is up and no spin is running. */
  private rollGiftVariant(): GiftVariant | undefined {
    let roll = this.random();
    for (const rule of GIFT_VARIANTS) {
      if (roll < rule.chance) {
        if (rule.variant === 'pink' && this.shields >= SHIELD_LIMIT) return undefined;
        if (rule.variant !== 'slot') return rule.variant;
        if (this.elapsed < this.nextSlotAt || this.slotSpinning) return undefined;
        this.nextSlotAt = this.elapsed + SLOT_MIN_GAP + this.random() * 30;
        return rule.variant;
      }
      roll -= rule.chance;
    }
    return undefined;
  }

  get slotSpinning(): boolean { return this.slotSpin !== null && this.slotSpin.settledAt === null; }

  private pick<Item>(items: readonly Item[]): Item { return items[Math.floor(this.random() * items.length)]; }

  /** The outcome is rolled at pickup, with the multiplier locked in, and the reels are chosen to show it. */
  private startSlotSpin(): void {
    let roll = this.random();
    const rule = SLOT_OUTCOMES.find(candidate => (roll -= candidate.chance) < 0) ?? SLOT_OUTCOMES[SLOT_OUTCOMES.length - 1];
    this.slotSpin = {
      startedAt: this.elapsed, stopAt: [this.elapsed + SLOT_REEL_STOPS[0], this.elapsed + SLOT_REEL_STOPS[1], this.elapsed + SLOT_REEL_STOPS[2]],
      reels: this.slotReels(rule.outcome), outcome: rule.outcome, amount: rule.payout > 0 ? rule.payout * this.multiplier : rule.payout, settledAt: null,
    };
  }

  private slotReels(outcome: SlotOutcome): SlotSpin['reels'] {
    if (outcome === 'jackpot') return ['seven', 'seven', 'seven'];
    if (outcome === 'cursed') return ['coal', 'coal', 'coal'];
    if (outcome === 'triple') { const symbol = this.pick(SLOT_SYMBOLS.filter(candidate => candidate !== 'seven')); return [symbol, symbol, symbol]; }
    if (outcome === 'miss') {
      const pool = [...SLOT_SYMBOLS], picks: SlotSymbol[] = [];
      while (picks.length < 3) picks.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
      return [picks[0], picks[1], picks[2]];
    }
    const pairSymbol: SlotSymbol = outcome === 'loss' ? 'coal' : this.pick(SLOT_SYMBOLS);
    const odd = this.pick(SLOT_SYMBOLS.filter(candidate => candidate !== pairSymbol));
    const reels: SlotSpin['reels'] = [pairSymbol, pairSymbol, pairSymbol];
    reels[Math.floor(this.random() * 3)] = odd;
    return reels;
  }

  private settleSlot(): void {
    const spin = this.slotSpin;
    if (!spin || spin.settledAt !== null || this.elapsed < spin.stopAt[2]) return;
    spin.settledAt = this.elapsed;
    if (spin.amount > 0) this.addScore(spin.amount);
    else if (spin.amount < 0) this.score = Math.max(0, this.score + spin.amount);
    this.lastSlotResult = { outcome: spin.outcome, amount: spin.amount, at: this.elapsed };
  }

  /** Nitro tank capacity in seconds of boost. */
  get nitroSeconds(): number { return 3 + this.nitroLevel; }

  /** Every coupon reward, in a shuffled order. */
  private rollOffer(): CouponReward[] {
    const pool = [...COUPON_REWARDS], picks: CouponReward[] = [];
    while (pool.length) picks.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return picks;
  }

  /** Score a Freeplay cash-in would add right now. */
  get freeplayValue(): number { return this.giftPoints * this.multiplier; }

  /** Levels bought so far for a shop item (shields count those currently held). */
  owned(item: ShopItem): number {
    return item === 'shield' ? this.shields : item === 'nitro' ? this.nitroLevel : item === 'loyalty' ? this.loyaltyLevel : item === 'magnet' ? Number(this.magnet) : 0;
  }

  /** Price of the next level, or null when sold out. Shields restock as they are used, up to the limit. Freeplay costs the whole balance. */
  shopCost(item: ShopItem): number | null {
    const costs = SHOP_ITEMS.find(entry => entry.item === item)?.costs ?? [];
    if (item === 'shield') return this.shields < SHIELD_LIMIT ? costs[0] : null;
    if (item === 'freeplay') return Math.max(FREEPLAY_MINIMUM, this.giftPoints);
    return costs[this.owned(item)] ?? null;
  }

  canAfford(item: ShopItem): boolean {
    const cost = this.shopCost(item);
    return cost !== null && this.state === 'shop' && this.giftPoints >= cost;
  }

  /** Spend gift points on an upgrade while parked at the shop. */
  buy(item: ShopItem): boolean {
    const cost = this.shopCost(item);
    if (cost === null || !this.canAfford(item)) return false;
    if (item === 'freeplay') this.addScore(this.freeplayValue);
    this.giftPoints -= cost; this.spent += cost;
    if (item === 'shield') this.shields++;
    if (item === 'nitro') { this.nitroLevel++; this.boostMeter = 1; this.boostLocked = false; }
    if (item === 'loyalty') this.loyaltyLevel++;
    if (item === 'magnet') this.magnetUntil = this.elapsed + MAGNET_SECONDS;
    this.lastRedeemed = item;
    return true;
  }

  leaveShop(): void {
    if (this.state !== 'shop') return;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.elapsed + 0.6);
    this.state = 'running';
  }

  chooseGift(reward: CouponReward): void {
    if (this.state !== 'reward' || !this.offer.includes(reward)) return;
    this.applyCoupon(reward);
    this.offer = [];
    this.coupons++;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.elapsed + 0.4);
    this.state = 'running';
  }

  private applyCoupon(reward: CouponReward): void {
    if (reward === 'ghost') this.ghostUntil = Math.max(this.elapsed, this.ghostUntil) + 7;
    if (reward === 'jackpot') this.jackpotUntil = Math.max(this.elapsed, this.jackpotUntil) + 10;
    if (reward === 'rain') {
      // Every hazard still ahead becomes a gift, and new rows are all gifts for a few seconds. Each can roll a colour like a route gift.
      for (const e of this.entities) if (e.z >= 48 && isHazard(e.kind)) { e.kind = 'gift'; e.variant = this.rollGiftVariant(); }
      this.entities = this.entities.filter(e => (e.kind !== 'crane' && e.kind !== 'ferrari') || e.z < 48);
      // Closures still ahead are cleared into a trail of gifts along the lane.
      const works = this.entities.filter(e => e.kind === 'roadworks' && e.z >= 48);
      this.entities = this.entities.filter(e => !works.includes(e));
      for (const e of works) for (let z = e.z; z <= e.z + (e.length ?? 0); z += 70) {
        this.entities.push({ id: this.nextId++, row: e.row, lane: e.lane, z, kind: 'gift', handled: false, variant: this.rollGiftVariant() });
      }
      this.rainUntil = Math.max(this.elapsed, this.rainUntil) + 4;
      this.sweepAt = this.elapsed;
    }
    this.lastRedeemed = reward;
  }

  update(seconds: number): void {
    if (this.state !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    // Catch-up is capped; a suspended browser must not skip through a collision.
    const dt = Math.min(seconds, 0.05);
    // Boost drains a short nitro meter; once empty it must recharge before reuse.
    const boosting = this.boostActive;
    this.boostMeter = Math.max(0, Math.min(1, this.boostMeter + (boosting ? -dt / this.nitroSeconds : dt / 8)));
    if (this.boostMeter <= 0) this.boostLocked = true;
    else if (this.boostLocked && this.boostMeter >= 0.25) this.boostLocked = false;
    this.boostLevel = Math.max(0, Math.min(1, this.boostLevel + (boosting ? 1 : -1) * dt * 6));
    const travel = this.travelAfter(dt) * this.boostMultiplier;
    this.elapsed += dt;
    this.distance += travel;
    const fromLane = this.lanePosition, delta = this.lane - fromLane;
    this.lanePosition += Math.sign(delta) * Math.min(Math.abs(delta), dt / 0.16);
    for (const e of this.entities) {
      const previousZ = e.z, length = e.length ?? 0;
      // An oncoming car closes on the truck by its own speed as well as the road's.
      const moved = e.kind === 'ferrari' ? travel + this.speed * FERRARI_PACE * dt : travel;
      e.z -= moved;
      const tail = isHazard(e.kind) && e.kind !== 'giftasaurus' ? Math.min(48, 68 - travel / dt * MIN_HIT_SECONDS) : 48;
      if (e.handled || e.kind === 'gantry' || e.z > 68 || previousZ + length < tail) continue;
      // Swept overlap catches an obstacle even when one fast frame crosses the
      // entire collision zone, and uses the truck's actual lane-change path.
      // A roadworks closure overlaps for its whole length, so steering into it crashes.
      const enter = Math.max(0, (previousZ - 68) / moved);
      const leave = Math.min(1, (previousZ + length - tail) / moved);
      const laneAt = (fraction: number) => fromLane + Math.sign(delta) * Math.min(Math.abs(delta), dt * fraction / 0.16);
      const a = laneAt(enter), b = laneAt(leave);
      // The Dustbuster reaches gifts one lane either side of the truck.
      const reach = e.kind === 'gift' && this.magnet ? MAGNET_REACH_LANES + 0.43 : 0.43;
      const misses = e.kind === 'giftasaurus' ? !this.bites(e, a) && !this.bites(e, b)
        : e.kind === 'crane' ? !this.craneHits(e, a) && !this.craneHits(e, b)
        : e.kind === 'ferrari' ? !this.ferrariHits(e, previousZ, moved, enter, leave, laneAt)
        : Math.max(a, b) <= e.lane - reach || Math.min(a, b) >= e.lane + reach;
      if (misses) continue;
      e.handled = true;
      if (e.kind === 'shop') {
        this.shopsVisited++;
        this.state = 'shop';
        break;
      } else if (e.kind === 'coupon') {
        this.couponPickedAt = this.elapsed;
        this.offer = this.rollOffer();
        this.state = 'reward';
        break;
      } else if (e.kind === 'gift') {
        const points = this.pointsPerGift * this.giftMultiplier(e.variant);
        this.gifts++;
        this.giftPoints += points; this.pointsEarned += points;
        this.lastPickupAt = this.elapsed;
        this.extendChain(1);
        // Any gift in a row keeps the chain, so a Gift Shoppe gift taken beside the route gift does not break it.
        for (const o of this.entities) if (o !== e && o.route && o.row === e.row) o.route = false;
        this.addScore(points * this.multiplier);
        if (e.variant) this.applyGiftVariant(e.variant);
      } else if (e.kind === 'delivery') this.completeDelivery();
      else if (e.kind === 'powerpup') { this.addScore(POWERPUP_BONUS * this.multiplier); this.lastPowerpupAt = this.elapsed; }
      else if (this.invulnerableUntil > this.elapsed || this.ghostUntil > this.elapsed) continue;
      else if (this.shields > 0) { this.shields--; this.invulnerableUntil = this.elapsed + 0.55; this.breakChain(); }
      else { this.state = 'crashed'; this.crashLane = e.kind === 'ferrari' ? Math.round(this.ferrariLane(e)) : e.lane; break; }
    }
    for (const e of this.entities) {
      if (e.z >= 48 || e.handled) continue;
      if (e.kind === 'gift' && e.route) { e.route = false; this.breakChain(); }
      else if (e.kind === 'delivery') { e.handled = true; this.missDelivery(); this.delivery = null; }
    }
    this.entities = this.entities.filter(e => e.z + (e.length ?? 0) > -90 && !((e.kind === 'gift' || e.kind === 'coupon' || e.kind === 'shop' || e.kind === 'delivery' || e.kind === 'powerpup') && e.handled));
    if (this.state !== 'running') return;
    this.settleSlot();
    this.updateTunnel();
    this.updateGust(dt);
    // Score trickles in with pace (not boost), so distance matters but never dominates.
    this.score += PACE_SCORE * this.speed / SPEED_START * dt * this.multiplier;
    this.updateDelivery();
    this.updateFerrari();
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // Spawn 4.8 seconds ahead, accounting for future acceleration. Density
      // increases, but adjacent rows keep at least 0.47 seconds apart (ROW_GAPS).
      this.spawnRow(68 + this.travelAfter(BAY_LEAD_SECONDS));
      this.spawnIn += rowGapAt(this.elapsed);
    }
  }

  /** How far the Giftasaurus jaws are stretched onto the road, from 0 (on the verge) to 1. */
  biteExtension(e: RoadEntity, at = this.elapsed): number {
    const [lean, clamp, pullBack] = BITE_CYCLE, time = this.biteTime(e, at);
    return time < lean ? time / lean : time < lean + clamp ? 1 : time < lean + clamp + pullBack ? 1 - (time - lean - clamp) / pullBack : 0;
  }

  biteStage(e: RoadEntity, at = this.elapsed): BiteStage {
    const [lean, clamp, pullBack] = BITE_CYCLE, time = this.biteTime(e, at);
    return time < lean ? 'lean' : time < lean + clamp ? 'clamp' : time < lean + clamp + pullBack ? 'pullBack' : 'rest';
  }

  private biteTime(e: RoadEntity, at: number): number {
    const period = BITE_CYCLE.reduce((sum, part) => sum + part, 0);
    return ((at - (e.biteAt ?? 0)) % period + period) % period;
  }

  /** Whether the jaws reach a truck at this lane position. `e.lane` is the edge lane on the Giftasaurus side. */
  bites(e: RoadEntity, lanePosition: number, at = this.elapsed): boolean {
    const gap = (e.lane === 0 ? lanePosition : 2 - lanePosition) + 0.5 - TRUCK_HALF_WIDTH + BITE_OVERLAP;
    return this.biteExtension(e, at) * BITE_REACH > gap;
  }

  /** Where the crane's wrecking ball hangs, in lanes (1 is the middle lane), `at` this time. */
  craneBall(e: RoadEntity, at = this.elapsed): number {
    return 1 + CRANE_REACH * Math.sin((at - (e.swingAt ?? 0)) * 2 * Math.PI / CRANE_PERIOD);
  }

  /** Whether the ball is over a truck at this lane position, widened by `margin` lanes. `e.lane` is the verge the crane stands on and plays no part. */
  craneHits(e: RoadEntity, lanePosition: number, at = this.elapsed, margin = 0): boolean {
    return Math.abs(this.craneBall(e, at) - lanePosition) < CRANE_HIT + margin;
  }

  /** Seconds until a row `z` ahead reaches the truck, boosting for up to `boostSeconds` first. */
  private arrivalIn(z: number, boostSeconds: number): number {
    let time = 0, travelled = 0;
    while (travelled < z - 68 && time < 30) {
      time += 0.02;
      travelled += speedAt(this.elapsed + time) * 0.02 * (time <= boostSeconds ? DeliveryDashEngine.BOOST_FACTOR : 1);
    }
    return time;
  }

  /**
   * Time the bite so its lane is clear either at the normal pace or only when boosting.
   * Without enough nitro in the tank to arrive well early, the normal pace always gets through.
   */
  private timeBite(e: RoadEntity): void {
    const period = BITE_CYCLE.reduce((sum, part) => sum + part, 0);
    const tank = this.boostLocked ? 0 : this.boostMeter * this.nitroSeconds;
    const steady = this.elapsed + this.arrivalIn(e.z, 0), boosted = this.elapsed + this.arrivalIn(e.z, tank);
    const clear = (at: number) => [-0.3, -0.15, 0, 0.15, 0.3].every(offset => !this.bites(e, e.lane, at + offset));
    const needBoost = steady - boosted > 1.2 && this.random() < 0.6;
    const starts = [...Array(Math.round(period / 0.05)).keys()].map(step => this.elapsed + step * 0.05);
    const fits = starts.filter(start => {
      e.biteAt = start;
      return needBoost ? clear(boosted) && this.bites(e, e.lane, steady) && this.bites(e, e.lane, steady + 0.15) : clear(steady);
    });
    e.biteAt = fits.length ? fits[Math.floor(this.random() * fits.length)] : steady + period - BITE_CYCLE[0] / 2;
  }

  /**
   * Time the swing so the ball is well clear of the route lane for the whole of the truck's pass at the normal pace.
   * Every other lane is fair game, so leaving the route to dodge or chase something else means reading the swing.
   */
  private timeSwing(e: RoadEntity, routeLane: number): void {
    const arrival = this.elapsed + this.arrivalIn(e.z, 0);
    const clear = (swingAt: number) => [-0.3, -0.15, 0, 0.15, 0.3].every(offset => {
      e.swingAt = swingAt;
      return !this.craneHits(e, routeLane, arrival + offset, CRANE_MARGIN);
    });
    const starts = [...Array(Math.round(CRANE_PERIOD / 0.05)).keys()].map(step => this.elapsed + step * 0.05);
    const fits = starts.filter(clear);
    e.swingAt = fits.length ? fits[Math.floor(this.random() * fits.length)] : arrival - CRANE_PERIOD * (routeLane === 2 ? 0.75 : 0.25);
  }

  /** Whether a Ferrari is on its way and has not yet reached the truck. */
  get ferrariAhead(): boolean { return this.entities.some(e => e.kind === 'ferrari' && e.z > 20); }

  /** Where the Ferrari is across the road, in lanes (1 is the middle lane), when it is `z` ahead of the truck. */
  ferrariLane(e: RoadEntity, z = e.z): number {
    const weave = e.weave;
    if (!weave) return e.lane;
    return weave.starts.reduce((lane, start, index) => {
      const progress = Math.max(0, Math.min(1, (start - z) / weave.moveLength));
      return lane + (weave.lanes[index + 1] - weave.lanes[index]) * progress * progress * (3 - 2 * progress);
    }, weave.lanes[0]);
  }

  /** The lane the Ferrari's indicator is flashing toward, or null when it is not about to change lane. */
  ferrariSignal(e: RoadEntity): number | null {
    const weave = e.weave;
    const index = weave ? weave.starts.findIndex(start => e.z > start && e.z <= start + weave.signalLength) : -1;
    return weave && index >= 0 ? weave.lanes[index + 1] : null;
  }

  /** Whether the Ferrari overlaps the truck at any point of a frame in which it came from `previousZ` and the truck steered along `laneAt`. */
  private ferrariHits(e: RoadEntity, previousZ: number, moved: number, enter: number, leave: number, laneAt: (fraction: number) => number): boolean {
    const samples = 8;
    return Array.from({ length: samples + 1 }, (_, step) => enter + (leave - enter) * step / samples)
      .some(fraction => Math.abs(this.ferrariLane(e, previousZ - moved * fraction) - laneAt(fraction)) < FERRARI_HIT);
  }

  /** Plain road all the way out to where a Ferrari would start, with nothing else claiming it. */
  private ferrariCanRun(): boolean {
    const reach = this.travelAfter(FERRARI_FLIGHT_SECONDS * (1 + FERRARI_PACE) + 2);
    return !this.delivery && !this.tunnel && !this.gust && this.rainUntil <= this.elapsed && this.row >= 6
      && nextBridge(this.distance).start - this.distance > reach && !this.entities.some(e => e.kind === 'roadworks');
  }

  /**
   * Plan a Ferrari when its time comes: from then rows carry only the route gift, in one fixed lane, so the road is clear
   * of everything the car will drive through, and the route lane stays where the Ferrari is told to keep out of.
   * Once the road ahead is empty it starts at the far end, drives in changing lanes, and finishes in a lane that is not the route lane.
   */
  private updateFerrari(): void {
    const plan = this.ferrariPlan;
    if (!plan) {
      if (this.elapsed < this.nextFerrariAt || !this.ferrariCanRun()) return;
      this.ferrariPlan = { since: this.elapsed };
      this.ferrariRoute = this.safeLane;
      return;
    }
    const waited = this.elapsed - plan.since;
    if (!this.ferrariCanRun() || waited > FERRARI_PLAN_TIMEOUT) {
      this.ferrariPlan = null;
      this.nextFerrariAt = this.elapsed + FERRARI_RETRY_SECONDS;
      return;
    }
    if (waited < FERRARI_PLAN_SECONDS || this.entities.some(e => e.kind !== 'gift')) return;
    this.entities.push(this.makeFerrari(this.ferrariRoute));
    this.ferrariPlan = null;
    this.nextFerrariAt = this.elapsed + FERRARI_GAP_SECONDS + this.random() * FERRARI_GAP_SPREAD;
    this.nextGiftasaurusAt = Math.max(this.nextGiftasaurusAt, this.elapsed + 8);
    this.nextCraneAt = Math.max(this.nextCraneAt, this.elapsed + 8);
  }

  /** A Ferrari that ends in a lane other than `route`, changing lane between neighbouring lanes on the way. */
  private makeFerrari(route: number): RoadEntity {
    const closing = speedAt(this.elapsed + FERRARI_FLIGHT_SECONDS / 2) * (1 + FERRARI_PACE);
    const lanes = [this.pick([0, 1, 2].filter(lane => lane !== route))];
    FERRARI_SWAPS.forEach(() => lanes.unshift(this.pick([0, 1, 2].filter(lane => Math.abs(lane - lanes[0]) === 1))));
    const weave: FerrariWeave = {
      lanes, starts: FERRARI_SWAPS.map(seconds => 68 + closing * seconds), moveLength: closing * FERRARI_SWAP_SECONDS, signalLength: closing * FERRARI_SIGNAL_SECONDS,
    };
    return { id: this.nextId++, row: this.row, lane: lanes[0], z: 68 + closing * FERRARI_FLIGHT_SECONDS, kind: 'ferrari', handled: false, weave };
  }

  private addScore(amount: number): void {
    this.score += amount;
    this.lastGain = Math.round(amount); this.lastGainAt = this.elapsed;
  }

  private breakChain(): void {
    if (this.chain > 0) this.lastChainBreak = { at: this.elapsed, lostMultiplier: this.multiplier, chain: this.chain };
    this.chain = 0;
  }

  private extendChain(count: number): void {
    this.chain += count;
    this.maxMultiplier = Math.max(this.maxMultiplier, this.multiplier);
  }

  /** Whether a row `z` ahead of the truck is on the river crossing. Shops and delivery bays are never placed there. */
  private onBridge(z: number): boolean { return inBridge(this.distance + z); }

  zoneAt(z: number): Zone {
    const at = this.distance + z;
    return this.tunnel && at >= this.tunnel.start && at <= this.tunnel.end ? 'tunnel' : inBridge(at) ? 'bridge' : 'road';
  }

  /** Plan a tunnel once its time comes, clear of any river crossing, and drop it once the truck is out of it. */
  private updateTunnel(): void {
    if (this.tunnel) {
      if (this.distance > this.tunnel.end + 120) {
        this.tunnel = null;
        this.nextTunnelAt = this.elapsed + blend(70, 45, this.elapsed) + this.random() * 20;
      }
      return;
    }
    if (this.elapsed < this.nextTunnelAt) return;
    const seconds = blend(10, 18, this.elapsed), margin = this.travelAfter(3);
    let start = this.distance + this.travelAfter(TUNNEL_LEAD_SECONDS);
    const length = this.travelAfter(TUNNEL_LEAD_SECONDS + seconds) - this.travelAfter(TUNNEL_LEAD_SECONDS);
    for (let cycle = 0; ; cycle++) {
      const bridge = bridgeSpan(cycle);
      if (bridge.start - margin > start + length) break;
      if (bridge.end + margin > start) start = Math.max(start, bridge.end + margin);
    }
    this.tunnel = { start, end: start + length, maintenance: false };
  }

  /**
   * Plan one crosswind per river crossing, once the run is past its easy start. Rows around it are left clear
   * of obstacles, so a push to the next lane costs attention but never the run.
   */
  /** Where the truck is drawn, in lanes: its lane, plus however far the wind has leaned it toward the next. */
  get visualLane(): number { return this.lanePosition + (this.gust?.offset ?? 0); }

  private updateGust(dt: number): void {
    if (!this.gust) {
      if (this.elapsed < GUST_FROM_SECONDS) return;
      const bridge = nextBridge(this.distance);
      if (bridge.start === this.gustPlannedFor || bridge.start - this.distance > this.travelAfter(TUNNEL_LEAD_SECONDS) || this.entities.some(e => e.kind === 'roadworks')) return;
      this.gustPlannedFor = bridge.start;
      if (bridge.start <= this.distance) return;
      const at = bridge.start + (bridge.end - bridge.start) * (0.4 + this.random() * 0.2), perSecond = this.speed * DeliveryDashEngine.BOOST_FACTOR * 1.15;
      this.gust = { at, direction: this.random() < 0.5 ? -1 : 1, startedAt: null, swappedAt: null, offset: 0, clearFrom: at - perSecond * 0.5, clearTo: at + perSecond * (GUST_BUILD_SECONDS + 1.2) };
      return;
    }
    const gust = this.gust;
    if (gust.startedAt === null) {
      if (this.distance < gust.at) return;
      gust.startedAt = this.elapsed;
    }
    // The drawn truck leans toward the next lane as the wind builds. Only at the peak does its lane change, so the
    // hitbox jumps while the picture carries on smoothly: the lean it had is taken off as the lane is added.
    const charge = Math.min(1, (this.elapsed - gust.startedAt) / GUST_BUILD_SECONDS);
    const open = this.lane + gust.direction >= 0 && this.lane + gust.direction <= 2;
    const target = gust.swappedAt === null && open ? gust.direction * charge : 0, step = GUST_EASE_LANES_PER_SECOND * dt;
    gust.offset += Math.max(-step, Math.min(step, target - gust.offset));
    if (gust.swappedAt === null && charge >= 1) {
      gust.swappedAt = this.elapsed;
      if (open) {
        this.lane += gust.direction;
        this.lanePosition = Math.max(0, Math.min(2, this.lanePosition + gust.direction));
        gust.offset -= gust.direction;
      }
    }
    if (gust.swappedAt !== null && Math.abs(gust.offset) < 0.01 && this.distance > gust.clearTo) this.gust = null;
  }

  private scheduleDelivery(): void { this.nextDeliveryAt = this.elapsed + 25 + this.random() * 15; }

  /**
   * Reserve a lane when a shop or coupon is not about to claim the road, announce it once the obstacles
   * already in it have passed, and expire a request that ran out of time. A reserved lane gets no new
   * obstacles until its bay passes, so chasing a delivery can cost points but never the run.
   */
  private updateDelivery(): void {
    if (!this.delivery) {
      if (this.elapsed >= this.nextDeliveryAt && !this.ferrariPlan && !this.entities.some(e => e.kind === 'roadworks') && !this.onBridge(68 + this.travelAfter(BAY_LEAD_SECONDS + DELIVERY_WARNING)) && this.nextShopAt - this.elapsed > 3 && this.nextCouponAt - this.elapsed > 3) {
        this.delivery = { lane: this.random() < 0.5 ? 0 : 2, phase: 'pending', spawnAt: 0, deadline: 0, window: 0 };
      }
    } else if (this.delivery.phase === 'pending') {
      const lane = this.delivery.lane;
      if (!this.entities.some(e => (e.kind === 'crane' || ((isHazard(e.kind) || e.kind === 'roadworks') && e.lane === lane)) && e.z + (e.length ?? 0) > 40)) {
        this.delivery = { ...this.delivery, phase: 'incoming', spawnAt: this.elapsed + DELIVERY_WARNING };
      }
    } else if (this.delivery.phase === 'active' && this.elapsed > this.delivery.deadline) {
      this.missDelivery();
      this.delivery.phase = 'expired';
    }
  }

  private completeDelivery(): void {
    if (this.delivery?.phase === 'active') {
      const bonus = DELIVERY_BONUS * this.multiplier;
      this.addScore(bonus);
      const nextTier = MULTIPLIER_TIERS.find(threshold => threshold > this.chain);
      this.extendChain(nextTier === undefined ? 1 : nextTier - this.chain);
      this.deliveries++;
      this.lastDelivery = { success: true, amount: bonus, at: this.elapsed };
      this.scheduleDelivery();
    }
    this.delivery = null;
  }

  /** A late or wrong-lane delivery costs a flat notch of score; the run and the chain carry on. */
  private missDelivery(): void {
    if (this.delivery?.phase !== 'active') return;
    this.score = Math.max(0, this.score - DELIVERY_PENALTY);
    this.deliveriesMissed++;
    this.lastDelivery = { success: false, amount: DELIVERY_PENALTY, at: this.elapsed };
    this.scheduleDelivery();
  }

  /** Lanes closed by roadworks at depth `z`, widened by `clearance` at both ends of each closure and by `lead` ahead of it. */
  closedLanesAt(z: number, clearance = 0, lead = 0): number[] {
    return [0, 1, 2].filter(lane => this.entities.some(e => e.kind === 'roadworks' && e.lane === lane
      && z >= e.z - clearance - lead && z <= e.z + (e.length ?? 0) + clearance));
  }

  /**
   * Close one edge lane, or two lanes leaving an edge open, for several seconds of
   * driving. Only edge lanes are closed alone so the open lanes stay connected. A rare
   * double closure flips sides after a clear gap long enough to cross both lanes.
   */
  private startRoadworks(z: number, maintenance = false): number[] {
    const openEdge = this.safeLane === 1 ? (this.random() < 0.5 ? 0 : 2) : this.safeLane;
    const double = this.random() < blend(0.2, 0.65, this.elapsed);
    const flip = !maintenance && double && this.random() < blend(0.2, 0.4, this.elapsed);
    const close = (lanes: number[], from: number, seconds: number) => {
      for (const lane of lanes) this.entities.push({ id: this.nextId++, row: this.row, lane, z: from, kind: 'roadworks', handled: false, length: this.speed * seconds, maintenance });
    };
    const firstSeconds = maintenance ? MAINTENANCE_MIN_SECONDS + this.random() * (MAINTENANCE_MAX_SECONDS - MAINTENANCE_MIN_SECONDS) : flip ? 2.5 + this.random() * 1.5 : 4 + this.random() * 3;
    const firstLanes = double ? [0, 1, 2].filter(l => l !== openEdge) : [2 - openEdge];
    close(firstLanes, z, firstSeconds);
    let total = firstSeconds;
    if (flip) {
      const gapSeconds = 1.4, secondSeconds = 2.5 + this.random() * 1.5;
      close([0, 1, 2].filter(l => l !== 2 - openEdge), z + this.speed * (firstSeconds + gapSeconds), secondSeconds);
      total += gapSeconds + secondSeconds;
    }
    this.nextRoadworksAt = this.elapsed + total + blend(22, 14, this.elapsed) + this.random() * blend(18, 14, this.elapsed);
    return firstLanes;
  }

  /**
   * Once per tunnel, a maintenance vehicle closes one or two lanes for a few seconds. An overhead gantry a few
   * seconds before it shows a red X over each lane that will be shut, so the closure is never a surprise.
   */
  private planMaintenance(z: number): void {
    const tunnel = this.tunnel;
    if (!tunnel || tunnel.maintenance || this.delivery || this.rainUntil > this.elapsed || this.entities.some(e => e.kind === 'roadworks')) return;
    if (this.distance + z - tunnel.start < this.travelAfter(1.5)) return;
    const from = 68 + this.travelAfter(BAY_LEAD_SECONDS + GANTRY_SECONDS);
    if (this.distance + from + this.speed * MAINTENANCE_MAX_SECONDS * 1.15 > tunnel.end - this.travelAfter(0.5)) return;
    tunnel.maintenance = true;
    const closed = this.startRoadworks(from, true);
    this.entities.push({ id: this.nextId++, row: this.row, lane: 1, z, kind: 'gantry', handled: false, closed });
  }

  private spawnRow(z: number): void {
    // Successive guaranteed routes move at most one lane (a 0.16s change).
    if (this.row > 0 && this.row % 4 === 0) {
      // Clear stretches thin out as the run goes on, but never disappear.
      const lullChance = blend(0.4, 0.05, this.elapsed);
      const patterns = (['single', 'split', 'slalom'] as const).filter(p => p !== this.pattern);
      this.pattern = this.pattern !== 'breather' && this.random() < lullChance ? 'breather' : patterns[Math.floor(this.random() * patterns.length)];
    }
    // While a Ferrari is planned, or still has this row to drive through, rows hold the route in one lane and carry nothing else.
    const ferrariBusy = this.ferrariPlan !== null || this.entities.some(e => e.kind === 'ferrari' && e.z > z);
    if (ferrariBusy) this.safeLane = this.ferrariRoute;
    else if (this.pattern === 'slalom') {
      if (this.safeLane === 2) this.slalomDirection = -1;
      if (this.safeLane === 0) this.slalomDirection = 1;
      this.safeLane += this.slalomDirection;
    } else if (this.safeLane !== 1 && this.random() < blend(0, 0.3, this.elapsed)) {
      this.safeLane = 2 - this.safeLane;
    } else this.safeLane = Math.max(0, Math.min(2, this.safeLane + Math.floor(this.random() * 3) - 1));
    const raining = this.rainUntil > this.elapsed;
    const zone = this.zoneAt(z), gustClear = this.gust !== null && this.distance + z >= this.gust.clearFrom && this.distance + z <= this.gust.clearTo;
    if (zone === 'tunnel') this.planMaintenance(z);
    if (!this.closedLanesAt(z, ROADWORKS_CLEARANCE).length && this.elapsed >= this.nextRoadworksAt && this.row >= 6 && !this.delivery && !raining && zone !== 'tunnel' && !this.gust && !ferrariBusy) this.startRoadworks(z);
    // A closure that starts between rows (the far half of a flip) is treated as closed a little early,
    // so the row before it never leaves its route in a lane about to shut.
    const closed = this.closedLanesAt(z, ROADWORKS_CLEARANCE, this.speed * 0.9);
    const open = [0, 1, 2].filter(l => !closed.includes(l));
    if (!open.length) { this.row++; return; }
    // The route always runs through an open lane; rows where the closure starts, ends or flips are left clear.
    this.safeLane = open.reduce((best, l) => Math.abs(l - this.safeLane) < Math.abs(best - this.safeLane) ? l : best);
    const transition = closed.join() !== this.previousClosed;
    this.previousClosed = closed.join();
    const works = closed.length > 0 || transition;
    const others = open.filter(l => l !== this.safeLane);
    // A coupon row offers a choice: the plain gift in the guaranteed lane, or the
    // rare coupon in an adjacent lane. The third lane stays blocked.
    // Never place a shop on the river crossing.
    const onBridge = this.onBridge(z);
    const quiet = !this.delivery && !works && !ferrariBusy;
    const shopRow = quiet && this.elapsed >= this.nextShopAt && this.row >= 3 && !onBridge
      && this.elapsed < this.nextCouponAt;
    const couponRow = quiet && !shopRow && this.elapsed >= this.nextCouponAt && this.row >= 3;
    const powerpupRow = quiet && !shopRow && !couponRow && this.elapsed >= this.nextPowerpupAt && this.row >= 3;
    const giftasaurusRow = quiet && !shopRow && !couponRow && !powerpupRow && this.elapsed >= this.nextGiftasaurusAt && this.row >= 6 && !raining && !gustClear;
    const craneRow = quiet && !shopRow && !couponRow && !powerpupRow && !giftasaurusRow && this.elapsed >= this.nextCraneAt && this.row >= 6 && !raining && !onBridge;
    if (craneRow) {
      // The crane stands on a verge with its ball hanging over the middle of the road, swinging across all
      // three lanes. The route lane is clear as the truck passes at the normal pace; the other two are not.
      const crane: RoadEntity = { id: this.nextId++, row: this.row, lane: this.random() < 0.5 ? 0 : 2, z, kind: 'crane', handled: false };
      this.timeSwing(crane, this.safeLane);
      this.entities.push(crane);
      this.entities.push({ id: this.nextId++, row: this.row, lane: this.safeLane, z, kind: 'gift', handled: false, route: true, variant: this.rollGiftVariant() });
      this.nextCraneAt = this.elapsed + blend(32, 20, this.elapsed) + this.random() * blend(20, 14, this.elapsed);
      this.nextGiftasaurusAt = Math.max(this.nextGiftasaurusAt, this.elapsed + 8);
      this.pattern = 'single';
      this.row++;
      return;
    }
    if (giftasaurusRow) {
      // The jaws only reach the outer lane on its side, and the other two lanes stay clear. The route
      // gift sits under the jaws, so keeping the chain means timing the bite, boosting if needed.
      const side = this.safeLane === 1 ? (this.random() < 0.5 ? 0 : 2) : this.safeLane;
      const dino: RoadEntity = { id: this.nextId++, row: this.row, lane: side, z, kind: 'giftasaurus', handled: false };
      this.timeBite(dino);
      this.entities.push(dino);
      this.entities.push({ id: this.nextId++, row: this.row, lane: side, z, kind: 'gift', handled: false, route: true });
      this.nextGiftasaurusAt = this.elapsed + blend(26, 16, this.elapsed) + this.random() * blend(16, 12, this.elapsed);
      this.nextCraneAt = Math.max(this.nextCraneAt, this.elapsed + 8);
      this.safeLane = side; this.pattern = 'single';
      this.row++;
      return;
    }
    const deliveryRow = this.delivery?.phase === 'incoming' && this.elapsed >= this.delivery.spawnAt && this.row >= 3 && !onBridge && !works;
    if (deliveryRow && this.delivery) {
      const window = BAY_LEAD_SECONDS - DELIVERY_MARGIN;
      this.delivery = { ...this.delivery, phase: 'active', deadline: this.elapsed + window, window };
      this.pattern = 'single';
    }
    if (shopRow) {
      this.nextShopAt = this.elapsed + 45 + this.random() * 25;
      this.nextCouponAt = Math.max(this.nextCouponAt, this.elapsed + 10);
      this.shopSide = this.random() < 0.5 ? -1 : 1;
      this.pattern = 'single';
    }
    const shopLane = this.shopSide < 0 ? 0 : 2;
    // Coupons and the Snappy powerpup both sit beside the guaranteed lane, with the third lane blocked.
    let specialLane = -1;
    if (couponRow || powerpupRow) {
      const adjacent = others.filter(l => Math.abs(l - this.safeLane) === 1);
      specialLane = adjacent[Math.floor(this.random() * adjacent.length)];
      if (couponRow) this.nextCouponAt = this.elapsed + 32 + this.random() * 18;
      else this.nextPowerpupAt = this.elapsed + 50 + this.random() * 40;
      this.pattern = 'single';
    }
    const deliveryLane = this.delivery?.lane ?? -1;
    // A delivery's lane stays clear from reservation until its bay passes.
    const hazardLanes = others.filter(l => l !== deliveryLane);
    const blocked = shopRow || deliveryRow || transition || gustClear || ferrariBusy || open.length < 2 || !hazardLanes.length ? [] : couponRow || powerpupRow ? others.filter(l => l !== specialLane) : this.pattern === 'breather' ? [] : this.pattern === 'split' || this.pattern === 'slalom' || this.random() < blend(0.1, 0.7, this.elapsed) ? hazardLanes : [hazardLanes[Math.floor(this.random() * hazardLanes.length)]];
    const bayLane = shopRow ? shopLane : deliveryRow ? deliveryLane : -1;
    for (const lane of blocked) {
      const plainKinds: EntityKind[] = this.row < 3 ? ['cone', 'barrier'] : ['cone', 'barrier', 'drum', 'pothole'];
      const zoneKinds: EntityKind[] = zone === 'tunnel' ? ['stalledcar'] : zone === 'bridge' ? ['birds', 'puddle'] : [];
      const kinds: EntityKind[] = zoneKinds.length && this.random() < ZONE_HAZARD_CHANCE ? zoneKinds : plainKinds;
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      this.entities.push({ id: this.nextId++, row: this.row, lane, z, kind: raining ? 'gift' : kind, handled: false, variant: raining ? this.rollGiftVariant() : undefined });
    }
    if (shopRow) this.entities.push({ id: this.nextId++, row: this.row, lane: shopLane, z, kind: 'shop', handled: false });
    if (deliveryRow) this.entities.push({ id: this.nextId++, row: this.row, lane: deliveryLane, z, kind: 'delivery', handled: false });
    if (couponRow || powerpupRow) this.entities.push({ id: this.nextId++, row: this.row, lane: specialLane, z, kind: couponRow ? 'coupon' : 'powerpup', handled: false });
    this.row++;
    if (this.safeLane !== bayLane) this.entities.push({ id: this.nextId++, row: this.row - 1, lane: this.safeLane, z, kind: 'gift', handled: false, route: !(shopRow || deliveryRow || couponRow || powerpupRow), variant: this.rollGiftVariant() });
  }
}
