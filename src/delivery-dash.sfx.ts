// Sound effects, mostly synthesised with Web Audio. The Ferrari's pass is a recording served from `assets/sfx/` by default:
// BigSoundBank's CC0 "Acceleration Aston Martin" (#0600) with the two honks from "Car Honking at 90 km/h #3" (#3438) mixed in,
// bit-crushed to sit with the pixel art. Until it loads, or if it can't, a synthesised engine and horn stand in.
export type SoundEffect = 'pickup' | 'bonusPickup' | 'coupon' | 'delivered' | 'setback' | 'shieldHit' | 'crash' | 'honk' | 'snappyDeath';

/**
 * Where a passing car is relative to the truck: `ahead` in world units (negative once it has gone by), `arrival` in seconds
 * until it reaches the truck, and `pan` from -1 (left) to 1 (right).
 */
export interface CarPosition { ahead: number; arrival: number; pan: number; }

export const DEFAULT_SFX_BASE = 'assets/sfx/';
const CAR_PASS_FILE = 'ferrari-pass.mp3';

export const DEFAULT_SFX_VOLUME = 0.5;
const SFX_VOLUME_KEY = 'giftgo-delivery-dash-sfx-volume';
/** Gain at 100% on the effects slider. */
const SFX_LEVEL = 1;

type Wave = OscillatorType;

/** Ferrari engine: idle pitch, how loud it is right beside the truck, and the distance at which it has fallen to half that. */
const ENGINE_HZ = 150;
const ENGINE_PEAK = 0.22;
const ENGINE_HALF_DISTANCE = 250;
/** Pitch shift as it approaches (up) and recedes (down), and over what distance it swings from one to the other. */
const ENGINE_DOPPLER = 0.14;
const ENGINE_DOPPLER_DISTANCE = 60;
/** The recording revs up to its loudest, honking, CAR_PASS_PEAK_AT seconds in, so it starts that long before the car arrives. */
const CAR_PASS_PEAK_AT = 2.8;
const CAR_PASS_LEVEL = 0.5;
/** The recording builds up by itself, so distance only quietens it once the car has gone by. */
const CAR_PASS_RECEDE_DISTANCE = 120;

interface EngineVoice {
  sources: AudioScheduledSourceNode[]; gain: GainNode; pan: StereoPannerNode | null; recorded: boolean;
  /** Sets the pitch as a multiple of the engine's own, and the loudness. */
  update(pitch: number, level: number, now: number): void;
}

/** Plays short game sounds. Browsers only allow audio after a user gesture, so call `unlock` from one. */
export class DeliveryDashSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _volume = DEFAULT_SFX_VOLUME;
  private engine: EngineVoice | null = null;
  private carPass: AudioBuffer | null = null;

  constructor(private readonly win: Window & typeof globalThis, private readonly base = DEFAULT_SFX_BASE) {
    try {
      const stored = win.localStorage.getItem(SFX_VOLUME_KEY);
      if (stored !== null && Number.isFinite(Number(stored))) this._volume = Math.min(1, Math.max(0, Number(stored)));
    } catch {}
  }

  get volume(): number { return this._volume; }

  setVolume(volume: number): void {
    this._volume = Math.min(1, Math.max(0, volume));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this._volume * SFX_LEVEL, this.ctx.currentTime, 0.02);
    try { this.win.localStorage.setItem(SFX_VOLUME_KEY, String(this._volume)); } catch {}
  }

  /** Call from a click or key press; until then nothing plays. */
  unlock(): void {
    if (!this.ctx) {
      const Context = this.win.AudioContext ?? (this.win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      try { this.ctx = new Context(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume * SFX_LEVEL;
      // A limiter keeps overlapping sounds (a crash over a jingle) from clipping.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 12;
      limiter.attack.value = 0.002; limiter.release.value = 0.1;
      this.master.connect(limiter).connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const ctx = this.ctx;
      void this.win.fetch(this.base + CAR_PASS_FILE)
        .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer(); })
        .then(data => ctx.decodeAudioData(data))
        .then(buffer => { this.carPass = buffer; })
        .catch(() => {});
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  play(effect: SoundEffect): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this._volume <= 0) return;
    const t = ctx.currentTime + 0.005;
    switch (effect) {
      // Heard every second or so, so it is a quiet, very short tick with a little pitch drift to avoid fatigue.
      case 'pickup': {
        const f = 1900 * (0.97 + Math.random() * 0.06);
        this.tone('sine', f, f * 1.25, t, 0.045, 0.15);
        break;
      }
      case 'bonusPickup':
        this.tone('triangle', 1568, 1568, t, 0.07, 0.35);
        this.tone('triangle', 2349, 2349, t + 0.05, 0.1, 0.3);
        break;
      case 'coupon':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone('square', f, f, t + i * 0.055, 0.09, 0.22));
        this.tone('triangle', 2637, 2637, t + 0.22, 0.35, 0.4);
        break;
      case 'delivered':
        [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.07, 0.12, 0.45));
        this.tone('triangle', 1047, 1047, t + 0.21, 0.45, 0.5);
        this.tone('square', 1047, 1047, t + 0.21, 0.3, 0.1);
        break;
      // Shared "that cost you" sound: streak lost, missed delivery.
      case 'setback':
        this.tone('square', 392, 370, t, 0.13, 0.25);
        this.tone('square', 311, 233, t + 0.13, 0.26, 0.25);
        break;
      case 'shieldHit':
        this.thump(t, 0.18, 0.5);
        this.tone('triangle', 880, 440, t, 0.18, 0.25);
        break;
      case 'crash':
        this.thump(t, 0.55, 0.8);
        this.tone('square', 196, 55, t + 0.02, 0.5, 0.15);
        break;
      // Two blasts of a two-note horn, the second a touch lower as the car is already going by. The recorded pass has its own.
      case 'honk':
        if (this.engine?.recorded) break;
        this.horn(t, 0.16, 1);
        this.horn(t + 0.24, 0.22, 0.93);
        break;
      // Snappy gets run over: a rubber-toy squeak up, then a stepped 8-bit tumble down to a final deflating squeak.
      case 'snappyDeath':
        this.tone('square', 1400, 2600, t, 0.06, 0.2);
        this.tone('square', 1600, 3000, t + 0.07, 0.07, 0.2);
        [1760, 1480, 1245, 1047, 880, 740].forEach((f, i) => this.tone('square', f * 1.06, f, t + 0.16 + i * 0.05, 0.05, 0.16));
        this.tone('square', 1200, 300, t + 0.47, 0.22, 0.18);
        break;
    }
  }

  /** Keeps the Ferrari's engine note in step with the car; null fades it out (gone, paused or crashed). Call every frame. */
  setCar(car: CarPosition | null): void {
    const ctx = this.ctx;
    if (!car || !ctx || ctx.state !== 'running' || this._volume <= 0) { this.stopEngine(); return; }
    const voice = this.engine ?? (this.engine = this.carPass ? this.startRecordedPass(ctx, this.carPass, car.arrival) : this.startEngine(ctx));
    const now = ctx.currentTime, distance = Math.abs(car.ahead);
    const pitch = 1 + ENGINE_DOPPLER * Math.tanh(car.ahead / ENGINE_DOPPLER_DISTANCE);
    const level = voice.recorded
      ? CAR_PASS_LEVEL / (car.ahead >= 0 ? 1 : 1 + (distance / CAR_PASS_RECEDE_DISTANCE) ** 2)
      : ENGINE_PEAK / (1 + (distance / ENGINE_HALF_DISTANCE) ** 2);
    voice.update(pitch, level, now);
    voice.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, car.pan)), now, 0.05);
  }

  destroy(): void {
    this.stopEngine();
    void this.ctx?.close().catch(() => {});
    this.ctx = this.master = null;
  }

  /** A gain and, where supported, a stereo pan feeding the master bus. */
  private voiceOutput(ctx: AudioContext): { gain: GainNode; pan: StereoPannerNode | null } {
    const gain = ctx.createGain(), pan = ctx.createStereoPanner?.() ?? null;
    gain.gain.value = 0.0001;
    if (pan) gain.connect(pan).connect(this.master!); else gain.connect(this.master!);
    return { gain, pan };
  }

  /** The recorded pass, started so its peak lands as the car reaches the truck; the Doppler shift bends its playback rate. */
  private startRecordedPass(ctx: AudioContext, buffer: AudioBuffer, arrival: number): EngineVoice {
    const { gain, pan } = this.voiceOutput(ctx), source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const lead = arrival - CAR_PASS_PEAK_AT;
    source.start(ctx.currentTime + Math.max(0, lead), Math.min(buffer.duration, Math.max(0, -lead)));
    return {
      sources: [source], gain, pan, recorded: true,
      update: (pitch, level, now) => { source.playbackRate.setTargetAtTime(pitch, now, 0.05); gain.gain.setTargetAtTime(level, now, 0.05); },
    };
  }

  /** Two slightly detuned saws over a square an octave down, low-passed: a buzzy engine that beats a little. */
  private startEngine(ctx: AudioContext): EngineVoice {
    const filter = ctx.createBiquadFilter(), { gain, pan } = this.voiceOutput(ctx);
    filter.type = 'lowpass'; filter.Q.value = 2;
    filter.connect(gain);
    const oscillators = (['sawtooth', 'sawtooth', 'square'] as const).map(wave => {
      const osc = ctx.createOscillator();
      osc.type = wave; osc.frequency.value = ENGINE_HZ;
      osc.connect(filter); osc.start();
      return osc;
    });
    return {
      sources: oscillators, gain, pan, recorded: false,
      update: (pitch, level, now) => {
        oscillators.forEach((osc, i) => osc.frequency.setTargetAtTime(ENGINE_HZ * pitch * [1, 1.012, 0.5][i], now, 0.05));
        filter.frequency.setTargetAtTime(500 + 2500 * level / ENGINE_PEAK, now, 0.05);
        gain.gain.setTargetAtTime(level, now, 0.05);
      },
    };
  }

  private stopEngine(): void {
    const voice = this.engine, ctx = this.ctx;
    if (!voice || !ctx) return;
    this.engine = null;
    const now = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    // The recording rings out a little longer, as the car disappears up the road behind.
    voice.gain.gain.setTargetAtTime(0.0001, now, voice.recorded ? 0.2 : 0.12);
    voice.sources.forEach(source => { try { source.stop(now + 1.2); } catch {} });
  }

  /** One horn blast: a major third of square waves through a low-pass, like a car's twin horns. */
  private horn(start: number, length: number, pitch: number): void {
    const ctx = this.ctx!, filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
    gain.gain.setValueAtTime(0.22, start + length - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    filter.connect(gain).connect(this.master!);
    for (const f of [415, 523]) {
      const osc = ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = f * pitch;
      osc.connect(filter); osc.start(start); osc.stop(start + length + 0.02);
    }
  }

  /** One oscillator note with a fast attack and an exponential decay, optionally gliding in pitch. */
  private tone(wave: Wave, from: number, to: number, start: number, length: number, peak: number): void {
    const ctx = this.ctx!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(this.master!);
    osc.start(start); osc.stop(start + length + 0.02);
  }

  /** A low-passed noise burst over a falling sine: an impact. */
  private thump(start: number, length: number, peak: number): void {
    const ctx = this.ctx!, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, start);
    filter.frequency.exponentialRampToValueAtTime(120, start + length);
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(start); source.stop(start + length);
    this.tone('sine', 140, 40, start, length * 0.8, peak * 0.9);
  }
}
