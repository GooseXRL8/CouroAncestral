/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioSettings, AudioParameters } from './types';
import {
  COMPRESSOR_THRESHOLD_DB,
  TA_TUM_THRESHOLD,
  CHOKE_THRESHOLD_SEC,
  MIN_VELOCITY,
  SKIN_TENSION
} from './constants';

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
      this.compressor.threshold.setValueAtTime(COMPRESSOR_THRESHOLD_DB, this.ctx.currentTime);
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
   * Simple linear interpolation helper.
   */
  private lerp(start: number, end: number, fraction: number): number {
    return start + (end - start) * fraction;
  }

  /**
   * Locks physical hit distance coordinates into stable percussive tonal regions.
   * QA-03 helper function extracted for better layout separation and DRY design.
   */
  private mapToStableZone(t: number): number {
    if (t < TA_TUM_THRESHOLD) {
      return this.lerp(0.12, 0.22, t / TA_TUM_THRESHOLD); // Locked TÁ center zone (high)
    } else {
      return this.lerp(0.82, 0.92, (t - TA_TUM_THRESHOLD) / (1 - TA_TUM_THRESHOLD)); // Locked TUM rim zone (bass)
    }
  }

  /**
   * Structural calculation model for physical parameters (frequencies, envelope, timbre).
   * QA-03 helper function extracting the multi-level synthesis coefficients.
   */
  private calculateParameters(
    distance: number,
    intensity: number,
    press: number,
    tuningFactor: number
  ): AudioParameters {
    const t_stable = this.mapToStableZone(distance);

    // === FREQUÊNCIAS ===
    const f0 = this.lerp(280, 75, t_stable) * tuningFactor;          // fundamental
    const f1 = this.lerp(420, 150, t_stable) * tuningFactor;         // 1º harmônico
    const f2 = this.lerp(680, 280, t_stable) * tuningFactor;         // 2º harmônico
    const f3 = this.lerp(950, 420, t_stable) * tuningFactor;         // 3º harmônico

    // === ENVELOPE ===
    const attack = this.lerp(0.003, 0.008, t_stable);
    const decay = this.lerp(0.12, 0.45, t_stable) * (1 + press * 0.3);
    const sustain = this.lerp(0.02, 0.08, t_stable);
    const release = this.lerp(0.08, 0.25, t_stable);

    // === TIMBRE ===
    const brightness = this.lerp(0.9, 0.3, t_stable); // centro = brilhante
    const body = this.lerp(0.2, 0.8, t_stable);       // borda = encorpado

    return {
      t_stable,
      frequencies: [f0, f1, f2, f3],
      amplitudes: [body, brightness * 0.6, brightness * 0.35, brightness * 0.15],
      envelope: { attack, decay, sustain, release },
      timbre: { brightness, body }
    };
  }

  /**
   * Plays a physical modeling percussion stroke depending on hit position.
   * BUG-01: Correctly asynchronous, robust, and avoids browser autoplay blocker issues.
   */
  public async playHit(
    x: number,
    y: number,
    distance: number,
    intensity: number
  ): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> {
    try {
      // BUG-01 & SEC-02: Ensure AudioContext remains active on user gestures
      if (!this.ctx || !this.initialized) {
        await this.init();
      }
      if (!this.ctx) {
        return { type: 'INTERMEDIATE' };
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // SEC-01: Strict input coordinate bounds validation
      const safeX = Math.min(Math.max(x, -1), 1);
      const safeY = Math.min(Math.max(y, -1), 1);
      const safeDistance = Math.min(Math.max(distance, 0), 1);
      const safeIntensity = Math.min(Math.max(intensity, 0), 1);

      const now = this.ctx.currentTime;
      
      // Determine type categorization
      const type: 'TUM' | 'TA' | 'INTERMEDIATE' = safeDistance < TA_TUM_THRESHOLD ? 'TA' : 'TUM';

      // -------------------------------------------------------------
      // ACTIVE VOICE CHOKING / PHASE SYNC ENGINE
      // -------------------------------------------------------------
      this.activeGains = this.activeGains.filter(voice => {
        const age = now - voice.time;
        // BUG-03: More aggressive voice clearance (from 2.0s to 1.0s)
        if (age > 1.0) {
          return false;
        }

        if (age > CHOKE_THRESHOLD_SEC) {
          if (voice.type === type || (type === 'TA' && voice.type === 'INTERMEDIATE')) {
            try {
              voice.output.gain.cancelScheduledValues(now);
              voice.output.gain.setTargetAtTime(0, now, 0.015);
            } catch (err) {
              // safe ignore
            }
          }
        }
        return true;
      });

      // Smart pressure support
      const press = SKIN_TENSION;
      const vel = Math.min(Math.max(safeIntensity, MIN_VELOCITY), 1.0);

      // Adapt tuning and tension size characteristics to keep configurable presets
      let tuningFactor = 1.0;
      if (this.settings.tuning === 'RUMPI') {
        tuningFactor = 1.35;
      } else if (this.settings.tuning === 'LE') {
        tuningFactor = 1.70;
      }
      tuningFactor *= this.settings.frequencyFactor;

      // QA-03 helper map
      const params = this.calculateParameters(safeDistance, safeIntensity, press, tuningFactor);

      const output = this.ctx.createGain();
      output.gain.setValueAtTime(0, now);

      // Track active output gain for choking
      this.activeGains.push({
        output,
        type,
        time: now
      });

      // BUG-03 footprint containment
      if (this.activeGains.length > 20) {
        this.activeGains = this.activeGains.slice(-10);
      }

      // Stereo Panning for immersive audio placement based on click coordinates
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(safeX * 0.4, now);

      output.connect(panner);
      panner.connect(this.masterGain!);

      // BUG-02 explicitly trace generated nodes to guarantee full teardown
      const connectedNodes: AudioNode[] = [output, panner];

      // Pequena imperfeição de afinação (realismo)
      const detune = (Math.random() - 0.5) * 8;

      const { frequencies, amplitudes, envelope } = params;
      const { attack, decay, sustain, release } = envelope;

      frequencies.forEach((f, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = i === 0 ? 'sine' : (i === 1 ? 'triangle' : 'sine');
        osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.005), now);
        osc.detune.setValueAtTime(detune + (Math.random() - 0.5) * 4, now);

        const amp = amplitudes[i] * vel * press;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amp, now + attack);
        gain.gain.exponentialRampToValueAtTime(amp * sustain, now + attack + decay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

        osc.connect(gain);
        gain.connect(output);
        osc.start(now);
        
        const stopTime = now + attack + decay + release + 0.1;
        osc.stop(stopTime);
        
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (e) { /* safe ignore */ }
        };

        connectedNodes.push(osc, gain);
      });

      // === RUÍDO DE IMPACTO (ataque) ===
      const noiseLen = this.lerp(0.04, 0.08, params.t_stable);
      const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * noiseLen, this.ctx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
      }
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(this.lerp(3000, 800, params.t_stable), now);
      noiseFilter.Q.setValueAtTime(1.2, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(vel * press * this.lerp(0.15, 0.05, params.t_stable), now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(output);
      
      noiseSrc.start(now);
      noiseSrc.stop(now + noiseLen);

      // BUG-02 noise sequence automatic cleanup
      noiseSrc.onended = () => {
        try {
          noiseSrc.disconnect();
          noiseFilter.disconnect();
          noiseGain.disconnect();
        } catch (e) { /* safe ignore */ }
      };

      connectedNodes.push(noiseSrc, noiseFilter, noiseGain);

      // === ENVELOPE MASTER ===
      const masterEnv = this.lerp(0.5, 0.9, params.t_stable) * vel * press;
      output.gain.setValueAtTime(0, now);
      output.gain.linearRampToValueAtTime(masterEnv, now + attack);
      output.gain.exponentialRampToValueAtTime(masterEnv * 0.3, now + attack + decay * 0.5);
      output.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

      // BUG-02: Clean up reference nodes completely with faster release cycle
      const duration = attack + decay + release + 0.05;
      setTimeout(() => {
        try {
          connectedNodes.forEach(node => {
            try {
              node.disconnect();
            } catch (_) {}
          });
        } catch (err) {
          // safe ignore
        }
      }, duration * 1000);

      return { type };
    } catch (e) {
      console.error('Audio playback failed:', e);
      return { type: 'INTERMEDIATE' };
    }
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
