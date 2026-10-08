import { DELIVERY_DASH_ASSETS } from './delivery-dash.assets';
import { BITE_REACH, DeliveryDashEngine, GameState, GUST_BUILD_SECONDS, isCouponReward, isShopItem, POWERPUP_BONUS, RoadEntity, RunResult, ShopItem, SHOP_ITEMS, SlotSymbol, nextBridge } from './delivery-dash.engine';
import { GIFT_VARIANT_PALETTES, GIFT_VARIANT_TOASTS, PLAIN_GIFT_PALETTE, REWARD_CATALOG, SLOT_RESULT_TOASTS } from './delivery-dash.rewards';
import { BOARD_PAGE_SIZE, cleanNickname, BoardVersion, distanceLabel, fetchRank, fetchScores, formatScore, MIN_SUBMIT_SCORE, ScoreRow, startRun, submitScore } from './delivery-dash.leaderboard';

type GameWindow = Window & typeof globalThis;

const SLOT_PANEL = { width: 46, height: 62, top: 66, edge: 3, reelWidth: 11, reelHeight: 26, reelPitch: 14 };
const SLOT_ENTER_SECONDS = 0.25;
const SLOT_RESULT_SECONDS = 1.1;
const SLOT_EXIT_SECONDS = 0.3;
const SLOT_REEL_CYCLE: readonly SlotSymbol[] = ['seven', 'gift', 'star', 'bell', 'coal'];
const TAP_MAX_DISTANCE = 24;
const SWIPE_MIN_DISTANCE = 56;
const CAMERA_PAN = 0.5;
const CAMERA_FOLLOW_SECONDS = 0.45;
const TRUCK_LEAN_MAX = 0.1;
const TRUCK_LEAN_PER_LANE_SPEED = 0.016;
const TRUCK_LEAN_SETTLE_SECONDS = 0.08;
const LANE_WIDTH = 260 / 3;
/** Where the lamps sit in the embedded sprites, as [x, y, width, height] in sprite pixels. */
const STALLED_CAR_LAMPS: readonly (readonly number[])[] = [[4, 22, 5, 5], [43, 22, 5, 5]];
/** The centres of the Ferrari's left and right headlights in sprite pixels, which its indicators flash over, and how fast they flash. */
const FERRARI_LAMPS: readonly (readonly number[])[] = [[9, 45], [51, 45]];
const FERRARI_SIGNAL_RATE = 9;
const MAINTENANCE_BEACON: readonly (readonly number[])[] = [[28, 1, 6, 6]];
const TUNNEL_HALF_WIDTH = 150;
const TUNNEL_HEIGHT = 112;
const TUNNEL_LAMP_SPACING = 150;
const TUNNEL_VOID = '#05080F';
/** In a tunnel, hazards fade out beyond this many seconds of travel; lit things (gifts, bays) and the gantry stay visible further. */
const HAZARD_SIGHT_SECONDS = 1.5;
const GLOW_SIGHT_SECONDS = 2.6;
const GANTRY_SIGHT_SECONDS = 3.8;
const GANTRY_HEIGHT = 92;
const WINDSOCK_SIGHT_SECONDS = 6;
const GUST_WARNING_SECONDS = 3;
interface SpriteBox { image: HTMLImageElement; x: number; y: number; w: number; h: number; scale: number; baseX: number; baseY: number; }
interface RoadObject { z: number; over: boolean; draw: () => void; hazard?: boolean; glowLateral?: number; sight?: number; emit?: () => void; }
/** Crane sprite pixels: the cable stub the chain hangs from, drawn CRANE_UNIT world units to a pixel so it sits over the middle of the road. The ball sprite has a chain link on top and its centre at CRANE_BALL_CENTRE. */
const CRANE_PIVOT = { x: 250, y: 35 };
const CRANE_UNIT = 1.1;
const CRANE_BALL_CENTRE = { x: 24.5, y: 33.5 };
const CRANE_BALL_UNIT = 1.15;
/** Chain length from the cable stub to the middle of the ball, in world units. */
const CRANE_CHAIN = 110;

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
  private cameraLane = 1;
  private tunnelView: { near: number; far: number } | null = null;
  private entityAlpha = 1;
  private truckHeading = 0;
  private swipeX: number | null = null;
  private swipeY = 0;
  private pointerId: number | null = null;
  private displayScale = 2;
  private hasWidth = true;
  private lastGainAt = -100;
  private lastDeliveryAt = -100;
  private lastPowerpupAt = -100;
  private lastBonusGiftAt = -100;
  private lastSlotAt = -100;
  private slotSpinKey = -1;
  private slotSide = 1;
  private lastChainBreakAt = -100;
  private lastMultiplier = 1;
  private streakFlashUntil = 0;
  private streakCallUntil = 0;
  private snappyUntil = 0;
  private deliveryKey = '';
  private toastUntil = 0;
  private toastLocked = false;
  private offerKey = '';
  private shopNote = '';
  private boardRows: ScoreRow[] = [];
  private boardNote = '';
  private rankNote = '';
  private boardOpen = false;
  private boardVersion: BoardVersion = 'v02';
  private boardLoading = false;
  private boardFailed = false;
  private boardQuery = '';
  private boardOffset = 0;
  private boardHasMore = false;
  private boardRequest = 0;
  private searchTimer = 0;
  private newBest = false;
  private highlightId = 0;
  private pendingResult: RunResult | null = null;
  private runId: Promise<string | null> = Promise.resolve(null);
  private submitting = false;
  private nicknameKey = 'giftgo-delivery-dash-name';
  private fullscreen = false;
  private nativeFullscreen = false;
  private historyEntry = false;
  private swipeHintUntil = 0;
  private touchInput = false;
  private swipesLearned = 0;
  private swipeKey = 'giftgo-delivery-dash-swipes-learned';
  private static readonly W = 240;
  private static readonly MIN_HEIGHT = 230;
  private static readonly MAX_HEIGHT = 560;
  private sceneHeight = DeliveryDashGame.MIN_HEIGHT;

  constructor(private readonly root: HTMLElement, private readonly win: GameWindow,
    private readonly onFinish: (result: RunResult) => void = () => {}) {
    this.canvas = this.find<HTMLCanvasElement>('[data-game-canvas]');
    this.logo = this.find<HTMLImageElement>('[data-truck-logo]');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    this.ctx = ctx;
    this.canvas.width = DeliveryDashGame.W; this.canvas.height = this.sceneHeight;
    this.abort = new win.AbortController();
    this.motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    // Touchscreen laptops report (pointer: coarse) even when driven by mouse, so the last real pointer decides.
    this.setTouchInput(!win.matchMedia('(any-pointer: fine)').matches);
    try {
      const stored = Number(win.localStorage.getItem('giftgo-delivery-dash-best-score'));
      if (Number.isFinite(stored)) this.best = Math.max(0, Math.floor(stored));
      this.swipesLearned = Number(win.localStorage.getItem(this.swipeKey)) || 0;
    } catch {}
    this.logo.src = DELIVERY_DASH_ASSETS.logo;
    this.find<HTMLImageElement>('[data-brand-logo]').src = DELIVERY_DASH_ASSETS.logo;
    const signal = this.abort.signal;
    const listen = (target: EventTarget, type: string, fn: EventListener) => target.addEventListener(type, fn, { signal });
    listen(this.find('[data-action="start"]'), 'click', () => this.startOrResume());
    listen(this.find('[data-action="pause"]'), 'click', () => this.togglePause());
    listen(this.find('[data-action="open-board"]'), 'click', () => {
      this.boardOpen = true; this.boardVersion = 'v02'; this.clearSearch(); this.syncUI(); void this.loadBoard(true);
      this.find<HTMLButtonElement>('[data-action="close-board"]').focus({ preventScroll: true });
    });
    listen(this.find('[data-action="close-board"]'), 'click', () => this.closeBoard());
    listen(this.find('[data-board-card]'), 'click', event => {
      const version = (event.target as Element).closest<HTMLElement>('[data-board-tab]')?.dataset['boardTab'];
      if ((version !== 'v02' && version !== 'v01') || version === this.boardVersion) return;
      this.boardVersion = version; void this.loadBoard(true);
    });
    const search = this.find<HTMLInputElement>('[data-board-search]');
    listen(search, 'input', () => {
      win.clearTimeout(this.searchTimer);
      this.searchTimer = win.setTimeout(() => {
        const query = search.value.trim();
        if (query !== this.boardQuery) { this.boardQuery = query; void this.loadBoard(true); }
      }, 250);
    });
    listen(this.find('[data-board-list]'), 'scroll', () => this.fillBoard(true));
    listen(this.find('[data-submit]'), 'submit', event => { event.preventDefault(); void this.submitRun(); });
    try { this.find<HTMLInputElement>('[data-nickname]').value = win.localStorage.getItem(this.nicknameKey) ?? ''; } catch {}
    listen(this.find('[data-action="fullscreen"]'), 'click', () => this.toggleFullscreen());
    listen(root.ownerDocument, 'fullscreenchange', () => this.fullscreenChanged());
    listen(win, 'popstate', () => {
      if (!this.historyEntry) return;
      this.historyEntry = false;
      if (this.fullscreen) this.exitFullscreen();
    });
    listen(this.find('[data-rewards]'), 'click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-reward]');
      const reward = button?.dataset['reward'] ?? '';
      if (button?.disabled) return;
      if (this.engine.state === 'shop' && isShopItem(reward)) { this.buy(reward); return; }
      if (!isCouponReward(reward)) return;
      this.engine.chooseGift(reward);
      this.afterRedeem();
      this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
    });
    listen(this.find('[data-action="leave-shop"]'), 'click', () => {
      this.engine.leaveShop(); this.shopNote = '';
      this.syncEventMarkers(); this.lastTime = 0;
      this.syncUI(); this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
      this.draw(); this.schedule();
    });
    listen(root, 'keydown', event => this.key(event as KeyboardEvent));
    listen(root, 'keyup', event => { if (['ArrowUp', 'w', 'W'].includes((event as KeyboardEvent).key)) this.engine.setBoost(false); });
    listen(win, 'blur', () => this.engine.setBoost(false));
    const boostButton = this.find<HTMLButtonElement>('[data-action="boost"]');
    listen(boostButton, 'pointerdown', event => {
      event.preventDefault();
      boostButton.setPointerCapture((event as PointerEvent).pointerId);
      this.engine.setBoost(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(boostButton, type, () => this.engine.setBoost(false));
    listen(boostButton, 'contextmenu', event => event.preventDefault());
    listen(root, 'pointerdown', event => { this.setTouchInput((event as PointerEvent).pointerType !== 'mouse'); this.pointerDown(event as PointerEvent); });
    listen(root, 'pointerup', event => this.pointerUp(event as PointerEvent));
    listen(root, 'pointercancel', () => { this.swipeX = this.pointerId = null; });
    listen(root.ownerDocument, 'visibilitychange', () => this.visibility());
    listen(this.motion, 'change', () => { this.lastTime = 0; this.draw(); this.schedule(); });
    this.observer = new win.ResizeObserver(() => this.resize());
    this.observer.observe(this.find('[data-scene]'));
    this.observer.observe(root);
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
      this.draw(); this.syncUI(); this.schedule();
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

  private closeBoard(): void {
    this.boardOpen = false; this.syncUI();
    this.find<HTMLButtonElement>('[data-action="start"]').focus({ preventScroll: true });
  }

  private startOrResume(): void {
    if (!this.ready || this.destroyed) return;
    this.boardOpen = false;
    // Touch input plays fullscreen; the click is the user gesture requestFullscreen needs.
    const touch = this.touchInput;
    if (!this.fullscreen && touch) this.enterFullscreen();
    if (this.engine.state === 'paused') this.engine.resume();
    else { this.engine.start(); this.swipeHintUntil = touch && this.swipesLearned !== 3 ? 6 : 0; this.runId = startRun().catch(() => null); this.idleTime = 0; this.cameraLane = 1; this.truckHeading = 0; this.snappyUntil = 0; this.pendingResult = null; this.boardNote = ''; this.highlightId = 0; }
    this.syncEventMarkers();
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

  /** Skip toasts for score and delivery events that happened before this point (new run, coupon, shop). */
  private syncEventMarkers(): void {
    this.lastGainAt = this.engine.lastGainAt;
    this.lastDeliveryAt = this.engine.lastDelivery?.at ?? -100;
    this.lastPowerpupAt = this.engine.lastPowerpupAt;
    this.lastBonusGiftAt = this.engine.lastBonusGift?.at ?? -100;
    this.lastSlotAt = this.engine.lastSlotResult?.at ?? -100;
    this.lastChainBreakAt = this.engine.lastChainBreak?.at ?? -100;
    this.lastMultiplier = this.engine.multiplier;
    this.deliveryKey = '';
  }

  private showToast(text: string): void {
    this.find('[data-toast]').textContent = text;
    this.toastUntil = this.engine.elapsed + 1.4;
    this.toastLocked = true;
  }

  private afterRedeem(): void {
    const applied = this.engine.lastRedeemed;
    this.syncEventMarkers();
    this.lastTime = 0;
    if (applied) this.showToast(REWARD_CATALOG[applied].toast);
    this.syncUI(); this.draw(); this.schedule();
  }

  private buy(item: ShopItem): void {
    const cashed = this.engine.freeplayValue;
    if (!this.engine.buy(item)) return;
    this.shopNote = item === 'freeplay' ? `+${cashed} score!` : REWARD_CATALOG[item].toast;
    this.afterRedeem();
    const focused = this.root.ownerDocument.activeElement;
    if (!(focused instanceof this.win.HTMLButtonElement) || focused.disabled) {
      (this.root.querySelector<HTMLButtonElement>('[data-reward]:not(:disabled)') ?? this.find<HTMLButtonElement>('[data-action="leave-shop"]')).focus({ preventScroll: true });
    }
  }

  private toggleFullscreen(): void {
    if (this.fullscreen) this.exitFullscreen();
    else this.enterFullscreen();
  }

  private enterFullscreen(): void {
    this.setFullscreen(true);
    // A history entry lets the browser/phone back button leave fullscreen instead of the page.
    try { this.win.history.pushState({ deliveryDashFullscreen: true }, ''); this.historyEntry = true; } catch {}
    // iOS Safari has no element fullscreen; the fixed full-viewport layout covers it.
    if (this.root.requestFullscreen) {
      this.root.requestFullscreen({ navigationUI: 'hide' }).then(() => { this.nativeFullscreen = true; }).catch(() => {});
    }
  }

  private exitFullscreen(): void {
    const doc = this.root.ownerDocument;
    this.setFullscreen(false);
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
  }

  private setFullscreen(on: boolean): void {
    this.fullscreen = on;
    if (!on) {
      this.nativeFullscreen = false;
      // Left some other way (button, Esc): drop the history entry so back isn't a dead press.
      if (this.historyEntry) { this.historyEntry = false; this.win.history.back(); }
    }
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
    if (e.key === 'Escape' && this.boardOpen) {
      e.preventDefault();
      if (this.find<HTMLInputElement>('[data-board-search]').value) { this.clearSearch(); void this.loadBoard(true); } else this.closeBoard();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    if (['ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); this.engine.setBoost(true); return; }
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) this.engine.steer(['ArrowLeft', 'a', 'A'].includes(e.key) ? -1 : 1);
    } else if (['p', 'P', 'Escape'].includes(e.key)) {
      e.preventDefault(); if (!e.repeat) this.togglePause();
    }
  }

  private setTouchInput(touch: boolean): void {
    this.touchInput = touch;
    this.root.classList.toggle('dash-touch', touch);
  }

  private pointerDown(e: PointerEvent): void {
    if (this.engine.state !== 'running' || (e.target as Element).closest('button, input')) return;
    this.swipeX = e.clientX; this.swipeY = e.clientY; this.pointerId = e.pointerId;
    this.root.setPointerCapture(e.pointerId);
    this.find<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
  }

  private pointerUp(e: PointerEvent): void {
    if (this.swipeX === null || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.swipeX, dy = e.clientY - this.swipeY;
    if (Math.abs(dx) > SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
      this.engine.steer(Math.sign(dx));
      this.learnSwipe(dx < 0 ? 1 : 2);
    } else if (Math.abs(dx) <= TAP_MAX_DISTANCE && Math.abs(dy) <= TAP_MAX_DISTANCE) {
      const bounds = this.canvas.getBoundingClientRect();
      this.engine.steer(e.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
    }
    this.swipeX = this.pointerId = null;
  }

  /** Hide the swipe hint for this run; stop showing it once the player has swiped both ways. */
  private learnSwipe(direction: number): void {
    this.swipeHintUntil = 0;
    this.find<HTMLElement>('[data-swipe-hint]').hidden = true;
    if ((this.swipesLearned & direction) !== 0) return;
    this.swipesLearned |= direction;
    try { this.win.localStorage.setItem(this.swipeKey, String(this.swipesLearned)); } catch {}
  }

  private visibility(): void {
    if (this.root.ownerDocument.hidden || !this.onscreen || !this.hasWidth) {
      this.engine.pause(); this.engine.setBoost(false); this.lastTime = 0;
      if (this.frame) this.win.cancelAnimationFrame(this.frame);
      this.frame = 0; this.syncUI();
    } else { this.lastTime = 0; this.schedule(); }
  }

  /** Fullscreen fills the phone: the canvas takes the screen's aspect ratio, letterboxed only when it would get too wide. */
  private fitScene(): void {
    const scene = this.find('[data-scene]');
    scene.style.flex = scene.style.width = scene.style.height = '';
    let height = DeliveryDashGame.MIN_HEIGHT;
    if (this.fullscreen) {
      const availableWidth = scene.clientWidth, availableHeight = scene.clientHeight;
      if (availableWidth > 0 && availableHeight > 0) {
        height = Math.min(DeliveryDashGame.MAX_HEIGHT, Math.max(DeliveryDashGame.MIN_HEIGHT, Math.round(DeliveryDashGame.W * availableHeight / availableWidth)));
        const width = Math.min(availableWidth, availableHeight * DeliveryDashGame.W / height);
        scene.style.flex = 'none'; scene.style.width = `${width}px`; scene.style.height = `${width * height / DeliveryDashGame.W}px`;
      }
    }
    if (height !== this.sceneHeight) { this.sceneHeight = height; this.canvas.height = height; }
  }

  private resize(): void {
    this.fitScene();
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
      const previousLane = this.engine.visualLane;
      this.engine.update(dt);
      const follow = this.motion.matches ? 1 : 1 - Math.exp(-dt / CAMERA_FOLLOW_SECONDS);
      this.cameraLane += (this.engine.visualLane - this.cameraLane) * follow;
      const laneSpeed = dt > 0 ? (this.engine.visualLane - previousLane) / dt : 0;
      const headingTarget = this.motion.matches ? 0 : Math.max(-TRUCK_LEAN_MAX, Math.min(TRUCK_LEAN_MAX, laneSpeed * TRUCK_LEAN_PER_LANE_SPEED));
      this.truckHeading += (headingTarget - this.truckHeading) * (1 - Math.exp(-dt / TRUCK_LEAN_SETTLE_SECONDS));
      if (this.engine.lastPowerpupAt > this.lastPowerpupAt) this.syncUI();
      if ((this.engine.state as GameState) === 'crashed') {
        const finalScore = this.engine.result.score;
        this.newBest = finalScore > this.best;
        this.best = Math.max(this.best, finalScore);
        try { this.win.localStorage.setItem('giftgo-delivery-dash-best-score', String(this.best)); } catch {}
        this.onFinish(this.engine.result);
        this.pendingResult = this.engine.result.score >= MIN_SUBMIT_SCORE ? this.engine.result : null;
        this.boardNote = this.pendingResult ? '' : `Score ${MIN_SUBMIT_SCORE}+ points to join the leaderboard.`;
        this.rankNote = ''; this.highlightId = 0; this.boardOpen = false;
        this.find('[data-live-status]').textContent = `Run finished. ${this.engine.result.score} points, ${distanceLabel(this.engine.distance)}, best multiplier ${this.engine.maxMultiplier}. Play again to restart.`;
        this.syncUI();
        if (!this.pendingResult) this.find<HTMLButtonElement>('[data-action="start"]').focus({ preventScroll: true });
      } else if ((this.engine.state as GameState) === 'shop') {
        this.shopNote = '';
        this.syncUI();
        this.find('[data-live-status]').textContent = 'Roadside shop. Spend gift points on upgrades for the rest of the run. The game is paused while you shop.';
        this.root.querySelector<HTMLButtonElement>('[data-reward]:not(:disabled)')?.focus({ preventScroll: true });
      } else if ((this.engine.state as GameState) === 'reward') {
        this.syncUI();
        this.find('[data-live-status]').textContent = 'Coupon collected. Choose a free power-up to redeem. The game is paused while you choose.';
        const first = this.root.querySelector<HTMLButtonElement>('[data-reward]');
        first?.focus({ preventScroll: true });
      }
    } else if (this.engine.state === 'ready' && !this.motion.matches) this.idleTime += dt * 18;
    this.uiTime += dt;
    if (this.uiTime >= 0.1) { this.uiTime = 0; this.syncUI(); }
    this.draw(); this.schedule();
  }

  private syncUI(): void {
    const engine = this.engine, state = engine.state;
    this.root.dataset['state'] = state;
    const boardVisible = this.boardOpen && (state === 'ready' || state === 'paused' || state === 'crashed');
    this.root.dataset['boardOpen'] = String(boardVisible);
    this.find('[data-score]').textContent = Math.floor(engine.score).toLocaleString('en-US');
    const multiplierLabel = this.find('[data-multiplier]');
    multiplierLabel.textContent = `×${engine.multiplier}`; multiplierLabel.dataset['tier'] = String(engine.multiplier);
    const chainBreak = engine.lastChainBreak;
    if (chainBreak && chainBreak.at > this.lastChainBreakAt) this.flashStreak('lost', chainBreak.lostMultiplier > 1 ? `×${chainBreak.lostMultiplier} LOST` : 'STREAK LOST');
    else if (engine.multiplier > this.lastMultiplier) this.flashStreak('up', `×${engine.multiplier} STREAK!`);
    this.lastChainBreakAt = chainBreak?.at ?? -100; this.lastMultiplier = engine.multiplier;
    const progress = engine.chainProgress;
    this.find<HTMLElement>('[data-chain-fill]').style.width = `${progress ? Math.round(progress.have / progress.need * 100) : 100}%`;
    this.find('[data-points]').textContent = String(engine.giftPoints);
    this.renderDelivery();
    this.find<HTMLElement>('[data-overlay]').hidden = state === 'running';
    this.find<HTMLElement>('[data-main-card]').hidden = boardVisible;
    this.find<HTMLElement>('[data-board-card]').hidden = !boardVisible;
    const special = state === 'reward' || state === 'shop';
    const eyebrow = this.find<HTMLElement>('[data-eyebrow]');
    eyebrow.hidden = !special;
    eyebrow.textContent = state === 'reward' ? '★ GIFT&GO REWARD ★' : 'GIFT&GO ROADSIDE STORE';
    const metres = distanceLabel(engine.distance);
    const title = state === 'reward' ? 'COUPON' : state === 'shop' ? 'SHOP' : state === 'ready' ? 'Delivery Dash' : state === 'paused' ? 'Paused' : 'End of the road';
    const message = state === 'shop' ? (this.shopNote || `${engine.giftPoints} gift points to spend`)
      : state === 'reward' ? 'Choose a free power-up'
      : state === 'ready' ? (this.best ? `Your best: ${this.best.toLocaleString('en-US')} pts` : 'Dodge the roadworks. Chain gifts for a bigger multiplier.')
      : state === 'paused' ? ''
      : `${engine.result.score.toLocaleString('en-US')} pts · ${metres} · best ×${engine.maxMultiplier}${this.newBest ? ' · New best!' : ''}`;
    this.find('[data-overlay-title]').textContent = title;
    this.find('[data-overlay-message]').textContent = message;
    this.find<HTMLElement>('[data-rewards]').hidden = !special;
    this.find<HTMLElement>('[data-action="leave-shop"]').hidden = state !== 'shop';
    this.find<HTMLElement>('[data-action="open-board"]').hidden = special;
    this.renderOffer();
    this.renderBoard();
    const start = this.find<HTMLButtonElement>('[data-action="start"]');
    start.textContent = state === 'paused' ? 'Resume' : state === 'crashed' ? 'Drive again' : 'Start driving';
    start.disabled = !this.ready;
    start.hidden = special;
    const pause = this.find<HTMLButtonElement>('[data-action="pause"]');
    pause.disabled = state !== 'running' && state !== 'paused';
    pause.setAttribute('aria-label', state === 'paused' ? 'Resume' : 'Pause');
    this.find('[data-pause-icon]').setAttribute('d', state === 'paused' ? 'M4 2l10 6-10 6z' : 'M3.5 2h3v12h-3zM9.5 2h3v12h-3z');
    const boost = this.find<HTMLButtonElement>('[data-action="boost"]');
    boost.disabled = state !== 'running';
    boost.dataset['active'] = String(engine.boostLevel > 0.3);
    boost.dataset['locked'] = String(engine.boostLockedOut);
    boost.style.setProperty('--boost-fill', `${Math.round(engine.boostMeter * 100)}%`);
    this.find('[data-boost-label]').textContent = engine.boostLockedOut ? 'RECHARGING' : 'BOOST';
    const remaining = (until: number) => Math.ceil(until - engine.elapsed);
    const perks: string[] = [];
    if (engine.shields) perks.push(`Shield ×${engine.shields}`);
    if (engine.jackpotUntil > engine.elapsed) perks.push(`Jackpot ${remaining(engine.jackpotUntil)}s`);
    if (engine.ghostUntil > engine.elapsed) perks.push(`Ghost ${remaining(engine.ghostUntil)}s`);
    if (engine.magnet) perks.push(`Dustbuster ${remaining(engine.magnetUntil)}s`);
    const gustChip = this.gustState();
    if (gustChip) perks.push(`Crosswind ${gustChip.direction < 0 ? '←' : '→'}`);
    if (engine.ferrariAhead) perks.push('Oncoming!');
    const perkLine = this.find<HTMLElement>('[data-perks]');
    const perkKey = perks.join('|');
    if (perkLine.dataset['key'] !== perkKey) {
      perkLine.dataset['key'] = perkKey;
      perkLine.replaceChildren(...perks.map(text => { const chip = this.root.ownerDocument.createElement('span'); chip.textContent = text; return chip; }));
    }
    perkLine.hidden = !perks.length || state === 'ready';
    if (this.toastLocked && engine.elapsed >= this.toastUntil) this.toastLocked = false;
    const outcome = engine.lastDelivery;
    if (outcome && outcome.at > this.lastDeliveryAt) {
      const text = outcome.success ? `Delivered! +${outcome.amount}` : `Missed delivery −${outcome.amount}`;
      this.showToast(text);
      this.find('[data-live-status]').textContent = text;
    }
    this.lastDeliveryAt = outcome?.at ?? -100;
    const bonusGift = engine.lastBonusGift;
    if (bonusGift && bonusGift.at > this.lastBonusGiftAt) {
      const text = `${GIFT_VARIANT_TOASTS[bonusGift.variant]} +${engine.lastGain}`;
      this.showToast(text);
      this.find('[data-live-status]').textContent = text;
    }
    this.lastBonusGiftAt = bonusGift?.at ?? -100;
    const slotResult = engine.lastSlotResult;
    if (slotResult && slotResult.at > this.lastSlotAt) {
      const text = slotResult.amount ? `${SLOT_RESULT_TOASTS[slotResult.outcome]} ${slotResult.amount > 0 ? '+' : '−'}${Math.abs(slotResult.amount)}` : SLOT_RESULT_TOASTS[slotResult.outcome];
      this.showToast(text);
      this.find('[data-live-status]').textContent = text;
    }
    this.lastSlotAt = slotResult?.at ?? -100;
    if (engine.lastGainAt > this.lastGainAt && !this.toastLocked) {
      this.find('[data-toast]').textContent = `+${engine.lastGain}`;
      this.toastUntil = engine.elapsed + 0.85;
    }
    this.lastGainAt = engine.lastGainAt;
    if (engine.lastPowerpupAt > this.lastPowerpupAt) {
      this.snappyUntil = engine.elapsed + 1.3;
      this.find('[data-snappy-points]').textContent = `+${engine.lastGain}`;
      this.find('[data-live-status]').textContent = `Snappy! +${engine.lastGain} points.`;
    }
    this.lastPowerpupAt = engine.lastPowerpupAt;
    this.find<HTMLElement>('[data-swipe-hint]').hidden = state !== 'running' || engine.elapsed >= this.swipeHintUntil;
    this.find<HTMLElement>('[data-snappy]').hidden = state !== 'running' || engine.elapsed >= this.snappyUntil;
    this.find<HTMLElement>('[data-toast]').hidden = state !== 'running' || engine.elapsed >= this.toastUntil;
    this.find<HTMLElement>('[data-streak-call]').hidden = state !== 'running' || engine.elapsed >= this.streakCallUntil;
    if (engine.elapsed >= this.streakFlashUntil) this.find<HTMLElement>('[data-score-box]').dataset['flash'] = '';
  }

  /** Celebrate a multiplier step or flag a broken streak in red, restarting the animation even if one is still playing. */
  private flashStreak(kind: 'up' | 'lost', text: string): void {
    const box = this.find<HTMLElement>('[data-score-box]'), call = this.find<HTMLElement>('[data-streak-call]');
    box.dataset['flash'] = ''; void box.offsetWidth; box.dataset['flash'] = kind;
    call.textContent = text; call.dataset['kind'] = kind;
    call.hidden = true; void call.offsetWidth; call.hidden = false;
    this.streakFlashUntil = this.engine.elapsed + 0.9;
    this.streakCallUntil = this.engine.elapsed + 1.3;
    this.find('[data-live-status]').textContent = kind === 'up' ? text : 'Streak lost.';
  }

  private renderDelivery(): void {
    const engine = this.engine, request = engine.delivery;
    const banner = this.find<HTMLElement>('[data-delivery]');
    const visible = !!request && (request.phase === 'incoming' || request.phase === 'active') &&(engine.state === 'running' || engine.state === 'paused');
    banner.hidden = !visible;
    if (!request || !visible) { this.deliveryKey = ''; return; }
    const arrow = request.lane === 0 ? '←' : '→';
    const remaining = Math.max(0, request.deadline - engine.elapsed);
    banner.dataset['phase'] = request.phase;
    banner.dataset['urgent'] = String(request.phase === 'active' && remaining < 1.2);
    this.find('[data-delivery-text]').textContent = request.phase === 'incoming' ? `DELIVERY ${arrow} get ready` : `DROP-OFF ${arrow} ${remaining.toFixed(1)}s`;
    this.find<HTMLElement>('[data-delivery-fill]').style.width = request.phase === 'incoming' ? '100%' : `${Math.round(remaining / request.window * 100)}%`;
    const key = `${request.phase}${request.lane}`;
    if (key !== this.deliveryKey) {
      this.deliveryKey = key;
      this.find('[data-live-status]').textContent = request.phase === 'incoming'
        ? `Delivery incoming on the ${request.lane === 0 ? 'left' : 'right'}. Get in that lane and boost to beat the clock.`
        : `Drop-off ahead on the ${request.lane === 0 ? 'left' : 'right'}. Reach it before the timer runs out.`;
    }
  }

  private clearSearch(): void {
    this.win.clearTimeout(this.searchTimer);
    this.boardQuery = ''; this.find<HTMLInputElement>('[data-board-search]').value = '';
  }

  /** Loads the next page of the open board, or its first page when reset. */
  private async loadBoard(reset = false): Promise<void> {
    if (!reset && (this.boardLoading || !this.boardHasMore)) return;
    const request = ++this.boardRequest;
    if (reset) { this.boardRows = []; this.boardOffset = 0; }
    this.boardLoading = true; this.boardFailed = false; this.renderBoard();
    let rows: ScoreRow[] = [], failed = false;
    try { rows = await fetchScores(this.boardVersion, this.boardQuery, this.boardOffset); } catch { failed = true; }
    if (this.destroyed || request !== this.boardRequest) return;
    // A run submitted between pages shifts rows down, so the next page can repeat one.
    const seen = new Set(this.boardRows.map(row => row.id));
    this.boardRows = [...this.boardRows, ...rows.filter(row => !seen.has(row.id))];
    this.boardOffset += rows.length;
    this.boardHasMore = failed || rows.length === BOARD_PAGE_SIZE;
    this.boardFailed = failed; this.boardLoading = false;
    this.renderBoard();
    this.fillBoard(false);
  }

  /** Loads more rows when the list is scrolled near its end, or is too short to scroll. A failed page retries only on scroll. */
  private fillBoard(scrolled: boolean): void {
    const list = this.find('[data-board-list]');
    const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (this.root.dataset['boardOpen'] === 'true' && nearEnd && (scrolled || !this.boardFailed)) void this.loadBoard();
  }

  /** Pages through the v0.2 board until the submitted run is loaded, so it can be highlighted. */
  private async revealHighlight(): Promise<void> {
    while (!this.destroyed && this.boardVersion === 'v02' && !this.boardQuery && this.boardHasMore && !this.boardFailed
      && this.boardRows.length < 500 && !this.boardRows.some(row => row.id === this.highlightId)) {
      const loaded = this.boardRows.length;
      await this.loadBoard();
      if (this.boardRows.length === loaded) return;
    }
  }

  private renderBoard(): void {
    const state = this.engine.state;
    this.find<HTMLElement>('[data-submit]').hidden = !(state === 'crashed' && this.pendingResult);
    const note = this.find<HTMLElement>('[data-board-note]');
    note.textContent = this.boardNote; note.hidden = !this.boardNote || state !== 'crashed';
    const result = this.find<HTMLElement>('[data-board-result]');
    result.textContent = this.rankNote; result.hidden = !this.rankNote || this.boardVersion !== 'v02';
    const current = this.boardVersion === 'v02';
    this.root.querySelectorAll<HTMLElement>('[data-board-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset['boardTab'] === this.boardVersion)));
    this.find('[data-board-empty]').textContent = this.boardLoading ? 'Loading…' : this.boardFailed ? 'Couldn’t load the leaderboard.' : this.boardRows.length ? ''
      : this.boardQuery ? `No names match “${this.boardQuery}”.` : current ? 'No scores yet. Be the first!' : 'No archived scores.';
    const list = this.find('[data-board-list]');
    // Later pages are appended so the reader keeps their scroll position.
    const key = `${this.boardVersion}|${this.boardQuery}|${this.highlightId}`;
    const start = list.dataset['key'] === key && this.boardRows.length >= list.children.length ? list.children.length : 0;
    if (!start) { list.dataset['key'] = key; list.replaceChildren(); list.scrollTop = 0; }
    const doc = this.root.ownerDocument;
    for (const row of this.boardRows.slice(start)) {
      const item = doc.createElement('li');
      const highlighted = current && row.id === this.highlightId;
      if (highlighted) item.className = 'dash-board-you';
      for (const [className, text] of [['dash-board-rank', String(row.rank)], ['dash-board-name', row.nickname], ['dash-board-value', current ? `${formatScore(row.score ?? 0)} pts` : distanceLabel(row.distance)]]) {
        const cell = doc.createElement('span'); cell.className = className; cell.textContent = text; item.appendChild(cell);
      }
      list.appendChild(item);
      if (highlighted) item.scrollIntoView({ block: 'nearest' });
    }
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
      const runId = await this.runId;
      if (!runId) throw new Error('No run id');
      this.highlightId = await submitScore(runId, nickname, result);
      try { this.win.localStorage.setItem(this.nicknameKey, nickname); } catch {}
      this.pendingResult = null; this.boardNote = ''; this.boardOpen = true; this.boardVersion = 'v02'; this.clearSearch();
      this.rankNote = 'Score submitted!';
      this.syncUI();
      this.find<HTMLButtonElement>('[data-action="close-board"]').focus({ preventScroll: true });
      const [, rank] = await Promise.all([this.loadBoard(true).then(() => this.revealHighlight()), fetchRank(result.score).catch(() => 0)]);
      if (rank) this.rankNote = `You placed #${rank} with ${formatScore(result.score)} pts!`;
      this.find('[data-live-status]').textContent = this.rankNote;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.boardNote = message === 'No run id' ? 'Couldn’t reach the leaderboard when this run started, so it can’t be submitted.'
        : message.includes('name') ? 'That name was rejected. Try a different one.'
        : message.includes('(400)') ? 'The leaderboard didn’t accept this run.'
        : 'Couldn’t reach the leaderboard. Try again.';
    } finally {
      this.submitting = false; button.disabled = false;
      if (!this.destroyed) this.renderBoard();
    }
  }

  private renderOffer(): void {
    const state = this.engine.state;
    const engine = this.engine;
    const shopKey = `${SHOP_ITEMS.map(({ item }) => engine.owned(item)).join()}|${engine.freeplayValue}`;
    const key = state === 'reward' ? `reward:${engine.offer.join()}` : state === 'shop' ? `shop:${shopKey}` : '';
    const container = this.find('[data-rewards]');
    if (key !== this.offerKey) {
      this.offerKey = key;
      container.replaceChildren();
      const doc = this.root.ownerDocument;
      const entries = state === 'reward' ? engine.offer : state === 'shop' ? SHOP_ITEMS.map(({ item }) => item) : [];
      for (const reward of entries) {
        const definition = REWARD_CATALOG[reward];
        const button = doc.createElement('button');
        button.type = 'button'; button.dataset['reward'] = reward;
        button.style.setProperty('--accent', definition.accent);
        const shopItem = isShopItem(reward) ? SHOP_ITEMS.find(entry => entry.item === reward) : undefined;
        const cost = shopItem ? engine.shopCost(shopItem.item) : null;
        const levels = shopItem && shopItem.costs.length > 1 ? ` · Lv ${engine.owned(shopItem.item)}/${shopItem.costs.length}` : '';
        const freeplay = reward === 'freeplay';
        const label = shopItem ? `${cost === null || freeplay ? '' : 'Buy '}${definition.label}` : `Redeem ${definition.label}`;
        const priceText = !shopItem ? 'FREE' : cost === null ? 'MAX' : freeplay ? `+${engine.freeplayValue}` : `${cost} pts`;
        const price = `<em class="dash-reward-cost">${priceText}</em>`;
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${definition.icon}</svg><span class="dash-reward-text"><strong>${label}</strong><span>${definition.description}${levels}</span></span>${price}`;
        container.appendChild(button);
      }
    }
    if (state === 'shop') {
      for (const button of container.querySelectorAll<HTMLButtonElement>('[data-reward]')) {
        const item = button.dataset['reward'] ?? '';
        button.disabled = !isShopItem(item) || !engine.canAfford(item);
      }
    }
  }

  private project(lateral: number, z: number): { x: number; y: number; scale: number } {
    // Widen the view gradually as pace grows, keeping approaching hazards readable.
    const view = Math.sqrt(this.engine.pace);
    const projectedZ = 20 + (z - 20) / view;
    const scale = 120 / (Math.max(-80, projectedZ) + 120);
    return { x: this.roadCentre(scale) + lateral * scale, y: 40 + (this.sceneHeight - 40) * scale, scale };
  }

  /** Whether a ground point has driven past the bottom edge; the edge moves with the canvas height in fullscreen. */
  private pastBottom(y: number): boolean { return y > this.sceneHeight + 35; }

  private roadCentre(depth: number): number {
    const time = this.engine.elapsed;
    const bend = 36 * Math.sin(time / 11) * (0.8 + 0.2 * Math.sin(time / 37));
    // Anchor the camera at the truck's contact depth. Curvature increases into
    // the distance; every lane, obstacle and roadside object uses this centre.
    // The camera slides sideways after the truck rather than turning towards it, so the
    // vanishing point stays put and the truck keeps facing straight up the road.
    const pan = (this.cameraLane - 1) * (260 / 3) * CAMERA_PAN * depth;
    return 120 + bend * (Math.pow(1 - depth, 2) - Math.pow(1 - 6 / 7, 2)) - pan;
  }

  private bridgeRange(): { near: number; far: number } {
    const span = nextBridge(this.engine.distance, 60);
    return { near: span.start - this.engine.distance, far: span.end - this.engine.distance };
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
      if (z < -20 || p.y < 45 || p.y > this.sceneHeight + 5) continue;
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
    const c = this.ctx, height = this.sceneHeight, stretch = (height - 40) / 190;
    c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
    this.rect('#F4F6FB', 0, 0, 240, height);
    const travel = this.engine.distance + this.idleTime;
    const bridge = this.bridgeRange();
    this.tunnelView = this.computeTunnelView();
    const onBridge = (z: number) => (z >= bridge.near && z <= bridge.far) || this.inTunnel(z);
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
    for (let y = 62; y < height; y++) this.rect(grass[Math.min(4, Math.floor((y - 62) / (34 * stretch)))], 0, y, 240, 1);
    const riverTop = Math.max(44, this.project(0, bridge.far).y);
    const riverBottom = Math.min(height, this.project(0, bridge.near).y);
    if (bridge.far > 0 && riverBottom > riverTop) {
      const water = ['#A6C3C3', '#8CAFB9', '#709FAB', '#608C9B', '#537D90'];
      for (let y = Math.ceil(riverTop); y < riverBottom; y++) {
        this.rect(water[Math.min(4, Math.floor((y - 44) / (38 * stretch)))], 0, y, 240, 1);
      }
      if (riverBottom < height - 2) this.rect('#C7C6A3', 0, riverBottom, 240, 2);
      for (let i = 0; i < 34; i++) {
        const y = 48 + (i * 41) % Math.round(180 * stretch);
        if (y <= riverTop || y >= riverBottom) continue;
        const x = ((i * 73 + skyTime * 3) % 260) - 10;
        this.rect(i % 3 ? '#99BAC1' : '#BAD1CE', x, y, 5 + (y - 40) / (15 * stretch), 1);
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
    for (let y = 44; y < height; y++) {
      const depth = (y - 40) / (height - 40), half = 130 * depth;
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
    this.roadworksSurface(travel);
    const decor:{ z: number; side: number; index: number }[] = [];
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
    if (this.tunnelView) this.tunnelShell(this.tunnelView);
    // Roadworks become many props along their length, each sorted with the other objects.
    const objects: RoadObject[] = this.engine.entities.filter(e => (!e.handled || e.kind !== 'gift') && e.kind !== 'roadworks')
      .map(e => this.roadObject(e))
      .concat(this.roadworksProps(travel).map(prop => ({ ...prop, over: false })), this.windsockObjects()).sort((a, b) => b.z - a.z);
    // A Giftasaurus beside the truck leans over it, so its bite is drawn on top.
    const overTruck = (o: RoadObject) => o.z < 20 || o.over;
    objects.filter(o => !overTruck(o)).forEach(o => this.drawLit(o));
    this.gustStreaks();
    this.gustBar();
    this.speedStreaks();
    this.drawTruck();
    objects.filter(overTruck).forEach(o => this.drawLit(o));
    const sweepAge = this.engine.elapsed - this.engine.sweepAt;
    if (sweepAge >= 0 && sweepAge < 0.5 && !this.motion.matches) {
      c.globalAlpha = 0.35 * (1 - sweepAge / 0.5); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 240, height);
      c.globalAlpha = 1; this.rect('#FFE08A', 0, height - sweepAge * height * 1.9, 240, 3);
    }
    this.slotPanel();
    if (this.engine.state === 'crashed') {
      c.fillStyle = 'rgba(237,139,0,0.13)'; c.fillRect(0, 0, 240, height);
    }
  }

  private slotEntity(e: RoadEntity): void {
    const p = this.project((e.lane - 1) * (260 / 3), e.z);
    if (this.pastBottom(p.y)) return;
    const c = this.ctx, s = p.scale, time = this.engine.elapsed, calm = this.motion.matches;
    const bob = calm ? 0 : Math.sin(time * 5 + e.id) * 2;
    const r = (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, p.x + dx * s, p.y + (dy + bob) * s, w * s, h * s);
    c.globalAlpha = (calm ? 0.3 : 0.24 + 0.1 * Math.sin(time * 6)) * this.entityAlpha;
    c.fillStyle = '#FFD36B'; c.beginPath();
    c.ellipse(Math.round(p.x), Math.round(p.y + (bob - 24) * s), 30 * s, 34 * s, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = this.entityAlpha;
    this.rect('#34424C', p.x - 22 * s, p.y - s, 44 * s, 4 * s);
    r('#002855', -17, -46, 34, 46); r('#C8102E', -15, -44, 30, 42); r('#FFC13A', -15, -44, 30, 7);
    for (let index = 0; index < 4; index++) r(!calm && Math.floor(time * 6) % 2 === index % 2 ? '#FFFFFF' : '#E08A00', -11 + index * 7, -42, 3, 3);
    r('#1B2A41', -13, -35, 26, 18);
    ['#C8102E', '#ED8B00', '#2F7DD6'].forEach((color, index) => {
      r('#FFF8E1', -12 + index * 8.5, -34, 7.5, 16);
      r(color, -10.5 + index * 8.5, calm ? -28 : -30 + 4 * Math.sin(time * 9 + index * 2), 4.5, 5);
    });
    r('#7A4A00', -10, -13, 20, 7); r('#FFD177', -8, -12, 16, 2);
    r('#9AA5B1', 17, -36, 3, 16); r('#E0307A', 16, -41, 5, 6);
  }

  /**
   * The slot machine's panel for the pickup that started a spin. It hops in from the screen edge on whichever
   * side has more verge, stays over the roadside, spins three reels while the truck keeps driving, then shows
   * the payout or penalty and leaves. All of it runs on engine time, so a pause freezes it.
   */
  private slotPanel(): void {
    const spin = this.engine.slotSpin, state = this.engine.state;
    if (!spin || state === 'ready' || state === 'crashed') return;
    const time = this.engine.elapsed, calm = this.motion.matches, c = this.ctx;
    const { width, height, top, edge, reelWidth, reelHeight, reelPitch } = SLOT_PANEL;
    const settledFor = spin.settledAt === null ? -1 : time - spin.settledAt;
    const leaving = settledFor < 0 ? 0 : Math.min(1, Math.max(0, (settledFor - SLOT_RESULT_SECONDS) / SLOT_EXIT_SECONDS));
    if (leaving >= 1 || (calm && leaving > 0)) return;
    if (this.slotSpinKey !== spin.startedAt) {
      this.slotSpinKey = spin.startedAt;
      this.slotSide = this.roadCentre(0.3) > 120 ? -1 : 1;
    }
    const enter = Math.min(1, (time - spin.startedAt) / SLOT_ENTER_SECONDS);
    const eased = calm ? 1 : 1 + 2.2 * Math.pow(enter - 1, 3) + 1.2 * Math.pow(enter - 1, 2);
    const slide = calm ? 0 : (1 - eased + leaving) * (width + edge + 6);
    const shake = !calm && (spin.outcome === 'loss' || spin.outcome === 'cursed') && settledFor >= 0 && settledFor < 0.4 ? Math.round(Math.sin(settledFor * 60) * 2) : 0;
    const left = Math.round((this.slotSide < 0 ? edge - slide : 240 - width - edge + slide) + shake);
    const winning = spin.amount > 0 && settledFor >= 0;
    this.rect('#002855', left, top, width, height);
    const cursed = spin.outcome === 'cursed' && settledFor >= 0;
    this.rect(winning ? '#E8A400' : cursed ? '#14080A' : '#C8102E', left + 2, top + 2, width - 4, height - 4);
    this.rect('#FFC13A', left + 2, top + 2, width - 4, 9);
    for (let index = 0; index < 5; index++) {
      const lit = winning ? Math.floor(time * 12) % 2 === index % 2 : !calm && Math.floor(time * 6) % 2 === index % 2;
      this.rect(lit ? '#FFFFFF' : '#E08A00', left + 5 + index * 8, top + 5, 3, 3);
    }
    const reelsLeft = left + Math.round((width - (reelWidth * 3 + 3)) / 2), reelsTop = top + 15;
    this.rect('#1B2A41', reelsLeft - 2, reelsTop - 2, reelWidth * 3 + 7, reelHeight + 4);
    spin.reels.forEach((symbol, index) => {
      const reelLeft = reelsLeft + index * (reelWidth + 1);
      this.rect('#FFF8E1', reelLeft, reelsTop, reelWidth, reelHeight);
      c.save(); c.beginPath(); c.rect(reelLeft, reelsTop, reelWidth, reelHeight); c.clip();
      const centre = reelLeft + reelWidth / 2, middle = reelsTop + reelHeight / 2;
      if (time >= spin.stopAt[index]) {
        const age = time - spin.stopAt[index];
        this.slotSymbol(symbol, centre, middle + (calm ? 0 : Math.round(Math.sin(Math.min(age / 0.15, 1) * Math.PI) * 3)));
      } else if (calm) this.rect('#C9BFA0', centre - 2, middle, 5, 2);
      else {
        const travelled = time * 70 + index * 23, base = Math.floor(travelled / reelPitch), fraction = travelled % reelPitch;
        for (let row = -1; row <= 1; row++) {
          const cycleIndex = ((row - base) % SLOT_REEL_CYCLE.length + SLOT_REEL_CYCLE.length) % SLOT_REEL_CYCLE.length;
          this.slotSymbol(SLOT_REEL_CYCLE[cycleIndex], centre, middle + row * reelPitch + fraction);
        }
      }
      this.rect('#0000002E', reelLeft, reelsTop, reelWidth, 4); this.rect('#0000002E', reelLeft, reelsTop + reelHeight - 4, reelWidth, 4);
      c.restore();
    });
    this.rect('#7A4A00', left + 10, top + height - 15, width - 20, 8); this.rect('#FFD177', left + 12, top + height - 14, width - 24, 2);
    this.rect('#FFC13A', left + 2, top + height - 5, width - 4, 3);
    const leverLeft = this.slotSide < 0 ? left + width : left - 4;
    const pull = Math.round(Math.sin(Math.min(1, (time - spin.startedAt) / 0.4) * Math.PI) * 10);
    this.rect('#9AA5B1', leverLeft + 1, top + 20, 2, 14); this.rect('#E0307A', leverLeft - 1, top + 13 + (calm ? 0 : pull), 6, 6);
    if (settledFor < 0 || settledFor > SLOT_RESULT_SECONDS + SLOT_EXIT_SECONDS) return;
    if (spin.outcome === 'cursed') { this.cursedBanner(spin.amount, settledFor, leaving, calm); return; }
    const label = spin.amount > 0 ? `+${spin.amount}` : spin.amount < 0 ? `−${-spin.amount}` : 'NO LUCK';
    const labelX = left + width / 2, labelY = top + height + 10;
    c.font = 'bold 14px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 4;
    c.strokeStyle = '#002855'; c.strokeText(label, labelX, labelY);
    c.fillStyle = spin.amount > 0 ? '#FFE08A' : spin.amount < 0 ? '#FF8A8A' : '#FFFFFF'; c.fillText(label, labelX, labelY);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    if (spin.outcome === 'jackpot' && !calm) for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4 + time * 2, radius = 30 + settledFor * 40;
      c.globalAlpha = Math.max(0, 1 - settledFor / 1.2);
      this.rect(index % 2 ? '#FFFFFF' : '#FFE08A', left + width / 2 + Math.cos(angle) * radius, top + height / 2 + Math.sin(angle) * radius, 3, 3);
      c.globalAlpha = 1;
    }
  }

  private cursedBanner(amount: number, settledFor: number, leaving: number, calm: boolean): void {
    const c = this.ctx, centreX = DeliveryDashGame.W / 2, centreY = Math.round(this.sceneHeight / 2) - 3;
    const pop = calm ? 1 : Math.min(1, settledFor / 0.2), scale = calm ? 1 : 1.5 - 0.5 * pop * pop * (3 - 2 * pop);
    const shake = !calm && settledFor < 0.6 ? Math.round(Math.sin(settledFor * 70) * 2) : 0;
    c.save();
    c.globalAlpha = Math.min(1, settledFor / 0.1) * (1 - leaving);
    c.fillStyle = '#000000CC'; c.fillRect(0, centreY - 34, DeliveryDashGame.W, 68);
    c.fillStyle = '#C8102E'; c.fillRect(0, centreY - 34, DeliveryDashGame.W, 2); c.fillRect(0, centreY + 32, DeliveryDashGame.W, 2);
    c.translate(centreX + shake, centreY); c.scale(scale, scale);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.font = 'bold 36px system-ui, sans-serif'; c.lineWidth = 7;
    c.strokeStyle = '#000000'; c.strokeText('CURSED', 0, -9); c.fillStyle = '#E3162F'; c.fillText('CURSED', 0, -9);
    c.font = 'bold 22px system-ui, sans-serif'; c.lineWidth = 5;
    c.strokeStyle = '#E3162F'; c.strokeText(`−${Math.abs(amount)}`, 0, 21); c.fillStyle = '#000000'; c.fillText(`−${Math.abs(amount)}`, 0, 21);
    c.restore();
  }

  private slotSymbol(symbol: SlotSymbol, centreX: number, centreY: number): void {
    const r = (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, centreX + dx, centreY + dy, w, h);
    if (symbol === 'seven') {
      r('#C8102E', -4, -5, 9, 2);
      this.polygon('#C8102E', [[centreX + 5, centreY - 3], [centreX + 2, centreY - 3], [centreX - 2, centreY + 5], [centreX + 1, centreY + 5]]);
    } else if (symbol === 'gift') {
      r('#ED8B00', -4, -2, 9, 7); r('#FFF2D9', -1, -2, 2, 7); r('#FFF2D9', -4, 1, 9, 1); r('#C25E00', -4, -5, 4, 3); r('#C25E00', 1, -5, 4, 3);
    } else if (symbol === 'star') {
      const points: number[][] = [];
      for (let index = 0; index < 10; index++) {
        const angle = -Math.PI / 2 + index * Math.PI / 5, radius = index % 2 ? 2.4 : 5.5;
        points.push([centreX + Math.cos(angle) * radius, centreY + Math.sin(angle) * radius]);
      }
      this.polygon('#FFB400', points);
    } else if (symbol === 'bell') {
      r('#E08A00', -1, -6, 3, 2);
      this.polygon('#FFC13A', [[centreX - 2, centreY - 4], [centreX + 2, centreY - 4], [centreX + 4, centreY + 2], [centreX + 5, centreY + 4], [centreX - 5, centreY + 4], [centreX - 4, centreY + 2]]);
      r('#7A4A00', -1, 5, 3, 2);
    } else {
      this.polygon('#2B2B33', [[centreX - 5, centreY + 3], [centreX - 4, centreY - 2], [centreX, centreY - 5], [centreX + 4, centreY - 3], [centreX + 5, centreY + 3], [centreX + 1, centreY + 5]]);
      r('#6B6B78', -2, -3, 2, 2);
    }
  }

  private speedStreaks(): void {
    const level = this.engine.boostLevel;
    if (level < 0.05 || this.motion.matches) return;
    const phase = this.engine.distance * 0.012;
    this.ctx.globalAlpha = 0.55 * level;
    for (let i = 0; i < 18; i++) {
      const progress = ((phase + i * 0.0617) % 1 + 1) % 1, side = i % 2 ? 1 : -1;
      const spread = 0.35 + (i * 0.37 % 1) * 0.9;
      const x = 120 + side * spread * progress * 160, y = 44 + progress * (this.sceneHeight - 30);
      this.rect('#FFFFFF', x, y, 1 + progress, 3 + progress * 16 * level);
    }
    this.ctx.globalAlpha = 1;
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
    c.globalAlpha = pulse * this.entityAlpha; this.polygon('#ED8B00', corners.map(p => [p.x, p.y])); c.globalAlpha = this.entityAlpha;
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

  private deliveryEntity(e: RoadEntity): void {
    const c = this.ctx, side = e.lane === 0 ? -1 : 1, laneX = (e.lane - 1) * (260 / 3);
    const late = this.engine.delivery?.phase === 'expired';
    const accent = late ? '#8A94A6' : '#2E9B5A';
    const pulse = this.motion.matches || late ? 0.7 : 0.7 + 0.2 * Math.sin(this.engine.elapsed * 8);
    const corners = [[-37, 20], [37, 20], [37, -20], [-37, -20]].map(([dx, dz]) => this.project(laneX + dx, e.z + dz));
    c.globalAlpha = pulse * this.entityAlpha; this.polygon(accent, corners.map(p => [p.x, p.y])); c.globalAlpha = this.entityAlpha;
    for (let i = 0; i < 4; i++) {
      const z0 = e.z + 14 - i * 9, p0 = this.project(laneX - 37, z0), p1 = this.project(laneX + 37, z0), p2 = this.project(laneX, z0 - 6);
      this.polygon('#E9F7EE', [[p0.x, p0.y], [p2.x, p2.y], [p1.x, p1.y], [p1.x, p1.y - 2 * p1.scale], [p2.x, p2.y - 3 * p2.scale], [p0.x, p0.y - 2 * p0.scale]]);
    }
    // A customer's house on the verge, with the parcel waiting on its porch.
    const b = this.project(side * 215, e.z + 6), s = b.scale;
    const r = (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, b.x + dx * s, b.y + dy * s, w * s, h * s);
    r('#586F49', -40, -2, 80, 5);
    r('#F4F0DD', -32, -38, 64, 38); r('#D9D3BB', -32, -6, 64, 5);
    this.polygon(late ? '#5B6678' : '#0A2A52', [[-40, -38], [40, -38], [0, -66]].map(([dx, dy]) => [b.x + dx * s, b.y + dy * s]));
    r('#0A2A52', -22, -30, 16, 14); r('#9FD0E6', -20, -28, 12, 10);
    r('#0A2A52', 8, -26, 14, 26); r('#123C68', 10, -24, 10, 24);
    r('#ED8B00', -6, -9, 12, 9); r('#FFE49A', -6, -9, 12, 2); r('#0A2A52', -1, -9, 2, 9);
    // Overhead sign marks the lane to be in when passing.
    const p = this.project(laneX, e.z), t = p.scale, bob = this.motion.matches ? 0 : Math.sin(this.engine.elapsed * 8) * 2;
    this.rect('#2B3C4B', p.x - 31 * t, p.y - 78 * t, 3 * t, 78 * t); this.rect('#2B3C4B', p.x + 28 * t, p.y - 78 * t, 3 * t, 78 * t);
    this.rect(accent, p.x - 35 * t, p.y - 104 * t, 70 * t, 30 * t); this.rect('#0A2A52', p.x - 33 * t, p.y - 102 * t, 66 * t, 26 * t);
    c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.max(4, Math.round(11 * t))}px system-ui, sans-serif`;
    c.fillText(late ? 'TOO LATE' : 'DROP-OFF', Math.round(p.x), Math.round(p.y - 89 * t));
    if (!late) this.polygon('#7BE0A6', [[p.x - 9 * t, p.y - 68 * t + bob], [p.x + 9 * t, p.y - 68 * t + bob], [p.x, p.y - 52 * t + bob]]);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }

  /** Dug-up surface across every closed lane, painted per scanline so it follows the bends. */
  private roadworksSurface(travel: number): void {
    if (!this.engine.entities.some(e => e.kind === 'roadworks')) return;
    const view = Math.sqrt(this.engine.pace);
    for (let y = 44; y < this.sceneHeight; y++) {
      const depth = (y - 40) / (this.sceneHeight - 40), z = 20 + (120 / depth - 140) * view;
      const closed = this.engine.closedLanesAt(z);
      if (!closed.length) continue;
      const centre = this.roadCentre(depth), width = 260 / 3 * depth;
      const color = Math.floor((z + travel) / 18) % 2 ? '#7E6B52' : '#73614A';
      for (const lane of closed) this.rect(color, centre + (lane - 1.5) * width, y, width, 1);
    }
  }

  /** Cones along each closed lane's open edge, an arrow board at its start and a warning sign on the verge. */
  private roadworksProps(travel: number): { z: number; draw: () => void; hazard?: boolean; emit?: () => void }[] {
    const props: { z: number; draw: () => void; hazard?: boolean; emit?: () => void }[] = [];
    const horizon = 1400 * Math.sqrt(this.engine.pace);
    for (const e of this.engine.entities) {
      if (e.kind !== 'roadworks') continue;
      const laneX = (e.lane - 1) * (260 / 3), end = Math.min(horizon, e.z + (e.length ?? 0));
      for (const side of [-1, 1]) {
        const neighbour = e.lane + side;
        if (neighbour < 0 || neighbour > 2) continue;
        // Cones are fixed in world space so they stream past rather than swim.
        for (let z = Math.ceil((Math.max(-40, e.z) + travel) / 40) * 40 - travel; z <= end; z += 40) {
          if (!this.engine.closedLanesAt(z).includes(neighbour)) props.push({ z, hazard: true, draw: () => this.worksCone(laneX + side * 36, z) });
        }
      }
      if (e.z > horizon || e.z < -40) continue;
      const open = [0, 1, 2].filter(lane => !this.engine.closedLanesAt(e.z + 1).includes(lane));
      const direction = Math.sign((open.reduce((sum, lane) => sum + lane, 0) / Math.max(1, open.length)) - e.lane);
      if (e.maintenance) props.push({ z: e.z, hazard: true, draw: () => this.maintenanceTruck(laneX, e.z), emit: () => this.flashLamps('maintenanceTruck', laneX, e.z, MAINTENANCE_BEACON, e.id * 0.5, 4.2) });
      else {
        props.push({ z: e.z, hazard: true, draw: () => this.arrowBoard(laneX, e.z, direction) });
        if (e.lane !== 1) props.push({ z: e.z + 4, hazard: true, draw: () => this.worksSign((e.lane - 1) * 150, e.z + 4) });
      }
    }
    return props;
  }

  private painter(lateral: number, z: number) {
    const p = this.project(lateral, z), s = p.scale;
    return {
      visible: !this.pastBottom(p.y),
      r: (color: string, dx: number, dy: number, w: number, h: number) => this.rect(color, p.x + dx * s, p.y + dy * s, w * s, h * s),
      poly: (color: string, points: number[][]) => this.polygon(color, points.map(([dx, dy]) => [p.x + dx * s, p.y + dy * s])),
    };
  }

  private worksCone(lateral: number, z: number): void {
    const { visible, r, poly } = this.painter(lateral, z);
    if (!visible) return;
    r('#172936', -11, -2, 22, 4);
    poly('#C16605', [[-2, -26], [2, -26], [9, -2], [-9, -2]]);
    poly('#F29A13', [[-2, -25], [0, -25], [3, -2], [-8, -2]]);
    poly('#FFF2D9', [[-4, -18], [4, -18], [6, -13], [-6, -13]]);
  }

  private arrowBoard(lateral: number, z: number, direction: number): void {
    const { visible, r, poly } = this.painter(lateral, z);
    if (!visible) return;
    const lit = this.motion.matches || Math.floor(this.engine.elapsed * 2.5) % 2 === 0;
    r('#34424C', -38, -1, 76, 4);
    // A striped barrier closes the whole lane under a flashing chevron board.
    r('#273642', -38, -22, 76, 14);
    for (let i = 0; i < 8; i++) r(i % 2 ? '#F3EFE0' : '#E0301E', -37 + i * 9.25, -21, 9.25, 12);
    r('#1C2C39', -34, -8, 6, 8); r('#1C2C39', 28, -8, 6, 8);
    r('#2B3C4B', -3, -46, 6, 24);
    r('#1C2C39', -28, -72, 56, 28);
    if (direction) for (let i = 0; i < 3; i++) {
      const x0 = (-14 + i * 10) * direction;
      poly(lit ? '#FFC94A' : '#8A5A0A', [[x0, -68], [x0 + 6 * direction, -68], [x0 + 13 * direction, -58], [x0 + 6 * direction, -48], [x0, -48], [x0 + 7 * direction, -58]]);
    }
    r(lit ? '#FFDA68' : '#C07A10', -26, -76, 5, 4); r(lit ? '#C07A10' : '#FFDA68', 21, -76, 5, 4);
  }

  private worksSign(lateral: number, z: number): void {
    const { visible, r, poly } = this.painter(lateral, z);
    if (!visible) return;
    r('#5E6B73', -1, -36, 3, 36);
    poly('#C8102E', [[0, -62], [15, -34], [-15, -34]]);
    poly('#FFFFFF', [[0, -56], [10, -38], [-10, -38]]);
    // Worker with a shovel, as on the UK roadworks sign.
    r('#111111', -2, -50, 3, 3); r('#111111', -3, -47, 4, 5); r('#111111', -4, -42, 2, 3); r('#111111', 0, -42, 2, 3);
    r('#111111', 1, -46, 5, 1); r('#111111', 4, -45, 1, 4); r('#111111', -7, -40, 5, 2);
  }

  private computeTunnelView(): { near: number; far: number } | null {
    const tunnel = this.engine.tunnel;
    if (!tunnel) return null;
    const near = tunnel.start - this.engine.distance, far = tunnel.end - this.engine.distance;
    return far < -60 || near > 1500 * Math.sqrt(this.engine.pace) ? null : { near, far };
  }

  private inTunnel(z: number): boolean { return this.tunnelView !== null && z >= this.tunnelView.near && z <= this.tunnelView.far; }

  /** How visible something `z` ahead is: full outside a tunnel, fading with the seconds it is from the truck inside one. */
  private sight(z: number, hazard: boolean, seconds = hazard ? HAZARD_SIGHT_SECONDS : GLOW_SIGHT_SECONDS): number {
    if (!this.inTunnel(z)) return 1;
    const ahead = (z - 20) / (this.engine.speed * seconds);
    return ahead <= 0.35 ? 1 : Math.max(hazard ? 0 : 0.18, 1 - (ahead - 0.35) / 0.65);
  }

  /** Hazards dim into the dark; lit things glow, and an emitter (hazard lamps, a beacon) shows through the dark. */
  private drawLit(object: RoadObject): void {
    const c = this.ctx, glow = this.sight(object.z, false, object.sight), seen = object.hazard ? this.sight(object.z, true) : glow;
    if (seen > 0.03) {
      if (!object.hazard && object.glowLateral !== undefined && this.inTunnel(object.z)) this.objectGlow(object.glowLateral, object.z, seen);
      this.entityAlpha = c.globalAlpha = seen;
      object.draw();
      this.entityAlpha = c.globalAlpha = 1;
    }
    if (object.emit && glow > 0.03) { c.globalAlpha = glow; object.emit(); c.globalAlpha = 1; }
  }

  private objectGlow(lateral: number, z: number, seen: number): void {
    const p = this.project(lateral, z), c = this.ctx;
    c.globalAlpha = 0.2 * seen; c.fillStyle = '#FFE9A8'; c.beginPath();
    c.ellipse(Math.round(p.x), Math.round(p.y - 14 * p.scale), 34 * p.scale, 30 * p.scale, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }

  private roadObject(e: RoadEntity): RoadObject {
    const lateral = (e.lane - 1) * LANE_WIDTH;
    const base = { z: e.z, over: (e.kind === 'giftasaurus' || e.kind === 'crane') && e.z < 90, draw: () => this.entity(e) };
    if (e.kind === 'stalledcar') return { ...base, hazard: true, emit: () => this.flashLamps('stalledCar', lateral, e.z, STALLED_CAR_LAMPS, e.id * 0.37) };
    if (e.kind === 'gantry') return { ...base, sight: GANTRY_SIGHT_SECONDS };
    const hazard = e.kind === 'cone' || e.kind === 'barrier' || e.kind === 'drum' || e.kind === 'pothole' || e.kind === 'giftasaurus' || e.kind === 'crane' || e.kind === 'ferrari' || e.kind === 'birds' || e.kind === 'puddle';
    return hazard ? { ...base, hazard } : { ...base, glowLateral: lateral };
  }

  private spriteBox(name: string, lateral: number, z: number, plane = false): SpriteBox | null {
    const image = this.scenery[name], p = this.project(lateral, z);
    if (!image || this.pastBottom(p.y)) return null;
    const w = Math.max(1, Math.round(image.width * p.scale)), h = Math.max(1, Math.round(image.height * p.scale));
    return { image, x: Math.round(p.x - w / 2), y: Math.round(plane ? p.y - h * 0.62 : p.y - h + 3 * p.scale), w, h, scale: p.scale, baseX: p.x, baseY: p.y };
  }

  private drawSprite(name: string, lateral: number, z: number, options: { shadow?: boolean; plane?: boolean; flip?: boolean; lift?: number } = {}): SpriteBox | null {
    const box = this.spriteBox(name, lateral, z, options.plane);
    if (!box) return null;
    const c = this.ctx, y = box.y - Math.round((options.lift ?? 0) * box.scale);
    if (options.shadow) this.rect('#34424C', box.baseX - box.w * 0.46, box.baseY - box.scale, box.w * 0.92, 4 * box.scale);
    if (options.flip) { c.save(); c.translate(box.x + box.w, y); c.scale(-1, 1); c.drawImage(box.image, 0, 0, box.w, box.h); c.restore(); }
    else c.drawImage(box.image, box.x, y, box.w, box.h);
    return box;
  }

  /** Flashing lamps over a sprite: bright amber with a halo while lit. */
  private flashLamps(name: string, lateral: number, z: number, lamps: readonly (readonly number[])[], phase: number, rate = 3.4): void {
    const box = this.spriteBox(name, lateral, z);
    if (!box) return;
    const c = this.ctx, lit = this.motion.matches || Math.floor(this.engine.elapsed * rate + phase) % 2 === 0, base = c.globalAlpha;
    if (!lit) return;
    for (const [lx, ly, lw, lh] of lamps) {
      const cx = box.x + (lx + lw / 2) * box.scale, cy = box.y + (ly + lh / 2) * box.scale;
      c.globalAlpha = base * 0.4; c.fillStyle = '#FFB000'; c.beginPath();
      c.ellipse(Math.round(cx), Math.round(cy), 7 * box.scale + 2, 5 * box.scale + 2, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = base;
      this.rect('#FFC21A', box.x + lx * box.scale, box.y + ly * box.scale, lw * box.scale, lh * box.scale);
      this.rect('#FFF3B0', box.x + (lx + 1) * box.scale, box.y + (ly + 1) * box.scale, Math.max(1, (lw - 2) * box.scale), Math.max(1, (lh - 2) * box.scale));
    }
    c.globalAlpha = base;
  }

  private stalledCar(e: RoadEntity): void { this.drawSprite('stalledCar', (e.lane - 1) * LANE_WIDTH, e.z, { shadow: true }); }

  /** The oncoming Ferrari, drawn where its weave has taken it, with the indicator on the side of the lane it is about to move into flashing. */
  private ferrari(e: RoadEntity): void {
    const lane = this.engine.ferrariLane(e), lateral = (lane - 1) * LANE_WIDTH, signal = this.engine.ferrariSignal(e);
    const box = this.drawSprite('ferrari', lateral, e.z, { shadow: true });
    if (!box) return;
    // The headlight glow and the indicator keep a minimum size, so the car and its lane change read from far down the road.
    const c = this.ctx, base = c.globalAlpha, blink = this.motion.matches || Math.floor(this.engine.elapsed * FERRARI_SIGNAL_RATE) % 2 === 0;
    FERRARI_LAMPS.forEach(([lx, ly], side) => {
      const signalling = signal !== null && side === (signal > lane ? 1 : 0);
      if (signalling && !blink) return;
      const cx = Math.round(box.x + lx * box.scale), cy = Math.round(box.y + ly * box.scale), radius = Math.max(signalling ? 4 : 2.5, (signalling ? 9 : 5) * box.scale);
      c.globalAlpha = base * (signalling ? 0.6 : 0.3); c.fillStyle = signalling ? '#FFB000' : '#FFF3B0'; c.beginPath();
      c.ellipse(cx, cy, radius, radius * 0.7, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = base;
      if (signalling) this.rect('#FFC21A', cx - Math.max(3, 6 * box.scale) / 2, cy - Math.max(2, 4 * box.scale) / 2, Math.max(3, 6 * box.scale), Math.max(2, 4 * box.scale));
    });
    c.globalAlpha = base;
  }

  private maintenanceTruck(lateral: number, z: number): void { this.drawSprite('maintenanceTruck', lateral, z, { shadow: true }); }

  /** A flock on the road: mostly still, with the odd flutter. */
  private birds(e: RoadEntity): void {
    const time = this.engine.elapsed, flutter = !this.motion.matches && Math.floor(time * 2.4 + e.id * 1.7) % 4 === 3;
    this.drawSprite(flutter ? 'birdsFlapping' : 'birdsStanding', (e.lane - 1) * LANE_WIDTH, e.z, { shadow: true, lift: flutter ? 2 : 0 });
  }

  /** A large puddle lying on the road, with a glint that comes and goes. */
  private puddle(e: RoadEntity): void {
    const box = this.drawSprite('puddle', (e.lane - 1) * LANE_WIDTH, e.z, { plane: true });
    if (!box || this.motion.matches) return;
    const spot = [[0.28, 0.4], [0.62, 0.55], [0.46, 0.3]][Math.floor((this.engine.elapsed * 2 + e.id) % 3)];
    this.rect('#FFFFFF', box.x + box.w * spot[0], box.y + box.h * spot[1], Math.max(1, 2 * box.scale), Math.max(1, 2 * box.scale));
  }

  /** An overhead lane-control gantry: a red X over each lane that will be shut ahead, a green arrow over the rest. */
  private gantry(e: RoadEntity): void {
    const { visible, r } = this.painter(0, e.z);
    if (!visible) return;
    const c = this.ctx, p = this.project(0, e.z), s = p.scale, closed = e.closed ?? [];
    for (const side of [-1, 1]) { r('#4E5C66', side * 138 - 3, -GANTRY_HEIGHT, 6, GANTRY_HEIGHT); r('#2B3742', side * 138 - 6, -3, 12, 4); }
    r('#3A4752', -144, -GANTRY_HEIGHT - 2, 288, 9); r('#8FA0AC', -144, -GANTRY_HEIGHT - 2, 288, 2);
    for (const lane of [0, 1, 2]) {
      const shut = closed.includes(lane), x = (lane - 1) * LANE_WIDTH, image = this.scenery[shut ? 'laneClosed' : 'laneOpen'];
      c.globalAlpha = 0.28 * this.entityAlpha; c.fillStyle = shut ? '#FF3B30' : '#3CE06B'; c.beginPath();
      c.ellipse(Math.round(p.x + x * s), Math.round(p.y + (-GANTRY_HEIGHT + 17) * s), 22 * s, 22 * s, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = this.entityAlpha;
      this.rect('#2B3742', p.x + (x - 1.5) * s, p.y + (-GANTRY_HEIGHT + 5) * s, 3 * s, 5 * s);
      if (image) c.drawImage(image, Math.round(p.x + (x - 14) * s), Math.round(p.y + (-GANTRY_HEIGHT + 8) * s), Math.max(1, Math.round(28 * s)), Math.max(1, Math.round(28 * s)));
    }
  }

  /** The tunnel: from outside a hill with a concrete portal, from inside dark walls, a ceiling of lamps and the bright exit. */
  private tunnelShell(view: { near: number; far: number }): void {
    const c = this.ctx, height = this.sceneHeight, horizon = 1500 * Math.sqrt(this.engine.pace);
    const zFar = Math.min(view.far, horizon), zNear = Math.max(view.near, -70);
    const edge = (side: number, z: number) => this.project(side * TUNNEL_HALF_WIDTH, z);
    const top = (p: { y: number; scale: number }) => p.y - TUNNEL_HEIGHT * p.scale;
    const nearLeft = edge(-1, zNear), nearRight = edge(1, zNear), farLeft = edge(-1, zFar), farRight = edge(1, zFar);
    const leaving = Math.max(0, Math.min(1, (view.far + 20) / 80));
    const outside = Math.max(0, Math.min(1, (view.near + 10) / 60)), inside = Math.max(0, Math.min(1, 1 - (view.near - 20) / 40));
    if (outside > 0) {
      c.globalAlpha = outside;
      const roofTop = top(farLeft), faceTop = top(nearLeft), base = nearLeft.y, scale = nearLeft.scale;
      this.polygon('#7F9A63', [[-20, roofTop], [260, roofTop], [260, faceTop], [-20, faceTop]]);
      this.polygon('#6A8553', [[-20, roofTop + (faceTop - roofTop) * 0.55], [260, roofTop + (faceTop - roofTop) * 0.55], [260, faceTop], [-20, faceTop]]);
      this.rect('#9AA4A8', 0, faceTop, 240, base - faceTop);
      this.rect('#7B868C', 0, faceTop, 240, Math.max(1, 5 * scale));
      const arch = (grow: number, color: string) => {
        const archTop = base - TUNNEL_HEIGHT * 0.84 * scale - grow, chamfer = 18 * scale, left = nearLeft.x - grow, right = nearRight.x + grow;
        this.polygon(color, [[left, base], [left, archTop + chamfer], [left + chamfer, archTop], [right - chamfer, archTop], [right, archTop + chamfer], [right, base]]);
      };
      arch(Math.max(2, 5 * scale), '#D2D8D9'); arch(0, TUNNEL_VOID);
      for (let i = 0; i < 12; i++) this.rect(i % 2 ? '#F3EFE0' : '#ED8B00', nearLeft.x + (nearRight.x - nearLeft.x) * i / 12, faceTop + 6 * scale, (nearRight.x - nearLeft.x) / 12, Math.max(1, 5 * scale));
      c.globalAlpha = 1;
    }
    if (inside > 0) {
      c.globalAlpha = inside * leaving;
      const wall = '#0B1424', ceiling = '#070D1B';
      const topNearLeft = top(nearLeft), topNearRight = top(nearRight), topFarLeft = top(farLeft), topFarRight = top(farRight);
      this.polygon(wall, [[nearLeft.x, nearLeft.y], [farLeft.x, farLeft.y], [farLeft.x, topFarLeft], [nearLeft.x, topNearLeft]]);
      this.polygon(wall, [[nearRight.x, nearRight.y], [farRight.x, farRight.y], [farRight.x, topFarRight], [nearRight.x, topNearRight]]);
      this.polygon(ceiling, [[nearLeft.x, topNearLeft], [farLeft.x, topFarLeft], [farRight.x, topFarRight], [nearRight.x, topNearRight]]);
      if (view.far > horizon) this.rect(TUNNEL_VOID, farLeft.x, topFarLeft, farRight.x - farLeft.x, farLeft.y - topFarLeft);
      const floor = c.createLinearGradient(0, farLeft.y, 0, Math.min(height, nearLeft.y));
      floor.addColorStop(0, 'rgba(5,8,15,0.92)'); floor.addColorStop(1, 'rgba(5,8,15,0.5)');
      c.fillStyle = floor; c.beginPath();
      [[nearLeft.x, nearLeft.y], [farLeft.x, farLeft.y], [farRight.x, farRight.y], [nearRight.x, nearRight.y]].forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
      c.closePath(); c.fill();
      const travel = this.engine.distance + this.idleTime, phase = travel % TUNNEL_LAMP_SPACING;
      for (let z = TUNNEL_LAMP_SPACING - phase; z < zFar; z += TUNNEL_LAMP_SPACING) {
        if (z < Math.max(zNear, 5)) continue;
        const p = this.project(0, z), s = p.scale, y = p.y - (TUNNEL_HEIGHT - 6) * s;
        c.globalAlpha = 0.1 * inside * leaving; c.fillStyle = '#FFE9A8'; c.beginPath(); c.ellipse(Math.round(p.x), Math.round(p.y), 64 * s, 8 * s, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.2 * inside * leaving; c.beginPath(); c.ellipse(Math.round(p.x), Math.round(y), 30 * s, 6 * s, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = inside * leaving; this.rect('#FFF4C8', p.x - 8 * s, y - s, 16 * s, 3 * s);
        for (const side of [-1, 1]) { const w = this.project(side * (TUNNEL_HALF_WIDTH - 3), z); this.rect('#F2A13A', w.x - 2 * s, w.y - 22 * s, 4 * s, 6 * s); }
      }
      if (view.near < 120) {
        const nearEdge = [this.project(-34, 28), this.project(34, 28)], farEdge = [this.project(-110, 420), this.project(110, 420)];
        const beam = c.createLinearGradient(0, nearEdge[0].y, 0, farEdge[0].y);
        beam.addColorStop(0, 'rgba(255,238,180,0.2)'); beam.addColorStop(1, 'rgba(255,238,180,0)');
        c.globalAlpha = inside * leaving; c.fillStyle = beam; c.beginPath();
        [[nearEdge[0].x, nearEdge[0].y], [farEdge[0].x, farEdge[0].y], [farEdge[1].x, farEdge[1].y], [nearEdge[1].x, nearEdge[1].y]].forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
        c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  /** The crosswind, as the truck is about to meet it or while it blows: its direction, and whether it is blowing now. */
  private gustState(): { direction: number; active: boolean; seconds: number } | null {
    const gust = this.engine.gust;
    if (!gust || this.engine.state === 'ready') return null;
    const seconds = (gust.at - this.engine.distance) / Math.max(1, this.engine.speed);
    const active = gust.startedAt !== null && this.engine.elapsed - gust.startedAt < GUST_BUILD_SECONDS + 0.6;
    return active || (seconds > 0 && seconds < GUST_WARNING_SECONDS) ? { direction: gust.direction, active, seconds } : null;
  }

  /** A windsock on the verge ahead of the gust: limp while it is far off, streaming once the wind is near. */
  private windsockObjects(): RoadObject[] {
    const gust = this.engine.gust;
    if (!gust || this.engine.state === 'ready') return [];
    const z = gust.at - this.engine.distance - this.engine.speed * 0.6;
    if (z < -40 || z > 1500 * Math.sqrt(this.engine.pace)) return [];
    const blowing = (z - 20) / Math.max(1, this.engine.speed) < GUST_WARNING_SECONDS + 0.6 || gust.startedAt !== null;
    const lateral = -gust.direction * 152;
    return [{ z, over: false, sight: WINDSOCK_SIGHT_SECONDS, glowLateral: lateral, draw: () => this.drawSprite(blowing ? 'windsockStreaming' : 'windsockLimp', lateral + (blowing ? gust.direction * 20 : 0), z, { flip: gust.direction < 0 && blowing }) }];
  }

  /** How far the crosswind has built, from 0 to 1 (1 is the peak, when the lane changes). */
  private gustCharge(): number {
    const gust = this.engine.gust;
    return !gust || gust.startedAt === null ? 0 : Math.min(1, (this.engine.elapsed - gust.startedAt) / GUST_BUILD_SECONDS);
  }

  /** A bar that fills outward from the middle in the direction the wind will push; the lane changes when it is full. */
  private gustBar(): void {
    const state = this.gustState(), gust = this.engine.gust;
    if (!state || !gust) return;
    const c = this.ctx, charge = this.gustCharge(), centre = DeliveryDashGame.W / 2, half = 56, y = 24, height = 7;
    const peak = gust.swappedAt !== null && this.engine.elapsed - gust.swappedAt < 0.3;
    c.globalAlpha = 0.8; this.rect('#0B1B33', centre - half - 2, y - 2, half * 2 + 4, height + 4); c.globalAlpha = 1;
    this.rect('#27405F', centre - half, y, half * 2, height);
    this.rect('#8FA6C4', centre - 1, y - 2, 2, height + 4);
    const filled = Math.round(half * (peak ? 1 : charge)), left = state.direction < 0 ? centre - filled : centre;
    const colour = peak ? '#FFFFFF' : charge < 0.5 ? '#7FD1FF' : charge < 0.85 ? '#FFC83D' : '#FF5A36';
    this.rect(colour, left, y, filled, height);
    const pulse = this.motion.matches || Math.floor(this.engine.elapsed * 6) % 2 === 0, tip = centre + state.direction * (half + 5);
    for (let i = 0; i < 2; i++) {
      const x = tip + state.direction * i * 4, lit = pulse === (i === 0);
      c.fillStyle = lit ? '#FFC83D' : '#8FA6C4';
      c.beginPath(); c.moveTo(Math.round(x), y); c.lineTo(Math.round(x + state.direction * 4), y + height / 2); c.lineTo(Math.round(x), y + height); c.closePath(); c.fill();
    }
  }

  /** Wind streaks across the road in the direction it pushes, from the warning until the last shove. */
  private gustStreaks(): void {
    const state = this.gustState();
    if (!state || this.motion.matches) return;
    const c = this.ctx, time = this.engine.elapsed, strength = state.active ? 0.5 + 0.5 * this.gustCharge() : Math.max(0.2, 0.5 * (1 - state.seconds / GUST_WARNING_SECONDS));
    c.fillStyle = '#FFFFFF';
    for (let i = 0; i < 22; i++) {
      const lane = (i * 37) % 100 / 100, speed = 160 + (i % 4) * 50, length = 18 + (i % 3) * 10;
      const x = (((i * 53 + time * speed * state.direction) % 280) + 280) % 280 - 20, y = 50 + lane * (this.sceneHeight - 70);
      c.globalAlpha = 0.7 * strength; c.fillRect(Math.round(x), Math.round(y), length, i % 3 === 0 ? 2 : 1);
    }
    c.globalAlpha = 1;
  }

  private entity(e: RoadEntity): void {
    if (e.kind === 'shop') { this.shopEntity(e); return; }
    if (e.kind === 'delivery') { this.deliveryEntity(e); return; }
    if (e.kind === 'powerpup') { this.powerpup(e); return; }
    if (e.variant === 'slot') { this.slotEntity(e); return; }
    if (e.kind === 'giftasaurus') { this.giftasaurus(e); return; }
    if (e.kind === 'crane') { this.crane(e); return; }
    if (e.kind === 'ferrari') { this.ferrari(e); return; }
    if (e.kind === 'stalledcar') { this.stalledCar(e); return; }
    if (e.kind === 'birds') { this.birds(e); return; }
    if (e.kind === 'puddle') { this.puddle(e); return; }
    if (e.kind === 'gantry') { this.gantry(e); return; }
    const p = this.project((e.lane - 1) * (260 / 3), e.z);
    if (this.pastBottom(p.y)) return;
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
      this.ctx.globalAlpha = pulse * this.entityAlpha;
      poly('#FFD36B', [[-34, cy], [-24, cy - 22], [0, cy - 30], [24, cy - 22], [34, cy], [24, cy + 22], [0, cy + 30], [-24, cy + 22]]);
      this.ctx.globalAlpha = this.entityAlpha;
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
      // Warm wrapping and a large orange bow make gifts distinct from roadworks; coloured gifts swap the palette.
      const palette = e.variant ? GIFT_VARIANT_PALETTES[e.variant] : PLAIN_GIFT_PALETTE;
      poly(palette.outline, [[-16, -25], [-11, -31], [18, -31], [18, -5], [13, 0], [-16, 0]]);
      r(palette.front, -16, -25, 29, 25); r(palette.side, 13, -25, 5, 25);
      r(palette.lid, -18, -28, 33, 6); r(palette.lidSide, 15, -28, 5, 6);
      r(palette.ribbon, -4, -29, 7, 29); r(palette.ribbonHighlight, -3, -29, 2, 29);
      poly(palette.bow, [[-2, -29], [-15, -34], [-13, -41], [-5, -39], [0, -31]]);
      poly(palette.bowLight, [[1, -30], [6, -40], [14, -40], [16, -34], [4, -28]]);
      r(palette.bowHighlight, -11, -37, 4, 3); r(palette.bowHighlight, 8, -37, 4, 3);
      r(palette.knot, -3, -32, 7, 5);
      if (e.variant && !this.motion.matches) for (let index = 0; index < 3; index++) {
        const twinkle = Math.sin(this.engine.elapsed * 6 + e.id * 2 + index * 2.1);
        if (twinkle > 0.2) r(palette.bowHighlight, [-24, 22, 2][index], [-30, -36, -52][index], 4, 4);
      }
    }
  }

  /** The Snappy mascot sprite in a pulsing glow, circled by message icons. */
  private powerpup(e: RoadEntity): void {
    const sprite = this.scenery['snappy'];
    const p = this.project((e.lane - 1) * (260 / 3), e.z);
    if (!sprite || this.pastBottom(p.y)) return;
    const c = this.ctx, s = p.scale, time = this.engine.elapsed, calm = this.motion.matches;
    const bob = calm ? 0 : Math.sin(time * 5 + e.id) * 2;
    c.globalAlpha = (calm ? 0.3 : 0.24 + 0.1 * Math.sin(time * 6)) * this.entityAlpha;
    c.fillStyle = '#BFF0FF'; c.beginPath();
    c.ellipse(Math.round(p.x), Math.round(p.y + (bob - 28) * s), 32 * s, 34 * s, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = this.entityAlpha;
    this.rect('#34424C', p.x - 22 * s, p.y - s, 44 * s, 4 * s);
    c.drawImage(sprite, Math.round(p.x - 26 * s), Math.round(p.y + (bob - 56) * s), Math.max(1, Math.round(52 * s)), Math.max(1, Math.round(56 * s)));
    // The prize at the current multiplier, so the player knows what it is worth before committing.
    c.font = `bold ${Math.max(6, Math.round(18 * s))}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = Math.max(2, 4 * s);
    const prize = `+${POWERPUP_BONUS * this.engine.multiplier}`, prizeY = Math.round(p.y + (bob - 72) * s);
    c.strokeStyle = '#002855'; c.strokeText(prize, Math.round(p.x), prizeY);
    c.fillStyle = '#FFE08A'; c.fillText(prize, Math.round(p.x), prizeY);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    if (calm) return;
    ['#A77BF0', '#4FD1B5', '#5AA8F0', '#F2B84B', '#6BD66B'].forEach((color, index) => {
      const angle = Math.PI + index * Math.PI / 4 + Math.sin(time * 1.5) * 0.25;
      this.rect(color, p.x + (Math.cos(angle) * 34 - 2) * s, p.y + (bob - 32 + Math.sin(angle) * 30 - 2) * s, 5 * s, 5 * s);
    });
  }

  /**
   * Giftasaurus stands on the verge with its feet planted, tilts its body about them and swings its big head
   * out over the outer lane on its neck, clamping its jaws there. The jaws open only while it leans in. Drawn as
   * the left-hand one facing the road and mirrored for the right. Sprite pixels: the feet pivot at body (24, 48),
   * the head's top-left sits at body (26, -23) so its neck socket covers the stump, and the head turns about the
   * socket at body (32.5, 8). The jaw tip is head (39, 11).
   */
  private giftasaurus(e: RoadEntity): void {
    const body = this.scenery['giftasaurusBody'], extension = this.engine.biteExtension(e);
    const head = this.scenery[this.engine.biteStage(e) === 'lean' ? 'giftasaurusOpen' : 'giftasaurusClosed'];
    const p = this.project(0, e.z), s = p.scale, c = this.ctx, calm = this.motion.matches;
    if (!body || !head || this.pastBottom(p.y)) return;
    const { bodyTilt, headTurn, unit, pivot } = this.giftasaurusPose(extension);
    // Bobblehead: the head nods on its neck while it waits, and holds still while biting.
    const nod = calm ? 0 : Math.sin(this.engine.elapsed * 7 + e.id) * 0.08 * (1 - extension);
    c.save();
    c.translate(Math.round(p.x), Math.round(p.y));
    if (e.lane === 2) c.scale(-1, 1);
    c.fillStyle = '#34424C'; c.fillRect(Math.round((pivot - 16 * unit) * s), Math.round(-2 * s), Math.round(30 * unit * s), Math.max(1, Math.round(3 * s)));
    c.translate(pivot * s, 0);
    c.rotate(bodyTilt);
    c.scale(unit * s, unit * s);
    c.drawImage(body, -24, -48);
    c.translate(8.5, -40); c.rotate(headTurn + nod); c.translate(-8.5, 40);
    c.drawImage(head, 2, -71);
    c.restore();
  }

  /**
   * The crane stands on a verge, left-hand facing the road and mirrored for the right, with its boom reaching over
   * the middle of the road. The ball hangs from the cable stub on a chain and swings about it; a shadow on the road
   * shows where it is. The chain angle comes from the engine's ball position so what is drawn is what hits the truck.
   */
  private crane(e: RoadEntity): void {
    const body = this.scenery['craneBody'], ball = this.scenery['craneBall'];
    const p = this.project(0, e.z), c = this.ctx;
    if (!body || !ball || this.pastBottom(p.y) || p.scale > 2) return;
    const ballLane = this.engine.craneBall(e), lateral = (ballLane - 1) * LANE_WIDTH;
    const angle = Math.asin(Math.max(-1, Math.min(1, lateral / CRANE_CHAIN)));
    const height = (body.naturalHeight - CRANE_PIVOT.y) * CRANE_UNIT, swing = CRANE_CHAIN * Math.cos(angle);
    c.save();
    c.translate(Math.round(p.x), Math.round(p.y));
    c.scale(p.scale, p.scale);
    c.save();
    if (e.lane === 2) c.scale(-1, 1);
    c.drawImage(body, -CRANE_PIVOT.x * CRANE_UNIT, -body.naturalHeight * CRANE_UNIT, body.naturalWidth * CRANE_UNIT, body.naturalHeight * CRANE_UNIT);
    c.restore();
    const low = Math.max(0, Math.min(1, (height - swing) / 40));
    c.globalAlpha = 0.18 + 0.12 * low;
    c.fillStyle = '#0E1B2A'; c.beginPath();
    c.ellipse(lateral, 0, 15 + 4 * low, 4 + low, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.translate(0, -height);
    c.rotate(-angle);
    const linkTop = CRANE_CHAIN - CRANE_BALL_CENTRE.y * CRANE_BALL_UNIT;
    for (let link = 0; link * 5 < linkTop; link++) {
      c.fillStyle = link % 2 ? '#3E4F60' : '#9DB0C1';
      c.fillRect(-2, link * 5, 4, 5);
    }
    c.drawImage(ball, -CRANE_BALL_CENTRE.x * CRANE_BALL_UNIT, linkTop, ball.naturalWidth * CRANE_BALL_UNIT, ball.naturalHeight * CRANE_BALL_UNIT);
    c.restore();
  }

  /** Body tilt and head turn that put the jaw tip `extension` of the bite reach past the road edge. */
  private giftasaurusPose(extension: number): { bodyTilt: number; headTurn: number; unit: number; pivot: number } {
    const degrees = Math.PI / 180, socket = [8.5, -40], jaw = [32.5, -20];
    const turn = (angle: number, [x, y]: number[]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    const pose = (amount: number) => ({ bodyTilt: (-6 + 30 * amount) * degrees, headTurn: (-10 + 40 * amount) * degrees });
    const tipAt = (amount: number) => {
      const { bodyTilt, headTurn } = pose(amount), [jx, jy] = turn(headTurn, jaw);
      return turn(bodyTilt, [socket[0] + jx, socket[1] + jy])[0];
    };
    const rest = tipAt(0), unit = BITE_REACH * (260 / 3) / (tipAt(1) - rest), target = rest + extension * (tipAt(1) - rest);
    let low = 0, high = 1;
    for (let step = 0; step < 18; step++) { const middle = (low + high) / 2; if (tipAt(middle) < target) low = middle; else high = middle; }
    return { ...pose((low + high) / 2), unit, pivot: -130 - rest * unit };
  }

  private truckLean(): number {
    return this.truckHeading;
  }

  private drawTruck(): void {
    if (!this.truck) return;
    const e = this.engine, p = this.project((e.visualLane - 1) * (260 / 3), 20);
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
    if (e.boostLevel > 0.1) {
      const flicker = 0.75 + 0.25 * Math.sin(e.elapsed * 60);
      for (const x of [left + 7, left + width - 13]) {
        const length = Math.round((6 + 12 * e.boostLevel) * flicker);
        this.rect('#ED8B00', x, top + height - 2, 6, length);
        this.rect('#FFE08A', x + 1, top + height - 2, 4, Math.round(length * 0.65));
        this.rect('#FFFFFF', x + 2, top + height - 2, 2, Math.round(length * 0.35));
      }
    }
    const lean = this.truckLean(), sourceHeight = this.truck.naturalHeight, rowHeight = Math.max(1, Math.round(sourceHeight / height));
    for (let row = 0; row < height; row++) {
      this.ctx.drawImage(this.truck, 0, Math.min(sourceHeight - rowHeight, Math.floor(row * sourceHeight / height)), this.truck.naturalWidth, rowHeight, left + Math.round(lean * (height - row)), top + row, width, 1);
    }
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
    if (e.magnet && !calm) {
      for (let i = 0; i < 14; i++) {
        const angle = time * 3 + i * Math.PI * 2 / 14, reach = 58 + 4 * Math.sin(time * 4 + i);
        this.rect(i % 2 ? '#FF6A4D' : '#FFD1C8', p.x + Math.cos(angle) * reach, top + 60 + Math.sin(angle) * 16, 3, 3);
      }
    }
    if (e.jackpotUntil > time && !calm) {
      for (let i = 0; i < 10; i++) {
        const age = (time * 1.8 + i * 0.37) % 1;
        this.rect(i % 2 ? '#C58BFF' : '#FFE08A', p.x - 24 + ((i * 17) % 48), top + 66 - age * 70, 3, 3);
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
    this.logo.style.left = `${(left + 7 + Math.round(lean * 30)) * s}px`;
    this.logo.style.top = `${(top + 34) * s}px`;
    this.logo.style.width = `${34 * s}px`;
    this.logo.style.visibility = 'visible';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0; this.abort.abort(); this.win.clearTimeout(this.searchTimer);
    this.observer.disconnect(); this.intersection.disconnect();
  }
}
