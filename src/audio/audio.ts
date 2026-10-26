import { daylight } from '../sim/clock';

/**
 * All the game's sound, made from scratch with the Web Audio API: wind, leaves, birds, crickets, owls, traffic,
 * rain, water and fire for the ambience, and small tones for the interface. There are no sound files to download.
 */

export interface SoundEnv {
  /** Hour of the day, 0 to 24. */
  hour: number;
  /** How wooded the spot under the camera is, 0 to 1. */
  forest: number;
  /** How many cars are near the camera, 0 to 1. */
  traffic: number;
  /** Water close to the camera (a pond or stream), 0 to 1. */
  water: number;
  /** A fire close to the camera, 0 to 1. */
  fire: number;
  /** How hard it is raining, 0 to 1. */
  rain: number;
  /** How violent the storm is, 0 to 1. */
  storm: number;
  /** After the outbreak the town goes quiet and eerie. */
  outbreak: boolean;
}

const STORAGE_KEY = 'zgame.audio';

function pinkNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambient!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private readonly layers = new Map<string, GainNode>();
  private readonly levels: Record<string, number> = {};
  private volume = 0.6;
  private muted = false;
  private failed = false;
  private env: SoundEnv = { hour: 11, forest: 0.4, traffic: 0, water: 0, fire: 0, rain: 0, storm: 0, outbreak: false };
  private readonly next = { bird: 0, owl: 0, horn: 0, crackle: 0, thunder: 0 };
  /** Counts of one-off sounds played, so tests can check the ambience is alive. */
  readonly stats = { birds: 0, owls: 0, horns: 0, thunder: 0, crackles: 0, effects: 0 };

  constructor() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { volume?: number; muted?: boolean } | null;
      if (saved && typeof saved.volume === 'number') this.volume = Math.min(1, Math.max(0, saved.volume));
      if (saved && typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      // Ignore unreadable settings
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get level(): number {
    return this.volume;
  }

  get isAvailable(): boolean {
    return !this.failed && typeof AudioContext !== 'undefined';
  }

  /** Start the sound. Browsers only allow this after the player has clicked or pressed a key. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      try {
        this.build();
      } catch (err) {
        console.warn('Sound is not available', err);
        this.failed = true;
        return;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyMaster();
    this.save();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
    this.save();
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      // Settings simply will not be remembered
    }
  }

  private applyMaster(): void {
    if (!this.ctx) return;
    // Squaring the slider makes the middle of the slider sound like the middle
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * this.volume, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------ Building the sound graph

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 1;
    this.ambient.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.noise = pinkNoise(ctx, 4);
    this.applyMaster();

    const layer = (name: string): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ambient);
      this.layers.set(name, g);
      return g;
    };
    const noiseSource = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random() * this.noise.duration);
      return s;
    };
    const filter = (type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    /** Make a slowly wobbling gain, for gusts and swells. */
    const wobble = (base: number, depth: number, hz: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = base;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const d = ctx.createGain();
      d.gain.value = depth;
      lfo.connect(d);
      d.connect(g.gain);
      lfo.start();
      return g;
    };

    // Wind in the trees: low rushing noise that swells and fades
    const wind = layer('wind');
    noiseSource().connect(filter('lowpass', 650, 0.4)).connect(wobble(0.7, 0.3, 0.11)).connect(wind);

    // Leaves rustling
    const rustle = layer('rustle');
    noiseSource().connect(filter('highpass', 2200)).connect(filter('lowpass', 6500)).connect(wobble(0.5, 0.35, 0.23)).connect(rustle);

    // Traffic: a low engine hum plus road hiss
    const traffic = layer('traffic');
    noiseSource().connect(filter('lowpass', 240)).connect(traffic);
    const hiss = ctx.createGain();
    hiss.gain.value = 0.25;
    noiseSource().connect(filter('bandpass', 1100, 0.8)).connect(hiss).connect(traffic);

    // Crickets: three high tones, switched on and off quickly in short bursts
    const crickets = layer('crickets');
    [[4300, 23, 2.6], [4620, 27, 3.1], [5010, 31, 2.2]].forEach(([freq, chirpHz, burstHz]) => {
      const carrier = ctx.createOscillator();
      carrier.frequency.value = freq;
      const chirp = wobble(0.5, 0.5, chirpHz);
      const burst = wobble(0.5, 0.5, burstHz);
      const out = ctx.createGain();
      out.gain.value = 0.33;
      carrier.connect(chirp).connect(burst).connect(out).connect(crickets);
      carrier.start();
    });

    // Water: a gentle bubbling trickle
    const water = layer('water');
    noiseSource().connect(filter('bandpass', 1400, 1.4)).connect(wobble(0.6, 0.3, 1.9)).connect(water);
    const sparkle = ctx.createGain();
    sparkle.gain.value = 0.15;
    noiseSource().connect(filter('highpass', 3500)).connect(wobble(0.6, 0.4, 5.3)).connect(sparkle).connect(water);

    // Rain
    const rain = layer('rain');
    noiseSource().connect(filter('highpass', 900)).connect(filter('lowpass', 9000)).connect(rain);
    const patter = ctx.createGain();
    patter.gain.value = 0.3;
    noiseSource().connect(filter('lowpass', 420)).connect(patter).connect(rain);

    // After the outbreak: a low, uneasy drone
    const drone = layer('drone');
    const droneFilter = filter('lowpass', 220);
    droneFilter.connect(drone);
    [[55, 'sine'], [55.8, 'sine'], [82.4, 'triangle']].forEach(([freq, type]) => {
      const o = ctx.createOscillator();
      o.type = type as OscillatorType;
      o.frequency.value = freq as number;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g).connect(droneFilter);
      o.start();
    });
  }

  // ------------------------------------------------------------ Steering the ambience

  /** Call a few times a second with what the camera is looking at. */
  update(env: SoundEnv): void {
    this.env = env;
    const ctx = this.ctx;
    if (!ctx) return;
    const day = daylight(env.hour);
    const night = 1 - day;
    const out = env.outbreak;
    const set = (name: string, value: number) => {
      this.layers.get(name)?.gain.setTargetAtTime(value, ctx.currentTime, 0.9);
      this.levels[name] = value;
    };
    set('wind', (0.1 + 0.14 * env.forest + 0.14 * env.rain + 0.22 * env.storm) * (0.75 + 0.25 * day) * (out ? 1.35 : 1));
    set('rustle', env.forest * 0.1 * (0.4 + 0.6 * day) * (1 + env.rain));
    set('traffic', out ? 0 : env.traffic * (0.22 * day + 0.08 * night));
    set('crickets', out ? 0.008 : night * night * (0.35 + 0.65 * env.forest) * (1 - env.rain) * 0.07);
    set('water', env.water * 0.12);
    set('rain', env.rain * 0.28);
    set('drone', out ? 0.1 : 0);

    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!out && day > 0.35 && env.rain < 0.4 && now >= this.next.bird) {
      this.chirp(0.05 * (0.45 + env.forest));
      this.next.bird = now + (1.3 + Math.random() * 4.5) / (0.3 + env.forest);
    }
    if (!out && night > 0.7 && env.rain < 0.5 && now >= this.next.owl) {
      this.hoot(0.05 * (0.4 + env.forest));
      this.next.owl = now + 9 + Math.random() * 14;
    }
    if (!out && env.traffic > 0.4 && day > 0.4 && now >= this.next.horn) {
      this.horn();
      this.next.horn = now + 16 + Math.random() * 30;
    }
    if (env.fire > 0.05 && now >= this.next.crackle) {
      this.crackle(env.fire);
      this.next.crackle = now + 0.04 + (Math.random() * 0.3) / env.fire;
    }
  }

  private panned(): StereoPannerNode {
    const pan = this.ctx!.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.ambient);
    return pan;
  }

  private chirp(volume: number): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + 0.02;
    const pan = this.panned();
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 2200;
    const rising = Math.random() > 0.5;
    for (let i = 0; i < notes; i++) {
      const t = start + i * (0.075 + Math.random() * 0.03);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + (rising ? i * 0.04 : -i * 0.03)), t);
      osc.frequency.exponentialRampToValueAtTime(base * (rising ? 1.28 : 0.8), t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      osc.connect(g).connect(pan);
      osc.start(t);
      osc.stop(t + 0.11);
    }
    this.stats.birds++;
  }

  private hoot(volume: number): void {
    const ctx = this.ctx!;
    const pan = this.panned();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 650;
    low.connect(pan);
    const note = (offset: number, length: number, from: number) => {
      const t = ctx.currentTime + 0.05 + offset;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.linearRampToValueAtTime(from * 0.86, t + length);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(volume, t + length * 0.25);
      g.gain.linearRampToValueAtTime(0.0001, t + length);
      osc.connect(g).connect(low);
      osc.start(t);
      osc.stop(t + length + 0.05);
    };
    note(0, 0.4, 360);
    note(0.65, 0.22, 350);
    note(0.95, 0.4, 345);
    this.stats.owls++;
  }

  private horn(): void {
    const ctx = this.ctx!;
    const pan = this.panned();
    const g = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1100;
    g.connect(low).connect(pan);
    const t = ctx.currentTime + 0.02;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.02);
    g.gain.setValueAtTime(0.012, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    for (const f of [410, 520]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
    }
    this.stats.horns++;
  }

  private burst(length: number, filterType: BiquadFilterType, freq: number, peak: number, decay: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * (this.noise.duration - length - 0.1), length);
  }

  private crackle(intensity: number): void {
    this.burst(0.04, 'bandpass', 1800 + Math.random() * 2500, 0.05 * (0.4 + intensity), 0.05, this.ambient);
    this.stats.crackles++;
  }

  /** A lightning strike at a distance in meters: a crack if it is close, then a rumble that arrives later the further away it was. */
  thunderAt(distance: number): void {
    if (!this.ctx) return;
    const loud = Math.max(0.25, Math.min(1, 1.1 - distance / 160));
    const delay = Math.min(4.5, distance / 110);
    window.setTimeout(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (distance < 70) this.burst(0.35, 'bandpass', 1100, 0.55 * loud, 0.35, this.ambient);
      this.burst(3.6, 'lowpass', 150 + (distance < 40 ? 80 : 0), 0.7 * loud, 3.4, this.ambient);
      this.stats.thunder++;
    }, delay * 1000);
  }

  // ------------------------------------------------------------ Interface sounds

  private tone(freq: number, length: number, type: OscillatorType, peak: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + length + 0.05);
    this.stats.effects++;
  }

  click(): void {
    this.tone(640, 0.05, 'sine', 0.12);
  }

  /** A purchase: two rising chimes. */
  buy(): void {
    this.tone(880, 0.12, 'triangle', 0.2);
    this.tone(1318, 0.22, 'triangle', 0.2, 0.09);
  }

  /** Something placed on the ground: a thump. */
  place(): void {
    this.tone(150, 0.14, 'sine', 0.35, 0, 55);
    if (this.ctx?.state === 'running') this.burst(0.05, 'highpass', 900, 0.12, 0.06, this.sfxBus);
  }

  remove(): void {
    if (this.ctx?.state === 'running') this.burst(0.18, 'bandpass', 700, 0.18, 0.2, this.sfxBus);
    this.tone(300, 0.15, 'sine', 0.12, 0, 120);
  }

  error(): void {
    this.tone(170, 0.16, 'sawtooth', 0.08);
  }

  /** Something finished building. */
  done(): void {
    [784, 988, 1175].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.16, i * 0.1));
  }

  // ------------------------------------------------------------ For tests

  debug(): Record<string, unknown> {
    return {
      state: this.ctx?.state ?? 'none',
      muted: this.muted,
      volume: this.volume,
      levels: { ...this.levels },
      stats: { ...this.stats },
      env: this.env,
      master: this.ctx ? this.master.gain.value : null,
    };
  }
}
