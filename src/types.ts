/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PlayMode = 'FREE' | 'EXAMPLE' | 'CHALLENGE';

export interface AudioSettings {
  volume: number;
  reverbEnabled: boolean;
  frequencyFactor: number; // 0.8 to 1.2 to pitch the drum up or down
  tuning: 'RUM' | 'RUMPI' | 'LE'; // traditional sizes (Rum = deep, Rumpi = medium, Lê = high-pitched)
}

export interface AudioEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface AudioTimbre {
  brightness: number;
  body: number;
}

export interface AudioParameters {
  t_stable: number;
  frequencies: number[];
  amplitudes: number[];
  envelope: AudioEnvelope;
  timbre: AudioTimbre;
}

export interface RecordedHit {
  type: 'TUM' | 'TA';
  timeOffset: number; // ms offset relative to recording startup
  x: number;
  y: number;
}

export interface ChallengeSequence {
  id: string;
  name: string;
  steps: ('TUM' | 'TA')[];
  tempo: number; // BPM
}

export interface GameState {
  score: number;
  streak: number;
  maxStreak: number;
  currentLevel: number;
  challengeSequence: ('TUM' | 'TA')[];
  userSequence: ('TUM' | 'TA')[];
  userTimings: number[];
  playbackProgress: number; // index of currently playing block in challenge
  isPlayingChallenge: boolean;
  challengeStatus: 'IDLE' | 'PLAYING_PROMPT' | 'WAITING_USER' | 'SUCCESS' | 'FAILED';
  feedbackMessage: string;
  feedbackType: 'success' | 'warning' | 'info' | 'error' | '';
}
