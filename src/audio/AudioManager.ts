import { Game, GameState } from '../core/Game';

/**
 * Background music and SFX.
 *
 * The iPhone recording of the reference is a mid-range music-box bed in Bb
 * (G4 as the home note, then Bb, C, D, F) — not a dark healing drone.
 * Pads stay light; the melody is the thing you hear. Nature sits underneath.
 *
 * All generated in the Web Audio graph so it stays offline and tiny.
 */

/** Light Bb-family pads. Melody does the talking. */
const CHORDS: number[][] = [
  [116.54, 174.61, 233.08, 392.00],
  [155.56, 196.00, 233.08, 311.13],
  [174.61, 233.08, 261.63, 349.23],
  [196.00, 233.08, 293.66, 392.00]
];

const PHRASES: number[][] = [
  [392.00, 466.16, 523.25],
  [466.16, 392.00, 349.23],
  [392.00, 523.25, 466.16, 392.00],
  [311.13, 349.23, 392.00],
  [523.25, 466.16, 392.00],
  [349.23, 392.00, 466.16],
  [392.00, 349.23, 311.13, 349.23]
];

const MASTER = 0.9;
const SFX_BUS = 0.9;
const PAD = 0.16;
const PAD_TOWN = 0.18;
const PAD_TALK = 0.1;
const WIND = 0.035;
const WATER = 0.08;

export class AudioManager {
  private game: Game;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private isMuted: boolean = false;
  private isPlaying: boolean = false;

  private windGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padBus: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private padVoices: { oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode }[] = [];
  private lfo: OscillatorNode | null = null;
  private loops: AudioBufferSourceNode[] = [];

  private scheduler: number | null = null;
  private nextPhrase = 0;
  private nextBird = 0;
  private nextChord = 0;
  private chordIndex = 0;

  private footstepTime: number = 0;
  private footstepInterval: number = 0.32;
  private unlocked = false;
  private noiseCache: AudioBuffer | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Browsers keep AudioContext suspended until a gesture. Call this from the
   * first pointer/key so the title orbit can already carry the bed.
   */
  public unlock(): void {
    if (this.unlocked) {
      this.ensureContext();
      if (!this.isPlaying && !this.isMuted) this.startMusic();
      return;
    }
    this.unlocked = true;
    if (this.ensureContext() && !this.isMuted) this.startMusic();
  }

  private ensureContext(): boolean {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = MASTER;

        this.musicGain = this.audioContext.createGain();
        this.musicGain.connect(this.masterGain);
        this.musicGain.gain.value = 1;

        this.sfxGain = this.audioContext.createGain();
        this.sfxGain.connect(this.masterGain);
        this.sfxGain.gain.value = SFX_BUS;
      } catch {
        return false;
      }
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    return true;
  }

  public startMusic(): void {
    if (!this.ensureContext() || this.isPlaying || !this.audioContext || !this.musicGain) return;
    this.isPlaying = true;
    this.buildBed();
    const now = this.audioContext.currentTime;
    this.chordIndex = 0;
    this.nextChord = now + 20;
    this.nextPhrase = now + 1.6;
    this.nextBird = now + 10;
    this.tickScheduler();
  }

  private noiseBurst(): AudioBuffer {
    if (!this.noiseCache) this.noiseCache = this.brownBuffer(0.28);
    return this.noiseCache;
  }

  private brownBuffer(seconds: number): AudioBuffer {
    const ctx = this.audioContext!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = Math.max(-1, Math.min(1, last * 3.5));
    }
    return buffer;
  }

  private startLoop(buffer: AudioBuffer, dest: AudioNode): AudioBufferSourceNode {
    const src = this.audioContext!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(dest);
    src.start();
    this.loops.push(src);
    return src;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.audioContext!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buffer;
  }

  private buildBed(): void {
    const ctx = this.audioContext!;
    const music = this.musicGain!;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.1, 2.2);
    const verbBus = ctx.createGain();
    verbBus.gain.value = 0.7;
    reverb.connect(verbBus);
    verbBus.connect(music);

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = WIND;
    windFilter.connect(this.windGain);
    this.windGain.connect(music);
    this.startLoop(this.brownBuffer(3.2), windFilter);

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 780;
    waterFilter.Q.value = 0.7;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.0;
    waterFilter.connect(this.waterGain);
    this.waterGain.connect(music);
    this.startLoop(this.brownBuffer(2.4), waterFilter);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = PAD;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 2200;
    this.padFilter.Q.value = 0.35;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(music);
    const padWet = ctx.createGain();
    padWet.gain.value = 0.85;
    this.padFilter.connect(padWet);
    padWet.connect(reverb);

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.045;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.padBus.gain);
    this.lfo.start();

    const starters = CHORDS[0];
    this.padVoices = starters.map((freq, i) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gain = ctx.createGain();
      oscA.type = 'sine';
      oscB.type = i === 0 ? 'sine' : 'triangle';
      oscA.frequency.value = freq;
      oscB.frequency.value = freq * 1.0035;
      gain.gain.value = i === 0 ? 0.28 : 0.22 + i * 0.03;
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(this.padBus!);
      oscA.start();
      oscB.start();
      return { oscA, oscB, gain };
    });

    this.melodyBus = ctx.createGain();
    this.melodyBus.gain.value = 0.42;
    const delay = ctx.createDelay(1.6);
    delay.delayTime.value = 0.52;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.42;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2400;
    this.melodyBus.connect(delayFilter);
    delayFilter.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(reverb);
    this.melodyBus.connect(music);
    delay.connect(music);
  }

  private tickScheduler = (): void => {
    if (!this.isPlaying || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.shiftChord(now);
    this.schedulePhrase(now);
    this.scheduleBirds(now);
    this.scheduler = window.setTimeout(this.tickScheduler, 400);
  };

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(Math.random() * list.length)];
  }

  private shiftChord(now: number): void {
    if (now < this.nextChord || this.padVoices.length === 0) return;
    this.nextChord = now + 18 + Math.random() * 8;
    this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
    const chord = CHORDS[this.chordIndex];
    const t = now + 5.5;
    this.padVoices.forEach((voice, i) => {
      const f = chord[i];
      voice.oscA.frequency.linearRampToValueAtTime(f, t);
      voice.oscB.frequency.linearRampToValueAtTime(f * (1.003 + i * 0.0008), t);
    });
  }

  /** Slow piano-like phrase through delay, the "melody" layer of the bed. */
  private schedulePhrase(now: number): void {
    if (now < this.nextPhrase || !this.melodyBus) return;
    this.nextPhrase = now + 2.4 + Math.random() * 2.2;
    const phrase = this.pick(PHRASES);
    phrase.forEach((freq, i) => {
      this.mallet(freq, 0.16 - i * 0.015, 1.6, this.melodyBus!, now + i * 0.42);
    });
  }

  /** Two-note chirp, only away from town. */
  private scheduleBirds(now: number): void {
    if (now < this.nextBird || !this.musicGain || !this.audioContext) return;
    this.nextBird = now + 7 + Math.random() * 12;
    if (this.game.state === GameState.TITLE) return;
    const pos = this.game.character?.group.position;
    if (pos && this.game.planet.urbanAmount(pos) > 0.65) return;

    const ctx = this.audioContext;
    const start = 1800 + Math.random() * 900;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(start * (1.15 + Math.random() * 0.2), now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(start * 0.92, now + 0.18);
    filter.type = 'bandpass';
    filter.frequency.value = start;
    filter.Q.value = 6;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  private mallet(freq: number, peak: number, life: number, dest: AudioNode, when?: number): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(3200, freq * 5.5);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + life);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + life + 0.05);
  }

  public update(): void {
    if (!this.isPlaying || !this.waterGain || !this.windGain || !this.padBus) return;
    const ctx = this.audioContext;
    if (!ctx) return;

    let water = 0.08;
    let urban = 0.4;
    if (this.game.state !== GameState.TITLE && this.game.character) {
      const pos = this.game.character.group.position;
      water = this.game.planet.waterProximity(pos);
      urban = this.game.planet.urbanAmount(pos);
    }

    const t = ctx.currentTime + 0.08;
    this.waterGain.gain.linearRampToValueAtTime(WATER * water, t);
    this.windGain.gain.linearRampToValueAtTime(WIND * (0.75 + 0.45 * (1 - urban * 0.55)), t);
    const pad = this.game.state === GameState.DIALOGUE
      ? PAD_TALK
      : PAD + urban * (PAD_TOWN - PAD);
    this.padBus.gain.linearRampToValueAtTime(pad, t);
  }

  public setDialogue(active: boolean): void {
    if (!this.padBus || !this.audioContext) return;
    const t = this.audioContext.currentTime + 0.12;
    this.padBus.gain.linearRampToValueAtTime(active ? PAD_TALK : PAD, t);
  }

  public playJump(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBurst();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.2);

    this.mallet(196, 0.12, 0.28, this.sfxGain, now);
  }

  public playLand(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBurst();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.16);
  }

  public playFootstep(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;

    const now = this.audioContext.currentTime;
    if (now - this.footstepTime < this.footstepInterval) return;
    this.footstepTime = now;

    const noise = this.audioContext.createBufferSource();
    noise.buffer = this.noiseBurst();
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 170 + Math.random() * 80;
    filter.Q.value = 1.1;
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.2 + Math.random() * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.08);
  }

  public playPickup(): void {
    if (!this.ensureContext() || this.isMuted || !this.sfxGain) return;
    const now = this.audioContext!.currentTime;
    this.mallet(349.23, 0.22, 0.55, this.sfxGain, now);
    this.mallet(523.25, 0.18, 0.7, this.sfxGain, now + 0.09);
  }

  public playDeliver(): void {
    if (!this.ensureContext() || this.isMuted || !this.sfxGain) return;
    const now = this.audioContext!.currentTime;
    this.mallet(261.63, 0.2, 0.5, this.sfxGain, now);
    this.mallet(349.23, 0.2, 0.6, this.sfxGain, now + 0.11);
    this.mallet(466.16, 0.18, 0.85, this.sfxGain, now + 0.22);
  }

  public playDialogue(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    // The reference talk-tick lives around 110 Hz, not a mid square beep.
    osc.frequency.value = 104 + Math.random() * 18;
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.07);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;

    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : MASTER;
    }

    if (this.isMuted) {
      this.stopMusic();
    } else {
      this.startMusic();
    }

    return this.isMuted;
  }

  private stopMusic(): void {
    this.isPlaying = false;
    if (this.scheduler !== null) {
      window.clearTimeout(this.scheduler);
      this.scheduler = null;
    }
    for (const src of this.loops) {
      try { src.stop(); } catch { /* ignore */ }
    }
    this.loops = [];
    for (const voice of this.padVoices) {
      try { voice.oscA.stop(); voice.oscB.stop(); } catch { /* ignore */ }
    }
    this.padVoices = [];
    if (this.lfo) {
      try { this.lfo.stop(); } catch { /* ignore */ }
      this.lfo = null;
    }
    this.windGain = null;
    this.waterGain = null;
    this.padBus = null;
    this.padFilter = null;
    this.melodyBus = null;
  }

  public dispose(): void {
    this.stopMusic();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
