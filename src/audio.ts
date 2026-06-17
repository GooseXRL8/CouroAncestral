/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioSettings } from './types';
import {
  COMPRESSOR_THRESHOLD_DB,
  TA_TUM_THRESHOLD,
  CHOKE_THRESHOLD_SEC,
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

  // Audio Buffers
  private slapBuffer: AudioBuffer | null = null;
  private openBuffer: AudioBuffer | null = null;

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  // ─── INITIALIZATION ───────────────────────────────────────────

  /**
   * Initializes the AudioContext and configures all audio nodes.
   * Safe to call multiple times — returns early if already initialized.
   */
  public async init(): Promise<void> {
    if (this.initialized && this.ctx?.state === 'running') return;

    try {
      if (!this.ctx) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
        
        this.setupCompressor();
        this.setupMasterGain();
        this.setupReverbChain();
        
        // Load sound files once
        await this.loadSounds();
      }

      // FIX MOBILE: resume AudioContext se suspenso (iOS/Android)
      // Em smartphones, o contexto só pode ser retomado dentro de um evento de clique
      if (this.ctx.state === 'suspended') {
        console.log('[AudioEngine] AudioContext suspended, attempting resume...');
        await this.ctx.resume();
      }

      // FIX MOBILE: listener para re-resume se browser suspender depois
      this.ctx.onstatechange = () => {
        console.log('[AudioEngine] AudioContext state changed:', this.ctx?.state);
      };

      this.initialized = true;
      console.log('[AudioEngine] Init complete, state:', this.ctx.state);
    } catch (e) {
      console.error('[AudioEngine] Failed to initialize:', e);
    }
  }

  /**
   * Loads the WAV files into AudioBuffers.
   */
  private async loadSounds(): Promise<void> {
    if (!this.ctx) return;

    const loadBuffer = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        return await this.ctx!.decodeAudioData(arrayBuffer);
      } catch (e) {
        console.error(`[AudioEngine] Error loading sound ${url}:`, e);
        return null;
      }
    };

    // slap.wav (TA) and open.wav (TUM)
    const [slap, open] = await Promise.all([
      loadBuffer('/sounds/slap.wav'),
      loadBuffer('/sounds/open.wav')
    ]);

    this.slapBuffer = slap;
    this.openBuffer = open;
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
   */
  private setupReverbChain(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    this.reverbNode = this.ctx.createConvolver();
    this.createReverbImpulse();

    this.reverbGain = this.ctx.createGain();
    const wet = this.settings.reverbEnabled ? 0.35 : 0;
    this.reverbGain.gain.setValueAtTime(wet, now);

    this.dryGain = this.ctx.createGain();
    const dry = this.settings.reverbEnabled ? 0.75 : 1.0;
    this.dryGain.gain.setValueAtTime(dry, now);

    this.masterGain.connect(this.dryGain);
    this.dryGain.connect(this.compressor!);

    this.masterGain.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor!);
  }

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

  public setVolume(volume: number): void {
    this.settings.volume = volume;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  public setReverbEnabled(enabled: boolean): void {
    this.settings.reverbEnabled = enabled;
    if (this.ctx && this.reverbGain && this.dryGain) {
      this.reverbGain.gain.setTargetAtTime(enabled ? 0.35 : 0, this.ctx.currentTime, 0.1);
      this.dryGain.gain.setTargetAtTime(enabled ? 0.75 : 1.0, this.ctx.currentTime, 0.1);
    }
  }

  public updateTuning(tuning: 'RUM' | 'RUMPI' | 'LE'): void {
    this.settings.tuning = tuning;
  }

  public async resume(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    } else {
      await this.init();
    }
  }

  // ─── VOICE MANAGEMENT ────────────────────────────────────────

  private cleanupVoices(now: number, currentType: ActiveVoice['type']): void {
    this.activeGains = this.activeGains.filter(voice => {
      const age = now - voice.time;
      if (age > 1.0) return false;

      if (age > CHOKE_THRESHOLD_SEC) {
        if (voice.type === currentType || (currentType === 'TA' && voice.type === 'INTERMEDIATE')) {
          try {
            voice.output.gain.cancelScheduledValues(now);
            voice.output.gain.setTargetAtTime(0, now, 0.015);
          } catch (_) {}
        }
      }
      return true;
    });

    if (this.activeGains.length > 20) {
      this.activeGains = this.activeGains.slice(-10);
    }
  }

  // ─── PLAYBACK ────────────────────────────────────────────────

  /**
   * Plays a sample-based drum stroke.
   */
  public async playHit(
    x: number,
    y: number,
    distance: number,
    intensity: number
  ): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> {
    try {
      if (!this.ctx || !this.initialized) {
        await this.init();
      }
      if (!this.ctx) return { type: 'INTERMEDIATE' };

      // Re-resume context on every hit if it's not running (important for mobile)
      if (this.ctx.state !== 'running') {
        await this.ctx.resume();
      }

      const safeX = Math.min(Math.max(x, -1), 1);
      const safeDistance = Math.min(Math.max(distance, 0), 1);
      const safeIntensity = Math.min(Math.max(intensity, 0), 1);

      const now = this.ctx.currentTime;
      const type: ActiveVoice['type'] = safeDistance < TA_TUM_THRESHOLD ? 'TA' : 'TUM';

      this.cleanupVoices(now, type);

      // Select buffer
      const buffer = type === 'TA' ? this.slapBuffer : this.openBuffer;
      if (!buffer) {
        console.warn(`[AudioEngine] Buffer for ${type} not loaded yet.`);
        return { type };
      }

      // Output chain: source → output → panner → masterGain
      const output = this.ctx.createGain();
      output.gain.setValueAtTime(0, now);
      
      // Master envelope for the sample
      const attack = 0.002;
      const release = 0.1;
      output.gain.linearRampToValueAtTime(safeIntensity, now + attack);
      
      this.activeGains.push({ output, type, time: now });

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(safeX * 0.4, now);
      
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      
      // Pitch adjustment based on tuning settings
      const presetFactors: Record<string, number> = {
        RUM: 1.0,
        RUMPI: 1.2,
        LE: 1.4
      };
      const tuningFactor = (presetFactors[this.settings.tuning] ?? 1.0) * this.settings.frequencyFactor;
      source.playbackRate.setValueAtTime(tuningFactor, now);

      // Routing
      source.connect(output);
      output.connect(panner);
      panner.connect(this.masterGain!);

      source.start(now);
      
      // Cleanup
      const duration = buffer.duration / tuningFactor;
      source.stop(now + duration + 0.1);
      
      setTimeout(() => {
        try {
          source.disconnect();
          output.disconnect();
          panner.disconnect();
        } catch (_) {}
      }, (duration + 0.2) * 1000);

      return { type };
    } catch (e) {
      console.error('Audio playback failed:', e);
      return { type: 'INTERMEDIATE' };
    }
  }
}
