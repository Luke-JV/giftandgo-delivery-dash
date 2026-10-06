import { DELIVERY_DASH_ASSETS } from './delivery-dash.assets';
import { DeliveryDashEngine, GameState, GiftReward, RoadEntity, RunResult, SHOP_ITEMS } from './delivery-dash.engine';
import { REWARD_CATALOG } from './delivery-dash.rewards';
import { cleanNickname, fetchRank, fetchTopScores, MIN_SCORE_DISTANCE, ScoreRow, submitScore } from './delivery-dash.leaderboard';

type GameWindow = Window & typeof globalThis;

/** Reusable canvas game host. No Angular or third-party dependency. */
export class DeliveryDashGame {
  readonly engine = new DeliveryDashEngine();
  private readonly canvas: HTMLCanvasElement;
  private readonly logo: HTMLImageElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly abort: AbortController;
  private readonly observer: ResizeObserver;
  private readonly intersection: IntersectionObserver;
  private readonly motion: MediaQueryList;
  private truck?: HTMLImageElement;
  private scenery: Record<string, HTMLImageElement> = {};
  private frame = 0;
  private lastTime = 0;
  private destroyed = false;
  private onscreen = true;
  private ready = false;
  private best = 0;
  private uiTime = 0;
  private idleTime = 0;
  private swipeX: number | null = null;
  private swipeY = 0;
  private pointerId: number | null = null;
  private displayScale = 2;
  private hasWidth = true;
  private lastGiftPoints = 0;
  private toastUntil = 0;
  private toastLocked = false;
  private offerKey = '';
  private shopNote = '';
  private boardRows: ScoreRow[] = [];
  private boardNote = '';
  private highlightId = 0;
  private pendingResult: RunResult | null = null;
  private submitting = false;
  private nicknameKey = 'giftgo-delivery-dash-name';
  private fullscreen = false;
  private nativeFullscreen = false;
  private static readonly W = 240;
  private static readonly H = 230;

  constructor(private readonly root: HTMLElement, private readonly win: GameWindow,
    private readonly onFinish: (result: RunResult) => void = () => {}) {
    this.canvas = this.find<HTMLCanvasElement>('[data-game-canvas]');
    this.logo = this.find<HTMLImageElement>('[data-truck-logo]');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    this.ctx = ctx;
    this.canvas.width = DeliveryDashGame.W; this.canvas.height = DeliveryDashGame.H;
    this.abort = new win.AbortController();
    this.motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      const stored = Number(win.localStorage.getItem('giftgo-delivery-dash-best'));
      if (Number.isFinite(stored)) this.best = Math.max(0, Math.floor(stored));
    } catch {}
    this.logo.src = DELIVERY_DASH_ASSETS.logo;
    this.find<HTMLImageElement>('[data-brand-logo]').src = DELIVERY_DASH_ASSETS.logo;
    const signal = this.abort.signal;
    const listen = (target: EventTarget, type: string, fn: EventListener) => target.addEventListener(type, fn, { signal });
    listen(this.find('[data-action="start"]'), 'click', () => this.startOrResume());
    listen(this.find('[data-action="pause"]'), 'click', () => this.togglePause());
    listen(this.find('[data-action="left"]'), 'click', () => this.engine.steer(-1));
    listen(this.find('[data-action="right"]'), 'click', () => this.engine.steer(1));
    listen(this.find('[data-submit]'), 'submit', event => { event.preventDefault(); void this.submitRun(); });
    try { this.find<HTMLInputElement>('[data-nickname]').value = win.localStorage.getItem(this.nicknameKey) ?? ''; } catch {}
    listen(this.find('[data-action="fullscreen"]'), 'click', () => this.toggleFullscreen());
    listen(root.ownerDocument, 'fullscreenchange', () => this.fullscreenChanged());
    listen(this.find('[data-rewards]'), 'click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-reward]');
      const reward = button?.dataset['reward'] as GiftReward | undefined;
      if (!reward || button?.disabled) return;
      if (this.engine.state === 'shop') { this.buy(reward); return; }
      this.engine.chooseGift(reward);
      this.afterRedeem();
      this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
    });
    listen(this.find('[data-action="leave-shop"]'), 'click', () => {
      this.engine.leaveShop(); this.shopNote = '';
      this.lastGiftPoints = this.engine.giftPoints; this.lastTime = 0;
      this.syncUI(); this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
      this.draw(); this.schedule();
    });
    listen(root, 'keydown', event => this.key(event as KeyboardEvent));
    listen(this.canvas, 'pointerdown', event => this.pointerDown(event as PointerEvent));
    listen(this.canvas, 'pointerup', event => this.pointerUp(event as PointerEvent));
    listen(this.canvas, 'pointercancel', () => { this.swipeX = this.pointerId = null; });
    listen(root.ownerDocument, 'visibilitychange', () => this.visibility());
    listen(this.motion, 'change', () => { this.lastTime = 0; this.draw(); this.schedule(); });
    this.observer = new win.ResizeObserver(() => this.resize());
    this.observer.observe(this.find('[data-scene]'));
    this.intersection = new win.IntersectionObserver(entries => {
      this.onscreen = entries[0]?.isIntersecting ?? false;
      this.visibility();
    });
    this.intersection.observe(root);
    this.resize(); this.syncUI();
    const load = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new win.Image();
      image.onload = () => resolve(image); image.onerror = reject; image.src = source;
    });
    void Promise.all(Object.entries(DELIVERY_DASH_ASSETS).filter(([key]) => key !== 'logo')
      .map(async ([key, source]) => [key, await load(source)] as const)).then(entries => {
      if (this.destroyed) return;
      this.scenery = Object.fromEntries(entries);
      this.truck = this.scenery['truck']; this.ready = true;
      this.find<HTMLButtonElement>('[data-action="start"]').disabled = false;
      this.draw(); this.syncUI(); this.schedule(); void this.refreshBoard();
    }).catch(() => {
      if (this.destroyed) return;
      this.find('[data-overlay-title]').textContent = 'Unable to load the game';
      this.find('[data-overlay-message]').textContent = 'Reload this page to try again.';
      this.find<HTMLButtonElement>('[data-action="start"]').disabled = true;
    });
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing game element: ${selector}`);
    return el;
  }

  private startOrResume(): void {
    if (!this.ready || this.destroyed) return;
    if (this.engine.state === 'paused') this.engine.resume();
    else { this.engine.start(); this.idleTime = 0; this.pendingResult = null; this.boardNote = ''; this.highlightId = 0; }
    this.lastGiftPoints = this.engine.giftPoints;
    this.lastTime = 0; this.uiTime = 0;
    this.syncUI();
    this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
    this.draw(); this.schedule();
  }

  private togglePause(): void {
    if (this.engine.state === 'running') this.engine.pause();
    else if (this.engine.state === 'paused') this.engine.resume();
    else return;
    this.lastTime = 0; this.syncUI(); this.schedule();
  }

  private showToast(text: string): void {
    this.find('[data-toast]').textContent = text;
    this.toastUntil = this.engine.elapsed + 1.4;
    this.toastLocked = true;
  }

  private afterRedeem(): void {
    const applied = this.engine.lastRedeemed;
    this.lastGiftPoints = this.engine.giftPoints;
    this.lastTime = 0;
    if (applied) this.showToast(REWARD_CATALOG[applied].toast);
    this.syncUI(); this.draw(); this.schedule();
  }

  private buy(reward: GiftReward): void {
    if (!this.engine.buy(reward)) return;
    this.shopNote = `${REWARD_CATALOG[reward].toast}`;
    this.afterRedeem();
    const focused = this.root.ownerDocument.activeElement;
    if (!(focused instanceof this.win.HTMLButtonElement) || focused.disabled) {
      (this.root.querySelector<HTMLButtonElement>('[data-reward]:not(:disabled)') ?? this.find<HTMLButtonElement>('[data-action="leave-shop"]')).focus({ preventScroll: true });
    }
  }

  private toggleFullscreen(): void {
    const doc = this.root.ownerDocument;
    if (this.fullscreen) {
      this.setFullscreen(false);
      if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
      return;
    }
    this.setFullscreen(true);
    // iOS Safari has no element fullscreen; the fixed full-viewport layout covers it.
    if (this.root.requestFullscreen) {
      this.root.requestFullscreen({ navigationUI: 'hide' }).then(() => { this.nativeFullscreen = true; }).catch(() => {});
    }
  }

  private setFullscreen(on: boolean): void {
    this.fullscreen = on;
    if (!on) this.nativeFullscreen = false;
    this.root.classList.toggle('dash-fullscreen', on);
    this.root.ownerDocument.documentElement.style.overflow = on ? 'hidden' : '';
    const button = this.find<HTMLButtonElement>('[data-action="fullscreen"]');
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    this.find('[data-fullscreen-icon] path').setAttribute('d', on
      ? 'M5 1v4H1M11 1v4h4M15 11h-4v4M1 11h4v4'
      : 'M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5');
    this.resize();
  }

  private fullscreenChanged(): void {
    if (this.nativeFullscreen && !this.root.ownerDocument.fullscreenElement) this.setFullscreen(false);
  }

  private key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) this.engine.steer(['ArrowLeft', 'a', 'A'].includes(e.key) ? -1 : 1);
    } else if (['p', 'P', 'Escape'].includes(e.key)) {
      e.preventDefault(); if (!e.repeat) this.togglePause();
    }
  }

  private pointerDown(e: PointerEvent): void {
    if (!e.isPrimary || this.engine.state !== 'running') return;
    this.swipeX = e.clientX; this.swipeY = e.clientY; this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
  }

  private pointerUp(e: PointerEvent): void {
    if (this.swipeX === null || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.swipeX, dy = e.clientY - this.swipeY;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) this.engine.steer(Math.sign(dx));
    else if (Math.abs(dx) <= 24 && Math.abs(dy) <= 24) {
      const bounds = this.canvas.getBoundingClientRect();
      this.engine.steer(e.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
    }
    this.swipeX = this.pointerId = null;
  }

  private visibility(): void {
    if (this.root.ownerDocument.hidden || !this.onscreen || !this.hasWidth) {
      this.engine.pause(); this.lastTime = 0;
      if (this.frame) this.win.cancelAnimationFrame(this.frame);
      this.frame = 0; this.syncUI();
    } else { this.lastTime = 0; this.schedule(); }
  }

  private resize(): void {
    const width = this.find('[data-scene]').clientWidth;
    this.hasWidth = width > 0;
    this.displayScale = Math.max(0, width / DeliveryDashGame.W);
    this.draw(); this.visibility();
  }

  private schedule(): void {
    if (this.destroyed || this.frame || !this.ready || !this.onscreen || !this.hasWidth || this.root.ownerDocument.hidden) return;
    if (this.engine.state !== 'running' && (this.engine.state !== 'ready' || this.motion.matches)) return;
    this.frame = this.win.requestAnimationFrame(now => this.tick(now));
  }

  private tick(now: number): void {
    this.frame = 0;
    if (this.destroyed) return;
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = now;
    if (this.engine.state === 'running') {
      this.engine.update(dt);
      if ((this.engine.state as GameState) === 'crashed') {
        this.best = Math.max(this.best, Math.floor(this.engine.distance));
        try { this.win.localStorage.setItem('giftgo-delivery-dash-best', String(this.best)); } catch {}
        this.onFinish(this.engine.result);
        this.pendingResult = this.engine.result.distance >= MIN_SCORE_DISTANCE ? this.engine.result : null;
        this.boardNote = ''; this.highlightId = 0;
        void this.refreshBoard();
        this.find('[data-live-status]').textContent = `Run finished. ${Math.floor(this.engine.distance)} metres, ${this.engine.pointsEarned} gift points earned. Play again to restart.`;
        this.syncUI();
        if (!this.pendingResult) this.find<HTMLButtonElement>('[data-action="start"]').focus({ preventScroll: true });
      } else if ((this.engine.state as GameState) === 'shop') {
        this.shopNote = '';
        this.syncUI();
        this.find('[data-live-status]').textContent = 'Roadside shop. Spend gift points on boosts. The game is paused while you shop.';
        this.root.querySelector<HTMLButtonElement>('[data-reward]:not(:disabled)')?.focus({ preventScroll: true });
      } else if ((this.engine.state as GameState) === 'reward') {
        this.syncUI();
        this.find('[data-live-status]').textContent = 'Coupon collected. Choose a boost to redeem. The game is paused while you choose.';
        const first = this.root.querySelector<HTMLButtonElement>('[data-reward]');
        first?.focus({ preventScroll: true });
      }
    } else if (this.engine.state === 'ready' && !this.motion.matches) this.idleTime += dt * 18;
    this.uiTime += dt;
    if (this.uiTime >= 0.1) { this.uiTime = 0; this.syncUI(); }
    this.draw(); this.schedule();
  }

  private syncUI(): void {
    const state = this.engine.state;
    this.root.dataset['state'] = state;
    this.find('[data-distance]').textContent = String(Math.floor(this.engine.distance)).padStart(4, '0');
    this.find('[data-points]').textContent = String(this.engine.giftPoints);
    this.find('[data-best]').textContent = `${this.best}m`;
    this.find('[data-speed]').textContent = `${this.engine.pace.toFixed(1)}×`;
    this.find<HTMLElement>('[data-overlay]').hidden = state === 'running';
    const title = state === 'reward' ? 'COUPON' : state === 'shop' ? 'SHOP' : state === 'ready' ? 'Special delivery.' : state === 'paused' ? 'Taking a pit stop.' : 'End of the road.';
    const message = state === 'shop' ? (this.shopNote || `${this.engine.giftPoints} gift points to spend. Pick up what you need.`) : state === 'reward' ? 'Choose a boost to redeem. Your drive is paused.' : state === 'ready' ? 'Collect gift points. Earn coupons. Keep the delivery going.' : state === 'paused' ? 'Your route is waiting. Resume when you’re ready.' : `${Math.floor(this.engine.distance)} metres · ${this.engine.pointsEarned} gift points earned · ${this.engine.coupons} coupons redeemed`;
    this.find('[data-eyebrow]').textContent = state === 'reward' ? '★ GIFT&GO REWARD ★' : state === 'shop' ? 'GIFT&GO ROADSIDE STORE' : 'THE GIFT&GO ROAD TRIP';
    this.find<HTMLElement>('[data-rewards]').hidden = state !== 'reward' && state !== 'shop';
    this.find<HTMLElement>('[data-action="leave-shop"]').hidden = state !== 'shop';
    this.renderOffer();
    this.renderBoard();
    this.find('[data-overlay-title]').textContent = title;
    this.find('[data-overlay-message]').textContent = message;
    const start = this.find<HTMLButtonElement>('[data-action="start"]');
    start.textContent = state === 'paused' ? 'Resume drive' : state === 'crashed' ? 'Drive again' : 'Start driving';
    start.disabled = !this.ready;
    start.hidden = state === 'reward' || state === 'shop';
    const pause = this.find<HTMLButtonElement>('[data-action="pause"]');
    pause.disabled = state === 'ready' || state === 'crashed' || state === 'reward' || state === 'shop';
    pause.textContent = state === 'paused' ? 'Resume' : 'Pause';
    this.find<HTMLButtonElement>('[data-action="left"]').disabled = state !== 'running';
    this.find<HTMLButtonElement>('[data-action="right"]').disabled = state !== 'running';
    const perks = [];
    if (this.engine.shields) perks.push(`Shield ×${this.engine.shields}`);
    if (this.engine.magnetUntil > this.engine.elapsed) perks.push(`Magnet ${Math.ceil(this.engine.magnetUntil - this.engine.elapsed)}s`);
    if (this.engine.doubleUntil > this.engine.elapsed) perks.push(`2× points ${Math.ceil(this.engine.doubleUntil - this.engine.elapsed)}s`);
    if (this.engine.jackpotUntil > this.engine.elapsed) perks.push(`Jackpot 5× ${Math.ceil(this.engine.jackpotUntil - this.engine.elapsed)}s`);
    if (this.engine.ghostUntil > this.engine.elapsed) perks.push(`Ghost ${Math.ceil(this.engine.ghostUntil - this.engine.elapsed)}s`);
    const perkLine = this.find('[data-perks]');
    perkLine.textContent = perks.join(' · '); perkLine.hidden = !perks.length;
    if (this.toastLocked && this.engine.elapsed >= this.toastUntil) this.toastLocked = false;
    if (this.engine.giftPoints > this.lastGiftPoints && !this.toastLocked) {
      this.find('[data-toast]').textContent = `+${this.engine.giftPoints - this.lastGiftPoints} gift points`;
      this.toastUntil = this.engine.elapsed + 0.85;
    }
    this.lastGiftPoints = this.engine.giftPoints;
    this.find<HTMLElement>('[data-toast]').hidden = state !== 'running' || this.engine.elapsed >= this.toastUntil;
  }

  private async refreshBoard(): Promise<void> {
    try { this.boardRows = await fetchTopScores(5); } catch { this.boardRows = []; }
    if (!this.destroyed) this.renderBoard();
  }

  private renderBoard(): void {
    const state = this.engine.state;
    const showBoard = (state === 'ready' || state === 'crashed') && this.boardRows.length > 0;
    const board = this.find<HTMLElement>('[data-board]');
    board.hidden = !showBoard;
    const form = this.find<HTMLElement>('[data-submit]');
    form.hidden = !(state === 'crashed' && this.pendingResult);
    const note = this.find<HTMLElement>('[data-board-note]');
    note.textContent = this.boardNote; note.hidden = !this.boardNote || (state !== 'crashed' && state !== 'ready');
    const renderedKey = `${this.boardRows.map(row => row.id).join()}|${this.highlightId}`;
    if (!showBoard || board.dataset['key'] === renderedKey) return;
    board.dataset['key'] = renderedKey;
    const list = this.find('[data-board-list]');
    list.replaceChildren();
    const doc = this.root.ownerDocument;
    this.boardRows.forEach((row, index) => {
      const item = doc.createElement('li');
      if (row.id === this.highlightId) item.className = 'dash-board-you';
      for (const [className, text] of [['dash-board-rank', String(index + 1)], ['dash-board-name', row.nickname], ['dash-board-distance', `${row.distance}m`]]) {
        const cell = doc.createElement('span'); cell.className = className; cell.textContent = text; item.appendChild(cell);
      }
      list.appendChild(item);
    });
  }

  private async submitRun(): Promise<void> {
    const result = this.pendingResult;
    if (!result || this.submitting) return;
    const input = this.find<HTMLInputElement>('[data-nickname]');
    const nickname = cleanNickname(input.value);
    if (!nickname) { this.boardNote = 'Pick a family-friendly name, 2–16 characters.'; this.renderBoard(); input.focus(); return; }
    this.submitting = true;
    const button = this.find<HTMLButtonElement>('[data-submit-button]');
    button.disabled = true; this.boardNote = 'Submitting…'; this.renderBoard();
    try {
      this.highlightId = await submitScore(nickname, result);
      try { this.win.localStorage.setItem(this.nicknameKey, nickname); } catch {}
      this.pendingResult = null;
      const [rows, rank] = await Promise.all([fetchTopScores(5), fetchRank(result.distance).catch(() => 0)]);
      this.boardRows = rows;
      this.boardNote = rank ? `You placed #${rank} with ${result.distance}m!` : 'Score submitted!';
      this.find('[data-live-status]').textContent = this.boardNote;
      this.find<HTMLButtonElement>('[data-action="start"]').focus({ preventScroll: true });
    } catch (error) {
      this.boardNote = error instanceof Error && error.message.includes('(400)') ? 'That name was rejected. Try a different one.' : 'Couldn’t reach the leaderboard. Try again.';
    } finally {
      this.submitting = false; button.disabled = false;
      if (!this.destroyed) this.renderBoard();
    }
  }

  private renderOffer(): void {
    const state = this.engine.state;
    const key = state === 'reward' ? `reward:${this.engine.offer.join()}` : state === 'shop' ? 'shop' : '';
    const container = this.find('[data-rewards]');
    if (key !== this.offerKey) {
      this.offerKey = key;
      container.replaceChildren();
      const doc = this.root.ownerDocument;
      const entries = state === 'reward' ? this.engine.offer.map(reward => ({ reward, cost: 0 })) : state === 'shop' ? SHOP_ITEMS : [];
      for (const { reward, cost } of entries) {
        const definition = REWARD_CATALOG[reward];
        const button = doc.createElement('button');
        button.type = 'button'; button.dataset['reward'] = reward;
        button.style.setProperty('--accent', definition.accent);
        const label = cost ? definition.label.replace(/^Redeem/, 'Buy') : definition.label;
        const price = cost ? `<em class="dash-reward-cost">${cost} pts</em>` : '';
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${definition.icon}</svg><span class="dash-reward-text"><strong>${label}</strong><span>${definition.description}</span></span>${price}`;
        container.appendChild(button);
      }
    }
    if (state === 'shop') {
      for (const button of container.querySelectorAll<HTMLButtonElement>('[data-reward]')) {
        button.disabled = !this.engine.canAfford(button.dataset['reward'] as GiftReward);
      }
    }
  }

  private project(lateral: number, z: number): { x: number; y: number; scale: number } {
    // Widen the view gradually as pace grows, keeping approaching hazards readable.
    const view = Math.sqrt(this.engine.pace);
    const projectedZ = 20 + (z - 20) / view;
    const scale = 120 / (Math.max(-80, projectedZ) + 120);
    return { x: this.roadCentre(scale) + lateral * scale, y: 40 + 190 * scale, scale };
  }

  private roadCentre(depth: number): number {
    const time = this.engine.elapsed;
    const bend = 36 * Math.sin(time / 11) * (0.8 + 0.2 * Math.sin(time / 37));
    // Anchor the camera at the truck's contact depth. Curvature increases into
    // the distance; every lane, obstacle and roadside object uses this centre.
    return 120 + bend * (Math.pow(1 - depth, 2) - Math.pow(1 - 6 / 7, 2));
  }

  private bridgeRange(): { near: number; far: number } {
    const cycle = Math.floor((this.engine.elapsed + 8) / 80) * 80;
    const distanceAt = (time: number) => 86 * time + 1.2 * time * time;
    return { near: distanceAt(cycle + 24) - this.engine.distance,
      far: distanceAt(cycle + 36) - this.engine.distance };
  }

  private bridgeRails(near: number, far: number): void {
    if (far < -20) return;
    const view = Math.sqrt(this.engine.pace);
    const start = Math.max(-15, near), end = Math.min(far, 1600 * view);
    if (start >= end) return;
    // Draw distant segments first, including the raised handrail and its posts.
    const step = 66;
    const firstPost = Math.floor((this.engine.distance + end) / step) * step - this.engine.distance;
    for (let z = firstPost; z > start; z -= step) {
      const closeZ = Math.max(start, z - step);
      for (const side of [-1, 1]) {
        const a = this.project(side * 137, z), b = this.project(side * 137, closeZ);
        this.polygon('#77858A', [[a.x - a.scale, a.y], [a.x + a.scale, a.y], [b.x + b.scale, b.y], [b.x - b.scale, b.y]]);
        this.polygon('#CAD1C9', [[a.x - a.scale, a.y - 12 * a.scale], [a.x + a.scale, a.y - 10 * a.scale], [b.x + b.scale, b.y - 10 * b.scale], [b.x - b.scale, b.y - 12 * b.scale]]);
        this.rect('#AFBCB9', b.x - b.scale, b.y - 11 * b.scale, 2 * b.scale, 12 * b.scale);
        this.rect('#E5E7D8', b.x - b.scale, b.y - 12 * b.scale, 2 * b.scale, 2 * b.scale);
      }
    }
    for (const z of [near, far]) for (const side of [-1, 1]) {
      const p = this.project(side * 139, z);
      if (z < -20 || p.y < 45 || p.y > 235) continue;
      this.rect('#8A9690', p.x - 4 * p.scale, p.y - 16 * p.scale, 8 * p.scale, 19 * p.scale);
      this.rect('#D7D8C6', p.x - 5 * p.scale, p.y - 17 * p.scale, 10 * p.scale, 3 * p.scale);
    }
  }

  private rect(color: string, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  private polygon(color: string, points: number[][]): void {
    const c = this.ctx;
    c.fillStyle = color; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
    c.closePath(); c.fill();
  }

  private draw(): void {
    if (this.destroyed || !this.hasWidth) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
    this.rect('#F4F6FB', 0, 0, 240, 230);
    const travel = this.engine.distance + this.idleTime;
    const bridge = this.bridgeRange();
    const onBridge = (z: number) => z >= bridge.near && z <= bridge.far;
    const skyTime = this.engine.elapsed + this.idleTime / 18;
    for (const [i, startX, y] of [[0, 13, 11], [1, 142, 4], [2, 231, 22]]) {
      const cloud = this.scenery['cloud' + i];
      if (!cloud) continue;
      const x = (startX - skyTime * 0.65 + 600) % 300 - 30;
      c.drawImage(cloud, Math.round(x), y);
    }
    const hills = this.scenery['hills'];
    if (hills) {
      c.globalAlpha = 0.65;
      c.drawImage(hills, -28, 25, 320, 40);
      c.globalAlpha = 1;
      c.drawImage(hills, -79, 36, 320, 35);
    }
    // The original loader's detailed foliage forms a distant woodland layer.
    const trees = this.scenery['trees'];
    if (trees) {
      c.globalAlpha = 0.45;
      for (let x = -30; x < 260; x += 100) c.drawImage(trees, x, 43, 100, 22);
      c.globalAlpha = 1;
    }
    const grass = ['#A4B397', '#96AA84', '#899F73', '#7C9465', '#70875C'];
    for (let y = 62; y < 230; y++) this.rect(grass[Math.min(4, Math.floor((y - 62) / 34))], 0, y, 240, 1);
    const riverTop = Math.max(44, this.project(0, bridge.far).y);
    const riverBottom = Math.min(230, this.project(0, bridge.near).y);
    if (bridge.far > 0 && riverBottom > riverTop) {
      const water = ['#A6C3C3', '#8CAFB9', '#709FAB', '#608C9B', '#537D90'];
      for (let y = Math.ceil(riverTop); y < riverBottom; y++) {
        this.rect(water[Math.min(4, Math.floor((y - 44) / 38))], 0, y, 240, 1);
      }
      if (riverBottom < 228) this.rect('#C7C6A3', 0, riverBottom, 240, 2);
      for (let i = 0; i < 34; i++) {
        const y = 48 + (i * 41) % 180;
        if (y <= riverTop || y >= riverBottom) continue;
        const x = ((i * 73 + skyTime * 3) % 260) - 10;
        this.rect(i % 3 ? '#99BAC1' : '#BAD1CE', x, y, 5 + (y - 40) / 15, 1);
      }
    }
    // Patches and flowers sit on the same receding plane as the road.
    for (let i = 0; i < 100; i++) {
      const z = ((i * 37 - travel) % 1400 + 1400) % 1400;
      if (onBridge(z)) continue;
      const p = this.project((i % 2 ? -1 : 1) * (148 + (i * 29) % 380), z);
      this.rect(i % 3 ? '#819A69' : '#A0AF7B', p.x, p.y, (7 + i % 9) * p.scale, 2 * p.scale);
      if (i % 9 === 0) {
        this.rect('#C5CD91', p.x + 2 * p.scale, p.y - 3 * p.scale, p.scale, 4 * p.scale);
        this.rect(i % 18 ? '#F1E6B0' : '#DDAC58', p.x + p.scale, p.y - 4 * p.scale, 3 * p.scale, p.scale);
      }
    }
    const asphalt = ['#6B747B', '#646E77', '#5C6670', '#55606A', '#4E5963', '#48535F', '#424D59'];
    for (let y = 44; y < 230; y++) {
      const depth = (y - 40) / 190, half = 130 * depth;
      const centre = this.roadCentre(depth);
      const z = 20 + (120 / depth - 140) * Math.sqrt(this.engine.pace);
      if (onBridge(z)) this.rect('#929F9F', centre - half - 7 * depth, y, half * 2 + 14 * depth, 1);
      this.rect(asphalt[Math.min(6, Math.floor(depth * 7))], centre - half, y, half * 2, 1);
      this.rect('#D0D5C1', centre - 1 - half - 2 * depth, y, 2 * depth, 1);
      this.rect('#D0D5C1', centre + 1 + half, y, 2 * depth, 1);
    }
    const phase = travel % 70;
    for (let z = -phase; z < 1400 * Math.sqrt(this.engine.pace); z += 70) {
      if (z < 0) continue;
      for (const x of [-130 / 3, 130 / 3]) {
        const a = this.project(x - 0.9, z), b = this.project(x + 0.9, z);
        const d = this.project(x - 0.9, z + 25), e = this.project(x + 0.9, z + 25);
        this.polygon('#F6F2DF', [[a.x, a.y], [b.x, b.y], [e.x, e.y], [d.x, d.y]]);
      }
    }
    // Surface specks travel in world space with the lane markings.
    for (let z = 0; z < 800; z += 39) {
      const p = this.project(((z * 37) % 230) - 115, (z - travel % 800 + 800) % 800);
      this.rect('#75808A', p.x, p.y, 2 * p.scale, 1);
    }
    const decor: { z: number; side: number; index: number }[] = [];
    for (let i = 0; i < 16; i++) for (const side of [-1, 1]) decor.push({ z: ((i * 76 + (side > 0 ? 38 : 0) - travel) % 1216 + 1216) % 1216, side, index: i });
    decor.sort((a, b) => b.z - a.z).forEach(d => {
      if (onBridge(d.z)) return;
      const p = this.project(d.side * (174 + d.index % 4 * 20), d.z);
      if (d.index % 5 === 0) {
        this.rect('#596B52', p.x, p.y - 14 * p.scale, 2 * p.scale, 14 * p.scale);
        this.rect('#F4F0DD', p.x - 2 * p.scale, p.y - 16 * p.scale, 6 * p.scale, 7 * p.scale);
        this.rect('#ED8B00', p.x - p.scale, p.y - 15 * p.scale, 4 * p.scale, 2 * p.scale);
      } else this.tree(p.x, p.y, p.scale, d.index % 3);
      if (trees && !onBridge(d.z + 28)) {
        const bush = this.project(d.side * (146 + d.index % 3 * 7), d.z + 28);
        c.drawImage(trees, 77, 52, 42, 14, Math.round(bush.x - 18 * bush.scale), Math.round(bush.y - 10 * bush.scale), Math.max(1, Math.round(36 * bush.scale)), Math.max(1, Math.round(12 * bush.scale)));
      }
    });
    this.bridgeRails(bridge.near, bridge.far);
    const objects = this.engine.entities.filter(e => !e.handled || e.kind !== 'gift').sort((a, b) => b.z - a.z);
    objects.filter(e => e.z >= 20).forEach(e => this.entity(e));
    this.drawTruck();
    objects.filter(e => e.z < 20).forEach(e => this.entity(e));
    const sweepAge = this.engine.elapsed - this.engine.sweepAt;
    if (sweepAge >= 0 && sweepAge < 0.5 && !this.motion.matches) {
      c.globalAlpha = 0.35 * (1 - sweepAge / 0.5); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 240, 230);
      c.globalAlpha = 1; this.rect('#FFE08A', 0, 230 - sweepAge * 440, 240, 3);
    }
    if (this.engine.state === 'crashed') {
      c.fillStyle = 'rgba(237,139,0,0.13)'; c.fillRect(0, 0, 240, 230);
    }
  }

  private tree(x: number, y: number, scale: number, variant: number): void {
    const image = this.scenery['trees'];
    if (!image) return;
    // Atlas windows reuse the actual broadleaf, pine and spreading tree artwork.
    const [sx, sw, width, height] = [[24, 60, 90, 99], [126, 42, 67, 108], [222, 60, 94, 103]][variant];
    this.rect('#586F49', x - 20 * scale, y, 42 * scale, 3 * scale);
    this.ctx.drawImage(image, sx, 0, sw, 66, Math.round(x - width * scale / 2), Math.round(y - height * scale), Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  }

  private shopEntity(e: RoadEntity): void {
    const c = this.ctx, side = e.lane === 0 ? -1 : 1, laneX = (e.lane - 1) * (260 / 3);
    const pulse = this.motion.matches ? 0.8 : 0.7 + 0.2 * Math.sin(this.engine.elapsed * 6);
    // Pull-in bay painted on the road in the shop's lane.
    const corners = [[-37, 20], [37, 20], [37, -20], [-37, -20]].map(([dx, dz]) => this.project(laneX + dx, e.z + dz));
    c.globalAlpha = pulse; this.polygon('#ED8B00', corners.map(p => [p.x, p.y])); c.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const z0 = e.z + 14 - i * 9, p0 = this.project(laneX - 37, z0), p1 = this.project(laneX + 37, z0), p2 = this.project(laneX, z0 - 6);
      this.polygon('#FFF2D9', [[p0.x, p0.y], [p2.x, p2.y], [p1.x, p1.y], [p1.x, p1.y - 2 * p1.scale], [p2.x, p2.y - 3 * p2.scale], [p0.x, p0.y - 2 * p0.scale]]);
    }
    // The shop building stands on the verge beside the bay.
    const b = this.project(side * 215, e.z + 6), s = b.scale;
    const r = (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, b.x + dx * s, b.y + dy * s, w * s, h * s);
    r('#586F49', -44, -2, 88, 5);
    r('#8C93A0', -40, -50, 80, 50); r('#F4F0DD', -38, -50, 76, 46); r('#D9D3BB', -38, -8, 76, 5);
    this.polygon('#0A2A52', [[-46, -50], [46, -50], [38, -66], [-38, -66]].map(([dx, dy]) => [b.x + dx * s, b.y + dy * s]));
    for (let i = 0; i < 8; i++) r(i % 2 ? '#FFF2D9' : '#ED8B00', -38 + i * 9.5, -50, 9.5, 11);
    r('#0A2A52', -31, -36, 20, 19); r('#9FD0E6', -29, -34, 16, 15); r('#FFFFFF', -29, -34, 5, 15);
    r('#0A2A52', 11, -36, 20, 19); r('#9FD0E6', 13, -34, 16, 15); r('#FFFFFF', 13, -34, 5, 15);
    r('#0A2A52', -7, -29, 14, 29); r('#123C68', -5, -27, 10, 27); r('#FFC35B', 2, -14, 2, 2);
    r('#ED8B00', -34, -12, 9, 9); r('#FFE49A', -34, -12, 9, 2); r('#ED8B00', 26, -9, 8, 6);
    c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.max(4, Math.round(10 * s))}px system-ui, sans-serif`;
    c.fillText('GIFT&GO', Math.round(b.x), Math.round(b.y - 58 * s));
    // Overhead sign marks the lane to be in when passing.
    const p = this.project(laneX, e.z), t = p.scale, bob = this.motion.matches ? 0 : Math.sin(this.engine.elapsed * 6) * 2;
    this.rect('#2B3C4B', p.x - 31 * t, p.y - 78 * t, 3 * t, 78 * t); this.rect('#2B3C4B', p.x + 28 * t, p.y - 78 * t, 3 * t, 78 * t);
    this.rect('#ED8B00', p.x - 35 * t, p.y - 104 * t, 70 * t, 30 * t); this.rect('#0A2A52', p.x - 33 * t, p.y - 102 * t, 66 * t, 26 * t);
    c.fillStyle = '#FFFFFF'; c.font = `bold ${Math.max(4, Math.round(15 * t))}px system-ui, sans-serif`;
    c.fillText('SHOP', Math.round(p.x), Math.round(p.y - 89 * t));
    this.polygon('#FFC35B', [[p.x - 9 * t, p.y - 68 * t + bob], [p.x + 9 * t, p.y - 68 * t + bob], [p.x, p.y - 52 * t + bob]]);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }

  private entity(e: RoadEntity): void {
    if (e.kind === 'shop') { this.shopEntity(e); return; }
    const p = this.project((e.lane - 1) * (260 / 3), e.z);
    if (p.y > 265) return;
    const s = p.scale, x = p.x, y = p.y;
    const r = (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, x + dx * s, y + dy * s, w * s, h * s);
    const poly = (color: string, points: number[][]) => this.polygon(color, points.map(([dx, dy]) => [x + dx * s, y + dy * s]));
    r('#34424C', -22, -1, 44, 4);
    if (e.kind === 'barrier') {
      // A framed roadwork barricade with deep feet, inset stripes and lamps.
      r('#1C2C39', -21, -3, 15, 5); r('#1C2C39', 8, -3, 15, 5);
      r('#758795', -17, -26, 5, 27); r('#758795', 13, -26, 5, 27);
      r('#C5CFCC', -17, -26, 2, 24); r('#C5CFCC', 13, -26, 2, 24);
      r('#273642', -28, -34, 56, 23);
      r('#F3EFE0', -26, -32, 52, 18);
      // Clip stripes to the face so they cannot jut out of the obstacle.
      const c = this.ctx; c.save(); c.beginPath();
      c.rect(Math.round(x - 26 * s), Math.round(y - 32 * s), Math.round(52 * s), Math.round(18 * s)); c.clip();
      for (let i = -4; i < 5; i++) poly('#ED8B00', [[i * 15, -32], [i * 15 + 8, -32], [i * 15 - 4, -14], [i * 15 - 12, -14]]);
      c.restore();
      r('#B8C0B9', -26, -15, 52, 2); r('#FFECC2', -26, -32, 52, 1);
      r('#1C2C39', -22, -40, 8, 6); r('#1C2C39', 14, -40, 8, 6);
      r('#D47700', -21, -43, 6, 7); r('#D47700', 15, -43, 6, 7);
      const lit = !this.motion.matches && Math.floor(this.engine.elapsed * 2.5) % 2 === 0;
      r(lit ? '#FFDA68' : '#FFAD20', -20, -42, 4, 4);
      r(lit ? '#FFDA68' : '#FFAD20', 16, -42, 4, 4);
      r('#62717D', -25, -29, 2, 2); r('#62717D', 23, -29, 2, 2);
    } else if (e.kind === 'cone') {
      poly('#172936', [[-19, -6], [12, -6], [20, -1], [16, 3], [-20, 3], [-23, -1]]);
      r('#58636B', -17, -5, 32, 3);
      poly('#C16605', [[-3, -39], [3, -39], [14, -5], [8, -2], [-14, -5]]);
      poly('#F29A13', [[-3, -38], [0, -38], [5, -5], [-12, -5]]);
      poly('#FFF2D9', [[-6, -28], [6, -28], [8, -22], [-8, -22]]);
      poly('#FFF2D9', [[-10, -16], [10, -16], [12, -10], [-12, -10]]);
      r('#FFD177', -3, -37, 3, 7);
    } else if (e.kind === 'drum') {
      r('#1C2C39', -20, -4, 40, 7);
      poly('#A9550D', [[-16, -34], [14, -34], [18, -5], [12, -1], [-14, -1], [-18, -5]]);
      r('#EC8C1B', -14, -33, 27, 29); r('#FFB343', -12, -32, 5, 27);
      r('#F8F0D8', -15, -27, 30, 7); r('#F8F0D8', -16, -13, 32, 7);
      r('#D8C9AC', 9, -27, 6, 7); r('#D8C9AC', 9, -13, 7, 7);
      poly('#4B5050', [[-13, -38], [12, -38], [16, -34], [11, -31], [-12, -31], [-16, -34]]);
      r('#E6A052', -10, -36, 20, 3); r('#745030', -3, -37, 6, 2);
      r('#5C421F', -13, -3, 26, 2);
    } else if (e.kind === 'pothole') {
      poly('#889398', [[-27, -7], [-20, -15], [-8, -13], [0, -19], [10, -15], [23, -13], [28, -4], [17, 3], [5, 1], [-4, 6], [-19, 2]]);
      poly('#26323C', [[-24, -6], [-17, -11], [-7, -10], [1, -15], [12, -11], [21, -10], [24, -4], [13, 0], [2, -2], [-6, 2], [-18, -1]]);
      poly('#142332', [[-18, -5], [-9, -9], [3, -10], [16, -7], [18, -3], [4, -1], [-9, -1]]);
      r('#A4ACAA', -31, -4, 5, 3); r('#A4ACAA', 26, -12, 5, 3);
      r('#606F77', -16, 5, 4, 2); r('#98A4A7', 13, 5, 5, 2);
      // Orange markers distinguish the broken road from harmless asphalt texture.
      r('#ED8B00', -24, -16, 5, 3); r('#FFBB54', 20, -16, 5, 3);
    } else if (e.kind === 'coupon') {
      const time = this.engine.elapsed, calm = this.motion.matches;
      const bob = calm ? 0 : Math.sin(time * 5 + e.id) * 3, pulse = calm ? 0.3 : 0.28 + 0.12 * Math.sin(time * 6);
      const cy = -30 + bob;
      this.ctx.globalAlpha = pulse;
      poly('#FFD36B', [[-34, cy], [-24, cy - 22], [0, cy - 30], [24, cy - 22], [34, cy], [24, cy + 22], [0, cy + 30], [-24, cy + 22]]);
      this.ctx.globalAlpha = 1;
      r('#7A4A00', -25, cy - 14, 50, 30); r('#FFC13A', -24, cy - 15, 48, 28); r('#FFE49A', -24, cy - 15, 48, 4);
      r('#E08A00', -24, cy + 9, 48, 4);
      for (let i = 0; i < 5; i++) r('#B86A00', 7, cy - 14 + i * 6, 2, 3);
      r('#424D59', -26, cy - 4, 3, 6); r('#424D59', 23, cy - 4, 3, 6);
      const star: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 4 : 9;
        star.push([-9 + Math.cos(angle) * radius, cy - 1 + Math.sin(angle) * radius]);
      }
      poly('#0F3F73', star);
      r('#0F3F73', 13, cy - 9, 8, 3); r('#0F3F73', 13, cy - 3, 8, 3); r('#0F3F73', 13, cy + 3, 5, 3);
      if (!calm) for (let i = 0; i < 4; i++) {
        const angle = time * 2.4 + i * Math.PI / 2, radius = 30 + 4 * Math.sin(time * 5 + i);
        r(i % 2 ? '#FFFFFF' : '#FFE08A', Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.7, 3, 3);
      }
    } else {
      // Warm wrapping and a large orange bow make gifts distinct from roadworks.
      poly('#C69F65', [[-16, -25], [-11, -31], [18, -31], [18, -5], [13, 0], [-16, 0]]);
      r('#F8EBCB', -16, -25, 29, 25); r('#D9C397', 13, -25, 5, 25);
      r('#FDF5DE', -18, -28, 33, 6); r('#B77518', 15, -28, 5, 6);
      r('#ED8B00', -4, -29, 7, 29); r('#FFB843', -3, -29, 2, 29);
      poly('#E78C14', [[-2, -29], [-15, -34], [-13, -41], [-5, -39], [0, -31]]);
      poly('#FFB13A', [[1, -30], [6, -40], [14, -40], [16, -34], [4, -28]]);
      r('#FFE4A5', -11, -37, 4, 3); r('#FFE4A5', 8, -37, 4, 3);
      r('#D27400', -3, -32, 7, 5);
    }
  }

  private drawTruck(): void {
    if (!this.truck) return;
    const e = this.engine, p = this.project((e.lanePosition - 1) * (260 / 3), 20);
    const width = 48, height = 73;
    const moving = e.state === 'running' || (e.state === 'ready' && !this.motion.matches);
    const bounce = moving && !this.motion.matches ? Math.round(Math.sin((e.elapsed + this.idleTime / 18) * 13) * 0.6) : 0;
    const left = Math.round(p.x - width / 2), top = Math.round(p.y - height + bounce);
    this.rect('#334350', left - 2, p.y - 3, width + 4, 5);
    if (moving && !this.motion.matches) {
      const time = e.elapsed + this.idleTime / 18;
      for (let i = 0; i < 4; i++) {
        const age = (time * 1.7 + i * 0.24) % 1;
        this.ctx.globalAlpha = (1 - age) * 0.32;
        this.rect('#C8D0CC', left + 4 - age * 4, p.y + 1 + age * 17, 3 + age * 5, 2 + age * 4);
      }
      this.ctx.globalAlpha = 1;
    }
    const ghost = e.ghostUntil > e.elapsed;
    const flicker = ghost && !this.motion.matches ? 0.45 + 0.15 * Math.sin(e.elapsed * 30) : ghost ? 0.5 : 1;
    this.ctx.globalAlpha = flicker;
    this.ctx.drawImage(this.truck, left, top, width, height);
    this.ctx.globalAlpha = 1;
    this.logo.style.opacity = String(flicker);
    const calm = this.motion.matches, time = e.elapsed;
    if (e.shields > 0 || e.invulnerableUntil > e.elapsed) {
      this.ctx.globalAlpha = 0.14 + 0.04 * e.shields;
      this.ctx.fillStyle = '#8ED5DD'; this.ctx.beginPath();
      this.ctx.ellipse(p.x, top + 38, 32, 44, 0, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.globalAlpha = 1;
      for (let i = 0; i < 18; i++) {
        const angle = i * Math.PI * 2 / 18;
        this.rect(i % 3 ? '#8ED5DD' : '#D7F6EE', p.x + Math.cos(angle) * 29, top + 37 + Math.sin(angle) * 42, 2, 2);
      }
      for (let i = 0; i < e.shields; i++) this.rect('#D7F6EE', p.x - 8 + i * 8, top - 6, 5, 5);
    }
    if (e.magnetUntil > time && !calm) {
      for (let i = 0; i < 14; i++) {
        const angle = time * 3 + i * Math.PI * 2 / 14, reach = 58 + 4 * Math.sin(time * 4 + i);
        this.rect(i % 2 ? '#FF6A4D' : '#FFD1C8', p.x + Math.cos(angle) * reach, top + 60 + Math.sin(angle) * 16, 3, 3);
      }
    }
    if ((e.doubleUntil > time || e.jackpotUntil > time) && !calm) {
      const jackpot = e.jackpotUntil > time;
      for (let i = 0; i < (jackpot ? 10 : 5); i++) {
        const age = (time * (jackpot ? 1.8 : 1.1) + i * 0.37) % 1;
        this.rect(jackpot ? (i % 2 ? '#C58BFF' : '#FFE08A') : '#FFC35B', p.x - 24 + ((i * 17) % 48), top + 66 - age * 70, 3, 3);
      }
    }
    if (ghost && !calm) for (let i = 0; i < 6; i++) {
      const age = (time * 1.4 + i * 0.17) % 1;
      this.rect('#BFD0FF', p.x - 20 + ((i * 13) % 40), top + 70 + age * 20, 3, 4);
    }
    const pickupAge = e.elapsed - e.lastPickupAt;
    if (!this.motion.matches && pickupAge >= 0 && pickupAge < 0.4) {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, radius = 12 + pickupAge * 65;
        this.rect(i % 2 ? '#ED8B00' : '#FFE2A6', p.x + Math.cos(angle) * radius, top + 12 + Math.sin(angle) * radius * 0.5 - pickupAge * 25, 2, 2);
      }
    }
    if (moving) {
      const tread = Math.floor((e.distance + this.idleTime) * 0.7) % 3;
      this.rect('#596273', left + 4, top + height - 3 + tread, 4, 1);
      this.rect('#596273', left + width - 8, top + height - 3 + tread, 4, 1);
    }
    const s = this.displayScale;
    this.logo.style.left = `${(left + 7) * s}px`;
    this.logo.style.top = `${(top + 34) * s}px`;
    this.logo.style.width = `${34 * s}px`;
    this.logo.style.visibility = 'visible';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0; this.abort.abort();
    this.observer.disconnect(); this.intersection.disconnect();
  }
}
