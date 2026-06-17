/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioSettings } from './types';
import {
  COMPRESSOR_THRESHOLD_DB,
  TA_TUM_THRESHOLD,
  CHOKE_THRESHOLD_SEC,
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

  // Audio Buffers
  private slapBuffer: AudioBuffer | null = null;
  private openBuffer: AudioBuffer | null = null;

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  // ─── INITIALIZATION ───────────────────────────────────────────

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
        
        // Load sound files
        await this.loadSounds();
      }

      if (this.ctx.state !== 'running') {
        console.log('[AudioEngine] Resuming AudioContext...');
        await this.ctx.resume();
      }

      this.initialized = true;
      console.log('[AudioEngine] Init complete, state:', this.ctx.state);
    } catch (e) {
      console.error('[AudioEngine] Failed to initialize:', e);
    }
  }

  private async loadSounds(): Promise<void> {
    if (!this.ctx) return;

    const loadBuffer = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        return await this.ctx!.decodeAudioData(arrayBuffer);
      } catch (e) {
        console.error(`[AudioEngine] Error loading sound ${url}:`, e);
        return null;
      }
    };

    const baseUrl = (import.meta as any).env.BASE_URL || './';
    const normalizeUrl = (path: string) => {
      const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      return base + cleanPath;
    };

    const slapUrl = normalizeUrl('sounds/slap.wav');
    const openUrl = normalizeUrl('sounds/open.wav');

    console.log('[AudioEngine] Loading sounds from:', { slapUrl, openUrl });

    const [slap, open] = await Promise.all([
      loadBuffer(slapUrl),
      loadBuffer(openUrl)
    ]);

    this.slapBuffer = slap;
    this.openBuffer = open;
  }

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

  private setupMasterGain(): void {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.settings.volume, this.ctx.currentTime);
    this.masterGain.connect(this.compressor!);
  }

  private setupReverbChain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.reverbNode = this.ctx.createConvolver();
    this.createReverbImpulse();
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(this.settings.reverbEnabled ? 0.35 : 0, now);
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(this.settings.reverbEnabled ? 0.75 : 1.0, now);
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
      if (this.ctx.state !== 'running') await this.ctx.resume();
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
    if (this.activeGains.length > 20) this.activeGains = this.activeGains.slice(-10);
  }

  // ─── PLAYBACK ────────────────────────────────────────────────

  public async playHit(
    x: number,
    y: number,
    distance: number,
    intensity: number
  ): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> {
    try {
      if (!this.ctx || !this.initialized) await this.init();
      if (!this.ctx) return { type: 'INTERMEDIATE' };
      if (this.ctx.state !== 'running') await this.ctx.resume();

      const safeX = Math.min(Math.max(x, -1), 1);
      const safeDistance = Math.min(Math.max(distance, 0), 1);
      const safeIntensity = Math.min(Math.max(intensity, 0), 1);
      const now = this.ctx.currentTime;
      const type: ActiveVoice['type'] = safeDistance < TA_TUM_THRESHOLD ? 'TA' : 'TUM';

      this.cleanupVoices(now, type);

      const output = this.ctx.createGain();
      output.gain.setValueAtTime(0, now);
      this.activeGains.push({ output, type, time: now });

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(safeX * 0.4, now);
      output.connect(panner);
      panner.connect(this.masterGain!);

      const buffer = type === 'TA' ? this.slapBuffer : this.openBuffer;
      const presetFactors: Record<string, number> = { RUM: 1.0, RUMPI: 1.2, LE: 1.4 };
      const tuningFactor = (presetFactors[this.settings.tuning] ?? 1.0) * this.settings.frequencyFactor;

      if (buffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(tuningFactor, now);
        source.connect(output);
        output.gain.linearRampToValueAtTime(safeIntensity, now + 0.002);
        source.start(now);
        const duration = buffer.duration / tuningFactor;
        source.stop(now + duration + 0.1);
        this.scheduleCleanup([source, output, panner], duration + 0.2);
      } else {
        this.playSynthesizedHit(type, safeIntensity, tuningFactor, now, output, [output, panner]);
      }

      return { type };
    } catch (e) {
      console.error('Playback error:', e);
      return { type: 'INTERMEDIATE' };
    }
  }

  private playSynthesizedHit(
    type: 'TUM' | 'TA' | 'INTERMEDIATE',
    vel: number,
    tuningFactor: number,
    now: number,
    output: GainNode,
    nodes: AudioNode[]
  ): void {
    if (!this.ctx) return;
    const isTa = type === 'TA';
    const freq = (isTa ? 400 : 90) * tuningFactor;
    const osc = this.ctx.createOscillator();
    osc.type = isTa ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq * 1.2, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vel * SKIN_TENSION, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isTa ? 0.15 : 0.4));
    osc.connect(g);
    g.connect(output);
    osc.start(now);
    osc.stop(now + 0.5);
    nodes.push(osc, g);
    this.scheduleCleanup(nodes, 0.6);
  }

  private scheduleCleanup(nodes: AudioNode[], duration: number): void {
    setTimeout(() => {
      nodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
    }, duration * 1000);
  }
}
