/**
 * RetroVerse Advanced Haptic & Retro Sound Feedback Service
 * Provides tactile vibration patterns and authentic 8-bit sound effects
 */

export type HapticIntensity = 'off' | 'light' | 'medium' | 'strong' | 'heartbeat';

class HapticFeedbackService {
  private intensity: HapticIntensity = 'medium';
  private soundEnabled: boolean = false;
  private audioCtx: AudioContext | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem('retroverse_haptic_intensity');
      if (saved && ['off', 'light', 'medium', 'strong', 'heartbeat'].includes(saved)) {
        this.intensity = saved as HapticIntensity;
      }
      const savedSound = localStorage.getItem('retroverse_touch_sound_enabled');
      if (savedSound !== null) {
        this.soundEnabled = savedSound === 'true';
      }
    } catch {}
  }

  public setIntensity(val: HapticIntensity) {
    this.intensity = val;
    try {
      localStorage.setItem('retroverse_haptic_intensity', val);
    } catch {}
    if (val !== 'off') {
      this.triggerButtonPress();
    }
  }

  public getIntensity(): HapticIntensity {
    return this.intensity;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem('retroverse_touch_sound_enabled', String(enabled));
    } catch {}
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  private initAudio() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * Play an authentic synthesized retro 8-bit beep / click
   */
  public playRetroSound(type: 'click' | 'dpad' | 'turbo' | 'save' | 'load' | 'achievement' | 'combo') {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'dpad') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.linearRampToValueAtTime(240, now + 0.025);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.025);
        osc.start(now);
        osc.stop(now + 0.025);
      } else if (type === 'turbo') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.03);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.03);
        osc.start(now);
        osc.stop(now + 0.03);
      } else if (type === 'save' || type === 'load') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(659, now + 0.05);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'combo') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'achievement') {
        // High-energy 8-bit fanfare arpeggio (C5 - E5 - G5 - C6)
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const noteOsc = this.audioCtx!.createOscillator();
          const noteGain = this.audioCtx!.createGain();
          noteOsc.type = 'square';
          noteOsc.frequency.setValueAtTime(freq, now + idx * 0.08);
          noteGain.gain.setValueAtTime(0.12, now + idx * 0.08);
          noteGain.gain.linearRampToValueAtTime(0.001, now + idx * 0.08 + 0.15);
          noteOsc.connect(noteGain);
          noteGain.connect(this.audioCtx!.destination);
          noteOsc.start(now + idx * 0.08);
          noteOsc.stop(now + idx * 0.08 + 0.15);
        });
      }
    } catch {}
  }

  /**
   * Dispatch vibration according to pattern and intensity
   */
  private vibrate(pattern: number | number[]) {
    if (this.intensity === 'off') return;
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

    try {
      const multiplier =
        this.intensity === 'light' ? 0.6 : this.intensity === 'medium' ? 1.0 : this.intensity === 'strong' ? 1.5 : 1.0;

      if (Array.isArray(pattern)) {
        const scaled = pattern.map((p, i) => (i % 2 === 0 ? Math.max(5, Math.round(p * multiplier)) : p));
        navigator.vibrate(scaled);
      } else {
        const scaled = Math.max(5, Math.round(pattern * multiplier));
        navigator.vibrate(scaled);
      }
    } catch {}
  }

  // --- Specialized feedback triggers ---

  public triggerButtonPress() {
    this.playRetroSound('click');
    if (this.intensity === 'heartbeat') {
      this.vibrate([12, 40, 16]);
    } else {
      this.vibrate(18);
    }
  }

  public triggerDirectionChange() {
    this.playRetroSound('dpad');
    this.vibrate(10);
  }

  public triggerSystemButton() {
    this.playRetroSound('click');
    this.vibrate([22, 50, 22]);
  }

  public triggerTurboPulse() {
    this.playRetroSound('turbo');
    this.vibrate(12);
  }

  public triggerSaveState() {
    this.playRetroSound('save');
    this.vibrate([25, 40, 35, 40, 45]);
  }

  public triggerLoadState() {
    this.playRetroSound('load');
    this.vibrate([45, 40, 35, 40, 25]);
  }

  public triggerComboExecuted() {
    this.playRetroSound('combo');
    this.vibrate([30, 40, 30, 40, 50]);
  }

  public triggerAchievementUnlocked() {
    this.playRetroSound('achievement');
    this.vibrate([50, 60, 40, 60, 70, 70, 100]);
  }
}

export const hapticFeedbackService = new HapticFeedbackService();
