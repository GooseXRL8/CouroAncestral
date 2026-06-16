/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AudioSettings } from '../types';
import { Volume2, VolumeX, Music, HelpCircle, RefreshCw, Radio, Settings } from 'lucide-react';

interface SettingsPanelProps {
  settings: AudioSettings;
  hitCount: number;
  currentMode: string;
  onVolumeChange: (volume: number) => void;
  onReverbChange: (enabled: boolean) => void;
  onTuningChange: (tuning: 'RUM' | 'RUMPI' | 'LE') => void;
  onPitchFactorChange: (factor: number) => void;
  onResetSession: () => void;
}

export default function SettingsPanel({
  settings,
  hitCount,
  currentMode,
  onVolumeChange,
  onReverbChange,
  onTuningChange,
  onPitchFactorChange,
  onResetSession
}: SettingsPanelProps) {
  
  // Format the name of the active size tuning
  const getTuningDescription = (t: 'RUM' | 'RUMPI' | 'LE') => {
    switch (t) {
      case 'RUM': return 'Grave, profundo e imponente (Atabaque Rum)';
      case 'RUMPI': return 'Médio, versátil e equilibrado (Atabaque Rumpi)';
      case 'LE': return 'Agudo, cortante e expressivo (Atabaque Lê)';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-[#1c1410] border border-[#2d221a] rounded-2xl p-4 sm:p-5 shadow-[inset_0_2px_15px_rgba(0,0,0,0.5)]">
      
      {/* COLUMN 1: INSTRUMENT CONTROLS */}
      <div className="flex flex-col gap-4 text-left">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-500 font-sans flex items-center gap-2 border-b border-[#2d221a]/60 pb-2">
          <Settings className="w-4 h-4 text-orange-400" />
          Ajustes de Afinação e Áudio
        </h4>

        {/* 1. Atabaque Size Tuning Selector buttons */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wider font-bold text-stone-400">Seleção do Atabaque:</label>
          <div className="flex bg-[#251b14] rounded-lg p-1 gap-1 border border-[#33251c]">
            {(['RUM', 'RUMPI', 'LE'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTuningChange(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold uppercase hover:shadow-sm cursor-pointer transition-all ${
                  settings.tuning === t
                    ? 'bg-[#f27d26] text-[#120d0a] shadow-sm font-extrabold'
                    : 'text-stone-300 hover:bg-[#32241c]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-stone-400 italic">
            {getTuningDescription(settings.tuning)}
          </span>
        </div>

        {/* 2. Pitch Sweep Scale Factor */}
        <div className="flex flex-col gap-1 text-left">
          <div className="flex justify-between items-center text-xs font-semibold text-stone-400">
            <span className="flex items-center gap-1">
              Tensão do Couro:
            </span>
            <span className="font-mono text-orange-400 font-bold">{Math.round(settings.frequencyFactor * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={settings.frequencyFactor}
            onChange={(e) => onPitchFactorChange(parseFloat(e.target.value))}
            className="w-full accent-[#f27d26] cursor-pointer h-1.5 bg-[#130d0a] border border-stone-800 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[9px] text-[#f27d26]/80 font-mono">
            <span>Frouxo (Grave)</span>
            <span>Apertado (Agudo)</span>
          </div>
        </div>

        {/* 3. Reverb Toggle / Sliders */}
        <div className="flex items-center justify-between py-1 border-t border-[#2d221a]/55 mt-1">
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
              Eco do Atabaque
            </span>
            <span className="text-[10px] text-stone-400 leading-normal">
              Simular reverberação em espaço aberto (roda)
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.reverbEnabled}
              onChange={(e) => onReverbChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#251b14] border border-[#3e2c21] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f27d26]"></div>
          </label>
        </div>
      </div>

      {/* COLUMN 2: ANALYTIC METRICS & CONTROLS */}
      <div className="flex flex-col gap-4 text-left border-t md:border-t-0 md:border-l border-[#2d221a]/65 md:pl-5 pt-4 md:pt-0">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-500 font-sans flex items-center gap-2 border-b border-[#2d221a]/60 pb-2">
          <Radio className="w-4 h-4 text-orange-400" />
          Métricas e Estatísticas da Sessão
        </h4>

        {/* Real-time stats visualization grids */}
        <div className="grid grid-cols-2 gap-3 grow">
          <div className="bg-[#130d0a] border border-[#2d221a] p-3 rounded-xl flex flex-col justify-between shadow-inner">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Golpes Totais</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold font-mono tracking-tight text-[#f27d26]">{hitCount}</span>
              <span className="text-[10px] text-stone-400">toques</span>
            </div>
            <span className="text-[9px] text-stone-500 leading-none mt-1">Acúmulo na sessão ativa</span>
          </div>

          <div className="bg-[#130d0a] border border-[#2d221a] p-3 rounded-xl flex flex-col justify-between shadow-inner">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Modo de Jogo</span>
            <div className="mt-1">
              <span className="px-2.5 py-0.5 rounded-full bg-[#1e1410] border border-[#f27d26]/30 text-orange-400 text-[11px] font-bold tracking-tight inline-block capitalize">
                {currentMode === 'FREE' ? 'Exploração' : currentMode === 'EXAMPLE' ? 'Exemplo' : 'Desafio'}
              </span>
            </div>
            <span className="text-[9px] text-stone-500 leading-none mt-2">Diferentes níveis rítmicos</span>
          </div>
        </div>

        {/* Master Volume with Mute togglers */}
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-stone-400">
            <span className="flex items-center gap-1.5">
              {settings.volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-500" /> : <Volume2 className="w-3.5 h-3.5 text-orange-400" />}
              Volume Geral:
            </span>
            <span className="font-mono text-orange-400 font-bold">{Math.round(settings.volume * 100)}%</span>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => onVolumeChange(settings.volume === 0 ? 0.8 : 0.0)}
              className="p-1 px-2 text-[10px] bg-[#251b14] hover:bg-[#32241c] text-stone-300 border border-[#33251c] rounded cursor-pointer font-bold"
            >
              {settings.volume === 0 ? 'DESMUDAR' : 'MUDAR'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="grow accent-[#f27d26] cursor-pointer h-1.5 bg-[#130d0a] border border-stone-800 rounded-lg appearance-none"
            />
          </div>
        </div>

        {/* Global Reset Action */}
        <button
          id="btn-reset-session"
          onClick={onResetSession}
          className="w-full py-2 bg-red-950/15 hover:bg-red-900/35 text-stone-300 font-bold hover:text-red-400 text-xs text-center border border-red-900/30 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99] cursor-pointer uppercase tracking-wider"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reiniciar Sessão e Pontuação
        </button>
      </div>

    </div>
  );
}
