import React, { useState } from 'react';
import { EmulatorInputState } from '../emulator/engine';

interface VirtualGamepadProps {
  onInput: (btn: keyof EmulatorInputState, pressed: boolean) => void;
}

export const VirtualGamepad: React.FC<VirtualGamepadProps> = ({ onInput }) => {
  const [opacity, setOpacity] = useState<number>(75);
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);

  const triggerHaptic = (ms: number = 15) => {
    if (hapticsEnabled && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore if unsupported
      }
    }
  };

  const handlePress = (btn: keyof EmulatorInputState, e: React.PointerEvent) => {
    e.preventDefault();
    triggerHaptic(18);
    onInput(btn, true);
  };

  const handleRelease = (btn: keyof EmulatorInputState, e: React.PointerEvent) => {
    e.preventDefault();
    onInput(btn, false);
  };

  return (
    <div
      style={{ opacity: opacity / 100 }}
      className="w-full flex flex-col justify-between select-none touch-none transition-opacity duration-150"
    >
      {/* Top Shoulder Triggers Row */}
      <div className="flex items-center justify-between px-4 py-1">
        <button
          onPointerDown={(e) => handlePress('l', e)}
          onPointerUp={(e) => handleRelease('l', e)}
          onPointerCancel={(e) => handleRelease('l', e)}
          className="h-9 w-24 sm:w-28 rounded-lg bg-[#1e1f26]/80 border border-[#494454]/60 flex items-center justify-between px-3 text-[#cbc3d7] font-mono text-xs active:bg-[#a078ff] active:text-[#340080] shadow-md transition-all active:scale-95"
        >
          <span className="text-[10px] text-[#958ea0] font-mono">TRIG</span>
          <span className="font-bold text-[#4cd7f6]">L</span>
        </button>

        {/* Turbo Toggle */}
        <button
          onClick={() => {
            setIsTurbo(!isTurbo);
            triggerHaptic(25);
          }}
          className={`h-7 px-2.5 rounded font-mono text-[10px] flex items-center gap-1 border transition-all ${
            isTurbo
              ? 'bg-[#ca8100]/30 border-[#ffb95f] text-[#ffb95f]'
              : 'bg-[#1e1f26]/80 border-[#494454]/40 text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-[13px] text-[#ffb95f]">bolt</span>
          <span>TURBO</span>
        </button>

        <button
          onPointerDown={(e) => handlePress('r', e)}
          onPointerUp={(e) => handleRelease('r', e)}
          onPointerCancel={(e) => handleRelease('r', e)}
          className="h-9 w-24 sm:w-28 rounded-lg bg-[#1e1f26]/80 border border-[#494454]/60 flex items-center justify-between px-3 text-[#cbc3d7] font-mono text-xs active:bg-[#a078ff] active:text-[#340080] shadow-md transition-all active:scale-95"
        >
          <span className="font-bold text-[#4cd7f6]">R</span>
          <span className="text-[10px] text-[#958ea0] font-mono">TRIG</span>
        </button>
      </div>

      {/* Main Controls Row: D-Pad Left, Select/Start Center, Face Buttons Right */}
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left Side: 8-Directional D-Pad */}
        <div className="relative w-36 h-36 rounded-full bg-[#0c0e14]/80 p-2 flex items-center justify-center border border-[#494454]/40 shadow-2xl backdrop-blur-sm">
          <div className="relative w-32 h-32">
            {/* UP */}
            <button
              onPointerDown={(e) => handlePress('up', e)}
              onPointerUp={(e) => handleRelease('up', e)}
              onPointerCancel={(e) => handleRelease('up', e)}
              className="absolute top-0 left-11 w-10 h-11 rounded-t-lg bg-[#191b22] border-t-2 border-x border-[#494454]/60 text-[#958ea0] flex items-center justify-center active:bg-[#282a30] active:text-[#4cd7f6] active:scale-95 transition-all shadow-lg"
            >
              <span className="material-symbols-outlined text-xl">arrow_drop_up</span>
            </button>
            {/* DOWN */}
            <button
              onPointerDown={(e) => handlePress('down', e)}
              onPointerUp={(e) => handleRelease('down', e)}
              onPointerCancel={(e) => handleRelease('down', e)}
              className="absolute bottom-0 left-11 w-10 h-11 rounded-b-lg bg-[#191b22] border-b-2 border-x border-[#494454]/60 text-[#958ea0] flex items-center justify-center active:bg-[#282a30] active:text-[#4cd7f6] active:scale-95 transition-all shadow-lg"
            >
              <span className="material-symbols-outlined text-xl">arrow_drop_down</span>
            </button>
            {/* LEFT */}
            <button
              onPointerDown={(e) => handlePress('left', e)}
              onPointerUp={(e) => handleRelease('left', e)}
              onPointerCancel={(e) => handleRelease('left', e)}
              className="absolute top-11 left-0 w-11 h-10 rounded-l-lg bg-[#191b22] border-l-2 border-y border-[#494454]/60 text-[#958ea0] flex items-center justify-center active:bg-[#282a30] active:text-[#4cd7f6] active:scale-95 transition-all shadow-lg"
            >
              <span className="material-symbols-outlined text-xl">arrow_left</span>
            </button>
            {/* RIGHT */}
            <button
              onPointerDown={(e) => handlePress('right', e)}
              onPointerUp={(e) => handleRelease('right', e)}
              onPointerCancel={(e) => handleRelease('right', e)}
              className="absolute top-11 right-0 w-11 h-10 rounded-r-lg bg-[#191b22] border-r-2 border-y border-[#494454]/60 text-[#958ea0] flex items-center justify-center active:bg-[#282a30] active:text-[#4cd7f6] active:scale-95 transition-all shadow-lg"
            >
              <span className="material-symbols-outlined text-xl">arrow_right</span>
            </button>
            {/* Center Pivot */}
            <div className="absolute top-11 left-11 w-10 h-10 bg-[#0c0e14] rounded-sm border border-[#494454]/40 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-[#282a30] border border-[#494454]"></div>
            </div>
          </div>
        </div>

        {/* Center: Select & Start Buttons */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <button
                onPointerDown={(e) => handlePress('select', e)}
                onPointerUp={(e) => handleRelease('select', e)}
                onPointerCancel={(e) => handleRelease('select', e)}
                className="w-12 h-5 rounded-full bg-[#282a30] border border-[#494454]/60 -rotate-12 active:bg-[#4cd7f6] active:scale-90 transition-all shadow-inner"
              ></button>
              <span className="font-mono text-[9px] tracking-wider text-[#958ea0] uppercase mt-1">Select</span>
            </div>
            <div className="flex flex-col items-center">
              <button
                onPointerDown={(e) => handlePress('start', e)}
                onPointerUp={(e) => handleRelease('start', e)}
                onPointerCancel={(e) => handleRelease('start', e)}
                className="w-12 h-5 rounded-full bg-[#282a30] border border-[#494454]/60 -rotate-12 active:bg-[#4cd7f6] active:scale-90 transition-all shadow-inner"
              ></button>
              <span className="font-mono text-[9px] tracking-wider text-[#4cd7f6] font-bold uppercase mt-1">Start</span>
            </div>
          </div>
        </div>

        {/* Right Side: SNES Diamond Action Cluster (X, Y, A, B) */}
        <div className="relative w-36 h-36 rounded-full bg-[#0c0e14]/80 p-2 flex items-center justify-center border border-[#494454]/40 shadow-2xl backdrop-blur-sm">
          <div className="relative w-32 h-32">
            {/* X (Top - Violet) */}
            <button
              onPointerDown={(e) => handlePress('x', e)}
              onPointerUp={(e) => handleRelease('x', e)}
              onPointerCancel={(e) => handleRelease('x', e)}
              className="absolute top-0 left-10 w-11 h-11 rounded-full bg-[#282a30] border-2 border-[#d0bcff]/50 text-[#d0bcff] font-bold text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#a078ff] active:text-[#340080] transition-all"
            >
              X
            </button>
            {/* Y (Left - Light Violet) */}
            <button
              onPointerDown={(e) => handlePress('y', e)}
              onPointerUp={(e) => handleRelease('y', e)}
              onPointerCancel={(e) => handleRelease('y', e)}
              className="absolute top-10 left-0 w-11 h-11 rounded-full bg-[#282a30] border-2 border-[#a078ff]/60 text-[#e9ddff] font-bold text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#a078ff] active:text-[#340080] transition-all"
            >
              Y
            </button>
            {/* A (Right - Cyber Amber / Cyan) */}
            <button
              onPointerDown={(e) => handlePress('a', e)}
              onPointerUp={(e) => handleRelease('a', e)}
              onPointerCancel={(e) => handleRelease('a', e)}
              className="absolute top-10 right-0 w-11 h-11 rounded-full bg-[#282a30] border-2 border-[#ffb95f]/60 text-[#ffddb8] font-bold text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#ffb95f] active:text-[#2a1700] transition-all"
            >
              A
            </button>
            {/* B (Bottom - Electric Cyan) */}
            <button
              onPointerDown={(e) => handlePress('b', e)}
              onPointerUp={(e) => handleRelease('b', e)}
              onPointerCancel={(e) => handleRelease('b', e)}
              className="absolute bottom-0 left-10 w-11 h-11 rounded-full bg-[#282a30] border-2 border-[#4cd7f6]/60 text-[#4cd7f6] font-bold text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#4cd7f6] active:text-[#001f26] transition-all"
            >
              B
            </button>
          </div>
        </div>
      </div>

      {/* Footer HUD Bar: Haptic toggle & Opacity */}
      <div className="w-full px-4 py-1.5 bg-[#0c0e14]/90 border-t border-[#494454]/30 flex items-center justify-between text-[11px] font-mono text-[#958ea0]">
        <button
          onClick={() => {
            setHapticsEnabled(!hapticsEnabled);
            triggerHaptic(20);
          }}
          className="flex items-center gap-1.5 text-[#4cd7f6] font-bold"
        >
          <span className="material-symbols-outlined text-sm">vibration</span>
          <span>Haptic: {hapticsEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase">Opacity:</span>
          <input
            type="range"
            min="30"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-16 h-1 accent-[#4cd7f6] cursor-pointer"
          />
          <span className="text-[#4cd7f6] font-bold">{opacity}%</span>
        </div>
      </div>
    </div>
  );
};
