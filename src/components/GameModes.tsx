/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { PlayMode, GameState, ChallengeSequence } from '../types';
import { Play, Square, RotateCcw, Award, Zap, CheckCircle2, AlertTriangle, BookOpen, Sparkles } from 'lucide-react';

interface GameModesProps {
  currentMode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  onPlayDemoHit: (x: number, y: number, type: 'TUM' | 'TA') => void;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

// FEAT-02: Expanded set of Brazilian folk and spiritual capoeira challenge sequences
const CHALLENGE_PRESETS: ChallengeSequence[] = [
  { id: '1', name: 'Nível 1: Batida Base', steps: ['TUM', 'TA'], tempo: 100 },
  { id: '2', name: 'Nível 2: Chamada Dobrada', steps: ['TUM', 'TUM', 'TA'], tempo: 110 },
  { id: '3', name: 'Nível 3: Toque de Angola (Capoeira)', steps: ['TUM', 'TA', 'TUM', 'TA'], tempo: 115 },
  { id: '4', name: 'Nível 4: São Bento Pequeno (Capoeira)', steps: ['TUM', 'TUM', 'TA', 'TA'], tempo: 120 },
  { id: '5', name: 'Nível 5: São Bento Grande de Angola', steps: ['TUM', 'TUM', 'TA', 'TUM', 'TA'], tempo: 125 },
  { id: '6', name: 'Nível 6: Congo Clássico (Umbanda)', steps: ['TUM', 'TUM', 'TA', 'TA', 'TUM', 'TUM', 'TA'], tempo: 110 },
  { id: '7', name: 'Nível 7: Cabula Tradicional (Umbanda)', steps: ['TA', 'TA', 'TUM', 'TA', 'TUM', 'TUM', 'TA'], tempo: 115 },
  { id: '8', name: 'Nível 8: Samba de Roda Baiano', steps: ['TUM', 'TA', 'TUM', 'TUM', 'TA', 'TA', 'TUM', 'TA'], tempo: 120 },
  { id: '9', name: 'Nível 9: Maracatu de Baque Virado', steps: ['TUM', 'TUM', 'TA', 'TUM', 'TUM', 'TA', 'TUM', 'TA', 'TA'], tempo: 105 },
  { id: '10', name: 'Nível 10: Barravento Frenético', steps: ['TA', 'TUM', 'TA', 'TA', 'TUM', 'TA', 'TUM', 'TA', 'TUM', 'TA'], tempo: 130 }
];

interface DemoRhythm {
  id: string;
  category: string;
  name: string;
  description: string;
  tempo: number;
  subdivision?: '8th' | '16th';
  pattern: { type: 'TUM' | 'TA' | 'SILENCE'; x: number; y: number }[];
}

// FEAT-02: Expanded set of realistic educational rhythmic patterns
const DEMO_RHYTHMS: DemoRhythm[] = [
  {
    id: 'sao_bento',
    category: 'Toque de Capoeira',
    name: 'São Bento Grande de Angola',
    description: 'Balanço clássico do atabaque com variação de marcação firme.',
    tempo: 136,
    subdivision: '8th',
    pattern: [
      { type: 'TUM', x: 0.0, y: 0.8 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TUM', x: -0.6, y: -0.6 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TUM', x: 0.6, y: -0.6 },
      { type: 'TA', x: 0.1, y: -0.1 }
    ]
  },
  {
    id: 'congo',
    category: 'Ritmo de Terreiro (Umbanda)',
    name: 'Congo',
    description: 'Congo de Umbanda tradicional para orixás guerreiros.',
    tempo: 190,
    subdivision: '8th',
    pattern: [
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'SILENCE', x: 0, y: 0 }
    ]
  },
  {
    id: 'cabula',
    category: 'Ritmo de Terreiro (Umbanda)',
    name: 'Cabula',
    description: 'Ritmo sagrado de Cabula, base da maioria dos toques de terreiro.',
    tempo: 110,
    subdivision: '8th',
    pattern: [
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'SILENCE', x: 0, y: 0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'SILENCE', x: 0, y: 0 }
    ]
  },
  {
    id: 'samba_de_roda',
    category: 'Samba de Roda',
    name: 'Samba de Roda',
    description: 'Balanço sincopado da Bahia, acompanhado por palmas rítmicas.',
    tempo: 125,
    subdivision: '8th',
    pattern: [
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 }
    ]
  },
  {
    id: 'barravento',
    category: 'Ritmo de Terreiro (Umbanda)',
    name: 'Barravento',
    description: 'Toque extremamente rápido, contínuo, frenético e festivo.',
    tempo: 140,
    subdivision: '8th',
    pattern: [
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 },
      { type: 'TUM', x: 0.0, y: 0.85 },
      { type: 'TA', x: 0.0, y: 0.0 }
    ]
  }
];

// -----------------------------------------------------------------
// PERF-02: High-Performance Memoized Sub-Components
// -----------------------------------------------------------------

const ChallengeHUD = React.memo(({ score, streak, maxStreak }: { score: number; streak: number; maxStreak: number }) => (
  <div className="grid grid-cols-3 gap-3 bg-[#130d0a] text-stone-300 p-3.5 rounded-xl shadow-lg relative overflow-hidden border border-[#2d221a]">
    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full blur-2xl pointer-events-none"></div>

    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wider text-stone-500">Pontuação</span>
      <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-[#f27d26]">{score}</span>
    </div>

    <div className="flex flex-col items-center border-x border-[#2d221a]/30">
      <span className="text-[9px] uppercase tracking-wider text-stone-500">Combo / Seq</span>
      <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-orange-400 flex items-center gap-1">
        <Zap className="w-3.5 h-3.5 fill-current text-orange-400 animate-bounce" />
        {streak}
      </span>
    </div>

    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wider text-stone-500">Nível Máximo</span>
      <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-amber-400">{maxStreak}</span>
    </div>
  </div>
));

const ChallengePresetsList = React.memo(({ currentLevel, onSelectLevel }: { currentLevel: number; onSelectLevel: (level: number) => void }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400 text-left">Selecione o Grau:</span>
    <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-thin scrollbar-thumb-orange-850/45">
      {CHALLENGE_PRESETS.map((preset, idx) => {
        const isSelected = currentLevel === idx + 1;
        return (
          <button
            key={preset.id}
            onClick={() => onSelectLevel(idx + 1)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              isSelected
                ? 'bg-[#f27d26] text-black font-extrabold shadow-sm'
                : 'bg-[#251b14] hover:bg-[#32241c] text-stone-400'
            }`}
          >
            Nível {idx + 1}
          </button>
        );
      })}
    </div>
  </div>
));

const RhythmStepsGrid = React.memo(({
  challengeSequence,
  userSequence,
  playbackProgress,
  feedbackMessage,
  feedbackType
}: {
  challengeSequence: ('TUM' | 'TA')[];
  userSequence: ('TUM' | 'TA')[];
  playbackProgress: number;
  feedbackMessage: string;
  feedbackType: string;
}) => (
  <div className="flex flex-col gap-2.5 bg-[#17110e] p-4 rounded-xl border border-[#2d221a]">
    <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400 text-left">Siga os Golpes:</span>
    
    <div className="flex justify-center items-center gap-2.5 sm:gap-4 flex-wrap py-1.5 w-full">
      {challengeSequence.map((step, idx) => {
        const isActivated = idx === playbackProgress;
        const userHit = userSequence[idx];
        const isHitPerfect = userHit === step;
        const isHitFailed = userHit !== undefined && userHit !== step;

        let nodeStyle = 'bg-[#110c09] border border-[#2d2018] text-stone-500';
        if (isActivated) {
          nodeStyle = 'bg-[#f27d26] text-black border-orange-400 font-extrabold scale-110 ring-2 ring-orange-500 shadow-[0_0_12px_rgba(242,125,38,0.5)]';
        } else if (isHitPerfect) {
          nodeStyle = 'bg-emerald-600 text-black border-emerald-500 font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.4)]';
        } else if (isHitFailed) {
          nodeStyle = 'bg-red-600 text-stone-150 border-red-500 font-extrabold shadow-[0_0_10px_rgba(239,68,68,0.4)]';
        } else if (userHit !== undefined) {
          nodeStyle = 'bg-orange-500 text-black border-orange-400';
        }

        return (
          <div key={idx} className="flex flex-col items-center gap-1.5 shrink-0 transition-transform duration-300">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xs tracking-wider transition-all shadow-sm ${nodeStyle}`}>
              {step}
            </div>
            <span className="text-[9px] font-mono text-stone-500">
              {isHitPerfect ? (
                <span className="text-emerald-400 font-bold font-sans">Ok</span>
              ) : isHitFailed ? (
                <span className="text-red-400 font-bold font-sans">Erro</span>
              ) : (
                `#${idx + 1}`
              )}
            </span>
          </div>
        );
      })}
    </div>

    {feedbackMessage && (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs leading-none justify-center mt-1 border text-center transition-all ${
        feedbackType === 'success' 
          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40'
          : feedbackType === 'error'
          ? 'bg-red-950/40 text-red-400 border-rose-900/30'
          : 'bg-[#1c1410] text-orange-400 border-[#2d221a]'
      }`}>
        {feedbackType === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        {feedbackType === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
        <span className="font-semibold text-center">{feedbackMessage}</span>
      </div>
    )}
  </div>
));

export default function GameModes({
  currentMode,
  onModeChange,
  onPlayDemoHit,
  gameState,
  setGameState
}: GameModesProps) {
  // Demo auto-play state
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [activeDemoId, setActiveDemoId] = useState('sao_bento');
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoIndexRef = useRef(0);

  // Challenge timeouts references (Store all timer IDs to clear them cleanly on disruption)
  const playSeqTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Stop everything when mode or level changes
  useEffect(() => {
    stopAllSequences();
    if (currentMode === 'CHALLENGE') {
      initializeLevel(gameState.currentLevel || 1);
    }
    return () => {
      stopAllSequences();
    };
  }, [currentMode, gameState.currentLevel]);

  // PERF-03: Safe play timer sincronization with React effect hooks
  useEffect(() => {
    if (!demoPlaying) {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      return;
    }

    const rhythm = DEMO_RHYTHMS.find(r => r.id === activeDemoId) || DEMO_RHYTHMS[0];
    const rhythmPattern = rhythm.pattern;
    const stepDuration = rhythm.subdivision === '16th'
      ? Math.round(15000 / rhythm.tempo)
      : Math.round(30000 / rhythm.tempo);

    demoIndexRef.current = 0;

    demoTimerRef.current = setInterval(() => {
      const step = rhythmPattern[demoIndexRef.current];
      if (step && step.type !== 'SILENCE') {
        onPlayDemoHit(step.x, step.y, step.type);
      }
      demoIndexRef.current = (demoIndexRef.current + 1) % rhythmPattern.length;
    }, stepDuration);

    return () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [demoPlaying, activeDemoId]);

  const stopAllSequences = () => {
    // Clear demo timers
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setDemoPlaying(false);

    // Clear challenge prompt timers
    playSeqTimeoutsRef.current.forEach(clearTimeout);
    playSeqTimeoutsRef.current = [];

    setGameState(prev => ({
      ...prev,
      isPlayingChallenge: false,
      challengeStatus: 'IDLE',
      userSequence: []
    }));
  };

  // -------------------------------------------------------------
  // OUVIRE EXEMPLO (PLAY DEMO RHYTHM)
  // -------------------------------------------------------------
  const selectDemoRhythm = (id: string) => {
    setActiveDemoId(id);
    // Restart rhythm playhead if currently playing
    if (demoPlaying) {
      setDemoPlaying(false);
      setTimeout(() => setDemoPlaying(true), 100);
    }
  };

  const toggleDemoPlay = () => {
    if (currentMode !== 'EXAMPLE') {
      onModeChange('EXAMPLE');
    }

    if (demoPlaying) {
      setDemoPlaying(false);
    } else {
      stopAllSequences();
      setDemoPlaying(true);
    }
  };

  // -------------------------------------------------------------
  // MODO DESAFIO (CHALLENGE GAME ENGINE)
  // -------------------------------------------------------------
  const initializeLevel = (level: number) => {
    const presetIndex = Math.min(level - 1, CHALLENGE_PRESETS.length - 1);
    const preset = CHALLENGE_PRESETS[presetIndex];

    setGameState(prev => ({
      ...prev,
      currentLevel: level,
      challengeSequence: preset.steps,
      userSequence: [],
      challengeStatus: 'IDLE',
      feedbackMessage: `Nível ${level}: Aprenda a sequência, depois repita!`,
      feedbackType: 'info'
    }));
  };

  const playChallengePrompt = () => {
    stopAllSequences();
    onModeChange('CHALLENGE');

    const presetIdx = Math.min(gameState.currentLevel - 1, CHALLENGE_PRESETS.length - 1);
    const preset = CHALLENGE_PRESETS[presetIdx];
    const steps = preset.steps;
    const interval = Math.floor(60000 / preset.tempo); // Dynamic BPM offset

    setGameState(prev => ({
      ...prev,
      challengeStatus: 'PLAYING_PROMPT',
      isPlayingChallenge: true,
      userSequence: [],
      feedbackMessage: 'Ritmo tocando... preste muita atenção!',
      feedbackType: 'info',
      playbackProgress: -1
    }));

    // Sequential chain of timeouts to hit the drum programmatically
    steps.forEach((step, index) => {
      const timerId = setTimeout(() => {
        // Fire hit at correct location
        const hitX = 0.0;
        const hitY = step === 'TUM' ? 0.85 : 0.0; // border vs center
        onPlayDemoHit(hitX, hitY, step);

        setGameState(prev => ({
          ...prev,
          playbackProgress: index
        }));

        // Final step clean-up transition
        if (index === steps.length - 1) {
          const finalTimerId = setTimeout(() => {
            setGameState(prev => ({
              ...prev,
              challengeStatus: 'WAITING_USER',
              playbackProgress: -1,
              feedbackMessage: 'Agora é a sua vez! Toque a sequência no atabaque!',
              feedbackType: 'info'
            }));
          }, interval);
          playSeqTimeoutsRef.current.push(finalTimerId);
        }
      }, (index + 1) * interval);

      playSeqTimeoutsRef.current.push(timerId);
    });
  };

  const handleLevelSelect = (level: number) => {
    stopAllSequences();
    initializeLevel(level);
  };

  const currentPreset = CHALLENGE_PRESETS[Math.min(gameState.currentLevel - 1, CHALLENGE_PRESETS.length - 1)];
  const activeRhythm = DEMO_RHYTHMS.find(r => r.id === activeDemoId) || DEMO_RHYTHMS[0];

  return (
    <div className="flex flex-col gap-4 bg-[#1c1410] border border-[#2d221a] rounded-2xl p-4 sm:p-5 shadow-[inset_0_2px_15px_rgba(0,0,0,0.5)]">
      {/* Modes Navigation Selector Tabs */}
      <div className="flex bg-[#251b14] rounded-xl p-1.5 gap-1.5 w-full relative z-10 border border-[#33251c]">
        <button
          id="tab-mode-free"
          onClick={() => onModeChange('FREE')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            currentMode === 'FREE'
              ? 'bg-[#f27d26] text-[#120d0a] shadow-[0_0_12px_rgba(242,125,38,0.4)] font-bold'
              : 'text-stone-400 hover:bg-[#2d2018] hover:text-stone-150'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Modo Livre
        </button>

        <button
          id="tab-mode-example"
          onClick={() => {
            onModeChange('EXAMPLE');
            if (!demoPlaying) toggleDemoPlay();
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            currentMode === 'EXAMPLE'
              ? 'bg-[#f27d26] text-[#120d0a] shadow-[0_0_12px_rgba(242,125,38,0.4)] font-bold'
              : 'text-stone-400 hover:bg-[#2d2018] hover:text-stone-150'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Ouvir Exemplo
        </button>

        <button
          id="tab-mode-challenge"
          onClick={() => onModeChange('CHALLENGE')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            currentMode === 'CHALLENGE'
              ? 'bg-[#f27d26] text-[#120d0a] shadow-[0_0_12px_rgba(242,125,38,0.4)] font-bold'
              : 'text-stone-400 hover:bg-[#2d2018] hover:text-stone-150'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Modo Desafio
        </button>
      </div>

      {/* RHYTHM DEMO PANEL (Ouvir Exemplo Mode) */}
      {currentMode === 'EXAMPLE' && (
        <div className="flex flex-col gap-4 py-1.5 animate-fadeIn">
          {/* Rhythm Selector Buttons */}
          <div className="text-left flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400">Selecione o Ritmo para Ouvir:</span>
            <div className="flex flex-wrap gap-2">
              {DEMO_RHYTHMS.map(rhythm => {
                const isActive = rhythm.id === activeDemoId;
                return (
                  <button
                    key={rhythm.id}
                    onClick={() => selectDemoRhythm(rhythm.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                      isActive
                        ? 'bg-[#f27d26] text-black font-extrabold border-[#f27d26] shadow-[0_0_12px_rgba(242,125,38,0.3)]'
                        : 'bg-[#241a14] hover:bg-[#32241c] text-stone-300 border-[#3e2c21]'
                    }`}
                  >
                    {rhythm.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Rhythm Card */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#241a14] border border-[#3e2c21] p-4 rounded-2xl shadow-md">
            <div className="flex gap-3.5 items-center w-full">
              <div className={`p-3 rounded-full shrink-0 transition-transform ${demoPlaying ? 'bg-[#f27d26] text-black animate-pulse scale-105' : 'bg-[#1a120e] text-[#f27d26]'}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-orange-500 block mb-0.5">{activeRhythm.category}</span>
                <h4 className="text-sm font-extrabold text-stone-100 font-sans truncate">{activeRhythm.name}</h4>
                <p className="text-xs text-stone-300 font-medium leading-relaxed mt-1">{activeRhythm.description}</p>
                <p className="text-[10px] text-stone-500 font-mono mt-1">Sincronização Ativa: {activeRhythm.tempo} BPM • {activeRhythm.pattern.filter(p => p.type !== 'SILENCE').length} Golpes ativos</p>
              </div>
            </div>

            <button
              id="btn-toggle-demo"
              onClick={toggleDemoPlay}
              className={`w-full sm:w-auto shrink-0 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-md ${
                demoPlaying
                  ? 'bg-red-650 hover:bg-red-700 text-stone-100'
                  : 'bg-[#f27d26] hover:bg-orange-600 text-black'
              }`}
            >
              {demoPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" /> Parar Ritmo
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Iniciar Toque
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* CHALLENGE GAME INTERACTION PANEL (Modo Desafio) */}
      {currentMode === 'CHALLENGE' && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Level list selector dropdown/inline list */}
          <ChallengePresetsList 
            currentLevel={gameState.currentLevel}
            onSelectLevel={handleLevelSelect}
          />

          {/* Core HUD status */}
          <ChallengeHUD 
            score={gameState.score}
            streak={gameState.streak}
            maxStreak={gameState.maxStreak}
          />

          {/* Preset Name and Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#241a14] border border-[#3e2c21] p-3.5 rounded-xl shadow-sm">
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-orange-500">Sequência Ativa</span>
              <h5 className="text-sm font-extrabold text-stone-100 leading-tight">{currentPreset?.name}</h5>
              <p className="text-[11px] text-stone-400">Tempo: {currentPreset?.tempo} BPM • {currentPreset?.steps.length} golpes</p>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              {gameState.challengeStatus === 'PLAYING_PROMPT' ? (
                <button
                  disabled
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-[#1a120e] text-orange-400 flex items-center justify-center gap-1.5 opacity-80"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping"></span>
                  Escutando...
                </button>
              ) : (
                <button
                  id="btn-play-prompt"
                  onClick={playChallengePrompt}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#f27d26] hover:bg-orange-600 text-black cursor-pointer flex items-center justify-center gap-1.5 shadow active:scale-[0.98] transition-transform"
                >
                  {gameState.challengeStatus === 'WAITING_USER' ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" /> Ouvir de Novo
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" /> Começar Desafio
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Graphical Rhythmic Step Nodes and Message feedback */}
          <RhythmStepsGrid 
            challengeSequence={gameState.challengeSequence}
            userSequence={gameState.userSequence}
            playbackProgress={gameState.playbackProgress}
            feedbackMessage={gameState.feedbackMessage}
            feedbackType={gameState.feedbackType}
          />
        </div>
      )}

      {/* FREE PLAY PANEL DESCRIPTION (Modo Livre) */}
      {currentMode === 'FREE' && (
        <div className="text-left px-1 py-1.5 animate-fadeIn">
          <h4 className="text-xs font-bold uppercase tracking-wider text-orange-500 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span> Exploração Sonora Livre
          </h4>
          <p className="text-xs text-stone-300 leading-relaxed mt-1">
            Toque e experimente em qualquer parte do couro natural em tempo real. Varie a velocidade e a posição do toque para obter dinâmicas reais. Use múltiplos dedos no celular para simular rulos rápidos!
          </p>
        </div>
      )}
    </div>
  );
}
