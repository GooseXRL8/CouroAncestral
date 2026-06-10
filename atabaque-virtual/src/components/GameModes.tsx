/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { PlayMode, GameState, ChallengeSequence } from '../types';
import { Play, Square, RotateCcw, Award, Zap, CheckCircle2, AlertTriangle, ArrowRight, BookOpen, Sparkles } from 'lucide-react';

interface GameModesProps {
  currentMode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  onPlayDemoHit: (x: number, y: number, type: 'TUM' | 'TA') => void;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}

const CHALLENGE_PRESETS: ChallengeSequence[] = [
  { id: '1', name: 'Nível 1: Batida Base', steps: ['TUM', 'TA'], tempo: 100 },
  { id: '2', name: 'Nível 2: Chamada Dobrada', steps: ['TUM', 'TUM', 'TA'], tempo: 110 },
  { id: '3', name: 'Nível 3: Toque de Angola', steps: ['TUM', 'TA', 'TUM', 'TA'], tempo: 115 },
  { id: '4', name: 'Nível 4: São Bento Pequeno', steps: ['TUM', 'TUM', 'TA', 'TA'], tempo: 120 },
  { id: '5', name: 'Nível 5: São Bento Grande de Angola', steps: ['TUM', 'TUM', 'TA', 'TUM', 'TA'], tempo: 120 },
  { id: '6', name: 'Nível 6: Barravento', steps: ['TUM', 'TUM', 'TA', 'TUM', 'TA', 'TUM', 'TA'], tempo: 125 },
  { id: '7', name: 'Nível 7: Ritmo Imperial', steps: ['TUM', 'TA', 'TA', 'TUM', 'TUM', 'TA', 'TUM', 'TA'], tempo: 130 }
];

export default function GameModes({
  currentMode,
  onModeChange,
  onPlayDemoHit,
  gameState,
  setGameState
}: GameModesProps) {
  // Demo auto-play state
  const [demoPlaying, setDemoPlaying] = useState(false);
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoIndexRef = useRef(0);

  // Challenge timeouts references (Store all timer IDs to clear them cleanly on disruption)
  const playSeqTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      stopAllSequences();
    };
  }, []);

  // Stop everything when mode changes
  useEffect(() => {
    stopAllSequences();
    if (currentMode === 'CHALLENGE') {
      initializeLevel(gameState.currentLevel || 1);
    }
  }, [currentMode]);

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
  const toggleDemoPlay = () => {
    if (currentMode !== 'EXAMPLE') {
      onModeChange('EXAMPLE');
    }

    if (demoPlaying) {
      if (demoTimerRef.current) clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
      setDemoPlaying(false);
    } else {
      stopAllSequences();
      setDemoPlaying(true);
      demoIndexRef.current = 0;

      // Traditional Capoeira São Bento Grande continuous rhythm loop
      // 8-step subdivision
      const rhythmPattern: { type: 'TUM' | 'TA' | 'SILENCE'; x: number; y: number }[] = [
        { type: 'TUM', x: 0.0, y: 0.8 },      // Step 0: TUM near bottom edge
        { type: 'SILENCE', x: 0, y: 0 },      // Step 1: SILENCE
        { type: 'TUM', x: -0.6, y: -0.6 },    // Step 2: TUM on top-left edge
        { type: 'SILENCE', x: 0, y: 0 },      // Step 3: SILENCE
        { type: 'TA', x: 0.0, y: 0.0 },       // Step 4: TA in absolute center
        { type: 'SILENCE', x: 0, y: 0 },      // Step 5: SILENCE
        { type: 'TUM', x: 0.6, y: -0.6 },     // Step 6: TUM on top-right edge
        { type: 'TA', x: 0.1, y: -0.1 }        // Step 7: TA near center
      ];

      const stepDuration = 220; // 220ms per sixteenth note (~136 BPM)

      demoTimerRef.current = setInterval(() => {
        const step = rhythmPattern[demoIndexRef.current];
        if (step.type !== 'SILENCE') {
          onPlayDemoHit(step.x, step.y, step.type);
        }
        
        // Loop index
        demoIndexRef.current = (demoIndexRef.current + 1) % rhythmPattern.length;
      }, stepDuration);
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
        const hitX = step === 'TUM' ? 0.0 : 0.0;
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
        <div className="flex flex-col gap-3 py-1.5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#241a14] border border-[#3e2c21] p-3.5 rounded-xl">
            <div className="flex gap-3 items-center">
              <div className={`p-2.5 rounded-full ${demoPlaying ? 'bg-[#f27d26] text-black animate-pulse' : 'bg-[#1a120e] text-[#f27d26]'}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="text-xs uppercase tracking-wider font-semibold text-orange-500">Toque de Capoeira</span>
                <h4 className="text-sm font-semibold text-stone-100 font-sans">São Bento Grande de Angola</h4>
                <p className="text-xs text-stone-400">Visualizando o balanço clássico do Atabaque na capoeiragem.</p>
              </div>
            </div>

            <button
              id="btn-toggle-demo"
              onClick={toggleDemoPlay}
              className={`w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow ${
                demoPlaying
                  ? 'bg-red-650 hover:bg-red-750 text-stone-100'
                  : 'bg-[#f27d26] hover:bg-orange-600 text-[#120d0a]'
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
          {/* Level List selector dropdown/inline list for fast navigation */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400 text-left">Selecione o Grau:</span>
            <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-thin scrollbar-thumb-orange-850/45">
              {CHALLENGE_PRESETS.map((preset, idx) => {
                const isSelected = gameState.currentLevel === idx + 1;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleLevelSelect(idx + 1)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#f27d26] text-black font-bold'
                        : 'bg-[#251b14] hover:bg-[#32241c] text-stone-400'
                    }`}
                  >
                    Nível {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core HUD status displaying score, streaks and active preset */}
          <div className="grid grid-cols-3 gap-3 bg-[#130d0a] text-stone-300 p-3.5 rounded-xl shadow-lg relative overflow-hidden border border-[#2d221a]">
            {/* Visual ambient light gradient inside hud */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-stone-550">Pontuação</span>
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-[#f27d26]">{gameState.score}</span>
            </div>

            <div className="flex flex-col items-center border-x border-[#2d221a]/30">
              <span className="text-[9px] uppercase tracking-wider text-stone-550">Combo / Seq</span>
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-orange-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 fill-current text-orange-400 animate-bounce" />
                {gameState.streak}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-wider text-stone-550">Nível Máximo</span>
              <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-amber-400">{gameState.maxStreak}</span>
            </div>
          </div>

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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-[#1a120e] text-orange-450 flex items-center justify-center gap-1.5 opacity-80"
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

          {/* Graphical Rhythmic Step Nodes (Target steps and user inputs) */}
          <div className="flex flex-col gap-2.5 bg-[#17110e] p-4 rounded-xl border border-[#2d221a]">
            <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400 text-left">Siga os Golpes:</span>
            
            <div className="flex justify-center items-center gap-2.5 sm:gap-4.5 py-1.5 overflow-x-auto w-full">
              {gameState.challengeSequence.map((step, idx) => {
                const isActivated = idx === gameState.playbackProgress;
                const userHit = gameState.userSequence[idx];
                const isHitPerfect = userHit === step;
                const isHitFailed = userHit !== undefined && userHit !== step;

                let nodeStyle = 'bg-[#110c09] border border-[#2d2018] text-stone-500';
                if (isActivated) {
                  nodeStyle = 'bg-[#f27d26] text-black border-orange-400 font-black scale-115 ring-2 ring-orange-500 shadow-[0_0_12px_rgba(242,125,38,0.5)]';
                } else if (isHitPerfect) {
                  nodeStyle = 'bg-emerald-600 text-black border-emerald-500 font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.4)]';
                } else if (isHitFailed) {
                  nodeStyle = 'bg-red-600 text-stone-100 border-red-500 font-extrabold shadow-[0_0_10px_rgba(239,68,68,0.4)]';
                } else if (userHit !== undefined) {
                  nodeStyle = 'bg-orange-500 text-black border-orange-400';
                }

                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5 shrink-0 transition-transform duration-300">
                    <div className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl flex items-center justify-center text-xs tracking-wider transition-all shadow-sm ${nodeStyle}`}>
                      {step}
                    </div>
                    {/* Tiny visual progress pointers under the balls */}
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

            {/* Micro progress indicator message bar */}
            {gameState.feedbackMessage && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs leading-none justify-center mt-1 border text-center transition-all ${
                gameState.feedbackType === 'success' 
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40'
                  : gameState.feedbackType === 'error'
                  ? 'bg-red-950/40 text-red-400 border-rose-900/30 animate-shake'
                  : 'bg-[#1c1410] text-orange-400 border-[#2d221a]'
              }`}>
                {gameState.feedbackType === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {gameState.feedbackType === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-bounce" />}
                <span className="font-semibold text-left sm:text-center shrink-0">{gameState.feedbackMessage}</span>
              </div>
            )}
          </div>
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
