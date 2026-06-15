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

/**
 * Voice tracking entry for active voice management.
 */
interface ActiveVoice {
  output: GainNode;
  type: 'TUM' | 'TA' | 'INTERMEDIATE';
  time: number;
}

export class AtabaqueAudioEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private settings: AudioSettings;
  private initialized: boolean = false;
  private activeGains: ActiveVoice[] = [];

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  // ─── INITIALIZATION ───────────────────────────────────────────

  /**
   * Initializes the AudioContext and configures all audio nodes.
   * Safe to call multiple times — returns early if already initialized.
   * Includes mobile fix: auto-resumes suspended AudioContext.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

      console.log('[AudioEngine] AudioContext created, state:', this.ctx.state);

      this.setupCompressor();
      this.setupMasterGain();
      this.setupReverbChain();

      // FIX MOBILE: resume AudioContext se suspenso (iOS/Android)
      if (this.ctx.state === 'suspended') {
        console.log('[AudioEngine] AudioContext suspended, resuming...');
        await this.ctx.resume();
        console.log('[AudioEngine] AudioContext resumed, state:', this.ctx.state);
      }

      // FIX MOBILE: listener para re-resume se browser suspender depois
      this.ctx.onstatechange = () => {
        console.log('[AudioEngine] AudioContext state changed:', this.ctx?.state);
        if (this.ctx?.state === 'suspended') {
          this.ctx.resume();
        }
      };

      this.initialized = true;
      console.log('[AudioEngine] Init complete, state:', this.ctx.state);
    } catch (e) {
      console.error('[AudioEngine] Failed to initialize:', e);
    }
  }

  /**
   * Creates and connects the dynamics compressor.
   */
  private setupCompressor(): void {
    if (!this.ctx) return;

    this.compressor = this.ctx.createDynamicsCompressor();
    const now = this.ctx.currentTime;

    this.compressor.threshold.setValueAtTime(COMPRESSOR_THRESHOLD_DB, now);
    this.compressor.knee.setValueAtTime(4, now);
    this.compressor.ratio.setValueAtTime(3, now);
    this.compressor.attack.setValueAtTime(0.003, now);
    this.compressor.release.setValueAtTime(0.08, now);
    this.compressor.connect(this.ctx.destination);
  }

  /**
   * Creates and connects the master gain node.
   */
  private setupMasterGain(): void {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.settings.volume, this.ctx.currentTime);
    this.masterGain.connect(this.compressor!);
  }

  /**
   * Creates the reverb chain: convolver → reverbGain, plus dryGain.
   * Both feed into the compressor.
   */
  private setupReverbChain(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Convolver with synthetic impulse
    this.reverbNode = this.ctx.createConvolver();
    this.createReverbImpulse();

    // Wet gain
    this.reverbGain = this.ctx.createGain();
    const wet = this.settings.reverbEnabled ? 0.35 : 0;
    this.reverbGain.gain.setValueAtTime(wet, now);

    // Dry gain
    this.dryGain = this.ctx.createGain();
    const dry = this.settings.reverbEnabled ? 0.75 : 1.0;
    this.dryGain.gain.setValueAtTime(dry, now);

    // Routing: master → dry → compressor
    this.masterGain.connect(this.dryGain);
    this.dryGain.connect(this.compressor!);

    // Routing: master → reverb → reverbGain → compressor
    this.masterGain.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor!);
  }

  // ─── REVERB IMPULSE ──────────────────────────────────────────

  /**
   * Generates a synthetic stereo reverb impulse response (1.2s, exponential decay).
   */
  private createReverbImpulse(): void {
    if (!this.ctx || !this.reverbNode) return;

    const rate = this.ctx.sampleRate;
    const length = rate * 1.2;
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

  // ─── PUBLIC CONTROLS ─────────────────────────────────────────

  /**
   * Updates master volume (smooth transition over 50ms).
   */
  public setVolume(volume: number): void {
    this.settings.volume = volume;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Enables or disables reverb (crossfades over 100ms).
   */
  public setReverbEnabled(enabled: boolean): void {
    this.settings.reverbEnabled = enabled;
    if (this.ctx && this.reverbGain && this.dryGain) {
      this.reverbGain.gain.setTargetAtTime(enabled ? 0.35 : 0, this.ctx.currentTime, 0.1);
      this.dryGain.gain.setTargetAtTime(enabled ? 0.75 : 1.0, this.ctx.currentTime, 0.1);
    }
  }

  /**
   * Updates the drum tuning preset.
   */
  public updateTuning(tuning: 'RUM' | 'RUMPI' | 'LE'): void {
    this.settings.tuning = tuning;
  }

  /**
   * Manually resumes the AudioContext if suspended.
   */
  public resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ─── SYNTHESIS HELPERS ───────────────────────────────────────

  /**
   * Linear interpolation.
   */
  private lerp(start: number, end: number, fraction: number): number {
    return start + (end - start) * fraction;
  }

  /**
   * Maps hit distance to a stable tonal zone.
   * - Below threshold → TA center zone (0.12–0.22)
   * - Above threshold → TUM rim zone (0.82–0.92)
   */
  private mapToStableZone(t: number): number {
    if (t < TA_TUM_THRESHOLD) {
      return this.lerp(0.12, 0.22, t / TA_TUM_THRESHOLD);
    }
    return this.lerp(0.82, 0.92, (t - TA_TUM_THRESHOLD) / (1 - TA_TUM_THRESHOLD));
  }

  /**
   * Calculates synthesis parameters from physical hit data.
   */
  private calculateParameters(
    distance: number,
    intensity: number,
    press: number,
    tuningFactor: number
  ): AudioParameters {
    const t = this.mapToStableZone(distance);

    return {
      t_stable: t,
      frequencies: [
        this.lerp(280, 75, t) * tuningFactor,
        this.lerp(420, 150, t) * tuningFactor,
        this.lerp(680, 280, t) * tuningFactor,
        this.lerp(950, 420, t) * tuningFactor
      ],
      amplitudes: (() => {
        const brightness = this.lerp(0.9, 0.3, t);
        const body = this.lerp(0.2, 0.8, t);
        return [body, brightness * 0.6, brightness * 0.35, brightness * 0.15];
      })(),
      envelope: {
        attack: this.lerp(0.003, 0.008, t),
        decay: this.lerp(0.12, 0.45, t) * (1 + press * 0.3),
        sustain: this.lerp(0.02, 0.08, t),
        release: this.lerp(0.08, 0.25, t)
      },
      timbre: {
        brightness: this.lerp(0.9, 0.3, t),
        body: this.lerp(0.2, 0.8, t)
      }
    };
  }

  /**
   * Resolves the tuning factor from the current preset and user frequency factor.
   */
  private resolveTuningFactor(): number {
    const presetFactors: Record<string, number> = {
      RUM: 1.0,
      RUMPI: 1.35,
      LE: 1.70
    };
    return (presetFactors[this.settings.tuning] ?? 1.0) * this.settings.frequencyFactor;
  }

  // ─── VOICE MANAGEMENT ────────────────────────────────────────

  /**
   * Cleans up old voices and chokes same-type voices past the threshold.
   */
  private cleanupVoices(now: number, currentType: ActiveVoice['type']): void {
    this.activeGains = this.activeGains.filter(voice => {
      const age = now - voice.time;

      // Remove voices older than 1s
      if (age > 1.0) return false;

      // Choke same-type voices past threshold
      if (age > CHOKE_THRESHOLD_SEC) {
        if (voice.type === currentType || (currentType === 'TA' && voice.type === 'INTERMEDIATE')) {
          try {
            voice.output.gain.cancelScheduledValues(now);
            voice.output.gain.setTargetAtTime(0, now, 0.015);
          } catch (_) { /* safe ignore */ }
        }
      }

      return true;
    });

    // Hard cap: keep only last 10 voices
    if (this.activeGains.length > 20) {
      this.activeGains = this.activeGains.slice(-10);
    }
  }

  // ─── PLAYBACK ────────────────────────────────────────────────

  /**
   * Plays a synthesized drum stroke.
   * Auto-initializes and resumes AudioContext on mobile.
   */
  public async playHit(
    x: number,
    y: number,
    distance: number,
    intensity: number
  ): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> {
    try {
      // Ensure context is ready
      if (!this.ctx || !this.initialized) {
        console.log('[AudioEngine] playHit: not initialized, calling init()');
        await this.init();
      }
      if (!this.ctx) {
        console.error('[AudioEngine] playHit: ctx is null after init');
        return { type: 'INTERMEDIATE' };
      }

      console.log('[AudioEngine] playHit: ctx state =', this.ctx.state);

      if (this.ctx.state === 'suspended') {
        console.log('[AudioEngine] playHit: resuming suspended ctx');
        await this.ctx.resume();
      }

      // Clamp inputs
      const safeX = Math.min(Math.max(x, -1), 1);
      const safeY = Math.min(Math.max(y, -1), 1);
      const safeDistance = Math.min(Math.max(distance, 0), 1);
      const safeIntensity = Math.min(Math.max(intensity, 0), 1);

      const now = this.ctx.currentTime;
      const type: ActiveVoice['type'] =
        safeDistance < TA_TUM_THRESHOLD ? 'TA' : 'TUM';

      // Voice management
      this.cleanupVoices(now, type);

      const vel = Math.min(Math.max(safeIntensity, MIN_VELOCITY), 1.0);
      const tuningFactor = this.resolveTuningFactor();
      const params = this.calculateParameters(safeDistance, safeIntensity, SKIN_TENSION, tuningFactor);

      // Output chain: oscillators → output → panner → masterGain
      const output = this.ctx.createGain();
      output.gain.setValueAtTime(0, now);

      this.activeGains.push({ output, type, time: now });

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(safeX * 0.4, now);
      output.connect(panner);
      panner.connect(this.masterGain!);

      const connectedNodes: AudioNode[] = [output, panner];

      // Oscillators
      this.startOscillators(params, vel, now, output, connectedNodes);

      // Impact noise
      this.startImpactNoise(params, vel, now, output, connectedNodes);

      // Master envelope
      this.applyMasterEnvelope(output, params, vel, now);

      // Cleanup after note ends
      const duration = params.envelope.attack + params.envelope.decay + params.envelope.release + 0.05;
      this.scheduleCleanup(connectedNodes, duration);

      return { type };
    } catch (e) {
      console.error('Audio playback failed:', e);
      return { type: 'INTERMEDIATE' };
    }
  }

  /**
   * Creates and starts the 4 oscillator voices.
   */
  private startOscillators(
    params: AudioParameters,
    vel: number,
    now: number,
    output: GainNode,
    connectedNodes: AudioNode[]
  ): void {
    if (!this.ctx) return;

    const { frequencies, amplitudes, envelope } = params;
    const { attack, decay, sustain, release } = envelope;
    const detune = (Math.random() - 0.5) * 8;

    frequencies.forEach((freq, i) => {
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i === 0 ? 'sine' : i === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.005), now);
      osc.detune.setValueAtTime(detune + (Math.random() - 0.5) * 4, now);

      const amp = amplitudes[i] * vel * SKIN_TENSION;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + attack);
      gain.gain.exponentialRampToValueAtTime(amp * sustain, now + attack + decay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

      osc.connect(gain);
      gain.connect(output);
      osc.start(now);
      osc.stop(now + attack + decay + release + 0.1);

      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch (_) {}
      };

      connectedNodes.push(osc, gain);
    });
  }

  /**
   * Creates and starts the impact noise burst (attack transient).
   */
  private startImpactNoise(
    params: AudioParameters,
    vel: number,
    now: number,
    output: GainNode,
    connectedNodes: AudioNode[]
  ): void {
    if (!this.ctx) return;

    const noiseLen = this.lerp(0.04, 0.08, params.t_stable);
    const sampleRate = this.ctx.sampleRate;
    const bufLen = sampleRate * noiseLen;

    const noiseBuf = this.ctx.createBuffer(1, bufLen, sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 3);
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(this.lerp(3000, 800, params.t_stable), now);
    noiseFilter.Q.setValueAtTime(1.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vel * SKIN_TENSION * this.lerp(0.15, 0.05, params.t_stable), now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);
    noiseSrc.start(now);
    noiseSrc.stop(now + noiseLen);

    noiseSrc.onended = () => {
      try { noiseSrc.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); } catch (_) {}
    };

    connectedNodes.push(noiseSrc, noiseFilter, noiseGain);
  }

  /**
   * Applies the master amplitude envelope to the output gain.
   */
  private applyMasterEnvelope(
    output: GainNode,
    params: AudioParameters,
    vel: number,
    now: number
  ): void {
    const { attack, decay, release } = params.envelope;
    const masterEnv = this.lerp(0.5, 0.9, params.t_stable) * vel * SKIN_TENSION;

    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(masterEnv, now + attack);
    output.gain.exponentialRampToValueAtTime(masterEnv * 0.3, now + attack + decay * 0.5);
    output.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);
  }

  /**
   * Schedules disconnection of all nodes after the note finishes.
   */
  private scheduleCleanup(nodes: AudioNode[], durationSec: number): void {
    setTimeout(() => {
      nodes.forEach(node => {
        try { node.disconnect(); } catch (_) {}
      });
    }, durationSec * 1000);
  }
}
