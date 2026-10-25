import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EmulatorInputState } from '../emulator/engine';
import { VirtualJoystick } from './VirtualJoystick';
import {
  MobileGamepadConfig,
  DEFAULT_GAMEPAD_CONFIG,
  MobileGamepadSettingsModal,
} from './MobileGamepadSettingsModal';

interface VirtualGamepadProps {
  onInput: (btn: keyof EmulatorInputState, pressed: boolean) => void;
  platform?: string;
  layout?: 'portrait' | 'landscape';
  onTriggerQuickSave?: () => void;
  onTriggerQuickLoad?: () => void;
  onTriggerRewind?: () => void;
  onCycleFastForward?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
  fastForwardSpeed?: number;
  currentSlot?: number;
}

export const VirtualGamepad: React.FC<VirtualGamepadProps> = ({
  onInput,
  platform = 'SNES',
  layout = 'portrait',
  onTriggerQuickSave,
  onTriggerQuickLoad,
  onTriggerRewind,
  onCycleFastForward,
  onTogglePause,
  isPaused = false,
  fastForwardSpeed = 1,
  currentSlot = 1,
}) => {
  // Load persistent gamepad config
  const [config, setConfig] = useState<MobileGamepadConfig>(() => {
    try {
      const saved = localStorage.getItem('retroverse_gamepad_custom_config');
      if (saved) return { ...DEFAULT_GAMEPAD_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_GAMEPAD_CONFIG;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Active Auto-fire timers
  const autoIntervalsRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [autoActive, setAutoActive] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });

  // Save config on change
  const handleUpdateConfig = (updated: Partial<MobileGamepadConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem('retroverse_gamepad_custom_config', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleResetConfig = () => {
    setConfig(DEFAULT_GAMEPAD_CONFIG);
    try {
      localStorage.setItem('retroverse_gamepad_custom_config', JSON.stringify(DEFAULT_GAMEPAD_CONFIG));
    } catch {}
  };

  const triggerHaptic = useCallback(
    (ms: number = 15) => {
      if (config.hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(ms);
        } catch {}
      }
    },
    [config.hapticsEnabled]
  );

  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // General button press / release
  const handlePress = useCallback(
    (btn: keyof EmulatorInputState, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      triggerHaptic(18);
      onInputRef.current(btn, true);
    },
    [triggerHaptic]
  );

  const handleRelease = useCallback(
    (btn: keyof EmulatorInputState, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      onInputRef.current(btn, false);
    },
    []
  );

  // Auto-Fire (Turbo A and Turbo B) logic
  const startAutoFire = useCallback(
    (btn: 'a' | 'b') => {
      if (autoIntervalsRef.current[btn]) {
        clearInterval(autoIntervalsRef.current[btn]!);
      }

      setAutoActive((prev) => ({ ...prev, [btn]: true }));
      triggerHaptic(25);

      const period = Math.max(30, Math.round(1000 / (config.turboRate * 2))); // Half period for on/off
      let state = true;
      onInputRef.current(btn, true);

      autoIntervalsRef.current[btn] = window.setInterval(() => {
        state = !state;
        onInputRef.current(btn, state);
      }, period);
    },
    [config.turboRate, triggerHaptic]
  );

  const stopAutoFire = useCallback(
    (btn: 'a' | 'b') => {
      if (autoIntervalsRef.current[btn]) {
        clearInterval(autoIntervalsRef.current[btn]!);
        autoIntervalsRef.current[btn] = null;
      }
      setAutoActive((prev) => ({ ...prev, [btn]: false }));
      onInputRef.current(btn, false);
    },
    []
  );

  const handleAutoButtonPointerDown = (btn: 'a' | 'b', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    if (config.turboLockMode) {
      // Toggle mode
      if (autoActive[btn]) {
        stopAutoFire(btn);
      } else {
        startAutoFire(btn);
      }
    } else {
      // Hold mode
      startAutoFire(btn);
    }
  };

  const handleAutoButtonPointerUp = (btn: 'a' | 'b', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (!config.turboLockMode) {
      stopAutoFire(btn);
    }
  };

  // Joystick direction change router (stable empty deps)
  const handleJoystickDirections = useCallback(
    (dirs: { up: boolean; down: boolean; left: boolean; right: boolean }) => {
      onInputRef.current('up', dirs.up);
      onInputRef.current('down', dirs.down);
      onInputRef.current('left', dirs.left);
      onInputRef.current('right', dirs.right);
    },
    []
  );

  // Clean all intervals on unmount
  useEffect(() => {
    return () => {
      if (autoIntervalsRef.current.a) clearInterval(autoIntervalsRef.current.a);
      if (autoIntervalsRef.current.b) clearInterval(autoIntervalsRef.current.b);
    };
  }, []);

  const isNES = platform.toUpperCase() === 'NES';

  // Dynamic Scale multiplier classes
  const scaleClass =
    config.scale === 'compact'
      ? 'scale-90 origin-bottom'
      : config.scale === 'large'
      ? 'scale-105 origin-bottom'
      : 'scale-100 origin-bottom';

  // =========================================================================
  // RENDER: LANDSCAPE FLOATING OVERLAY LAYOUT
  // =========================================================================
  if (layout === 'landscape') {
    return (
      <div
        style={{ opacity: config.opacity / 100 }}
        className="w-full h-full flex flex-col justify-between select-none pointer-events-none transition-opacity duration-200"
      >
        {/* Top Floating Mini Bar */}
        <div className="w-full flex items-center justify-between px-4 py-2 pointer-events-auto">
          {/* Left: Shoulder L */}
          {config.showShoulders && (
            <button
              onPointerDown={(e) => handlePress('l', e)}
              onPointerUp={(e) => handleRelease('l', e)}
              onPointerCancel={(e) => handleRelease('l', e)}
              className={`h-9 px-5 rounded-xl bg-[#171922]/80 border border-[#494454]/60 text-white font-mono font-bold text-xs flex items-center gap-2 active:bg-[#4cd7f6] active:text-[#003641] shadow-lg backdrop-blur-md active:scale-95 transition-all ${
                isNES ? 'opacity-30 pointer-events-none' : ''
              }`}
            >
              <span className="text-[#4cd7f6] text-sm">L</span>
              <span className="text-[10px] text-[#958ea0]">TRIG</span>
            </button>
          )}

          {/* Center: System & Controls Bar */}
          <div className="flex items-center gap-2 bg-[#12141c]/80 backdrop-blur-md px-3 py-1 rounded-full border border-[#494454]/40 shadow-lg">
            {/* Movement switcher */}
            <button
              onClick={() => {
                handleUpdateConfig({
                  movementType: config.movementType === 'dpad' ? 'joystick' : 'dpad',
                });
                triggerHaptic(20);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-mono text-[#4cd7f6] bg-[#1e202c] hover:bg-[#282a3a] border border-[#4cd7f6]/30 flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                {config.movementType === 'dpad' ? 'drag_indicator' : 'control_camera'}
              </span>
              <span>{config.movementType === 'dpad' ? 'D-Pad' : 'Joystick'}</span>
            </button>

            {/* Select & Start */}
            {config.showSystemButtons && (
              <div className="flex items-center gap-2 border-x border-[#494454]/30 px-2">
                <button
                  onPointerDown={(e) => handlePress('select', e)}
                  onPointerUp={(e) => handleRelease('select', e)}
                  onPointerCancel={(e) => handleRelease('select', e)}
                  className="px-2 py-0.5 rounded bg-[#252733] border border-[#494454]/50 text-[10px] font-mono text-[#cbc3d7] active:bg-[#4cd7f6] active:text-[#003641]"
                >
                  SELECT
                </button>
                <button
                  onPointerDown={(e) => handlePress('start', e)}
                  onPointerUp={(e) => handleRelease('start', e)}
                  onPointerCancel={(e) => handleRelease('start', e)}
                  className="px-2 py-0.5 rounded bg-[#252733] border border-[#4cd7f6]/50 text-[10px] font-mono text-[#4cd7f6] font-bold active:bg-[#4cd7f6] active:text-[#003641]"
                >
                  START
                </button>
              </div>
            )}

            {/* Quick Settings */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 rounded text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors"
              title="Tùy chỉnh tay cầm"
            >
              <span className="material-symbols-outlined text-base">tune</span>
            </button>
          </div>

          {/* Right: Shoulder R */}
          {config.showShoulders && (
            <button
              onPointerDown={(e) => handlePress('r', e)}
              onPointerUp={(e) => handleRelease('r', e)}
              onPointerCancel={(e) => handleRelease('r', e)}
              className={`h-9 px-5 rounded-xl bg-[#171922]/80 border border-[#494454]/60 text-white font-mono font-bold text-xs flex items-center gap-2 active:bg-[#4cd7f6] active:text-[#003641] shadow-lg backdrop-blur-md active:scale-95 transition-all ${
                isNES ? 'opacity-30 pointer-events-none' : ''
              }`}
            >
              <span className="text-[10px] text-[#958ea0]">TRIG</span>
              <span className="text-[#4cd7f6] text-sm">R</span>
            </button>
          )}
        </div>

        {/* Bottom Clusters: Left Thumb (Movement) & Right Thumb (Actions) */}
        <div className="w-full flex items-end justify-between px-6 pb-4">
          {/* LEFT THUMB ZONE */}
          <div className="pointer-events-auto flex flex-col items-center">
            {config.showMovement && (
              <div className="p-1">
                {config.movementType === 'joystick' ? (
                  <VirtualJoystick
                    onDirectionChange={handleJoystickDirections}
                    size={140}
                    onHaptic={triggerHaptic}
                  />
                ) : (
                  <DPadCluster onInput={onInput} onHaptic={triggerHaptic} />
                )}
              </div>
            )}
          </div>

          {/* RIGHT THUMB ZONE */}
          <div className="pointer-events-auto flex flex-col items-end gap-3">
            {/* Auto Buttons Row (Auto-A & Auto-B) */}
            {config.showAutoButtons && (
              <div className="flex items-center gap-2 mb-1">
                <button
                  onPointerDown={(e) => handleAutoButtonPointerDown('b', e)}
                  onPointerUp={(e) => handleAutoButtonPointerUp('b', e)}
                  onPointerCancel={(e) => handleAutoButtonPointerUp('b', e)}
                  className={`h-8 px-3 rounded-full border flex items-center gap-1 font-mono text-[11px] font-bold shadow-md transition-all ${
                    autoActive.b
                      ? 'bg-[#4cd7f6] text-[#003641] border-[#4cd7f6] scale-105 shadow-[0_0_12px_#4cd7f6]'
                      : 'bg-[#191b24]/90 border-[#4cd7f6]/50 text-[#4cd7f6]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">bolt</span>
                  <span>AUTO B</span>
                </button>

                <button
                  onPointerDown={(e) => handleAutoButtonPointerDown('a', e)}
                  onPointerUp={(e) => handleAutoButtonPointerUp('a', e)}
                  onPointerCancel={(e) => handleAutoButtonPointerUp('a', e)}
                  className={`h-8 px-3 rounded-full border flex items-center gap-1 font-mono text-[11px] font-bold shadow-md transition-all ${
                    autoActive.a
                      ? 'bg-[#ffb95f] text-[#2a1700] border-[#ffb95f] scale-105 shadow-[0_0_12px_#ffb95f]'
                      : 'bg-[#191b24]/90 border-[#ffb95f]/50 text-[#ffb95f]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">bolt</span>
                  <span>AUTO A</span>
                </button>
              </div>
            )}

            {/* Action Face Buttons Cluster */}
            {config.showActionButtons && (
              <ActionButtonsCluster
                isNES={isNES}
                onPress={handlePress}
                onRelease={handleRelease}
              />
            )}
          </div>
        </div>

        {/* Settings Modal */}
        <MobileGamepadSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={config}
          onChange={handleUpdateConfig}
          onReset={handleResetConfig}
        />
      </div>
    );
  }

  // =========================================================================
  // =========================================================================
  // RENDER: PORTRAIT HANDHELD CONSOLE BODY DECK
  // =========================================================================
  return (
    <div
      style={{ opacity: config.opacity / 100 }}
      className={`w-full flex flex-col justify-between bg-gradient-to-b from-[#181a24] to-[#0c0e14] border-t-2 border-[#494454]/40 rounded-t-3xl pt-2 pb-2.5 px-2 sm:px-4 shadow-[0_-8px_30px_rgba(0,0,0,0.8)] select-none touch-none transition-opacity duration-200 ${scaleClass}`}
    >
      {/* 1. TOP ROW: Shoulders L/R, Platform Tag & Quick Tools Bar */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 px-0 mb-1 w-full">
        {/* Left Shoulder L */}
        {config.showShoulders ? (
          <button
            onPointerDown={(e) => handlePress('l', e)}
            onPointerUp={(e) => handleRelease('l', e)}
            onPointerCancel={(e) => handleRelease('l', e)}
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#242735] border border-[#494454]/70 flex items-center justify-center gap-1 text-[#cbc3d7] font-mono text-xs active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-md shrink-0 min-w-[44px] xs:min-w-[52px] sm:min-w-[60px] ${
              isNES ? 'opacity-30 pointer-events-none' : ''
            }`}
          >
            <span className="font-bold text-[#4cd7f6] text-sm">L</span>
            <span className="text-[9px] text-[#958ea0] font-mono hidden xs:inline">BUMPER</span>
          </button>
        ) : (
          <div className="w-11 shrink-0"></div>
        )}

        {/* Center: Quick Tools & Controller Config Button */}
        <div className="flex-1 flex items-center justify-center gap-0.5 sm:gap-1 bg-[#12131b] px-1 sm:px-2 py-0.5 rounded-xl border border-[#494454]/40 shadow-inner min-w-0 max-w-[240px] sm:max-w-[270px] mx-0.5">
          {/* Movement Mode Switcher Button */}
          <button
            type="button"
            onClick={() => {
              handleUpdateConfig({
                movementType: config.movementType === 'dpad' ? 'joystick' : 'dpad',
              });
              triggerHaptic(20);
            }}
            className="h-7 px-1.5 sm:px-2 rounded-lg bg-[#252837] border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-[11px] font-bold flex items-center gap-1 transition-all hover:bg-[#2e3245] shrink-0"
            title="Đổi giữa D-Pad và Joystick"
          >
            <span className="material-symbols-outlined text-sm">
              {config.movementType === 'dpad' ? 'drag_indicator' : 'control_camera'}
            </span>
            <span className="hidden sm:inline">{config.movementType === 'dpad' ? 'D-Pad' : 'Stick'}</span>
          </button>

          {/* Quick Tools Shortcuts */}
          {config.showQuickTools && (
            <div className="flex items-center gap-0.5 sm:gap-1 border-x border-[#494454]/30 px-0.5 sm:px-1 shrink-0">
              {onTogglePause && (
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="h-7 w-7 rounded-lg bg-[#252837] text-[#d0bcff] hover:text-white flex items-center justify-center transition-colors"
                  title="Tạm dừng / Tiếp tục"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isPaused ? 'play_arrow' : 'pause'}
                  </span>
                </button>
              )}
              {onCycleFastForward && (
                <button
                  type="button"
                  onClick={onCycleFastForward}
                  className={`h-7 px-1.5 rounded-lg border font-mono text-[10px] flex items-center gap-0.5 transition-colors ${
                    fastForwardSpeed > 1
                      ? 'bg-[#03b5d3]/20 border-[#4cd7f6] text-[#4cd7f6]'
                      : 'bg-[#252837] border-transparent text-[#958ea0]'
                  }`}
                  title="Tua nhanh"
                >
                  <span className="material-symbols-outlined text-xs">fast_forward</span>
                  <span>{fastForwardSpeed}x</span>
                </button>
              )}
              {onTriggerQuickSave && (
                <button
                  type="button"
                  onClick={onTriggerQuickSave}
                  className="h-7 w-7 rounded-lg bg-[#252837] text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-colors"
                  title={`Lưu nhanh Slot #${currentSlot}`}
                >
                  <span className="material-symbols-outlined text-xs">save</span>
                </button>
              )}
              {onTriggerQuickLoad && (
                <button
                  type="button"
                  onClick={onTriggerQuickLoad}
                  className="h-7 w-7 rounded-lg bg-[#252837] text-[#4cd7f6] hover:text-[#70e0f8] flex items-center justify-center transition-colors"
                  title={`Nạp nhanh Slot #${currentSlot}`}
                >
                  <span className="material-symbols-outlined text-xs">file_open</span>
                </button>
              )}
            </div>
          )}

          {/* Settings Trigger */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="h-7 w-7 rounded-lg bg-[#252837] text-[#cbc3d7] hover:text-white hover:bg-[#34384d] flex items-center justify-center transition-colors shrink-0"
            title="Tùy chỉnh tay cầm"
          >
            <span className="material-symbols-outlined text-sm">tune</span>
          </button>
        </div>

        {/* Right Shoulder R */}
        {config.showShoulders ? (
          <button
            onPointerDown={(e) => handlePress('r', e)}
            onPointerUp={(e) => handleRelease('r', e)}
            onPointerCancel={(e) => handleRelease('r', e)}
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#242735] border border-[#494454]/70 flex items-center justify-center gap-1 text-[#cbc3d7] font-mono text-xs active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-md shrink-0 min-w-[44px] xs:min-w-[52px] sm:min-w-[60px] ${
              isNES ? 'opacity-30 pointer-events-none' : ''
            }`}
          >
            <span className="text-[9px] text-[#958ea0] font-mono hidden xs:inline">BUMPER</span>
            <span className="font-bold text-[#4cd7f6] text-sm">R</span>
          </button>
        ) : (
          <div className="w-11 shrink-0"></div>
        )}
      </div>

      {/* 2. AUTO-FIRE BUTTONS ROW (Auto A & Auto B) */}
      {config.showAutoButtons && (
        <div className="flex items-center justify-center gap-2 sm:gap-3 px-1 py-0.5 mb-1">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#12141d]/90 px-2.5 py-0.5 rounded-full border border-[#494454]/40 shadow-inner">
            <span className="text-[10px] font-mono text-[#958ea0] uppercase tracking-wider flex items-center gap-0.5">
              <span className="material-symbols-outlined text-xs text-[#ffb95f]">bolt</span>
              <span className="hidden xs:inline">Turbo:</span>
            </span>

            {/* Auto B Button */}
            <button
              onPointerDown={(e) => handleAutoButtonPointerDown('b', e)}
              onPointerUp={(e) => handleAutoButtonPointerUp('b', e)}
              onPointerCancel={(e) => handleAutoButtonPointerUp('b', e)}
              className={`h-7 px-2.5 rounded-full border flex items-center gap-1 font-mono text-xs font-bold transition-all shadow-md ${
                autoActive.b
                  ? 'bg-[#4cd7f6] text-[#003641] border-[#4cd7f6] scale-105 shadow-[0_0_12px_#4cd7f6]'
                  : 'bg-[#20222f] border-[#4cd7f6]/50 text-[#4cd7f6] active:scale-95'
              }`}
            >
              <span>Auto B</span>
              {autoActive.b && <span className="h-1.5 w-1.5 rounded-full bg-[#003641] animate-ping"></span>}
            </button>

            {/* Auto A Button */}
            <button
              onPointerDown={(e) => handleAutoButtonPointerDown('a', e)}
              onPointerUp={(e) => handleAutoButtonPointerUp('a', e)}
              onPointerCancel={(e) => handleAutoButtonPointerUp('a', e)}
              className={`h-7 px-2.5 rounded-full border flex items-center gap-1 font-mono text-xs font-bold transition-all shadow-md ${
                autoActive.a
                  ? 'bg-[#ffb95f] text-[#2a1700] border-[#ffb95f] scale-105 shadow-[0_0_12px_#ffb95f]'
                  : 'bg-[#20222f] border-[#ffb95f]/50 text-[#ffb95f] active:scale-95'
              }`}
            >
              <span>Auto A</span>
              {autoActive.a && <span className="h-1.5 w-1.5 rounded-full bg-[#2a1700] animate-ping"></span>}
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTROLS ROW: Left (Movement), Center (Select/Start), Right (Face Buttons) */}
      <div className="flex items-center justify-between px-0 sm:px-1 py-0.5 w-full max-w-full">
        {/* Left Side: D-Pad or Joystick */}
        <div className="flex-1 flex justify-start items-center min-w-0">
          {config.showMovement ? (
            config.movementType === 'joystick' ? (
              <VirtualJoystick
                onDirectionChange={handleJoystickDirections}
                size={116}
                onHaptic={triggerHaptic}
              />
            ) : (
              <DPadCluster onInput={onInput} onHaptic={triggerHaptic} />
            )
          ) : (
            <div className="w-[116px] h-[116px] sm:w-32 sm:h-32"></div>
          )}
        </div>

        {/* Center Console Area: Select / Start Buttons */}
        <div className="flex flex-col items-center justify-center px-0.5 space-y-1.5 shrink-0">
          {/* Faux Handheld Speaker Vents */}
          <div className="hidden xs:flex flex-col gap-0.5 items-center opacity-30">
            <div className="w-6 h-0.5 bg-[#494454] rounded-full"></div>
            <div className="w-4 h-0.5 bg-[#494454] rounded-full"></div>
          </div>

          {/* Select & Start Buttons */}
          {config.showSystemButtons && (
            <div className="flex items-center gap-1.5 sm:gap-2 pt-0.5">
              <div className="flex flex-col items-center">
                <button
                  onPointerDown={(e) => handlePress('select', e)}
                  onPointerUp={(e) => handleRelease('select', e)}
                  onPointerCancel={(e) => handleRelease('select', e)}
                  className="w-8 h-3.5 sm:w-10 sm:h-4 rounded-full bg-[#2a2d3b] border border-[#494454]/80 -rotate-12 active:bg-[#4cd7f6] active:scale-90 transition-all shadow-inner"
                  title="SELECT"
                ></button>
                <span className="font-mono text-[8px] sm:text-[9px] tracking-wider text-[#958ea0] uppercase mt-0.5">
                  Select
                </span>
              </div>

              <div className="flex flex-col items-center">
                <button
                  onPointerDown={(e) => handlePress('start', e)}
                  onPointerUp={(e) => handleRelease('start', e)}
                  onPointerCancel={(e) => handleRelease('start', e)}
                  className="w-8 h-3.5 sm:w-10 sm:h-4 rounded-full bg-[#2a2d3b] border border-[#4cd7f6]/60 -rotate-12 active:bg-[#4cd7f6] active:scale-90 transition-all shadow-inner"
                  title="START"
                ></button>
                <span className="font-mono text-[8px] sm:text-[9px] tracking-wider text-[#4cd7f6] font-bold uppercase mt-0.5">
                  Start
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Action Face Buttons */}
        <div className="flex-1 flex justify-end items-center min-w-0 pr-0 sm:pr-0.5">
          {config.showActionButtons ? (
            <ActionButtonsCluster
              isNES={isNES}
              onPress={handlePress}
              onRelease={handleRelease}
            />
          ) : (
            <div className="w-[116px] h-[116px] sm:w-32 sm:h-32"></div>
          )}
        </div>
      </div>

      {/* 4. FOOTER STATUS BAR */}
      <div className="w-full mt-1.5 pt-1 border-t border-[#494454]/25 flex items-center justify-between text-[11px] font-mono text-[#958ea0] px-1 sm:px-2">
        <button
          onClick={() => {
            handleUpdateConfig({ hapticsEnabled: !config.hapticsEnabled });
            triggerHaptic(20);
          }}
          className={`flex items-center gap-1 transition-colors ${
            config.hapticsEnabled ? 'text-[#4cd7f6] font-bold' : 'text-[#958ea0]'
          }`}
        >
          <span className="material-symbols-outlined text-sm">vibration</span>
          <span>Rung: {config.hapticsEnabled ? 'BẬT' : 'TẮT'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase">Độ mờ:</span>
          <input
            type="range"
            min="25"
            max="100"
            value={config.opacity}
            onChange={(e) => handleUpdateConfig({ opacity: Number(e.target.value) })}
            className="w-14 sm:w-16 h-1 accent-[#4cd7f6] cursor-pointer"
          />
          <span className="text-[#4cd7f6] font-bold text-[10px] sm:text-xs">{config.opacity}%</span>
        </div>
      </div>

      {/* Settings Modal */}
      <MobileGamepadSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onChange={handleUpdateConfig}
        onReset={handleResetConfig}
      />
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: CLASSIC 8-WAY D-PAD WITH DIAGONAL SLIDERS
// =========================================================================
interface DPadClusterProps {
  onInput: (btn: keyof EmulatorInputState, pressed: boolean) => void;
  onHaptic?: (ms: number) => void;
}

const DPadCluster: React.FC<DPadClusterProps> = ({ onInput, onHaptic }) => {
  const handleDir = (
    btn: keyof EmulatorInputState,
    pressed: boolean,
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (pressed) {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHaptic?.(16);
      } else {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    onInput(btn, pressed);
  };

  return (
    <div className="relative w-[118px] h-[118px] sm:w-32 sm:h-32 rounded-full bg-[#0c0e14]/90 p-1 flex items-center justify-center border-2 border-[#494454]/50 shadow-2xl backdrop-blur-sm select-none shrink-0">
      <div className="relative w-[104px] h-[104px] sm:w-28 sm:h-28">
        {/* UP */}
        <button
          onPointerDown={(e) => handleDir('up', true, e)}
          onPointerUp={(e) => handleDir('up', false, e)}
          onPointerCancel={(e) => handleDir('up', false, e)}
          className="absolute top-0 left-[34px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-t-xl bg-gradient-to-b from-[#2a2c3a] to-[#1c1e28] border-t-2 border-x border-[#494454]/80 text-[#958ea0] flex items-center justify-center active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-lg"
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_drop_up</span>
        </button>

        {/* DOWN */}
        <button
          onPointerDown={(e) => handleDir('down', true, e)}
          onPointerUp={(e) => handleDir('down', false, e)}
          onPointerCancel={(e) => handleDir('down', false, e)}
          className="absolute bottom-0 left-[34px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-b-xl bg-gradient-to-t from-[#2a2c3a] to-[#1c1e28] border-b-2 border-x border-[#494454]/80 text-[#958ea0] flex items-center justify-center active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-lg"
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_drop_down</span>
        </button>

        {/* LEFT */}
        <button
          onPointerDown={(e) => handleDir('left', true, e)}
          onPointerUp={(e) => handleDir('left', false, e)}
          onPointerCancel={(e) => handleDir('left', false, e)}
          className="absolute top-[34px] sm:top-9 left-0 w-9 h-9 sm:w-10 sm:h-10 rounded-l-xl bg-gradient-to-r from-[#2a2c3a] to-[#1c1e28] border-l-2 border-y border-[#494454]/80 text-[#958ea0] flex items-center justify-center active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-lg"
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_left</span>
        </button>

        {/* RIGHT */}
        <button
          onPointerDown={(e) => handleDir('right', true, e)}
          onPointerUp={(e) => handleDir('right', false, e)}
          onPointerCancel={(e) => handleDir('right', false, e)}
          className="absolute top-[34px] sm:top-9 right-0 w-9 h-9 sm:w-10 sm:h-10 rounded-r-xl bg-gradient-to-l from-[#2a2c3a] to-[#1c1e28] border-r-2 border-y border-[#494454]/80 text-[#958ea0] flex items-center justify-center active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-lg"
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_right</span>
        </button>

        {/* Center Pivot Bevel */}
        <div className="absolute top-[34px] sm:top-9 left-[34px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 bg-[#151722] rounded-sm border border-[#494454]/50 flex items-center justify-center shadow-inner pointer-events-none">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#252837] border border-[#494454]"></div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: ACTION FACE BUTTONS CLUSTER (SNES DIAMOND OR NES DUAL)
// =========================================================================
interface ActionButtonsClusterProps {
  isNES: boolean;
  onPress: (btn: keyof EmulatorInputState, e: React.PointerEvent) => void;
  onRelease: (btn: keyof EmulatorInputState, e: React.PointerEvent) => void;
}

const ActionButtonsCluster: React.FC<ActionButtonsClusterProps> = ({
  isNES,
  onPress,
  onRelease,
}) => {
  return (
    <div className="relative w-[118px] h-[118px] sm:w-32 sm:h-32 rounded-full bg-[#0c0e14]/90 p-1.5 sm:p-2 flex items-center justify-center border-2 border-[#494454]/50 shadow-2xl backdrop-blur-sm select-none shrink-0">
      <div className="relative w-[104px] h-[104px] sm:w-28 sm:h-28">
        {/* X (Top - Violet) */}
        <button
          onPointerDown={(e) => onPress('x', e)}
          onPointerUp={(e) => onRelease('x', e)}
          onPointerCancel={(e) => onRelease('x', e)}
          className={`absolute top-0 left-[34px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#333647] to-[#1f212d] border-2 border-[#d0bcff]/60 text-[#d0bcff] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#a078ff] active:text-[#340080] transition-all ${
            isNES ? 'opacity-20 pointer-events-none' : ''
          }`}
        >
          X
        </button>

        {/* Y (Left - Lavender) */}
        <button
          onPointerDown={(e) => onPress('y', e)}
          onPointerUp={(e) => onRelease('y', e)}
          onPointerCancel={(e) => onRelease('y', e)}
          className={`absolute top-[34px] sm:top-9 left-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#333647] to-[#1f212d] border-2 border-[#a078ff]/70 text-[#e9ddff] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#a078ff] active:text-[#340080] transition-all ${
            isNES ? 'opacity-20 pointer-events-none' : ''
          }`}
        >
          Y
        </button>

        {/* A (Right - Amber Flame) */}
        <button
          onPointerDown={(e) => onPress('a', e)}
          onPointerUp={(e) => onRelease('a', e)}
          onPointerCancel={(e) => onRelease('a', e)}
          className="absolute top-[34px] sm:top-9 right-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#38322c] to-[#211d1a] border-2 border-[#ffb95f]/70 text-[#ffddb8] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#ffb95f] active:text-[#2a1700] transition-all"
        >
          A
        </button>

        {/* B (Bottom - Electric Cyan) */}
        <button
          onPointerDown={(e) => onPress('b', e)}
          onPointerUp={(e) => onRelease('b', e)}
          onPointerCancel={(e) => onRelease('b', e)}
          className="absolute bottom-0 left-[34px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#26373f] to-[#182329] border-2 border-[#4cd7f6]/70 text-[#4cd7f6] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#4cd7f6] active:text-[#001f26] transition-all"
        >
          B
        </button>
      </div>
    </div>
  );
};
