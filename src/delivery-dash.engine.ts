export type GameState = 'ready' | 'running' | 'paused' | 'reward' | 'shop' | 'crashed';
export type GiftReward = 'shield' | 'magnet' | 'double' | 'jackpot' | 'ghost' | 'sweeper' | 'shower' | 'mystery';
export const ALL_REWARDS: readonly GiftReward[] = ['shield', 'magnet', 'double', 'jackpot', 'ghost', 'sweeper', 'shower', 'mystery'];
export type EntityKind = 'cone' | 'barrier' | 'drum' | 'pothole' | 'gift' | 'coupon' | 'shop';
export interface RoadEntity { id: number; row: number; lane: number; z: number; kind: EntityKind; handled: boolean; }
export interface RunResult { distance: number; gifts: number; giftPoints: number; coupons: number; spent: number; duration: number; }
export const SHOP_ITEMS: readonly { reward: GiftReward; cost: number }[] = [
  { reward: 'shield', cost: 100 },
  { reward: 'magnet', cost: 150 },
  { reward: 'ghost', cost: 200 },
  { reward: 'sweeper', cost: 250 },
];

/** Simulation only. Rendering and browser events live in delivery-dash.game.ts. */
export class DeliveryDashEngine {
  state: GameState = 'ready';
  distance = 0;
  gifts = 0;
  giftPoints = 0;
  pointsEarned = 0;
  spent = 0;
  coupons = 0;
  shields = 0;
  magnetUntil = 0;
  doubleUntil = 0;
  jackpotUntil = 0;
  ghostUntil = 0;
  sweepAt = -100;
  offer: GiftReward[] = [];
  lastRedeemed: GiftReward | null = null;
  private previousOffer: GiftReward[] = [];
  invulnerableUntil = 0;
  lastPickupAt = -100;
  private nextCouponAt = 16;
  private nextShopAt = 26;
  shopsVisited = 0;
  shopSide = 1;
  couponPickedAt = -100;
  private pattern: 'single' | 'split' | 'slalom' | 'breather' = 'single';
  private slalomDirection = 1;
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
  get boostActive(): boolean { return this.boostHeld && !this.boostLocked && this.boostMeter > 0; }
  private get boostMultiplier(): number { return 1 + (DeliveryDashEngine.BOOST_FACTOR - 1) * this.boostLevel; }
  get pace(): number { return this.speed * this.boostMultiplier / 86; }
  private travelAfter(seconds: number): number { return this.speed * seconds + 1.2 * seconds * seconds; }
  get result(): RunResult { return { distance: Math.floor(this.distance), gifts: this.gifts, giftPoints: this.pointsEarned, coupons: this.coupons, spent: this.spent, duration: Math.round(this.elapsed * 100) / 100 }; }

  start(): void {
    this.distance = this.elapsed = this.gifts = this.row = this.nextId = 0;
    this.spawnIn = 1.6;
    this.giftPoints = this.pointsEarned = this.spent = this.coupons = this.shields = this.magnetUntil = this.doubleUntil = this.jackpotUntil = this.ghostUntil = this.invulnerableUntil = 0;
    this.offer = []; this.previousOffer = []; this.lastRedeemed = null; this.sweepAt = -100;
    this.lastPickupAt = this.couponPickedAt = -100; this.nextCouponAt = 16; this.nextShopAt = 26; this.shopsVisited = 0;
    this.pattern = 'single'; this.slalomDirection = 1;
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
    return this.jackpotUntil > this.elapsed ? 50 : this.doubleUntil > this.elapsed ? 20 : 10;
  }

  /** Three different boosts per coupon, avoiding the previous offer where possible. */
  private rollOffer(): GiftReward[] {
    const eligible = ALL_REWARDS.filter(reward => reward !== 'shield' || this.shields < 3);
    const fresh = eligible.filter(reward => !this.previousOffer.includes(reward));
    const pool = fresh.length >= 3 ? fresh : eligible;
    const picks: GiftReward[] = [];
    const remaining = [...pool];
    while (picks.length < 3 && remaining.length) picks.push(remaining.splice(Math.floor(this.random() * remaining.length), 1)[0]);
    this.previousOffer = picks;
    return picks;
  }

  canAfford(reward: GiftReward): boolean {
    const item = SHOP_ITEMS.find(entry => entry.reward === reward);
    return !!item && this.state === 'shop' && this.giftPoints >= item.cost && (reward !== 'shield' || this.shields < 3);
  }

  /** Spend gift points on a boost without interrupting the drive. */
  buy(reward: GiftReward): boolean {
    if (!this.canAfford(reward)) return false;
    const cost = SHOP_ITEMS.find(entry => entry.reward === reward)?.cost ?? 0;
    this.giftPoints -= cost; this.spent += cost;
    this.applyReward(reward);
    return true;
  }

  leaveShop(): void {
    if (this.state !== 'shop') return;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.elapsed + 0.6);
    this.state = 'running';
  }

  chooseGift(reward: GiftReward): void {
    if (this.state !== 'reward' || !this.offer.includes(reward)) return;
    this.applyReward(reward);
    this.offer = [];
    this.coupons++;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.elapsed + 0.4);
    this.state = 'running';
  }

  private applyReward(reward: GiftReward): void {
    let applied = reward;
    if (applied === 'mystery') {
      const options = ALL_REWARDS.filter(option => option !== 'mystery' && (option !== 'shield' || this.shields < 3));
      applied = options[Math.floor(this.random() * options.length)];
    }
    if (applied === 'shield') this.shields = Math.min(3, this.shields + 1);
    if (applied === 'magnet') this.magnetUntil = Math.max(this.elapsed, this.magnetUntil) + 25;
    if (applied === 'double') this.doubleUntil = Math.max(this.elapsed, this.doubleUntil) + 25;
    if (applied === 'jackpot') this.jackpotUntil = Math.max(this.elapsed, this.jackpotUntil) + 10;
    if (applied === 'ghost') this.ghostUntil = Math.max(this.elapsed, this.ghostUntil) + 7;
    if (applied === 'shower') { this.giftPoints += 100; this.pointsEarned += 100; this.lastPickupAt = this.elapsed; }
    if (applied === 'sweeper') {
      this.entities = this.entities.filter(e => e.kind === 'gift' || e.kind === 'coupon' || e.kind === 'shop' || e.z < 48);
      this.sweepAt = this.elapsed;
    }
    this.lastRedeemed = applied;
  }

  update(seconds: number): void {
    if (this.state !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    // Catch-up is capped; a suspended browser must not skip through a collision.
    const dt = Math.min(seconds, 0.05);
    // Boost drains a short nitro meter; once empty it must recharge before reuse.
    const boosting = this.boostActive;
    this.boostMeter = Math.max(0, Math.min(1, this.boostMeter + (boosting ? -dt / 3 : dt / 8)));
    if (this.boostMeter <= 0) this.boostLocked = true;
    else if (this.boostLocked && this.boostMeter >= 0.25) this.boostLocked = false;
    this.boostLevel = Math.max(0, Math.min(1, this.boostLevel + (boosting ? 1 : -1) * dt * 6));
    const travel = this.travelAfter(dt) * this.boostMultiplier;
    this.elapsed += dt;
    this.distance += travel;
    const fromLane = this.lanePosition, delta = this.lane - fromLane;
    this.lanePosition += Math.sign(delta) * Math.min(Math.abs(delta), dt / 0.16);
    for (const e of this.entities) {
      const previousZ = e.z;
      e.z -= travel;
      if (e.handled || e.z > 68 || previousZ < 48) continue;
      // Swept overlap catches an obstacle even when one fast frame crosses the
      // entire collision zone, and uses the truck's actual lane-change path.
      const enter = Math.max(0, (previousZ - 68) / travel);
      const leave = Math.min(1, (previousZ - 48) / travel);
      const laneAt = (fraction: number) => fromLane + Math.sign(delta) * Math.min(Math.abs(delta), dt * fraction / 0.16);
      const a = laneAt(enter), b = laneAt(leave);
      const reach = e.kind === 'gift' && this.magnetUntil > this.elapsed ? 1.45 : 0.43;
      if (Math.max(a, b) <= e.lane - reach || Math.min(a, b) >= e.lane + reach) continue;
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
        this.gifts++;
        this.giftPoints += this.pointsPerGift; this.pointsEarned += this.pointsPerGift;
        this.lastPickupAt = this.elapsed;
      } else if (this.invulnerableUntil > this.elapsed || this.ghostUntil > this.elapsed) continue;
      else if (this.shields > 0) { this.shields--; this.invulnerableUntil = this.elapsed + 0.55; }
      else { this.state = 'crashed'; this.crashLane = e.lane; break; }
    }
    this.entities = this.entities.filter(e => e.z > -90 && !((e.kind === 'gift' || e.kind === 'coupon' || e.kind === 'shop') && e.handled));
    if (this.state !== 'running') return;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // Spawn 4.8 seconds ahead, accounting for future acceleration. Density
      // increases, but adjacent rows keep at least 0.8 seconds of reaction time.
      this.spawnRow(68 + this.travelAfter(4.8));
      this.spawnIn += Math.max(0.8, 1.8 / (1 + this.elapsed / 70));
    }
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
    const others = [0, 1, 2].filter(l => l !== this.safeLane);
    // A coupon row offers a choice: the plain gift in the guaranteed lane, or the
    // rare coupon in an adjacent lane. The third lane stays blocked.
    // Never place a shop on the river crossing (a 80s cycle; the bridge is 24-36s into it).
    const bridgeTime = (this.elapsed + 8 + 5) % 80;
    const shopRow = this.elapsed >= this.nextShopAt && this.row >= 3 && !(bridgeTime > 18 && bridgeTime < 42)
      && this.elapsed < this.nextCouponAt;
    const couponRow = !shopRow && this.elapsed >= this.nextCouponAt && this.row >= 3;
    if (shopRow) {
      this.nextShopAt = this.elapsed + 45 + this.random() * 25;
      this.nextCouponAt = Math.max(this.nextCouponAt, this.elapsed + 10);
      this.shopSide = this.random() < 0.5 ? -1 : 1;
      this.pattern = 'single';
    }
    const shopLane = this.shopSide < 0 ? 0 : 2;
    let couponLane = -1;
    if (couponRow) {
      const adjacent = others.filter(l => Math.abs(l - this.safeLane) === 1);
      couponLane = adjacent[Math.floor(this.random() * adjacent.length)];
      this.nextCouponAt = this.elapsed + 32 + this.random() * 18;
      this.pattern = 'single';
    }
    const blocked = shopRow ? [] : couponRow ? others.filter(l => l !== couponLane) : this.pattern === 'breather' ? [] : this.pattern === 'split' || this.pattern === 'slalom' ? others : [others[Math.floor(this.random() * 2)]];
    for (const lane of blocked) {
      const kinds: EntityKind[] = this.row < 3 ? ['cone', 'barrier'] : ['cone', 'barrier', 'drum', 'pothole'];
      this.entities.push({ id: this.nextId++, row: this.row, lane, z,
        kind: kinds[Math.floor(this.random() * kinds.length)], handled: false });
    }
    if (shopRow) this.entities.push({ id: this.nextId++, row: this.row, lane: shopLane, z, kind: 'shop', handled: false });
    if (couponRow) this.entities.push({ id: this.nextId++, row: this.row, lane: couponLane, z, kind: 'coupon', handled: false });
    this.row++;
    if (!(shopRow && this.safeLane === shopLane)) this.entities.push({ id: this.nextId++, row: this.row - 1, lane: this.safeLane, z, kind: 'gift', handled: false });
  }
}
