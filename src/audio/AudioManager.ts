import { Game } from '../core/Game';

export class AudioManager {
  private game: Game;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  
  private isMuted: boolean = false;
  private musicOscillators: OscillatorNode[] = [];
  private musicGains: GainNode[] = [];
  private isPlaying: boolean = false;
  
  private footstepTime: number = 0;
  private footstepInterval: number = 0.35;

  constructor(game: Game) {
    this.game = game;
  }

  private ensureContext(): boolean {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = 0.5;
        
        this.musicGain = this.audioContext.createGain();
        this.musicGain.connect(this.masterGain);
        this.musicGain.gain.value = 0.15;
        
        this.sfxGain = this.audioContext.createGain();
        this.sfxGain.connect(this.masterGain);
        this.sfxGain.gain.value = 0.4;
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
    this.playAmbientMusic();
  }

  private playAmbientMusic(): void {
    if (!this.audioContext || !this.musicGain) return;
    
    this.musicOscillators.forEach(osc => {
      try { osc.stop(); } catch { /* ignore */ }
    });
    this.musicOscillators = [];
    this.musicGains = [];
    
    const baseFreq = 220;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    
    const playChord = (noteIndices: number[], duration: number, startTime: number) => {
      noteIndices.forEach(noteIdx => {
        const freq = baseFreq * Math.pow(2, scale[noteIdx % scale.length] / 12 + Math.floor(noteIdx / scale.length));
        
        const osc = this.audioContext!.createOscillator();
        const gain = this.audioContext!.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        osc.connect(gain);
        gain.connect(this.musicGain!);
        
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.1);
        gain.gain.setValueAtTime(0.15, startTime + duration - 0.3);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
        
        this.musicOscillators.push(osc);
        this.musicGains.push(gain);
      });
    };
    
    const chordProgression = [
      [0, 2, 4],
      [3, 5, 7],
      [4, 6, 8],
      [2, 4, 6],
      [0, 2, 4],
      [5, 7, 9],
      [3, 5, 7],
      [0, 2, 4]
    ];
    
    const chordDuration = 4;
    const now = this.audioContext.currentTime;
    
    chordProgression.forEach((chord, i) => {
      playChord(chord, chordDuration, now + i * chordDuration);
    });
    
    const totalDuration = chordProgression.length * chordDuration;
    setTimeout(() => {
      if (this.isPlaying && !this.isMuted) {
        this.playAmbientMusic();
      }
    }, totalDuration * 1000 - 500);
  }

  public playJump(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.2);
  }

  public playLand(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.15);
  }

  public playFootstep(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const now = this.audioContext.currentTime;
    if (now - this.footstepTime < this.footstepInterval) return;
    this.footstepTime = now;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.type = 'triangle';
    osc.frequency.value = 80 + Math.random() * 40;
    
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start();
    osc.stop(now + 0.08);
  }

  public playPickup(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const now = this.audioContext.currentTime;
    
    [0, 0.1, 0.2].forEach((delay, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = 440 * Math.pow(1.25, i);
      
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
      
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      
      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });
  }

  public playDeliver(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const now = this.audioContext.currentTime;
    
    [0, 0.08, 0.16, 0.24, 0.32].forEach((delay, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = 523.25 * Math.pow(1.122, i);
      
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.2);
      
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  }

  public playDialogue(): void {
    if (!this.ensureContext() || this.isMuted || !this.audioContext || !this.sfxGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'square';
    osc.frequency.value = 300;
    
    gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.05);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : 0.5;
    }
    
    if (this.isMuted) {
      this.stopMusic();
    } else if (this.game.state !== 0) {
      this.startMusic();
    }
    
    return this.isMuted;
  }

  private stopMusic(): void {
    this.isPlaying = false;
    this.musicOscillators.forEach(osc => {
      try { osc.stop(); } catch { /* ignore */ }
    });
    this.musicOscillators = [];
    this.musicGains = [];
  }

  public dispose(): void {
    this.stopMusic();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
