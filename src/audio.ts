/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioSettings } from './types';

export class AtabaqueAudioEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private settings: AudioSettings;
  private initialized: boolean = false;
  private activeGains: {
    output: GainNode;
    type: 'TUM' | 'TA' | 'INTERMEDIATE';
    time: number;
  }[] = [];

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  /**
   * Initializes the AudioContext and configures nodes when user first interacts.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create Audio Context with low latency configuration
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

      // Compressor para evitar clipping com mais headroom para toque rápido
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-3, this.ctx.currentTime); // changed from -10 to -3 to lock dynamic power
      this.compressor.knee.setValueAtTime(4, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(3, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.08, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.settings.volume, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);

      // Reverb (convolution com impulso sintético)
      this.reverbNode = this.ctx.createConvolver();
      this.createReverbImpulse();

      this.reverbGain = this.ctx.createGain();
      const initialWet = this.settings.reverbEnabled ? 0.35 : 0;
      this.reverbGain.gain.setValueAtTime(initialWet, this.ctx.currentTime);

      this.dryGain = this.ctx.createGain();
      const initialDry = this.settings.reverbEnabled ? 0.75 : 1;
      this.dryGain.gain.setValueAtTime(initialDry, this.ctx.currentTime);

      this.masterGain.connect(this.dryGain);
      this.dryGain.connect(this.compressor);

      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);

      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
    }
  }

  /**
   * Gera som sintético do impulso de reverb
   */
  private createReverbImpulse(): void {
    if (!this.ctx || !this.reverbNode) return;
    const rate = this.ctx.sampleRate;
    const length = rate * 1.2; // 1.2 segundos
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.5);
        data[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
    this.reverbNode.buffer = impulse;
  }

  /**
   * Dynamically updates the current volume setting.
   */
  public setVolume(volume: number): void {
    this.settings.volume = volume;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Enabled or disables the room reverberation effect.
   */
  public setReverbEnabled(enabled: boolean): void {
    this.settings.reverbEnabled = enabled;
    if (this.ctx && this.reverbGain && this.dryGain) {
      const wet = enabled ? 0.35 : 0;
      const dry = enabled ? 0.75 : 1;
      this.reverbGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.1);
      this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.1);
    }
  }

  /**
   * Updates the global pitch scale multiplier or specific instrument tuning model.
   */
  public updateTuning(tuning: 'RUM' | 'RUMPI' | 'LE'): void {
    this.settings.tuning = tuning;
  }

  /**
   * Plays a physical modeling percussion stroke depending on hit position.
   */
  public playHit(x: number, y: number, distance: number, intensity: number): { type: 'TUM' | 'TA' | 'INTERMEDIATE' } {
    // Ensure Web Audio remains initialized
    if (!this.ctx) {
      this.init();
      return { type: 'INTERMEDIATE' };
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const t = Math.min(Math.max(distance, 0), 1); // 0 = centro, 1 = borda
    
    // Determine type categorization for rhythm accuracy matching:
    // Split at 0.50 exactly so registration is extremely reliable
    const type: 'TUM' | 'TA' | 'INTERMEDIATE' = t < 0.50 ? 'TA' : 'TUM';

    // -------------------------------------------------------------
    // ACTIVE VOICE CHOKING / PHASE SYNC ENGINE
    // -------------------------------------------------------------
    // Choke older active voices of the SAME type to prevent comb filtering (phase cancellation)
    // and stop signal buildup from squashing output volume (triggers compressor too hard).
    // Allow a small window (35ms) so intentional simultaneous multi-touch double strikes still ring.
    const chokeThreshold = 0.035; // 35ms
    this.activeGains = this.activeGains.filter(voice => {
      const age = now - voice.time;
      // Clean up references older than 2 seconds
      if (age > 2.0) {
        return false;
      }

      if (age > chokeThreshold) {
        if (voice.type === type || (type === 'TA' && voice.type === 'INTERMEDIATE')) {
          try {
            voice.output.gain.cancelScheduledValues(now);
            // Smoothly damp old voice to zero with very fast 15ms target curve to avoid audio cracks
            voice.output.gain.setTargetAtTime(0, now, 0.015);
          } catch (err) {
            // safe ignore
          }
        }
      }
      return true;
    });

    // Smart pressure support: avoid dropping volume on light touch pointer down
    const press = 0.85; // solid skin tension multiplier
    const vel = Math.min(Math.max(intensity, 0.60), 1.0); // Minimum 0.60 velocity on quick screen strikes

    const lerp = (start: number, end: number, fraction: number) => start + (end - start) * fraction;

    // Adapt tuning and tension size characteristics to keep configurable presets
    let tuningFactor = 1.0;
    if (this.settings.tuning === 'RUMPI') {
      tuningFactor = 1.35;
    } else if (this.settings.tuning === 'LE') {
      tuningFactor = 1.70;
    }

    tuningFactor *= this.settings.frequencyFactor;

    // -------------------------------------------------------------
    // STABILIZED PITCH SEGMENTATION (Prevent Slurry Pitch Shifts)
    // -------------------------------------------------------------
    // Stabilize physical t into locked zones. During high-speed drumming, fingers hit slightly off,
    // which with a pure linear lerp makes notes slide in pitch. Map to cohesive center/rim areas 
    // to guarantee the same clean tuning note triggers on rapid taps.
    let t_stable = t;
    if (t < 0.50) {
      t_stable = lerp(0.12, 0.22, t / 0.50); // Locked TÁ center zone (high)
    } else {
      t_stable = lerp(0.82, 0.92, (t - 0.50) / 0.50); // Locked TUM rim zone (bass)
    }

    // === FREQUÊNCIAS ===
    // Centro (Tá): mais agudo, ataque rápido
    // Borda (Tum): mais grave, sustentação mais longa
    const f0 = lerp(280, 75, t_stable) * tuningFactor;          // fundamental
    const f1 = lerp(420, 150, t_stable) * tuningFactor;         // 1º harmônico
    const f2 = lerp(680, 280, t_stable) * tuningFactor;         // 2º harmônico
    const f3 = lerp(950, 420, t_stable) * tuningFactor;         // 3º harmônico

    // === ENVELOPE ===
    const attack = lerp(0.003, 0.008, t_stable);
    const decay = lerp(0.12, 0.45, t_stable) * (1 + press * 0.3);
    const sustain = lerp(0.02, 0.08, t_stable);
    const release = lerp(0.08, 0.25, t_stable);

    // === TIMBRE ===
    const brightness = lerp(0.9, 0.3, t_stable); // centro = brilhante
    const body = lerp(0.2, 0.8, t_stable);       // borda = encorpado

    // Criar osciladores e envelopes para cada harmônico
    const freqs = [f0, f1, f2, f3];
    const amps = [body, brightness * 0.6, brightness * 0.35, brightness * 0.15];

    const output = this.ctx.createGain();
    output.gain.setValueAtTime(0, now);

    // Track active output gain for choking
    this.activeGains.push({
      output,
      type,
      time: now
    });

    // Stereo Panning for immersive audio placement based on click coordinates
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(x * 0.4, now);

    output.connect(panner);
    panner.connect(this.masterGain!);

    // Pequena imperfeição de afinação (realismo)
    const detune = (Math.random() - 0.5) * 8;

    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i === 0 ? 'sine' : (i === 1 ? 'triangle' : 'sine');
      osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.005), now);
      osc.detune.setValueAtTime(detune + (Math.random() - 0.5) * 4, now);

      const amp = amps[i] * vel * press;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + attack);
      gain.gain.exponentialRampToValueAtTime(amp * sustain, now + attack + decay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

      osc.connect(gain);
      gain.connect(output);
      osc.start(now);
      osc.stop(now + attack + decay + release + 0.1);
    });

    // === RUÍDO DE IMPACTO (ataque) ===
    const noiseLen = lerp(0.04, 0.08, t_stable);
    const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * noiseLen, this.ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(lerp(3000, 800, t_stable), now);
    noiseFilter.Q.setValueAtTime(1.2, now);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vel * press * lerp(0.15, 0.05, t_stable), now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);
    noiseSrc.start(now);
    noiseSrc.stop(now + noiseLen);

    // === ENVELOPE MASTER ===
    const masterEnv = lerp(0.5, 0.9, t_stable) * vel * press;
    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(masterEnv, now + attack);
    output.gain.exponentialRampToValueAtTime(masterEnv * 0.3, now + attack + decay * 0.5);
    output.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

    // Clean up nodes after completion
    const duration = attack + decay + release + 0.2;
    setTimeout(() => {
      try {
        output.disconnect();
        panner.disconnect();
      } catch (err) {
        // Safe discard on fast consecutive taps
      }
    }, duration * 1000);

    return { type };
  }

  /**
   * Helper utility to resume or warm up the context.
   */
  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
