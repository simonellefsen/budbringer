import { Game, GameState } from '../core/Game';

/**
 * Ambient bed and SFX, written to sit like the Messenger reference:
 * almost-whispered, dark, and more weather than song.
 *
 * The old loop marched major-pentatonic sine chords every four seconds and
 * used square-wave beeps for everything else, which read as a toy keyboard
 * sitting on top of the picture. The reference is the opposite: a warm
 * Bb-centred pad under brown wind, almost no air above 2 kHz, and SFX that
 * are short, filtered, and sparse.
 *
 * All of it is still generated in the Web Audio graph — no sample bank —
 * so it stays offline and tiny.
 */

const BB_PENTATONIC = [116.54, 130.81, 146.83, 174.61, 196.0, 233.08, 261.63, 293.66, 349.23, 392.0, 466.16];

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
  private padVoices: { oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode }[] = [];
  private loops: AudioBufferSourceNode[] = [];

  private scheduler: number | null = null;
  private nextSparkle = 0;
  private nextBird = 0;
  private nextPadShift = 0;

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
        this.masterGain.gain.value = 0.42;

        this.musicGain = this.audioContext.createGain();
        this.musicGain.connect(this.masterGain);
        this.musicGain.gain.value = 1;

        this.sfxGain = this.audioContext.createGain();
        this.sfxGain.connect(this.masterGain);
        this.sfxGain.gain.value = 0.55;
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
    this.nextSparkle = now + 3 + Math.random() * 4;
    this.nextBird = now + 6 + Math.random() * 8;
    this.nextPadShift = now + 11;
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

  private buildBed(): void {
    const ctx = this.audioContext!;
    const music = this.musicGain!;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.045;
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
    this.padBus.gain.value = 0.07;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 920;
    this.padFilter.Q.value = 0.4;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(music);

    // Three sustained, slightly detuned voices. They retune; they do not restart.
    const starters = [116.54, 233.08, 392.0];
    this.padVoices = starters.map((freq, i) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gain = ctx.createGain();
      oscA.type = 'sine';
      oscB.type = 'triangle';
      oscA.frequency.value = freq;
      oscB.frequency.value = freq * 1.004;
      gain.gain.value = 0.22 + i * 0.04;
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(this.padBus!);
      oscA.start();
      oscB.start();
      return { oscA, oscB, gain };
    });
  }

  private tickScheduler = (): void => {
    if (!this.isPlaying || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.scheduleSparkles(now);
    this.scheduleBirds(now);
    this.shiftPad(now);
    this.scheduler = window.setTimeout(this.tickScheduler, 400);
  };

  private pick(list: number[]): number {
    return list[Math.floor(Math.random() * list.length)];
  }

  private shiftPad(now: number): void {
    if (now < this.nextPadShift || this.padVoices.length === 0) return;
    this.nextPadShift = now + 10 + Math.random() * 8;
    const low = this.pick(BB_PENTATONIC.slice(0, 4));
    const mid = this.pick(BB_PENTATONIC.slice(3, 8));
    const high = this.pick(BB_PENTATONIC.slice(6));
    const freqs = [low, mid, high];
    this.padVoices.forEach((voice, i) => {
      const f = freqs[i];
      const t = now + 2.8;
      voice.oscA.frequency.linearRampToValueAtTime(f, t);
      voice.oscB.frequency.linearRampToValueAtTime(f * (1.003 + i * 0.001), t);
    });
  }

  /** Occasional high pentatonic tap — a distant kalimba, not a melody. */
  private scheduleSparkles(now: number): void {
    if (now < this.nextSparkle || !this.musicGain) return;
    this.nextSparkle = now + 4.5 + Math.random() * 7;
    const freq = this.pick(BB_PENTATONIC.slice(6));
    this.mallet(freq, 0.028, 1.8, this.musicGain, now);
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
    gain.gain.linearRampToValueAtTime(0.018, now + 0.02);
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
    filter.frequency.value = Math.min(1800, freq * 3.2);
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
    this.waterGain.gain.linearRampToValueAtTime(0.055 * water, t);
    this.windGain.gain.linearRampToValueAtTime(0.032 + 0.028 * (1 - urban * 0.6), t);
    // Town is a little more pad, countryside a little more air.
    this.padBus.gain.linearRampToValueAtTime(0.055 + urban * 0.025, t);
  }

  public setDialogue(active: boolean): void {
    if (!this.padBus || !this.audioContext) return;
    const t = this.audioContext.currentTime + 0.12;
    this.padBus.gain.linearRampToValueAtTime(active ? 0.03 : 0.065, t);
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
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.2);

    this.mallet(196, 0.05, 0.28, this.sfxGain, now);
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
    gain.gain.setValueAtTime(0.16, now);
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
    gain.gain.setValueAtTime(0.07 + Math.random() * 0.025, now);
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
    this.mallet(349.23, 0.09, 0.55, this.sfxGain, now);
    this.mallet(523.25, 0.07, 0.7, this.sfxGain, now + 0.09);
  }

  public playDeliver(): void {
    if (!this.ensureContext() || this.isMuted || !this.sfxGain) return;
    const now = this.audioContext!.currentTime;
    this.mallet(261.63, 0.08, 0.5, this.sfxGain, now);
    this.mallet(349.23, 0.08, 0.6, this.sfxGain, now + 0.11);
    this.mallet(466.16, 0.07, 0.85, this.sfxGain, now + 0.22);
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
    gain.gain.setValueAtTime(0.09, now);
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
      this.masterGain.gain.value = this.isMuted ? 0 : 0.42;
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
    this.windGain = null;
    this.waterGain = null;
    this.padBus = null;
    this.padFilter = null;
  }

  public dispose(): void {
    this.stopMusic();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
