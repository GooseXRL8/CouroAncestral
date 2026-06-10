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

export interface HitEvent {
  id: string;
  x: number;      // normalized -1 to 1 based on center of drum
  y: number;      // normalized -1 to 1 based on center of drum
  distance: number; // 0 (center) to 1 (edge)
  angle: number;    // angle of impact in radians
  intensity: number; // velocity/pressure 0 to 1
  timestamp: number;
  type: 'TUM' | 'TA' | 'INTERMEDIATE';
}

export interface RhythmStep {
  type: 'TUM' | 'TA' | 'SILENCE';
  delay: number; // offset in milliseconds from the start or prior step
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
