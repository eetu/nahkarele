// Every sound in both rooms, synthesized with the Web Audio API: no assets. Same shape as
// ../dice's DiceAudio. The context is created inside the first gesture (autoplay policy),
// and until then every call is a no-op: a frame loop can call freely from the first frame.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
/** The Audio Session API (Safari 17+), not yet in TypeScript's DOM types. */
type SessionNavigator = Navigator & { audioSession?: { type: string } };

const MUTE_KEY = "nahkarele:muted";

const readMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

const saveMuted = (muted: boolean) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* the mute is a convenience */
  }
};

/** Continuous sounds the frame loop holds at a level: the belt motor, the AIs' fans, the drone. */
export type BedName = "belt" | "fans" | "drone" | "wind";

/** A recording running past the head. */
export type Reel = { speed: (rate: number) => void; stop: () => void };

type Bed = {
  gain: GainNode;
  tune: (pitch: number, t: number) => void;
  level: number;
  pitch: number;
};

type Tone = {
  type?: OscillatorType;
  f0: number;
  /** Glide target, reached at the end of the sound. */
  f1?: number;
  peak: number;
  dur: number;
  attack?: number;
  cutoff?: number;
  pan?: number;
};

type Hiss = {
  filter?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  peak: number;
  dur: number;
  attack?: number;
  pan?: number;
};

/** DTMF row and column tones for the keypad. */
const DTMF: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "0": [941, 1336],
  "-": [941, 1209],
  back: [941, 1477],
};

class Sfx {
  muted = $state(readMuted());
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #beds = new Map<BedName, Bed>();

  /** The running context, or null before the first gesture and while muted or hidden. */
  #live(): AudioContext | null {
    return !this.muted && this.#ctx?.state === "running" ? this.#ctx : null;
  }

  /** Call from any user gesture: creates the context the first time, wakes it after. */
  unlock = () => {
    if (this.muted || typeof window === "undefined") return;
    if (!this.#ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -12;
      squash.ratio.value = 6;
      const master = ctx.createGain();
      master.connect(squash).connect(ctx.destination);
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.#ctx = ctx;
      this.#master = master;
      this.#noise = buf;
      // A hidden tab has no frame loop to turn the beds down, so the whole context sleeps.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) void ctx.suspend();
        else if (!this.muted) void ctx.resume();
      });
    }
    const ctx = this.#ctx;
    // iOS reports "interrupted" after a call or a trip to the background.
    if (ctx.state !== "running" && !document.hidden) {
      void ctx.resume();
      // WebKit lets a context sound only once something has started inside the gesture.
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      blip.connect(ctx.destination);
      blip.start();
    }
  };

  /**
   * iOS plays Web Audio as "ambient", which the silent switch mutes. The tape asks for
   * "playback" while it runs, as a media player would (it pauses other apps' audio); the game
   * stays ambient.
   */
  session(type: "playback" | "auto") {
    const nav = navigator as SessionNavigator;
    if (nav.audioSession) nav.audioSession.type = type;
  }

  toggleMute = () => {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.muted) void this.#ctx?.suspend();
    else this.unlock();
  };

  /** Everything at `level` of full volume: a room nobody is working in is heard from the door. */
  duck(level: number) {
    const ctx = this.#live();
    if (ctx && this.#master) this.#master.gain.setTargetAtTime(level, ctx.currentTime, 0.2);
  }

  #out(ctx: AudioContext, pan = 0): AudioNode {
    const master = this.#master as GainNode;
    if (!pan) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  #envelope(ctx: AudioContext, t: number, peak: number, attack: number, dur: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  #tone(ctx: AudioContext, t: number, o: Tone) {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = this.#envelope(ctx, t, o.peak, o.attack ?? 0.004, o.dur);
    let node: AudioNode = osc;
    if (o.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = o.cutoff;
      node = node.connect(lp);
    }
    node.connect(g).connect(this.#out(ctx, o.pan));
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  #hiss(ctx: AudioContext, t: number, o: Hiss) {
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? "bandpass";
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = this.#envelope(ctx, t, o.peak, o.attack ?? 0.003, o.dur);
    src.connect(f).connect(g).connect(this.#out(ctx, o.pan));
    src.start(t, src.loopStart);
    src.stop(t + o.dur + 0.03);
  }

  // --- beds --------------------------------------------------------------------------

  #build(ctx: AudioContext, name: BedName): Bed {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.#out(ctx, name === "fans" ? 0 : name === "belt" ? -0.2 : 0));
    const lp = ctx.createBiquadFilter();
    lp.connect(gain);
    const osc = (type: OscillatorType, f: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    };
    if (name === "belt") {
      // 50 Hz mains under a motor that whines higher as the belt is sped up.
      lp.frequency.value = 320;
      const mains = osc("sawtooth", 50);
      const motor = osc("triangle", 96);
      const mg = ctx.createGain();
      mg.gain.value = 0.5;
      mains.connect(lp);
      motor.connect(mg).connect(lp);
      return {
        gain,
        level: 0,
        pitch: 1,
        tune: (p, t) => motor.frequency.setTargetAtTime(96 * p, t, 0.3),
      };
    }
    if (name === "wind") {
      // Air through the broken window: noise in a wide band that rises as it blows harder.
      lp.type = "bandpass";
      lp.frequency.value = 320;
      lp.Q.value = 0.8;
      const src = ctx.createBufferSource();
      src.buffer = this.#noise;
      src.loop = true;
      src.connect(lp);
      src.start();
      return {
        gain,
        level: 0,
        pitch: 1,
        tune: (p, t) => lp.frequency.setTargetAtTime(320 * p, t, 0.4),
      };
    }
    if (name === "fans") {
      lp.frequency.value = 420;
      const src = ctx.createBufferSource();
      src.buffer = this.#noise;
      src.loop = true;
      src.connect(lp);
      src.start();
      return { gain, level: 0, pitch: 1, tune: () => {} };
    }
    // The drone: two detuned rotors through a band-pass, pitched by airspeed.
    lp.type = "bandpass";
    lp.frequency.value = 700;
    lp.Q.value = 2;
    const a = osc("sawtooth", 160);
    const b = osc("sawtooth", 167);
    a.connect(lp);
    b.connect(lp);
    return {
      gain,
      level: 0,
      pitch: 1,
      tune: (p, t) => {
        a.frequency.setTargetAtTime(160 * p, t, 0.08);
        b.frequency.setTargetAtTime(167 * p, t, 0.08);
      },
    };
  }

  /** Hold a continuous sound at `level` (0 silences it), retuned by `pitch` (1 = as built). */
  bed(name: BedName, level: number, pitch = 1) {
    const ctx = this.#live();
    if (!ctx) return;
    let bed = this.#beds.get(name);
    if (!bed) {
      if (level <= 0) return;
      bed = this.#build(ctx, name);
      this.#beds.set(name, bed);
    }
    const t = ctx.currentTime;
    if (Math.abs(bed.level - level) > 0.001) {
      bed.level = level;
      bed.gain.gain.setTargetAtTime(level, t, 0.15);
    }
    if (Math.abs(bed.pitch - pitch) > 0.005) {
      bed.pitch = pitch;
      bed.tune(pitch, t);
    }
  }

  // --- the factory -------------------------------------------------------------------

  /** The press comes down on a boot. */
  stamp() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: 120, f1: 50, peak: 0.55, dur: 0.18 });
    this.#hiss(ctx, t, { f0: 900, q: 1, peak: 0.22, dur: 0.06 });
    this.#hiss(ctx, t, { filter: "highpass", f0: 3500, peak: 0.08, dur: 0.02 });
  }

  /** The pass lever: a two-part metal clack. */
  lever() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#hiss(ctx, t, { f0: 2600, q: 4, peak: 0.16, dur: 0.025 });
    this.#hiss(ctx, t + 0.07, { f0: 1800, q: 4, peak: 0.13, dur: 0.03 });
    this.#tone(ctx, t + 0.07, { type: "square", f0: 320, peak: 0.03, dur: 0.03, cutoff: 1500 });
  }

  /** The gate relay closes on a boot. */
  relay(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#hiss(ctx, t, { f0: 4200, q: 3, peak: 0.06, dur: 0.015, pan });
    this.#tone(ctx, t, { type: "square", f0: 1150, peak: 0.02, dur: 0.02, pan });
  }

  /** TÄ'h reads a boot: tape motor and a run of 1978 computer blips. */
  scan(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#hiss(ctx, t, { f0: 600, q: 8, peak: 0.03, dur: 0.5, attack: 0.05, pan });
    for (let i = 0; i < 9; i++) {
      const f = 600 + Math.floor(Math.random() * 8) * 220;
      this.#tone(ctx, t + i * 0.055, {
        type: "square",
        f0: f,
        peak: 0.025,
        dur: 0.04,
        cutoff: 3000,
        pan,
      });
    }
  }

  /** TÄ'h changed the relay's call: up for a caught miss, down for an undone stamp. */
  chime(caught: boolean, pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const [a, b] = caught ? [880, 1320] : [1320, 880];
    this.#tone(ctx, t, { f0: a, peak: 0.07, dur: 0.22, pan });
    this.#tone(ctx, t + 0.11, { f0: b, peak: 0.07, dur: 0.3, pan });
  }

  /** A reject goes into the shredder. */
  shred(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const f of [52, 57]) {
      this.#tone(ctx, t, {
        type: "sawtooth",
        f0: f,
        f1: f * 0.8,
        peak: 0.12,
        dur: 0.45,
        cutoff: 700,
        pan,
      });
    }
    this.#hiss(ctx, t, { f0: 1300, f1: 500, q: 1, peak: 0.12, dur: 0.4, attack: 0.02, pan });
  }

  /** Something lands on the factory floor: rubber flops, phones clack. */
  flop(rubber: boolean, pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (rubber) {
      this.#tone(ctx, t, { f0: 95, f1: 48, peak: 0.32, dur: 0.15, pan });
      this.#hiss(ctx, t, { filter: "lowpass", f0: 650, peak: 0.14, dur: 0.07, pan });
    } else {
      this.#hiss(ctx, t, { f0: 2600, q: 2, peak: 0.18, dur: 0.04, pan });
      this.#tone(ctx, t, { type: "triangle", f0: 420, peak: 0.08, dur: 0.05, pan });
      this.#hiss(ctx, t + 0.09, { f0: 3000, q: 2, peak: 0.06, dur: 0.03, pan });
    }
  }

  /** A floor bot picks something up: a short servo whirr. */
  whirr(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, {
      type: "sawtooth",
      f0: 210,
      f1: 430,
      peak: 0.035,
      dur: 0.18,
      cutoff: 1200,
      pan,
    });
  }

  /** The shift whistle: a steam chord with a little air in it. */
  whistle() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const hold = 1.3;
    for (const f of [440, 554, 659]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 0.94, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
      g.gain.setValueAtTime(0.05, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.35);
      osc.connect(g).connect(this.#out(ctx));
      osc.start(t);
      osc.stop(t + hold + 0.4);
    }
    this.#hiss(ctx, t, { f0: 2200, q: 0.8, peak: 0.05, dur: hold + 0.3, attack: 0.08 });
  }

  /** Back from the toilet: handle, rush, gurgle, drain, the cistern refilling, the door. */
  flush() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    // The handle.
    this.#hiss(ctx, t, { f0: 1400, q: 3, peak: 0.12, dur: 0.04 });
    this.#tone(ctx, t, { f0: 180, f1: 120, peak: 0.12, dur: 0.08 });
    // The rush: a wide band of water swelling in, then the swirl draining down.
    const rush = t + 0.08;
    this.#hiss(ctx, rush, { f0: 900, q: 0.5, peak: 0.34, dur: 0.9, attack: 0.25 });
    this.#hiss(ctx, rush + 0.5, {
      filter: "lowpass",
      f0: 2600,
      f1: 280,
      q: 0.8,
      peak: 0.3,
      dur: 1.7,
      attack: 0.1,
    });
    for (let i = 0; i < 16; i++) {
      const at = rush + 0.3 + Math.random() * 1.6;
      const f = 180 + Math.random() * 280;
      this.#tone(ctx, at, { f0: f, f1: f * 2, peak: 0.07, dur: 0.07 + Math.random() * 0.08 });
    }
    // The cistern filling again, thin and patient.
    this.#hiss(ctx, rush + 1.7, { f0: 2400, q: 6, peak: 0.05, dur: 2.4, attack: 0.4 });
    this.door(t + 2.6);
  }

  /** A door shutting: thud and latch. */
  door(at?: number) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    this.#tone(ctx, t, { f0: 85, f1: 45, peak: 0.3, dur: 0.2 });
    this.#hiss(ctx, t + 0.02, { f0: 1900, q: 3, peak: 0.08, dur: 0.03 });
  }

  // --- the office --------------------------------------------------------------------

  /** An AI sends a message: a modem handshake from its side of the room. */
  send(pan: number, quiet = false) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = quiet ? 0.5 : 1;
    this.#tone(ctx, t, {
      type: "square",
      f0: 1100,
      f1: 2300,
      peak: 0.03 * v,
      dur: 0.06,
      cutoff: 3500,
      pan,
    });
    for (let i = 0; i < 4; i++) {
      this.#tone(ctx, t + 0.07 + i * 0.025, {
        type: "square",
        f0: i % 2 ? 1270 : 1070,
        peak: 0.025 * v,
        dur: 0.022,
        cutoff: 3000,
        pan,
      });
    }
  }

  /** The receiving AI takes a message in. */
  receive(pan: number) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, {
      type: "square",
      f0: 820,
      f1: 560,
      peak: 0.025,
      dur: 0.07,
      cutoff: 2000,
      pan,
    });
  }

  /** An envelope lands in the tray. */
  land() {
    const ctx = this.#live();
    if (!ctx) return;
    this.#hiss(ctx, ctx.currentTime, { f0: 1500, q: 0.7, peak: 0.08, dur: 0.05, pan: 0.1 });
  }

  /** An envelope slides off the desk and flutters down. */
  flutter(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      this.#hiss(ctx, t + i * 0.07, {
        f0: 2200 - i * 200,
        q: 1.5,
        peak: 0.05 - i * 0.008,
        dur: 0.05,
        pan,
      });
    }
    this.#hiss(ctx, t + 0.4, { f0: 900, q: 0.8, peak: 0.07, dur: 0.05, pan });
  }

  /** A keypad press, in DTMF. */
  key(k: string) {
    const ctx = this.#live();
    const pair = DTMF[k];
    if (!ctx || !pair) return;
    const t = ctx.currentTime;
    for (const f of pair) this.#tone(ctx, t, { f0: f, peak: 0.035, dur: 0.09, attack: 0.002 });
  }

  /** The desk's response to an answer. */
  verdict(right: boolean) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (right) {
      this.#tone(ctx, t, { type: "square", f0: 660, peak: 0.05, dur: 0.06, cutoff: 2400 });
      this.#tone(ctx, t + 0.07, { type: "square", f0: 990, peak: 0.05, dur: 0.1, cutoff: 2400 });
    } else {
      this.#tone(ctx, t, { type: "sawtooth", f0: 140, peak: 0.08, dur: 0.28, cutoff: 900 });
    }
  }

  /** The big ok button: a plastic clunk with a ding on top. */
  ok() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: 230, f1: 170, peak: 0.25, dur: 0.12 });
    this.#hiss(ctx, t, { f0: 1200, q: 1.5, peak: 0.08, dur: 0.03 });
    this.#tone(ctx, t + 0.02, { f0: 1760, peak: 0.04, dur: 0.35 });
  }

  /** The blast on the horizon. It is far away: the sound arrives a second after the light. */
  blast() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime + 1.1;
    this.#tone(ctx, t, { f0: 58, f1: 24, peak: 0.8, dur: 3, attack: 0.04 });
    this.#hiss(ctx, t, {
      filter: "lowpass",
      f0: 1100,
      f1: 70,
      q: 0.5,
      peak: 0.9,
      dur: 3.4,
      attack: 0.03,
    });
    // The window rattling in its frame.
    for (let i = 0; i < 14; i++) {
      this.#hiss(ctx, t + 0.15 + i * 0.045 + Math.random() * 0.02, {
        f0: 3200,
        q: 6,
        peak: 0.05 * (1 - i / 14),
        dur: 0.02,
      });
    }
  }

  /** The bird on the jar. */
  chirp() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const f = 3000 + Math.random() * 600;
      this.#tone(ctx, t + i * 0.09, { f0: f, f1: f * 1.35, peak: 0.03, dur: 0.06, attack: 0.005 });
    }
  }

  /** A swallow going over: a quick twitter of rising vit-vit notes. */
  twitter(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const f = 4600 + Math.random() * 900;
      this.#tone(ctx, t + i * 0.075, {
        f0: f,
        f1: f * 1.25,
        peak: 0.022,
        dur: 0.035,
        attack: 0.003,
        pan,
      });
    }
  }

  /** The tit in spring: its ti-ti-tyy, two quick high notes and a longer lower one. */
  song() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [at, f, dur] of [
      [0, 5400, 0.05],
      [0.13, 5400, 0.05],
      [0.26, 4100, 0.16],
    ]) {
      this.#tone(ctx, t + at, { f0: f, f1: f * 0.97, peak: 0.035, dur, attack: 0.005 });
    }
  }

  /** The tit scared off the lid: a sharp chink-chink. */
  alarm() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this.#tone(ctx, t + i * 0.11, { f0: 4600, f1: 4200, peak: 0.04, dur: 0.04, attack: 0.002 });
    }
  }

  /** The hooded crow: a hoarse, falling "kraa", the throat in it as much as the voice. */
  caw(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 520 + Math.random() * 60;
    this.#tone(ctx, t, {
      type: "sawtooth",
      f0: f,
      f1: f * 0.8,
      peak: 0.05,
      dur: 0.34,
      attack: 0.02,
      cutoff: 1400,
      pan,
    });
    this.#hiss(ctx, t, {
      filter: "bandpass",
      f0: 1300,
      f1: 1000,
      q: 3,
      peak: 0.05,
      dur: 0.32,
      attack: 0.02,
      pan,
    });
  }

  /** The owl in the tallest tree: two soft notes, the second lower. */
  hoot() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: 420, f1: 380, peak: 0.06, dur: 0.3, attack: 0.06, cutoff: 900 });
    this.#tone(ctx, t + 0.38, {
      f0: 380,
      f1: 320,
      peak: 0.07,
      dur: 0.5,
      attack: 0.08,
      cutoff: 900,
    });
  }

  /** A shaken apple tree: a dry rustle of leaves. */
  rustle() {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      this.#hiss(ctx, t + i * 0.035 + Math.random() * 0.02, {
        f0: 2600 + Math.random() * 1800,
        q: 1.2,
        peak: 0.05 * (1 - i / 12),
        dur: 0.05,
      });
    }
  }

  /** An apple landing in the grass. */
  apple(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: 150, f1: 90, peak: 0.16, dur: 0.12, pan });
    this.#hiss(ctx, t, { filter: "lowpass", f0: 900, peak: 0.06, dur: 0.05, pan });
  }

  /** A piece of wall hitting the floor; `big` for something that hung on it. */
  crumble(pan = 0, big = false) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: big ? 110 : 160, f1: 60, peak: big ? 0.2 : 0.1, dur: 0.18, pan });
    this.#hiss(ctx, t, {
      filter: "lowpass",
      f0: 1400,
      f1: 400,
      peak: big ? 0.1 : 0.05,
      dur: 0.22,
      pan,
    });
    // Grit settling after it.
    this.#hiss(ctx, t + 0.08, { filter: "bandpass", f0: 2600, q: 2, peak: 0.02, dur: 0.3, pan });
  }

  /** A dead branch landing on the floor: a dry tick and a soft knock. */
  twig(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#hiss(ctx, t, {
      filter: "bandpass",
      f0: 2200 + Math.random() * 800,
      q: 5,
      peak: 0.05,
      dur: 0.03,
      pan,
    });
    this.#tone(ctx, t + 0.01, { f0: 220, f1: 120, peak: 0.05, dur: 0.08, pan });
  }

  /** A dead tree going over: the wood cracking at its foot, then the crash as it lands. */
  timber(kind: "crack" | "crash", pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === "crack") {
      // Fibres giving, one after another, and the long groan of the trunk leaning.
      for (let i = 0; i < 7; i++) {
        this.#hiss(ctx, t + i * 0.07 + Math.random() * 0.04, {
          filter: "bandpass",
          f0: 900 + Math.random() * 900,
          q: 4,
          peak: 0.08 * (1 - i / 9),
          dur: 0.04,
          pan,
        });
      }
      this.#tone(ctx, t + 0.2, {
        type: "sawtooth",
        f0: 90,
        f1: 60,
        peak: 0.04,
        dur: 1.6,
        attack: 0.4,
        cutoff: 500,
        pan,
      });
      return;
    }
    this.#tone(ctx, t, { f0: 70, f1: 30, peak: 0.35, dur: 0.6, attack: 0.01, pan });
    this.#hiss(ctx, t, { filter: "lowpass", f0: 1800, f1: 200, peak: 0.16, dur: 0.7, pan });
    // The branches snapping under it, and settling.
    for (let i = 0; i < 6; i++) {
      this.#hiss(ctx, t + 0.04 + i * 0.06 + Math.random() * 0.05, {
        filter: "bandpass",
        f0: 1600 + Math.random() * 1400,
        q: 3,
        peak: 0.05 * (1 - i / 8),
        dur: 0.03,
        pan,
      });
    }
  }

  /** A beak on a glass lid. */
  peck() {
    const ctx = this.#live();
    if (!ctx) return;
    this.#hiss(ctx, ctx.currentTime, { f0: 5200, q: 8, peak: 0.05, dur: 0.012 });
  }

  // --- the orientation tape ----------------------------------------------------------

  #tapes = new Map<string, Promise<AudioBuffer | null>>();

  /** Fetch and decode a recording, once per url. Null without sound or on any failure. */
  load(url: string): Promise<AudioBuffer | null> {
    const ctx = this.#ctx;
    if (!ctx) return Promise.resolve(null);
    let tape = this.#tapes.get(url);
    if (!tape) {
      tape = fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
        .then((bytes) => ctx.decodeAudioData(bytes))
        .catch(() => null);
      this.#tapes.set(url, tape);
    }
    return tape;
  }

  /**
   * Thread `buffer` past the head from `offset` seconds. The caller sets the capstan speed
   * every frame (1 = play, easing to 0 as the reels coast), so starts and stops slur the way a
   * deck's do. Wow and flutter ride on top, and the tape hisses while it moves.
   */
  reel(buffer: AudioBuffer, offset: number): Reel | null {
    const ctx = this.#live();
    if (!ctx || offset >= buffer.duration) return null;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.0001;
    const wobble = ctx.createGain();
    wobble.gain.value = 0;
    wobble.connect(src.playbackRate);
    const lfos = [
      [0.55, 0.004],
      [6.8, 0.0015],
    ].map(([f, depth]) => {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(wobble);
      lfo.start(t);
      return lfo;
    });
    // A cheap speaker: no lows, no sparkle.
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1600;
    band.Q.value = 0.35;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(band).connect(gain).connect(this.#out(ctx));
    src.start(t, offset);

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.#noise;
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4000;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    hiss.connect(hp).connect(hg).connect(this.#out(ctx));
    hiss.start(t);

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      for (const node of [src, hiss, ...lfos]) node.stop();
    };
    src.onended = stop;
    return {
      speed: (rate: number) => {
        if (stopped) return;
        const now = ctx.currentTime;
        // Below a crawl the wobble would run the tape backwards; a stalled capstan is silent.
        if (rate < 0.02) {
          src.playbackRate.setTargetAtTime(0.0001, now, 0.01);
          wobble.gain.setTargetAtTime(0, now, 0.01);
        } else {
          src.playbackRate.setTargetAtTime(rate, now, 0.02);
          wobble.gain.setTargetAtTime(rate, now, 0.02);
        }
        hg.gain.setTargetAtTime(0.002 * rate, now, 0.05);
      },
      stop,
    };
  }

  // --- fireworks ---------------------------------------------------------------------

  launch(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    this.#hiss(ctx, ctx.currentTime, {
      f0: 900,
      f1: 3800,
      q: 6,
      peak: 0.025,
      dur: 0.5,
      attack: 0.1,
      pan,
    });
  }

  pop(pan = 0) {
    const ctx = this.#live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#tone(ctx, t, { f0: 110, f1: 40, peak: 0.3, dur: 0.25, pan });
    this.#hiss(ctx, t, { filter: "lowpass", f0: 2500, f1: 300, peak: 0.25, dur: 0.3, pan });
    for (let i = 0; i < 8; i++) {
      this.#hiss(ctx, t + 0.15 + Math.random() * 0.5, {
        filter: "highpass",
        f0: 4000,
        peak: 0.03,
        dur: 0.01,
        pan: pan + (Math.random() - 0.5) * 0.4,
      });
    }
  }
}

export const sfx = new Sfx();

/** Stereo position for a scene x, kept off the hard edges. */
export const panOf = (x: number, width: number): number => ((x / width) * 2 - 1) * 0.7;
