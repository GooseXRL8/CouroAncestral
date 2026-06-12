/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { DRUM_RADIUS_FACTOR } from '../constants';

interface AtabaqueCanvasProps {
  onHit: (
    x: number,
    y: number,
    distance: number,
    intensity: number
  ) => Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> | { type: 'TUM' | 'TA' | 'INTERMEDIATE' };
  activeRhythmHits?: { x: number; y: number; type: 'TUM' | 'TA'; timestamp: number }[];
  audioActivated?: boolean;
}

interface ActiveRipple {
  id: string;
  x: number; // absolute canvas X
  y: number; // absolute canvas Y
  type: 'TUM' | 'TA' | 'INTERMEDIATE';
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
  color: string;
  lineWidth: number;
  vibrationAmp: number;
}

interface InteractiveSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
}

export default function AtabaqueCanvas({
  onHit,
  activeRhythmHits = [],
  audioActivated = false
}: AtabaqueCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Animation references
  const ripplesRef = useRef<ActiveRipple[]>([]);
  const sparksRef = useRef<InteractiveSpark[]>([]);
  const drumVibrationRef = useRef({ amplitude: 0, frequency: 0, decay: 0.9, phase: 0 });

  // Throttling and dynamic performance scaling references
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);
  const rippleSegmentsRef = useRef(120);

  // Canvas visual text indicators flying up and touches ring ref to completely avoid React state updates
  const textIndicatorsRef = useRef<{ id: string; x: number; y: number; text: string; color: string; opacity: number; scale: number }[]>([]);
  const activeTouchesRef = useRef<{ id: string; x: number; y: number; timestamp: number }[]>([]);

  // Build high-performance canvas size on resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height, window.innerHeight * 0.65);
      
      // Support crisp Retina displays
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Slight delay to ensure parent dimensions are updated in React DOM
    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Main high-performance Canvas rendering loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // PERF-01: Throttling to target ~60 FPS under ProMotion/high refresh monitors
      const nowTime = performance.now();
      const elapsed = nowTime - lastFrameTimeRef.current;
      if (elapsed < 16.6) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = nowTime;

      // Track FPS dynamically for adaptive scaling
      frameCountRef.current++;
      if (nowTime - fpsTimerRef.current >= 1000) {
        const currentFps = (frameCountRef.current * 1000) / (nowTime - fpsTimerRef.current);
        if (currentFps < 45) {
          rippleSegmentsRef.current = 60; // downscale ripple complexity
        } else {
          rippleSegmentsRef.current = 120; // restore high resolution
        }
        frameCountRef.current = 0;
        fpsTimerRef.current = nowTime;
      }

      // Read Web Audio parameters
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const centerX = width / 2;
      const centerY = height / 2;
      const drumRadius = Math.min(width, height) * DRUM_RADIUS_FACTOR;

      // Update membrane oscillation physical model
      const vibe = drumVibrationRef.current;
      if (vibe.amplitude > 0.05) {
        vibe.phase += vibe.frequency;
        vibe.amplitude *= vibe.decay; // fade envelope
      } else {
        vibe.amplitude = 0;
      }

      // 1. Draw outer transparent drop shadow
      ctx.clearRect(0, 0, width, height);
      ctx.shadowBlur = 24;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 12;

      // -------------------------------------------------------------
      // DRAW ATABAQUE BODY WHEEL & WOODEN REINFORCEMENTS (Top-Down)
      // -------------------------------------------------------------
      
      // Draw outer wooden rim structure (O aro de madeira e ranhuras)
      ctx.beginPath();
      ctx.arc(centerX, centerY, drumRadius + 24, 0, Math.PI * 2);
      ctx.fillStyle = '#2f1c0c'; // Very dark Brazilian Jacarandá wood
      ctx.fill();
      ctx.shadowColor = 'transparent'; // Reset shadow for internal drawings

      // Draw wood fiber ring details
      ctx.strokeStyle = '#432918';
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, drumRadius + 10 + i * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw metallic tuning ring and iron clamps (Aro de Ferro / Ferragens)
      ctx.strokeStyle = '#5a504a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, drumRadius + 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#8b807a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, drumRadius + 5, 0, Math.PI * 2);
      ctx.stroke();

      // Draw traditional Tuning Wedges / Ropes (Cunhas e cordas tensionadoras)
      const wedgeCount = 8;
      for (let i = 0; i < wedgeCount; i++) {
        const angle = (i / wedgeCount) * Math.PI * 2;
        const outerX = centerX + Math.cos(angle) * (drumRadius + 24);
        const outerY = centerY + Math.sin(angle) * (drumRadius + 24);

        // Corda / Sisal Rope loops
        ctx.strokeStyle = '#7c5a3d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(centerX + Math.cos(angle) * drumRadius, centerY + Math.sin(angle) * drumRadius);
        ctx.lineTo(centerX + Math.cos(angle + 0.15) * (drumRadius + 30), centerY + Math.sin(angle + 0.15) * (drumRadius + 30));
        ctx.moveTo(centerX + Math.cos(angle) * drumRadius, centerY + Math.sin(angle) * drumRadius);
        ctx.lineTo(centerX + Math.cos(angle - 0.15) * (drumRadius + 30), centerY + Math.sin(angle - 0.15) * (drumRadius + 30));
        ctx.stroke();

        // Wooden Wedge shapes (Cunhas de afinação)
        ctx.fillStyle = '#1e1107';
        ctx.beginPath();
        ctx.arc(outerX, outerY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5c3d24';
        ctx.beginPath();
        ctx.moveTo(outerX, outerY);
        ctx.lineTo(outerX + Math.cos(angle) * 16, outerY + Math.sin(angle) * 16);
        ctx.lineTo(outerX + Math.cos(angle + 0.4) * 8, outerY + Math.sin(angle + 0.4) * 8);
        ctx.closePath();
        ctx.fill();
      }

      // -------------------------------------------------------------
      // DRAW COURO NATURAL (The interactive leather animal drum skin)
      // -------------------------------------------------------------
      const currentRadius = drumRadius + Math.sin(vibe.phase) * vibe.amplitude;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
      ctx.clip(); // Keep leather gradients inside boundaries

      const leatherGrad = ctx.createRadialGradient(
        centerX, centerY, currentRadius * 0.1,
        centerX, centerY, currentRadius
      );
      // Natural cream leather colors
      leatherGrad.addColorStop(0.0, '#f9f3eb'); // Crisp light center
      leatherGrad.addColorStop(0.3, '#f2e6d5'); // Cream tones
      leatherGrad.addColorStop(0.65, '#dfcca8'); // Golden/Amber leather transition
      leatherGrad.addColorStop(0.85, '#cca977'); // Brown rim leather
      leatherGrad.addColorStop(1.0, '#a37f51');  // Burnished edge leather

      ctx.fillStyle = leatherGrad;
      ctx.fill();

      // Add high-fidelity leather organic textures
      ctx.fillStyle = 'rgba(110, 80, 50, 0.05)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(centerX + (i * 20 - 40), centerY + (i * -15 + 30), currentRadius * 1.0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(163, 127, 81, ${0.03 + i * 0.01})`;
        ctx.lineWidth = 15;
        ctx.stroke();
      }

      // Add circular stretch marks
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      for (let rFactor = 0.25; rFactor <= 0.85; rFactor += 0.3) {
        ctx.beginPath();
        const stretchR = currentRadius * rFactor + Math.sin(vibe.phase * 1.5) * (vibe.amplitude * 0.2);
        ctx.arc(centerX, centerY, stretchR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hide fiber lines
      ctx.strokeStyle = 'rgba(100, 60, 30, 0.04)';
      ctx.lineWidth = 1;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(angle) * currentRadius, centerY + Math.sin(angle) * currentRadius);
        ctx.stroke();
      }

      ctx.restore();

      // Inner leather crease edge shadow
      ctx.strokeStyle = '#8c6c40';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
      ctx.stroke();

      // -------------------------------------------------------------
      // DRAW EXPANDING RIPPLES & CONCENTRIC IMPACT WAVES
      // -------------------------------------------------------------
      const ripples = ripplesRef.current;
      const segments = rippleSegmentsRef.current; // dynamically scaled for performance
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        
        r.radius += r.speed;
        r.opacity -= 0.025; 

        if (r.opacity <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          const distOffset = Math.sin(angle * 8 + r.radius * 0.1) * r.vibrationAmp * r.opacity;
          const rx = r.x + Math.cos(angle) * (r.radius + distOffset);
          const ry = r.y + Math.sin(angle) * (r.radius + distOffset);
          
          if (s === 0) {
            ctx.moveTo(rx, ry);
          } else {
            ctx.lineTo(rx, ry);
          }
        }
        ctx.closePath();

        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.opacity;
        ctx.lineWidth = r.lineWidth * (0.3 + r.opacity * 0.7);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // -------------------------------------------------------------
      // DRAW INTERACTIVE PARTICLE IMPACT SPARKS
      // -------------------------------------------------------------
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= s.decay;

        if (s.alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // -------------------------------------------------------------
      // RENDER AUTO-PLAY DEMO HITS
      // -------------------------------------------------------------
      if (activeRhythmHits && activeRhythmHits.length > 0) {
        const now = Date.now();
        activeRhythmHits.forEach((hit) => {
          const age = now - hit.timestamp;
          if (age < 600) {
            const hitAbsX = centerX + hit.x * drumRadius;
            const hitAbsY = centerY + hit.y * drumRadius;
            
            ctx.strokeStyle = hit.type === 'TUM' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(234, 179, 8, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(hitAbsX, hitAbsY, 15 + (age * 0.1), 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = hit.type === 'TUM' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)';
            ctx.beginPath();
            ctx.arc(hitAbsX, hitAbsY, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }

      // -------------------------------------------------------------
      // RENDER ACTIVE TOUCH GLOW RINGS (BUG-05 avoidance of React render state)
      // -------------------------------------------------------------
      const touches = activeTouchesRef.current;
      const now = Date.now();
      ctx.save();
      for (let i = touches.length - 1; i >= 0; i--) {
        const t = touches[i];
        const age = now - t.timestamp;
        if (age > 200) {
          touches.splice(i, 1);
          continue;
        }
        const alpha = 1.0 - (age / 200);
        const radius = 10 + (age / 200) * 45; 
        
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.45})`;
        ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.12})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // -------------------------------------------------------------
      // RENDER FLYING ACCURATE TEXT INDICATORS (UX-01 visual feedback)
      // -------------------------------------------------------------
      const indicators = textIndicatorsRef.current;
      for (let i = indicators.length - 1; i >= 0; i--) {
        const ind = indicators[i];
        ind.y -= 1.4; // float vertical up
        ind.opacity -= 0.035; // fade speed

        if (ind.opacity <= 0) {
          indicators.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.font = `bold ${Math.round(15 * ind.scale)}px "Space Grotesk"`;
        ctx.fillStyle = ind.color;
        ctx.globalAlpha = ind.opacity;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.textAlign = 'center';
        ctx.fillText(ind.text, ind.x, ind.y);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeRhythmHits]);

  const triggerHitGeneric = async (
    normX: number,
    normY: number,
    normDistance: number,
    intensity: number,
    clientXOffset?: number,
    clientYOffset?: number
  ) => {
    // 1. Play sound through physical synthesizer callback
    const res = await onHit(normX, normY, normDistance, intensity);
    const type = res.type;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const drumRadius = Math.min(centerX, centerY) * DRUM_RADIUS_FACTOR;

    // Use predefined offsets or calculate from normalized layout
    const x = clientXOffset !== undefined ? clientXOffset : (centerX + normX * drumRadius);
    const y = clientYOffset !== undefined ? clientYOffset : (centerY + normY * drumRadius);

    // 2. Queue Concentric Wave Ripple Animation
    const isTum = type === 'TUM';
    const isTa = type === 'TA';

    let rippleColor = 'rgba(217, 119, 6, 0.7)'; // Warm Amber for intermediates
    let maxRadius = 40 + intensity * 60;
    let waveSparks = 6;
    let sparkColor = '#b45309';

    if (isTum) {
      rippleColor = 'rgba(239, 68, 68, 0.85)'; // Crimson Red for deep TUM bass
      maxRadius = 60 + intensity * 10 
        + (drumVibrationRef.current.amplitude * 2); 
      waveSparks = 8;
      sparkColor = '#dc2626';

      // Set whole-drum membrane oscillation model
      drumVibrationRef.current = {
        amplitude: 8 + intensity * 10,
        frequency: 0.2, // slower deeper wobble
        decay: 0.92, // ring slightly longer
        phase: 0
      };
    } else if (isTa) {
      rippleColor = 'rgba(234, 179, 8, 0.9)'; // Bright Golden Yellow for high-pitch TA
      maxRadius = 30 + intensity * 40;
      waveSparks = 14; 
      sparkColor = '#eab308';

      // Set whole-drum membrane oscillation model
      drumVibrationRef.current = {
        amplitude: 3 + intensity * 6,
        frequency: 0.45, // fast pitch vibration
        decay: 0.86, // damp out very fast
        phase: 0
      };
    } else {
      drumVibrationRef.current = {
        amplitude: 5 + intensity * 7,
        frequency: 0.32,
        decay: 0.90,
        phase: 0
      };
    }

    // Add unique ripple object
    ripplesRef.current.push({
      id: `${Date.now()}-${Math.random()}`,
      x,
      y,
      type,
      radius: 2,
      maxRadius,
      opacity: 0.95,
      speed: isTa ? 5 : isTum ? 3 : 4,
      color: rippleColor,
      lineWidth: isTum ? 4.5 : isTa ? 2.5 : 3.5,
      vibrationAmp: isTum ? 12 : isTa ? 4 : 8,
    });

    // Add sparks particle burst
    for (let i = 0; i < waveSparks; i++) {
      const pAngle = Math.random() * Math.PI * 2;
      const speedPower = 1 + Math.random() * 5 * intensity;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(pAngle) * speedPower,
        vy: Math.sin(pAngle) * speedPower,
        color: sparkColor,
        size: 1.5 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.05
      });
    }

    // Add active touch indicator for canvas glow drawing (BUG-05 avoidance)
    activeTouchesRef.current.push({
      id: `touched-${Date.now()}-${Math.random()}`,
      x,
      y,
      timestamp: Date.now()
    });

    // UX-01: Add flying text indicator directly to the canvas thread
    const indicatorColor = isTum ? '#f87171' : isTa ? '#fbbf24' : '#fb923c';
    textIndicatorsRef.current.push({
      id: `flying-${Date.now()}-${Math.random()}`,
      x,
      y: y - 15,
      text: type,
      color: indicatorColor,
      opacity: 1.0,
      scale: intensity * 1.15
    });

    // UX-01: Device Haptic Vibration API
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(isTum ? [35] : [15]);
      } catch (_) { /* ignore */ }
    }
  };

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing on input focus
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (e.repeat) return;

      const key = e.key.toLowerCase();
      
      // UX-03: support customizable keyboard controls (loaded from LocalStorage)
      const cachedTaKeys = (localStorage.getItem('key_ta') || 'c,v').split(',');
      const cachedTumKeys = (localStorage.getItem('key_tum') || 'n,m').split(',');

      if (cachedTaKeys.includes(key)) {
        triggerHitGeneric(0.0, 0.0, 0.15, 0.9);
      } else if (cachedTumKeys.includes(key)) {
        triggerHitGeneric(0.0, 0.85, 0.85, 0.95);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onHit]);

  /**
   * Internal processor for all pointer down actions (mouse clicks or multi-touch taps).
   * Calculates structural and physical hit metadata, emits sound & triggers visual physics.
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const clickDistance = Math.sqrt(dx * dx + dy * dy);
    const drumRadius = Math.min(centerX, centerY) * 0.88; // outer skin edge boundaries

    // Ensure click is inside the active drum skin head
    if (clickDistance > drumRadius) {
      return;
    }

    const normX = dx / drumRadius;
    const normY = dy / drumRadius;
    const normDistance = clickDistance / drumRadius;

    // Smart Pressure detection
    let intensity = 0.85;
    if (e.pressure > 0.0 && e.pressure !== 0.5) {
      intensity = e.pressure;
    } else {
      intensity = 0.75 + Math.random() * 0.2;
    }

    triggerHitGeneric(normX, normY, normDistance, intensity, x, y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  return (
    <div className="flex flex-col items-center justify-center w-full grow relative select-none">
      {/* Visual Instruction HUD overlay inside the drum container margins */}
      <div className="absolute top-2 w-full flex justify-between px-6 text-[10px] sm:text-[11px] font-medium tracking-tight select-none pointer-events-none z-10 font-sans">
        <div className="flex items-center gap-2 bg-[#17110e]/90 border border-red-900/30 rounded-full px-3 py-1.5 text-stone-350 shadow-md backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-red-650 shadow-[0_0_8px_#ef4444] animate-pulse"></span>
          BORDA: <strong className="text-red-400">TUM</strong> (Grave)
        </div>
        <div className="flex items-center gap-2 bg-[#17110e]/90 border border-amber-900/30 rounded-full px-3 py-1.5 text-stone-350 shadow-md backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-550 shadow-[0_0_8px_#f59e0b] animate-pulse"></span>
          CENTRO: <strong className="text-amber-400 font-bold">TÁ</strong> (Agudo)
        </div>
      </div>

      {/* SEC-02: Translucent welcome banner offering instant haptic and gesture explanation */}
      {!audioActivated && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-40 px-4">
          <div className="bg-[#1a1310]/95 border border-[#f27d26]/30 rounded-2xl p-4 sm:p-5 max-w-[320px] text-center shadow-2xl backdrop-blur-md animate-pulse leading-relaxed">
            <p className="text-[#f27d26] text-xs font-bold uppercase tracking-[0.2em] mb-1">
              Ativação do Som
            </p>
            <p className="text-[11px] text-stone-300 leading-normal">
              Toque na pele do tambor ou use o teclado (<strong className="text-[#f27d26] font-mono">C, V</strong> e <strong className="text-red-400 font-mono">N, M</strong>) para ouvir os harmônicos tradicionais!
            </p>
          </div>
        </div>
      )}

      {/* Main Canvas Frame */}
      <div 
        ref={containerRef} 
        className="w-full flex justify-center items-center h-[52vh] sm:h-[58vh] relative overflow-hidden pb-2"
      >
        <canvas
          id="atabaque-canvas-head"
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onTouchStart={(e) => {
            // Secure direct tap registration on Safari and mobile devices
            if (e.cancelable) e.preventDefault();
          }}
          className="cursor-crosshair bg-transparent select-none touch-none drop-shadow-2xl active:scale-[0.99] transition-transform duration-75"
        />
      </div>

      {/* Keyboard shortcuts visual panel for PC desktop view */}
      <div className="absolute bottom-2 hidden sm:flex gap-3 text-[10px] md:text-[11px] font-semibold text-stone-400 select-none pointer-events-none z-10 font-sans px-4 bg-[#120d0a]/85 backdrop-blur border border-[#f27d26]/12 rounded-xl py-2 shadow-lg">
        <div className="flex items-center gap-1.5">
          <span className="bg-[#241a14] border border-[#3e2c21] rounded px-1.5 py-0.5 text-stone-100 font-mono text-[10px] shadow-sm">C</span>
          <span className="text-stone-500 font-light">ou</span>
          <span className="bg-[#241a14] border border-[#3e2c21] rounded px-1.5 py-0.5 text-stone-100 font-mono text-[10px] shadow-sm">V</span>
          <span className="text-amber-450 ml-0.5">TÁ (Centro Agudo)</span>
        </div>
        <div className="text-stone-700/80 font-light px-0.5">|</div>
        <div className="flex items-center gap-1.5">
          <span className="bg-[#241a14] border border-[#3e2c21] rounded px-1.5 py-0.5 text-stone-100 font-mono text-[10px] shadow-sm">N</span>
          <span className="text-stone-500 font-light">ou</span>
          <span className="bg-[#241a14] border border-[#3e2c21] rounded px-1.5 py-0.5 text-stone-100 font-mono text-[10px] shadow-sm">M</span>
          <span className="text-red-450 ml-0.5">TUM (Borda Grave)</span>
        </div>
      </div>
    </div>
  );
}
