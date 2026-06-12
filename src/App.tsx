/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { PlayMode, AudioSettings, GameState, RecordedHit } from './types';
import { AtabaqueAudioEngine } from './audio';
import AtabaqueCanvas from './components/AtabaqueCanvas';
import GameModes from './components/GameModes';
import SettingsPanel from './components/SettingsPanel';
import { Music, GraduationCap, Heart, InfoIcon, Play, Square, Award } from 'lucide-react';

/**
 * Procedural Atabaque Virtual Web Application
 * Master Controller
 */
export default function App() {
  // 1. Core State Managers
  const [currentMode, setCurrentMode] = useState<PlayMode>('FREE');
  const [hitCount, setHitCount] = useState<number>(0);
  const [audioActivated, setAudioActivated] = useState<boolean>(false);
  
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    volume: 0.8,
    reverbEnabled: true,
    frequencyFactor: 1.0,
    tuning: 'RUM'
  });

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    streak: 0,
    maxStreak: 0,
    currentLevel: 1,
    challengeSequence: [],
    userSequence: [],
    userTimings: [],
    playbackProgress: -1,
    isPlayingChallenge: false,
    challengeStatus: 'IDLE',
    feedbackMessage: 'Clique em "Começar Desafio" para ouvir os sinais do tambor!',
    feedbackType: 'info'
  });

  // Track programmatically triggered drum hits (for demo / playback visual lightups)
  const [activeRhythmHits, setActiveRhythmHits] = useState<{ x: number; y: number; type: 'TUM' | 'TA'; timestamp: number }[]>([]);

  // FEAT-01: Recording studio state definitions
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPlayingRecording, setIsPlayingRecording] = useState<boolean>(false);
  const [recordedHits, setRecordedHits] = useState<RecordedHit[]>([]);
  const recordStartTimeRef = useRef<number | null>(null);
  const playbackTimersRef = useRef<NodeJS.Timeout[]>([]);

  // 2. Audio Engine Reference (Lazy loader)
  const audioEngineRef = useRef<AtabaqueAudioEngine | null>(null);

  // BUG-04: Refs tracking current states to make handleAtabaqueHit immune to React's stale closure updates
  const gameStateRef = useRef(gameState);
  const currentModeRef = useRef(currentMode);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  // Lazy instantiate the Audio Engine on-demand to bypass initial browser autoplay blockades
  const getAudioEngine = (): AtabaqueAudioEngine => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AtabaqueAudioEngine(audioSettings);
      audioEngineRef.current.init();
    }
    return audioEngineRef.current;
  };

  // Sync settings modifications directly into Audio Node Graph
  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setVolume(audioSettings.volume);
      audioEngineRef.current.setReverbEnabled(audioSettings.reverbEnabled);
      audioEngineRef.current.updateTuning(audioSettings.tuning);
    }
  }, [audioSettings]);

  // Clean recording timeouts on unmount
  useEffect(() => {
    return () => {
      playbackTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  /**
   * Triggers a synthetic percussion strike at specific coordinates, counts metrics,
   * and runs gameplay validators if playing inside a challenge.
   */
  const handleAtabaqueHit = async (
    x: number,
    y: number,
    distance: number,
    intensity: number
  ): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> => {
    // SEC-02 gesture activation
    if (!audioActivated) {
      setAudioActivated(true);
    }

    // 1. Play synthesis sound
    const engine = getAudioEngine();
    const playbackStroke = await engine.playHit(x, y, distance, intensity);

    // 2. Increment interaction statistics
    setHitCount(prev => prev + 1);

    const activeMode = currentModeRef.current;
    const currentGameState = gameStateRef.current;

    // FEAT-01: Record hits as user plays on the drumhead
    if (isRecording && recordStartTimeRef.current !== null && (playbackStroke.type === 'TUM' || playbackStroke.type === 'TA')) {
      const offset = Date.now() - recordStartTimeRef.current;
      setRecordedHits(prev => [...prev, {
        type: playbackStroke.type as 'TUM' | 'TA',
        timeOffset: offset,
        x,
        y
      }]);
    }

    // 3. Process game challenge feedback if model expects user stroke input (using Ref tracking)
    if (activeMode === 'CHALLENGE' && currentGameState.challengeStatus === 'WAITING_USER') {
      const stepIndex = currentGameState.userSequence.length;
      const targetStep = currentGameState.challengeSequence[stepIndex];

      // Safe backup classification for tricky borderline "intermediate" hits
      const resolvedHit: 'TUM' | 'TA' = (playbackStroke.type === 'TUM')
        ? 'TUM'
        : (playbackStroke.type === 'TA')
          ? 'TA'
          : (distance > 0.57 ? 'TUM' : 'TA');

      const isCorrect = resolvedHit === targetStep;

      if (isCorrect) {
        const updatedSeq = [...currentGameState.userSequence, resolvedHit];
        const isSequenceComplete = updatedSeq.length === currentGameState.challengeSequence.length;

        if (isSequenceComplete) {
          // Level Completed! calculate combo rewards
          const pointsEarned = currentGameState.currentLevel * 100 * (1 + currentGameState.streak);
          const nextStreak = currentGameState.streak + 1;
          const nextMax = Math.max(currentGameState.maxStreak, nextStreak);
          const nextLevel = Math.min(currentGameState.currentLevel + 1, 10); // Cap at max levels (Expanded Level 10)

          setGameState(prev => ({
            ...prev,
            score: prev.score + pointsEarned,
            streak: nextStreak,
            maxStreak: nextMax,
            userSequence: updatedSeq,
            challengeStatus: 'SUCCESS',
            feedbackMessage: `Excelente! Ritmo correto! +${pointsEarned} pontos. 🏆`,
            feedbackType: 'success'
          }));

          // Trigger next level transition
          setTimeout(() => {
            setGameState(prev => ({
              ...prev,
              currentLevel: nextLevel,
              challengeSequence: [],
              userSequence: [],
              challengeStatus: 'IDLE',
              feedbackMessage: `Nível ${nextLevel} carregado. Toque para tentar!`,
              feedbackType: 'info'
            }));
          }, 2000);
        } else {
          // Correct, but pattern not finished yet
          setGameState(prev => ({
            ...prev,
            userSequence: updatedSeq,
            feedbackMessage: `Contatos: ${updatedSeq.join(' → ')} (Continue!)`,
            feedbackType: 'success'
          }));
        }
      } else {
        // Errou o passo! Reset level combo
        setGameState(prev => ({
          ...prev,
          userSequence: [],
          streak: 0,
          challengeStatus: 'FAILED',
          feedbackMessage: `Sequência incorreta! Você tocou ${resolvedHit} mas esperava ${targetStep}. Reinicie! 💔`,
          feedbackType: 'error'
        }));
      }
    }

    return playbackStroke;
  };

  /**
   * Programmatic simulator triggers. Highlights canvas skin and plays audio.
   * Leveraged by "Ouvir Exemplo" and Playback demo sequences.
   */
  const handlePlayDemoHit = (x: number, y: number, type: 'TUM' | 'TA') => {
    // Play synthesis
    const dist = type === 'TUM' ? 0.85 : 0.15;
    const engine = getAudioEngine();
    engine.playHit(x, y, dist, 0.9);

    // Flash canvas indicator
    const newDemoHit = { x, y, type, timestamp: Date.now() };
    setActiveRhythmHits(prev => [...prev.slice(-3), newDemoHit]); // Keep last 4 max
  };

  /**
   * Completely clear session statistics, combos and scores.
   */
  const handleResetSession = () => {
    setHitCount(0);
    setGameState({
      score: 0,
      streak: 0,
      maxStreak: 0,
      currentLevel: 1,
      challengeSequence: [],
      userSequence: [],
      userTimings: [],
      playbackProgress: -1,
      isPlayingChallenge: false,
      challengeStatus: 'IDLE',
      feedbackMessage: 'Pontuação reiniciada. Escolha o modo de jogo acima!',
      feedbackType: 'info'
    });
  };

  // FEAT-01: Start current interaction recording
  const startRecording = () => {
    setIsRecording(true);
    setRecordedHits([]);
    recordStartTimeRef.current = Date.now();
  };

  // FEAT-01: Stop current interaction recording
  const stopRecording = () => {
    setIsRecording(false);
  };

  // FEAT-01: Trigger sequential playback of recorded strokes
  const startPlaybackRecording = () => {
    if (recordedHits.length === 0) return;
    setIsPlayingRecording(true);

    playbackTimersRef.current.forEach(clearTimeout);
    playbackTimersRef.current = [];

    recordedHits.forEach((hit) => {
      const timer = setTimeout(() => {
        handlePlayDemoHit(hit.x, hit.y, hit.type);
      }, hit.timeOffset);
      playbackTimersRef.current.push(timer);
    });

    // Stop light-up markers cleanly upon end of stream
    const maxDuration = recordedHits[recordedHits.length - 1].timeOffset + 100;
    const wrapTimer = setTimeout(() => {
      setIsPlayingRecording(false);
    }, maxDuration);
    playbackTimersRef.current.push(wrapTimer);
  };

  const stopPlaybackRecording = () => {
    playbackTimersRef.current.forEach(clearTimeout);
    playbackTimersRef.current = [];
    setIsPlayingRecording(false);
  };

  // FEAT-01: Export captured rhythm list into downloadable file
  const exportRecordingAsJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(recordedHits, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `atabaque_ritmo_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#120d0a] text-stone-100 flex flex-col justify-between font-sans antialiased overflow-x-hidden">
      
      {/* 1. Header Navigation Bar styled as a vintage professional audio synthesizer bezel */}
      <header id="header-nav-main" className="border-b border-[#2d221a]/70 bg-[#1a1410]/90 backdrop-blur shrink-0 py-4 px-4 sm:px-6 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-3 sm:gap-0 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-950 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.3)] text-amber-50">
              <span className="text-xl font-bold font-serif">A</span>
            </div>
            <div className="text-left">
              <h1 className="text-lg sm:text-xl font-light tracking-tighter text-orange-500 uppercase">
                Simulador <span className="font-bold text-white">Atabaque</span>
              </h1>
              <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-semibold leading-none mt-1">
                Motor de Síntese Realista Físico-Acústica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* QA-02: Rectified color class typo bg-orange-550 to bg-orange-500 */}
            <div className="flex items-center gap-1.5 bg-[#251b14] border border-[#f27d26]/20 rounded-full px-3 py-1 text-[11px] font-semibold text-orange-400">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
              Web Audio DSP
            </div>
            <button
              onClick={() => {
                const engine = getAudioEngine();
                engine.resume();
                setAudioActivated(true);
              }}
              className="text-xs bg-orange-600 hover:bg-orange-700 text-black font-extrabold px-4 py-1.5 rounded-full transition-all cursor-pointer shadow-[0_0_12px_rgba(242,125,38,0.4)] active:scale-[0.98]"
            >
              Conectar Saída
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Workstation Grid with high-fidelity split layout */}
      <main className="grow py-6 px-4 sm:px-6 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT Performing Instrument Deck (Col span: 7) */}
        <section className="lg:col-span-12 xl:col-span-7 bg-[#1c1410] border border-[#2d221a] rounded-2xl p-4 sm:p-6 shadow-[inset_0_4px_30px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden h-auto min-h-[460px] sm:min-h-[560px] lg:h-[70vh]">
          {/* Subtle geometric technical grid watermarks */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="text-left mb-4 relative z-10 border-b border-[#2d221a] pb-3 flex justify-between items-end">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-orange-500 font-semibold leading-none">Canal de Toque</span>
              <h2 className="text-base font-bold text-stone-100 font-serif tracking-tight mt-1">
                Membrana Acústica Transiente
              </h2>
            </div>
            <div className="text-right text-[10px] font-mono text-stone-500">
              [CONEXÃO DIRETA]
            </div>
          </div>

          {/* Interactive Canvas Rendering layer (SEC-02: Pass audioActivated prop) */}
          <AtabaqueCanvas 
            onHit={handleAtabaqueHit}
            activeRhythmHits={activeRhythmHits}
            audioActivated={audioActivated}
          />
        </section>

        {/* RIGHT Specialised Controls Stack (Col span: 5) */}
        <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6 w-full">
          
          {/* Playback Controls & Rhythm Gamification Panel */}
          <section className="bg-[#1a1411] border border-[#2d221a] rounded-2xl p-0.5 shadow-md">
            <GameModes
              currentMode={currentMode}
              onModeChange={setCurrentMode}
              onPlayDemoHit={handlePlayDemoHit}
              gameState={gameState}
              setGameState={setGameState}
            />
          </section>

          {/* FEAT-01: Sleek Recording Studio Card */}
          <section className="bg-[#16100d] border border-[#2d221a] rounded-2xl p-4 sm:p-5 shadow-inner text-left flex flex-col gap-3.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/5 rounded-full blur-xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center border-b border-[#2d221a]/60 pb-2">
              <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                <Music className="w-4 h-4 text-orange-400" />
                Estúdio de Gravação
              </h3>
              {isRecording && (
                <span className="flex items-center gap-1.5 text-[10px] text-red-500 font-extrabold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-650 shadow-[0_0_8px_#ef4444]"></span> GRAVANDO
                </span>
              )}
            </div>

            <p className="text-xs text-stone-300 leading-normal">
              Grave sua própria polirritmia no couro, assista ao playback automatizado ou exporte o mapa rítmico como arquivo JSON.
            </p>

            <div className="flex gap-2.5 flex-wrap">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isPlayingRecording}
                  className="flex-1 min-w-[120px] py-2 bg-red-950/20 hover:bg-red-900/40 text-red-100 hover:text-red-300 border border-red-900/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> Gravar
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex-1 min-w-[120px] py-2 bg-stone-900 hover:bg-stone-850 text-stone-100 border border-stone-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  <Square className="w-3 h-3 fill-current text-white" /> Parar
                </button>
              )}

              {recordedHits.length > 0 && (
                <>
                  {!isPlayingRecording ? (
                    <button
                      onClick={startPlaybackRecording}
                      disabled={isRecording}
                      className="flex-1 min-w-[140px] py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-110 text-black rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider shadow"
                    >
                      <Play className="w-3 h-3 fill-current text-black" /> Ouvir ({recordedHits.length})
                    </button>
                  ) : (
                    <button
                      onClick={stopPlaybackRecording}
                      className="flex-1 min-w-[140px] py-2 bg-stone-900 hover:bg-stone-850 text-stone-100 border border-stone-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                    >
                      <Square className="w-3 h-3 fill-stone-100" /> Parar Reprodução
                    </button>
                  )}

                  <button
                    onClick={exportRecordingAsJSON}
                    className="px-3.5 py-2 bg-[#251b14] hover:bg-[#32241c] text-stone-300 border border-[#3c2b20] rounded-xl text-xs font-semibold hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Exportar JSON para o computador"
                  >
                    Exportar JSON
                  </button>
                </>
              )}
            </div>

            {recordedHits.length > 0 && !isRecording && (
              <div className="text-[10px] font-mono text-stone-500 leading-tight">
                Lista Rítmica: <span className="text-[#f27d26]">{recordedHits.map(h => h.type).slice(0, 12).join(' → ')}{recordedHits.length > 12 ? '...' : ''}</span>
              </div>
            )}
          </section>

          {/* Advanced Audio DSP variables, meters and volume dials */}
          <section className="bg-[#1a1411] border border-[#2d221a] rounded-2xl p-0.5 shadow-md">
            <SettingsPanel
              settings={audioSettings}
              hitCount={hitCount}
              currentMode={currentMode}
              onVolumeChange={(val) => setAudioSettings(prev => ({ ...prev, volume: val }))}
              onReverbChange={(val) => setAudioSettings(prev => ({ ...prev, reverbEnabled: val }))}
              onTuningChange={(val) => setAudioSettings(prev => ({ ...prev, tuning: val }))}
              onPitchFactorChange={(val) => setAudioSettings(prev => ({ ...prev, frequencyFactor: val }))}
              onResetSession={handleResetSession}
            />
          </section>

          {/* 3. Cultural educational context styled as a sleek metal reference plaque */}
          <section className="bg-[#17110e] border border-[#2d221a] rounded-2xl p-5 shadow-inner text-left flex flex-col gap-3.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/5 rounded-full blur-xl pointer-events-none"></div>
            
            <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-orange-500" />
              Especificações e Identidade Acústica
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-[11px] leading-relaxed text-stone-300">
              <div className="bg-[#1f1713] p-3 rounded-xl border border-white/[0.03]">
                <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-orange-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Rum
                </h4>
                <p className="text-stone-400 leading-normal">
                  Foco grave em 85Hz - 110Hz. O tambor guia responsável pelas improvisações e marcações na roda.
                </p>
              </div>
              
              <div className="bg-[#1f1713] p-3 rounded-xl border border-white/[0.03]">
                <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-orange-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Rumpi
                </h4>
                <p className="text-stone-400 leading-normal">
                  Médio em 115Hz - 145Hz. Conector polirrítmico constante para assegurar a harmonia rítmica.
                </p>
              </div>

              <div className="bg-[#1f1713] p-3 rounded-xl border border-white/[0.03]">
                <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-orange-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Lê
                </h4>
                <p className="text-stone-400 leading-normal">
                  Agudo seco em 150Hz - 195Hz. Ataques rápidos e brilhantes para suporte ao andamento dos coros.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 items-start bg-[#1a120e] p-3 rounded-xl border border-white/[0.02] text-[10px] text-stone-400">
              <InfoIcon className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="text-left leading-normal">
                <strong>Configuração de Monitor Espacial:</strong> Para máxima fidelidade do ressonador sub-bass simulado ("TUM"), recomenda-se o uso de fones de ouvido de nível profissional ou monitores de áudio de campo próximo.
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* 4. Footer credits styled as a thin carbon plate bezel */}
      <footer className="border-t border-[#231b15] bg-[#120d0a]/60 shrink-0 py-5 text-xs text-center text-stone-500 flex flex-col sm:flex-row items-center justify-between px-6 gap-2 w-full max-w-7xl mx-auto">
        <p className="flex items-center gap-1 justify-center">
          Feito com <Heart className="w-3 h-3 text-red-600 fill-current animate-pulse" /> • Atabaque Virtual Brasileiro • Hardware v1.0
        </p>
        <p className="font-mono text-[10px] text-stone-500/80">
          WEB AUDIO PROCEDURAL MODELLING ENGINE • 2026
        </p>
      </footer>
      
    </div>
  );
}
