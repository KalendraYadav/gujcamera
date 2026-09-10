// ==============================================================================
// Alert Audio Notifier (Web Audio API Synthesized Chime)
// Gujarat Police Innovation Challenge 2026
// Zero external asset dependency; graceful fallback if blocked by browser policy
// ==============================================================================

class AlertAudioNotifier {
  private audioCtx: AudioContext | null = null;
  private isMuted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('gujcamera_alert_audio_muted');
      if (stored === 'true') {
        this.isMuted = true;
      }
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('gujcamera_alert_audio_muted', String(this.isMuted));
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play tactical attention chime for CRITICAL alert
   */
  playCriticalAlert(): void {
    if (this.isMuted || typeof window === 'undefined') return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Tone 1: 587.33 Hz (D5)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2: 880 Hz (A5)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.35);
    } catch {
      // Audio playback blocked by browser user-gesture policy — safely ignore
    }
  }
}

export const alertAudioNotifier = new AlertAudioNotifier();
