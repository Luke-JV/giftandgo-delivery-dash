export type GameState = 'ready' | 'running' | 'paused' | 'reward' | 'shop' | 'crashed';
/** Coupons are free, short-lived power moments. */
export type CouponReward = 'ghost' | 'jackpot' | 'rain';
/** Shop items are bought with gift points; upgrades last for the rest of the run. */
export type ShopItem = 'shield' | 'nitro' | 'loyalty' | 'magnet' | 'freeplay';
export type GiftReward = CouponReward | ShopItem;
export const COUPON_REWARDS: readonly CouponReward[] = ['ghost', 'jackpot', 'rain'];
/** Freeplay cashes in every gift point at the current multiplier; it needs at least this many. */
export const FREEPLAY_MINIMUM = 10;
/** Coloured gifts sit in place of a plain route gift: blue pays double, green refills the nitro tank, purple pays five times, pink pays double and adds a shield. */
export type GiftVariant = 'blue' | 'green' | 'purple' | 'pink';
export interface GiftVariantRule { variant: GiftVariant; chance: number; multiplier: number; }
export const GIFT_VARIANTS: readonly GiftVariantRule[] = [
  { variant: 'blue', chance: 0.1, multiplier: 2 },
  { variant: 'green', chance: 0.06, multiplier: 1 },
  { variant: 'purple', chance: 0.03, multiplier: 5 },
  { variant: 'pink', chance: 0.02, multiplier: 2 },
];
export const SHIELD_LIMIT = 3;
export type EntityKind = 'cone' | 'barrier' | 'drum' | 'pothole' | 'gift' | 'coupon' | 'shop' | 'delivery' | 'roadworks' | 'powerpup' | 'giftasaurus';
/** `route` marks the guaranteed-lane gift; letting one go by breaks the multiplier chain. `variant` makes it a coloured gift with a different reward. `length` is how far a roadworks closure runs beyond `z`. `biteAt` is when a Giftasaurus bite cycle starts. */
export interface RoadEntity { id: number; row: number; lane: number; z: number; kind: EntityKind; handled: boolean; route?: boolean; variant?: GiftVariant; length?: number; biteAt?: number; }
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
/** Giftasaurus bite cycle in seconds: lean in, clamp, pull back, rest. */
export const BITE_CYCLE: readonly number[] = [1.3, 0.6, 1.0, 1.1];
export type BiteStage = 'lean' | 'clamp' | 'pullBack' | 'rest';
/** How far the jaws reach past the road edge at full stretch, in lanes: over a truck in the outer lane, short of the middle one. */
export const BITE_REACH = 0.6;
/** Half the truck's width, in lanes, and how far past its near side the jaws must reach to bite (the head is then down on the roof). */
const TRUCK_HALF_WIDTH = 0.32;
const BITE_OVERLAP = 0.2;
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
const isHazard = (kind: EntityKind): boolean => kind === 'cone' || kind === 'barrier' || kind === 'drum' || kind === 'pothole' || kind === 'giftasaurus';

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
  private nextDeliveryAt = 20;
  lastPowerpupAt = -100;
  private nextPowerpupAt = 35;
  private nextGiftasaurusAt = 45;
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
  // Continuous time-based acceleration: 86 at the start, 230 after one minute.
  // No speed ceiling; pause time does not count toward difficulty.
  get speed(): number { return 86 + 2.4 * this.elapsed; }
  boostHeld = false;
  boostMeter = 1;
  boostLevel = 0;
  private boostLocked = false;
  static readonly BOOST_FACTOR = 1.6;
  get magnet(): boolean { return this.magnetUntil > this.elapsed; }
  get boostActive(): boolean { return this.boostHeld && !this.boostLocked && this.boostMeter > 0; }
  private get boostMultiplier(): number { return 1 + (DeliveryDashEngine.BOOST_FACTOR - 1) * this.boostLevel; }
  get pace(): number { return this.speed * this.boostMultiplier / 86; }
  private travelAfter(seconds: number): number { return this.speed * seconds + 1.2 * seconds * seconds; }
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
    this.nextGiftasaurusAt = 45 + this.random() * 20;
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
    this.lastBonusGift = { variant, at: this.elapsed };
  }

  /** One roll per route gift; a shield gift is never offered to a full set of shields. */
  private rollGiftVariant(): GiftVariant | undefined {
    let roll = this.random();
    for (const rule of GIFT_VARIANTS) {
      if (roll < rule.chance) return rule.variant === 'pink' && this.shields >= SHIELD_LIMIT ? undefined : rule.variant;
      roll -= rule.chance;
    }
    return undefined;
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

  /** Price of the next level, or null when sold out. Shields restock as they are used, up to three. Freeplay costs the whole balance. */
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
      // Every hazard still ahead becomes a gift, and new rows are all gifts for a few seconds.
      for (const e of this.entities) if (e.z >= 48 && isHazard(e.kind)) e.kind = 'gift';
      // Closures still ahead are cleared into a trail of gifts along the lane.
      const works = this.entities.filter(e => e.kind === 'roadworks' && e.z >= 48);
      this.entities = this.entities.filter(e => !works.includes(e));
      for (const e of works) for (let z = e.z; z <= e.z + (e.length ?? 0); z += 70) {
        this.entities.push({ id: this.nextId++, row: e.row, lane: e.lane, z, kind: 'gift', handled: false });
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
      e.z -= travel;
      if (e.handled || e.z > 68 || previousZ + length < 48) continue;
      // Swept overlap catches an obstacle even when one fast frame crosses the
      // entire collision zone, and uses the truck's actual lane-change path.
      // A roadworks closure overlaps for its whole length, so steering into it crashes.
      const enter = Math.max(0, (previousZ - 68) / travel);
      const leave = Math.min(1, (previousZ + length - 48) / travel);
      const laneAt = (fraction: number) => fromLane + Math.sign(delta) * Math.min(Math.abs(delta), dt * fraction / 0.16);
      const a = laneAt(enter), b = laneAt(leave);
      // The Dustbuster reaches gifts one lane either side of the truck.
      const reach = e.kind === 'gift' && this.magnet ? MAGNET_REACH_LANES + 0.43 : 0.43;
      if (e.kind === 'giftasaurus' ? !this.bites(e, a) && !this.bites(e, b) : Math.max(a, b) <= e.lane - reach || Math.min(a, b) >= e.lane + reach) continue;
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
        this.addScore(points * this.multiplier);
        if (e.variant) this.applyGiftVariant(e.variant);
      } else if (e.kind === 'delivery') this.completeDelivery();
      else if (e.kind === 'powerpup') { this.addScore(POWERPUP_BONUS * this.multiplier); this.lastPowerpupAt = this.elapsed; }
      else if (this.invulnerableUntil > this.elapsed || this.ghostUntil > this.elapsed) continue;
      else if (this.shields > 0) { this.shields--; this.invulnerableUntil = this.elapsed + 0.55; this.breakChain(); }
      else { this.state = 'crashed'; this.crashLane = e.lane; break; }
    }
    for (const e of this.entities) {
      if (e.z >= 48 || e.handled) continue;
      if (e.kind === 'gift' && e.route) { e.route = false; this.breakChain(); }
      else if (e.kind === 'delivery') { e.handled = true; this.missDelivery(); this.delivery = null; }
    }
    this.entities = this.entities.filter(e => e.z + (e.length ?? 0) > -90 && !((e.kind === 'gift' || e.kind === 'coupon' || e.kind === 'shop' || e.kind === 'delivery' || e.kind === 'powerpup') && e.handled));
    if (this.state !== 'running') return;
    // Score trickles in with pace (not boost), so distance matters but never dominates.
    this.score += this.speed / 86 * dt * this.multiplier;
    this.updateDelivery();
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // Spawn 4.8 seconds ahead, accounting for future acceleration. Density
      // increases, but adjacent rows keep at least 0.8 seconds of reaction time.
      this.spawnRow(68 + this.travelAfter(BAY_LEAD_SECONDS));
      this.spawnIn += Math.max(0.8, 1.8 / (1 + this.elapsed / 70));
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

  /** Seconds until a row `z` ahead reaches the truck, boosting for up to `boostSeconds` first. */
  private arrivalIn(z: number, boostSeconds: number): number {
    let time = 0, travelled = 0;
    while (travelled < z - 68 && time < 30) {
      time += 0.02;
      travelled += (this.speed + 2.4 * time) * 0.02 * (time <= boostSeconds ? DeliveryDashEngine.BOOST_FACTOR : 1);
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

  /** Verge buildings are never placed on the river crossing (an 80s cycle; the bridge is 24-36s into it). */
  private onBridge(at: number): boolean {
    const bridgeTime = (at + 8 + 5) % 80;
    return bridgeTime > 18 && bridgeTime < 42;
  }

  private scheduleDelivery(): void { this.nextDeliveryAt = this.elapsed + 25 + this.random() * 15; }

  /**
   * Reserve a lane when a shop or coupon is not about to claim the road, announce it once the obstacles
   * already in it have passed, and expire a request that ran out of time. A reserved lane gets no new
   * obstacles until its bay passes, so chasing a delivery can cost points but never the run.
   */
  private updateDelivery(): void {
    if (!this.delivery) {
      if (this.elapsed >= this.nextDeliveryAt && !this.entities.some(e => e.kind === 'roadworks') && !this.onBridge(this.elapsed + BAY_LEAD_SECONDS + DELIVERY_WARNING) && this.nextShopAt - this.elapsed > 3 && this.nextCouponAt - this.elapsed > 3) {
        this.delivery = { lane: this.random() < 0.5 ? 0 : 2, phase: 'pending', spawnAt: 0, deadline: 0, window: 0 };
      }
    } else if (this.delivery.phase === 'pending') {
      const lane = this.delivery.lane;
      if (!this.entities.some(e => (isHazard(e.kind) || e.kind === 'roadworks') && e.lane === lane && e.z + (e.length ?? 0) > 40)) {
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
  private startRoadworks(z: number): void {
    const openEdge = this.safeLane === 1 ? (this.random() < 0.5 ? 0 : 2) : this.safeLane;
    const double = this.random() < Math.min(0.45, 0.2 + this.elapsed / 400);
    const flip = double && this.random() < 0.2;
    const close = (lanes: number[], from: number, seconds: number) => {
      for (const lane of lanes) this.entities.push({ id: this.nextId++, row: this.row, lane, z: from, kind: 'roadworks', handled: false, length: this.speed * seconds });
    };
    const firstSeconds = flip ? 2.5 + this.random() * 1.5 : 4 + this.random() * 3;
    close(double ? [0, 1, 2].filter(l => l !== openEdge) : [2 - openEdge], z, firstSeconds);
    let total = firstSeconds;
    if (flip) {
      const gapSeconds = 1.4, secondSeconds = 2.5 + this.random() * 1.5;
      close([0, 1, 2].filter(l => l !== 2 - openEdge), z + this.speed * (firstSeconds + gapSeconds), secondSeconds);
      total += gapSeconds + secondSeconds;
    }
    this.nextRoadworksAt = this.elapsed + total + 22 + this.random() * 18;
  }

  private spawnRow(z: number): void {
    // Successive guaranteed routes move at most one lane (a 0.16s change).
    if (this.row > 0 && this.row % 4 === 0) {
      const patterns = (['single', 'split', 'slalom', 'breather'] as const).filter(p => p !== this.pattern);
      this.pattern = patterns[Math.floor(this.random() * patterns.length)];
    }
    if (this.pattern === 'slalom') {
      if (this.safeLane === 2) this.slalomDirection = -1;
      if (this.safeLane === 0) this.slalomDirection = 1;
      this.safeLane += this.slalomDirection;
    } else this.safeLane = Math.max(0, Math.min(2, this.safeLane + Math.floor(this.random() * 3) - 1));
    const raining = this.rainUntil > this.elapsed;
    if (!this.closedLanesAt(z, ROADWORKS_CLEARANCE).length && this.elapsed >= this.nextRoadworksAt && this.row >= 6 && !this.delivery && !raining) this.startRoadworks(z);
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
    // Never place a shop on the river crossing (a 80s cycle; the bridge is 24-36s into it).
    const onBridge = this.onBridge(this.elapsed);
    const quiet = !this.delivery && !works;
    const shopRow = quiet && this.elapsed >= this.nextShopAt && this.row >= 3 && !onBridge
      && this.elapsed < this.nextCouponAt;
    const couponRow = quiet && !shopRow && this.elapsed >= this.nextCouponAt && this.row >= 3;
    const powerpupRow = quiet && !shopRow && !couponRow && this.elapsed >= this.nextPowerpupAt && this.row >= 3;
    const giftasaurusRow = quiet && !shopRow && !couponRow && !powerpupRow && this.elapsed >= this.nextGiftasaurusAt && this.row >= 6 && !raining;
    if (giftasaurusRow) {
      // The jaws only reach the outer lane on its side, and the other two lanes stay clear. The route
      // gift sits under the jaws, so keeping the chain means timing the bite, boosting if needed.
      const side = this.safeLane === 1 ? (this.random() < 0.5 ? 0 : 2) : this.safeLane;
      const dino: RoadEntity = { id: this.nextId++, row: this.row, lane: side, z, kind: 'giftasaurus', handled: false };
      this.timeBite(dino);
      this.entities.push(dino);
      this.entities.push({ id: this.nextId++, row: this.row, lane: side, z, kind: 'gift', handled: false, route: true });
      this.nextGiftasaurusAt = this.elapsed + 40 + this.random() * 25;
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
    const blocked = shopRow || deliveryRow || transition || open.length < 2 || !hazardLanes.length ? [] : couponRow || powerpupRow ? others.filter(l => l !== specialLane) : this.pattern === 'breather' ? [] : this.pattern === 'split' || this.pattern === 'slalom' ? hazardLanes : [hazardLanes[Math.floor(this.random() * hazardLanes.length)]];
    const bayLane = shopRow ? shopLane : deliveryRow ? deliveryLane : -1;
    for (const lane of blocked) {
      const kinds: EntityKind[] = this.row < 3 ? ['cone', 'barrier'] : ['cone', 'barrier', 'drum', 'pothole'];
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      this.entities.push({ id: this.nextId++, row: this.row, lane, z, kind: raining ? 'gift' : kind, handled: false });
    }
    if (shopRow) this.entities.push({ id: this.nextId++, row: this.row, lane: shopLane, z, kind: 'shop', handled: false });
    if (deliveryRow) this.entities.push({ id: this.nextId++, row: this.row, lane: deliveryLane, z, kind: 'delivery', handled: false });
    if (couponRow || powerpupRow) this.entities.push({ id: this.nextId++, row: this.row, lane: specialLane, z, kind: couponRow ? 'coupon' : 'powerpup', handled: false });
    this.row++;
    if (this.safeLane !== bayLane) this.entities.push({ id: this.nextId++, row: this.row - 1, lane: this.safeLane, z, kind: 'gift', handled: false, route: !(shopRow || deliveryRow), variant: this.rollGiftVariant() });
  }
}
