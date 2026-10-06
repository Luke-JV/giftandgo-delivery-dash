export type GameState = 'ready' | 'running' | 'paused' | 'reward' | 'crashed';
export type GiftReward = 'shield' | 'magnet' | 'double';
export type EntityKind = 'cone' | 'barrier' | 'drum' | 'pothole' | 'gift';
export interface RoadEntity { id: number; row: number; lane: number; z: number; kind: EntityKind; handled: boolean; }
export interface RunResult { distance: number; gifts: number; giftPoints: number; coupons: number; }

/** Simulation only. Rendering and browser events live in delivery-dash.game.ts. */
export class DeliveryDashEngine {
  state: GameState = 'ready';
  distance = 0;
  gifts = 0;
  giftPoints = 0;
  coupons = 0;
  shields = 0;
  magnetUntil = 0;
  doubleUntil = 0;
  invulnerableUntil = 0;
  lastPickupAt = -100;
  private nextCouponPoints = 100;
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
  get pace(): number { return this.speed / 86; }
  private travelAfter(seconds: number): number { return this.speed * seconds + 1.2 * seconds * seconds; }
  get result(): RunResult { return { distance: Math.floor(this.distance), gifts: this.gifts, giftPoints: this.giftPoints, coupons: this.coupons }; }

  start(): void {
    this.distance = this.elapsed = this.gifts = this.row = this.nextId = 0;
    this.spawnIn = 1.6;
    this.giftPoints = this.coupons = this.shields = this.magnetUntil = this.doubleUntil = this.invulnerableUntil = 0;
    this.lastPickupAt = -100; this.nextCouponPoints = 100;
    this.pattern = 'single'; this.slalomDirection = 1;
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

  pause(): void { if (this.state === 'running') this.state = 'paused'; }
  resume(): void { if (this.state === 'paused') this.state = 'running'; }

  chooseGift(reward: GiftReward): void {
    if (this.state !== 'reward' || !['shield', 'magnet', 'double'].includes(reward)) return;
    if (reward === 'shield' && this.shields >= 3) return;
    if (reward === 'shield') this.shields = Math.min(3, this.shields + 1);
    if (reward === 'magnet') this.magnetUntil = Math.max(this.elapsed, this.magnetUntil) + 25;
    if (reward === 'double') this.doubleUntil = Math.max(this.elapsed, this.doubleUntil) + 25;
    this.coupons++;
    this.nextCouponPoints += 100;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.elapsed + 0.4);
    this.state = 'running';
  }

  update(seconds: number): void {
    if (this.state !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    // Catch-up is capped; a suspended browser must not skip through a collision.
    const dt = Math.min(seconds, 0.05);
    const travel = this.travelAfter(dt);
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
      if (e.kind === 'gift') {
        this.gifts++; this.giftPoints += this.doubleUntil > this.elapsed ? 20 : 10;
        this.lastPickupAt = this.elapsed;
      } else if (this.invulnerableUntil > this.elapsed) continue;
      else if (this.shields > 0) { this.shields--; this.invulnerableUntil = this.elapsed + 0.55; }
      else { this.state = 'crashed'; this.crashLane = e.lane; break; }
    }
    this.entities = this.entities.filter(e => e.z > -90 && !(e.kind === 'gift' && e.handled));
    if (this.state !== 'running') return;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // Spawn 4.8 seconds ahead, accounting for future acceleration. Density
      // increases, but adjacent rows keep at least 0.8 seconds of reaction time.
      this.spawnRow(68 + this.travelAfter(4.8));
      this.spawnIn += Math.max(0.8, 1.8 / (1 + this.elapsed / 70));
    }
    if (this.giftPoints >= this.nextCouponPoints) this.state = 'reward';
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
    const blocked = this.pattern === 'breather' ? [] : this.pattern === 'split' || this.pattern === 'slalom' ? others : [others[Math.floor(this.random() * 2)]];
    for (const lane of blocked) {
      const kinds: EntityKind[] = this.row < 3 ? ['cone', 'barrier'] : ['cone', 'barrier', 'drum', 'pothole'];
      this.entities.push({ id: this.nextId++, row: this.row, lane, z,
        kind: kinds[Math.floor(this.random() * kinds.length)], handled: false });
    }
    this.entities.push({ id: this.nextId++, row: this.row++, lane: this.safeLane, z, kind: 'gift', handled: false });
  }
}
