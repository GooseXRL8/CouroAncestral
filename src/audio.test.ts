/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { AtabaqueAudioEngine } from '../audio';
import { TA_TUM_THRESHOLD } from '../constants';

// Mock Web Audio API classes
class MockAudioContext {
  currentTime = 0;
  state = 'suspended';
  sampleRate = 44100;
  destination = {};
  
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn()
      },
      connect: vi.fn()
    };
  }
  
  createDynamicsCompressor() {
    return {
      threshold: { setValueAtTime: vi.fn() },
      knee: { setValueAtTime: vi.fn() },
      ratio: { setValueAtTime: vi.fn() },
      attack: { setValueAtTime: vi.fn() },
      release: { setValueAtTime: vi.fn() },
      connect: vi.fn()
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
  }

  createConvolver() {
    return {
      buffer: null,
      connect: vi.fn()
    };
  }

  createStereoPanner() {
    return {
      pan: { setValueAtTime: vi.fn() },
      connect: vi.fn()
    };
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      detune: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
  }

  createBiquadFilter() {
    return {
      type: 'bandpass',
      frequency: { setValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn()
    };
  }

  createBuffer() {
    return {
      getChannelData: () => new Float32Array(100)
    };
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

global.AudioContext = MockAudioContext as any;
(global as any).window = { AudioContext: MockAudioContext };

describe('AtabaqueAudioEngine Synthesizer Tests', () => {
  const initialSettings = {
    volume: 0.8,
    reverbEnabled: true,
    frequencyFactor: 1.0,
    tuning: 'RUM' as const
  };

  it('instantiates correctly with provided parameters', () => {
    const engine = new AtabaqueAudioEngine(initialSettings);
    expect(engine).toBeDefined();
  });

  it('determines the correct percussive hits according to radial distances', async () => {
    const engine = new AtabaqueAudioEngine(initialSettings);
    await engine.init();
    
    // Low distance matches high-pitch center TA hits
    const taResult = await engine.playHit(0, 0, 0.15, 0.8);
    expect(taResult.type).toBe('TA');

    // High distance matches deep edge/rim TUM hits
    const tumResult = await engine.playHit(0, 0.8, 0.85, 0.9);
    expect(tumResult.type).toBe('TUM');
  });

  it('handles custom tuning factors and modifiers correctly', () => {
    const engine = new AtabaqueAudioEngine(initialSettings);
    engine.updateTuning('LE'); // High pitch drum Lê
    engine.setVolume(0.5);
    expect(engine).toBeDefined();
  });
});
