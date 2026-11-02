// Soundtrack player. The tracks are served as files (too large to embed), from `assets/music/` by default.
export const MUSIC_TRACKS = ['pixel-velocity.mp3', 'pixel-dash.mp3', 'pixel-adventure.mp3', 'pixel-velocity-ii.mp3', 'pixel-adventure-ii.mp3'];
export const DEFAULT_MUSIC_BASE = 'assets/music/';
export const DEFAULT_VOLUME = 0.4;
const VOLUME_KEY = 'giftgo-delivery-dash-volume';

/** The tracks are mastered loud and hearing is logarithmic, so the slider maps to gain on a squared curve: 40% plays at 0.16. */
const musicGain = (volume: number) => volume * volume;

/** Plays the soundtrack on a loop in a shuffled order. Browsers only allow playback after a user gesture, so call `unlock` from one. */
export class DeliveryDashMusic {
  private readonly audio: HTMLAudioElement;
  private order: string[] = [];
  private index = 0;
  private unlocked = false;
  private wanted = false;
  private _volume = DEFAULT_VOLUME;

  constructor(private readonly win: Window & typeof globalThis, private readonly base = DEFAULT_MUSIC_BASE) {
    try {
      const stored = win.localStorage.getItem(VOLUME_KEY);
      if (stored !== null && Number.isFinite(Number(stored))) this._volume = Math.min(1, Math.max(0, Number(stored)));
    } catch {}
    this.audio = new win.Audio();
    this.audio.preload = 'none';
    this.audio.volume = musicGain(this._volume);
    this.audio.addEventListener('ended', () => this.next());
    // A missing or broken file skips to the next track rather than stopping the music.
    this.audio.addEventListener('error', () => { if (this.order.length > 1) this.win.setTimeout(() => this.next(), 1000); });
    this.shuffle();
  }

  get volume(): number { return this._volume; }

  setVolume(volume: number): void {
    this._volume = Math.min(1, Math.max(0, volume));
    this.audio.volume = musicGain(this._volume);
    try { this.win.localStorage.setItem(VOLUME_KEY, String(this._volume)); } catch {}
    this.apply();
  }

  /** Call from a click or key press; until then nothing plays. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.load();
    this.apply();
  }

  /** Whether the game wants music right now (e.g. not paused or hidden). */
  setPlaying(playing: boolean): void {
    this.wanted = playing;
    this.apply();
  }

  destroy(): void {
    this.wanted = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private apply(): void {
    const play = this.unlocked && this.wanted && this._volume > 0;
    if (play && this.audio.paused) void this.audio.play().catch(() => {});
    else if (!play && !this.audio.paused) this.audio.pause();
  }

  private next(): void {
    this.index++;
    if (this.index >= this.order.length) {
      const last = this.order[this.order.length - 1];
      this.shuffle();
      // Don't play the same song twice in a row across a reshuffle.
      if (this.order.length > 1 && this.order[0] === last) [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
    }
    this.load();
    this.apply();
  }

  private load(): void {
    this.audio.src = this.base + this.order[this.index];
  }

  private shuffle(): void {
    this.order = [...MUSIC_TRACKS];
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.index = 0;
  }
}
