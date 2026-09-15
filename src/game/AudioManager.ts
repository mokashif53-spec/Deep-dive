import { SaveManager } from "./SaveManager";

/**
 * AudioManager
 * ------------
 * Everything is synthesized with the Web Audio API - no external assets.
 * - Music: a looping, scheduled underwater arcade track (pad + bass + pluck arp + soft drums)
 * - SFX: short synthesized cues.
 * Music scheduling uses a look-ahead scheduler so it stays perfectly in time and
 * can be paused / resumed exactly where it left off.
 */

type SfxName =
  | "bubble"
  | "coin"
  | "pearl"
  | "eat"
  | "boostStart"
  | "boostEnd"
  | "hitRock"
  | "hitCoral"
  | "hitJelly"
  | "hitShark"
  | "smash"
  | "death"
  | "gameOver"
  | "click"
  | "retry"
  | "danger";

const BPM = 112;
const SIXTEENTH = 60 / BPM / 4;

// Chord progression (MIDI note numbers). 2 bars per chord, 8 bars loop.
// D minor:  Dm9 | Bbmaj7 | Fmaj7 | Csus2  -> adventurous, mysterious
const CHORDS: number[][] = [
  [50, 57, 60, 64, 69], // D  A  C  E  A
  [46, 53, 57, 60, 65], // Bb F  A  C  F
  [41, 48, 52, 57, 60], // F  C  E  A  C
  [48, 55, 59, 62, 67], // C  G  B  D  G
];
const ARP_PATTERNS = [
  [0, 2, 3, 4, 3, 2, 1, 2, 0, 2, 3, 4, 3, 4, 3, 2],
  [4, 3, 2, 3, 4, 2, 1, 2, 4, 3, 2, 3, 0, 2, 3, 4],
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private delay!: DelayNode;
  private musicOn = SaveManager.getMusic();
  private soundOn = SaveManager.getSound();

  // scheduler
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private musicPlaying = false;

  get isMusicOn() {
    return this.musicOn;
  }
  get isSoundOn() {
    return this.soundOn;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // Gentle "underwater" low-pass on everything
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    this.master.connect(lp).connect(ctx.destination);

    // Reverb (generated impulse response)
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.2, 2.6);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.28;
    conv.connect(revGain).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 1 : 0;
    this.musicBus.connect(this.master);
    this.musicBus.connect(conv);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.soundOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    const sfxRev = ctx.createGain();
    sfxRev.gain.value = 0.5;
    this.sfxBus.connect(sfxRev).connect(conv);

    // Dotted-eighth feedback delay for the pluck arp
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = SIXTEENTH * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 1800;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.5;
    this.delay.connect(dOut).connect(this.musicBus);
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ---------------- Settings ----------------
  setMusic(on: boolean) {
    this.musicOn = on;
    SaveManager.setMusic(on);
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setSound(on: boolean) {
    this.soundOn = on;
    SaveManager.setSound(on);
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  // ---------------- Music ----------------
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.tick();
  }
  stopMusic() {
    this.musicPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  /** Freeze music exactly (used by the pause menu). */
  pauseAll() {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  }
  resumeAll() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  private tick = () => {
    if (!this.ctx || !this.musicPlaying) return;
    const lookahead = 0.25;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += SIXTEENTH;
      this.step = (this.step + 1) % (16 * 32); // 32 bar cycle
    }
    this.timer = window.setTimeout(this.tick, 60);
  };

  private scheduleStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const section = Math.floor(bar / 8) % 4; // 4 sections of 8 bars

    // --- Pad: hold chord at start of each chord change (2 bars)
    if (s16 === 0 && bar % 2 === 0) {
      const dur = SIXTEENTH * 32;
      for (let i = 1; i < 4; i++) this.pad(mtof(chord[i]), t, dur, 0.045);
      this.pad(mtof(chord[0] + 12), t, dur, 0.03);
    }

    // --- Bass: root on 1, octave on the "and" of 2, fifth on 4
    if (s16 === 0) this.bass(mtof(chord[0] - 12), t, SIXTEENTH * 6, 0.22);
    if (s16 === 6) this.bass(mtof(chord[0]), t, SIXTEENTH * 2, 0.14);
    if (s16 === 10) this.bass(mtof(chord[0] - 12), t, SIXTEENTH * 4, 0.18);
    if (s16 === 14 && section >= 1) this.bass(mtof(chord[1] - 12), t, SIXTEENTH * 2, 0.12);

    // --- Pluck arp: sections 1,2,3 (intro section is calmer)
    if (section !== 0 || bar >= 4) {
      const pat = ARP_PATTERNS[section % 2];
      const dense = section >= 2;
      if (dense || s16 % 2 === 0) {
        const idx = pat[s16];
        const note = chord[idx] + 12 + (idx === 4 && section === 3 ? 12 : 0);
        this.pluck(mtof(note), t, 0.05 + (s16 % 4 === 0 ? 0.02 : 0));
      }
    }
    // --- Melody accents (long notes) in section 2 & 3
    if (section >= 2 && bar % 2 === 1 && s16 === 8) {
      this.lead(mtof(chord[3] + 12), t, SIXTEENTH * 6, 0.05);
    }
    if (section === 3 && bar % 2 === 0 && s16 === 12) {
      this.lead(mtof(chord[2] + 12), t, SIXTEENTH * 4, 0.045);
    }

    // --- Drums (soft): kick on 1 & 3, subtle hats on offbeats, snare-ish on 3 in later sections
    if (section >= 1) {
      if (s16 === 0 || s16 === 8) this.kick(t, 0.3);
      if (s16 === 14 && bar % 2 === 1) this.kick(t, 0.18);
      if (s16 % 4 === 2) this.hat(t, 0.045);
      if (section >= 2 && s16 === 8) this.snare(t, 0.09);
    }
  }

  private pad(freq: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.2);
    g.gain.setValueAtTime(vol, t + dur - 1.0);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1100, t + dur / 2);
    f.frequency.linearRampToValueAtTime(500, t + dur);
    g.connect(f).connect(this.musicBus);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
  }

  private bass(freq: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private pluck(freq: number, t: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o2.connect(g2).connect(f);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.4);
    o2.stop(t + 0.4);
  }

  private lead(freq: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.value = 4;
    lfo.connect(lg).connect(o.detune);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseBuffer: AudioBuffer | null = null;
  private noise(t: number, dur: number, vol: number, filterFreq: number, type: BiquadFilterType, bus: GainNode) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
    return g;
  }
  private hat(t: number, vol: number) {
    this.noise(t, 0.05, vol, 7000, "highpass", this.musicBus);
  }
  private snare(t: number, vol: number) {
    this.noise(t, 0.14, vol, 1800, "bandpass", this.musicBus);
  }

  // ---------------- SFX ----------------
  private tone(
    freqA: number,
    freqB: number,
    dur: number,
    vol: number,
    type: OscillatorType = "sine",
    delay = 0
  ) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(name: SfxName) {
    if (!this.ctx || !this.soundOn) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    switch (name) {
      case "bubble":
        this.tone(600, 1300, 0.12, 0.12, "sine");
        break;
      case "coin":
        this.tone(1320, 1320, 0.08, 0.14, "square");
        this.tone(1760, 1760, 0.22, 0.12, "square", 0.07);
        break;
      case "pearl":
        [1568, 1976, 2637, 3136].forEach((f, i) => this.tone(f, f, 0.5, 0.1, "sine", i * 0.07));
        this.tone(4186, 4186, 0.7, 0.05, "triangle", 0.3);
        break;
      case "eat":
        this.noise(now, 0.09, 0.25, 1200, "bandpass", this.sfxBus);
        this.tone(420, 180, 0.12, 0.18, "triangle");
        this.tone(900, 1400, 0.1, 0.06, "sine", 0.08);
        break;
      case "boostStart": {
        this.tone(220, 880, 0.45, 0.16, "sawtooth");
        this.tone(440, 1760, 0.45, 0.08, "triangle");
        const n = this.noise(now, 0.7, 0.2, 1200, "bandpass", this.sfxBus);
        n.gain.setValueAtTime(0.02, now);
        n.gain.linearRampToValueAtTime(0.25, now + 0.3);
        n.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        break;
      }
      case "boostEnd":
        this.tone(880, 330, 0.35, 0.1, "triangle");
        this.tone(660, 220, 0.4, 0.06, "sine", 0.05);
        break;
      case "hitRock":
        this.noise(now, 0.25, 0.5, 400, "lowpass", this.sfxBus);
        this.tone(110, 40, 0.3, 0.4, "sine");
        break;
      case "hitCoral":
        this.noise(now, 0.2, 0.4, 2500, "bandpass", this.sfxBus);
        this.tone(200, 60, 0.25, 0.3, "triangle");
        break;
      case "hitJelly":
        this.tone(900, 120, 0.4, 0.25, "sawtooth");
        this.noise(now, 0.3, 0.2, 3000, "highpass", this.sfxBus);
        break;
      case "hitShark":
        this.noise(now, 0.3, 0.5, 700, "lowpass", this.sfxBus);
        this.tone(160, 50, 0.35, 0.4, "square");
        break;
      case "smash":
        this.noise(now, 0.18, 0.45, 1500, "bandpass", this.sfxBus);
        this.tone(300, 80, 0.2, 0.3, "triangle");
        this.tone(1200, 2400, 0.12, 0.08, "sine", 0.05);
        break;
      case "death":
        this.tone(440, 110, 0.9, 0.18, "triangle", 0.1);
        this.tone(330, 82, 0.9, 0.12, "sine", 0.15);
        break;
      case "gameOver":
        [220, 196, 174.6].forEach((f, i) => this.tone(f, f, 0.6, 0.12, "triangle", i * 0.22));
        this.tone(146.8, 146.8, 1.2, 0.14, "sine", 0.66);
        break;
      case "click":
        this.tone(900, 700, 0.06, 0.1, "square");
        break;
      case "retry":
        this.tone(523, 784, 0.15, 0.12, "triangle");
        this.tone(784, 1046, 0.2, 0.1, "triangle", 0.1);
        break;
      case "danger":
        this.tone(110, 95, 0.5, 0.16, "sawtooth");
        this.tone(165, 150, 0.5, 0.1, "square", 0.25);
        this.noise(now, 0.6, 0.08, 300, "lowpass", this.sfxBus);
        break;
    }
  }
}

export const Audio = new AudioManagerImpl();
