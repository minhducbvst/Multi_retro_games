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
  onTriggerRewind?: (seconds?: number) => void;
  onCycleFastForward?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
  fastForwardSpeed?: number;
  currentSlot?: number;
  rotationAngle?: number;
  gameTitle?: string;
  onExit?: () => void;
  orientationMode?: 'auto' | 'portrait' | 'landscape';
  onCycleOrientation?: () => void;
  isVirtualRotated?: boolean;
  rotationAngleDeg?: number;
  onToggleRotationAngle?: () => void;
  onOpenVisualSettings?: () => void;
  onTogglePCMode?: () => void;
  onToggleFullscreen?: () => void;
  onCycleSlot?: () => void;
  onSelectSlot?: (slot: number) => void;
  onRestartGame?: () => void;
  isGuestMode?: boolean;
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
  rotationAngle = 0,
  gameTitle,
  onExit,
  orientationMode = 'auto',
  onCycleOrientation,
  isVirtualRotated = false,
  rotationAngleDeg = 90,
  onToggleRotationAngle,
  onOpenVisualSettings,
  onTogglePCMode,
  onToggleFullscreen,
  onCycleSlot,
  onSelectSlot,
  onRestartGame,
  isGuestMode = false,
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
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

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

  const upperPlat = (platform || 'SNES').toUpperCase();
  const isNES = upperPlat === 'NES';
  const isGBA = upperPlat === 'GBA' || upperPlat.includes('ADVANCE') || upperPlat === 'GB' || upperPlat === 'GBC';
  const isGenesis = upperPlat === 'GENESIS' || upperPlat === 'MEGADRIVE' || upperPlat === 'SEGA';
  const isSNES = !isNES && !isGBA && !isGenesis;
  const hasShoulders = isSNES || isGBA;

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
        {/* Backdrop overlay to close dropdown menu on tap outside */}
        {isDropdownOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 pointer-events-auto"
            onClick={() => setIsDropdownOpen(false)}
          />
        )}

        {/* Top Floating Unified System & Triggers Bar */}
        <div className="w-full flex items-center justify-between px-3 sm:px-5 py-2 pointer-events-auto relative z-50">
          {/* Left: Shoulder L */}
          {config.showShoulders && hasShoulders ? (
            <button
              onPointerDown={(e) => handlePress('l', e)}
              onPointerUp={(e) => handleRelease('l', e)}
              onPointerCancel={(e) => handleRelease('l', e)}
              className={`h-9 px-3.5 sm:px-5 rounded-xl ${
                isGBA
                  ? 'bg-gradient-to-b from-[#2d3045] to-[#1c1e2b] border-[#818cf8]/60 text-[#c7d2fe]'
                  : 'bg-[#171922]/90 border-[#494454]/70 text-white'
              } border font-mono font-bold text-xs flex items-center gap-1.5 active:bg-[#4cd7f6] active:text-[#003641] shadow-lg backdrop-blur-md active:scale-95 transition-all shrink-0`}
            >
              <span className="text-[#4cd7f6] text-sm font-bold">L</span>
              <span className="text-[10px] text-[#958ea0]">{isGBA ? 'BUMPER' : 'TRIG'}</span>
            </button>
          ) : (
            <div className="w-12 shrink-0"></div>
          )}

          {/* Center: Sleek Unified Floating HUD Capsule with Direct Action Buttons & Dropdown Menu */}
          <div className="relative flex items-center gap-1 sm:gap-1.5 bg-[#12141c]/90 backdrop-blur-md px-2.5 sm:px-3 py-1 rounded-full border border-[#494454]/50 shadow-xl max-w-[85vw] overflow-visible">
            {/* 1. Back button & Title */}
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="text-xs text-[#cbc3d7] hover:text-[#4cd7f6] flex items-center gap-1 font-mono transition-colors shrink-0 pr-0.5"
                title="Thoát trò chơi"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span className="truncate max-w-[70px] xs:max-w-[110px] sm:max-w-[140px] font-bold">
                  {gameTitle || 'RetroVerse'}
                </span>
              </button>
            )}

            {/* 2. NÚT CHỌN KHE LƯU (Ẩn với Guest) */}
            {!isGuestMode && onCycleSlot && (
              <>
                <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
                <button
                  type="button"
                  onClick={onCycleSlot}
                  className="h-7 px-2 sm:px-2.5 rounded-full bg-[#1e202e] border border-amber-500/50 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 flex items-center gap-1 font-mono text-xs font-bold transition-all active:scale-95 shrink-0 shadow-sm"
                  title={`Chạm để đổi khe lưu (Hiện tại: Slot #${currentSlot})`}
                >
                  <span className="material-symbols-outlined text-sm text-amber-400">bookmark</span>
                  <span>Slot {currentSlot}</span>
                </button>
              </>
            )}

            {/* 3. Quick Save Button (Ẩn với Guest) */}
            {!isGuestMode && onTriggerQuickSave && (
              <>
                <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
                <button
                  type="button"
                  onClick={onTriggerQuickSave}
                  className="h-7 px-2 sm:px-2.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1 font-mono text-xs font-bold transition-all active:scale-95 shrink-0"
                  title={`Lưu nhanh trạng thái game vào Khe #${currentSlot}`}
                >
                  <span className="material-symbols-outlined text-sm text-emerald-400">save</span>
                  <span className="hidden xs:inline">Lưu</span>
                </button>
              </>
            )}

            {/* 4. Quick Load Button (Ẩn với Guest) */}
            {!isGuestMode && onTriggerQuickLoad && (
              <button
                type="button"
                onClick={onTriggerQuickLoad}
                className="h-7 px-2 sm:px-2.5 rounded-full bg-[#4cd7f6]/15 border border-[#4cd7f6]/40 text-[#4cd7f6] hover:bg-[#4cd7f6]/25 flex items-center gap-1 font-mono text-xs font-bold transition-all active:scale-95 shrink-0"
                title={`Tải nhanh bản lưu từ Khe #${currentSlot}`}
              >
                <span className="material-symbols-outlined text-sm">file_open</span>
                <span className="hidden xs:inline">Tải</span>
              </button>
            )}

            <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>

            {/* 5. Fullscreen Mode Button (Đưa ra ngoài theo yêu cầu) */}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="h-7 px-2 sm:px-2.5 rounded-full bg-[#1e202e] border border-[#494454]/50 text-[#d0bcff] hover:text-white hover:border-[#d0bcff]/50 flex items-center gap-1 font-mono text-xs transition-all active:scale-95 shrink-0"
                title="Chế độ chơi toàn màn hình (F11)"
              >
                <span className="material-symbols-outlined text-sm">fullscreen</span>
                <span className="hidden sm:inline text-[11px]">Toàn màn hình</span>
              </button>
            )}

            <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>

            {/* 6. DROPDOWN MENU TRIGGER BUTTON */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`h-7 px-2.5 rounded-full flex items-center gap-1 font-mono text-xs font-bold transition-all shadow-md ${
                  isDropdownOpen
                    ? 'bg-[#4cd7f6] text-[#003641] shadow-[0_0_12px_#4cd7f6]'
                    : 'bg-[#252837] text-[#4cd7f6] hover:bg-[#32364a] border border-[#4cd7f6]/40'
                }`}
                title="Danh sách chức năng & cài đặt phím"
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                <span>Menu</span>
                <span className="material-symbols-outlined text-xs">
                  {isDropdownOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {/* DROPDOWN MENU LIST POPUP */}
              {isDropdownOpen && (
                <div className="absolute top-9 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-72 bg-[#141622]/95 backdrop-blur-xl border border-[#494454]/60 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 text-xs select-none max-h-[82vh] overflow-y-auto">
                  <div className="text-[10px] font-mono uppercase text-[#958ea0] px-1 pb-1 border-b border-[#494454]/30 flex items-center justify-between">
                    <span>Công cụ & Cài đặt</span>
                    <span className="text-amber-400 font-bold">Slot #{currentSlot}</span>
                  </div>

                  {/* 0. CHỌN KHE LƯU TRỰC TIẾP TRONG MENU */}
                  {!isGuestMode && (
                    <div className="py-1.5 px-2.5 bg-[#1e202e] rounded-xl border border-[#494454]/40 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between font-mono text-[11px] text-[#cbc3d7]">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-amber-400">bookmark</span>
                          <span>Chọn khe lưu (Save Slot):</span>
                        </span>
                        <span className="text-amber-400 font-bold">Slot #{currentSlot}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              if (onSelectSlot) {
                                onSelectSlot(s);
                              } else if (onCycleSlot) {
                                onCycleSlot();
                              }
                              setIsDropdownOpen(false);
                            }}
                            className={`py-1 rounded-lg font-mono text-xs font-bold transition-all active:scale-95 flex items-center justify-center ${
                              currentSlot === s
                                ? 'bg-amber-500 text-[#141622] shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                : 'bg-[#27293b] text-[#cbc3d7] hover:bg-amber-500/20 hover:text-amber-300 border border-[#494454]/40'
                            }`}
                          >
                            #{s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 0.1 TẠM DỪNG / TIẾP TỤC & KHỞI ĐỘNG LẠI GAME TRONG MENU */}
                  {!isGuestMode && onTogglePause && (
                    <button
                      type="button"
                      onClick={() => {
                        onTogglePause();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#cbc3d7] hover:text-white flex items-center justify-between font-mono text-[11px] transition-colors"
                      title={isPaused ? "Tiếp tục trò chơi" : "Tạm dừng trò chơi"}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#d0bcff]">
                          {isPaused ? 'play_arrow' : 'pause'}
                        </span>
                        <span>{isPaused ? 'Tiếp tục trò chơi' : 'Tạm dừng trò chơi'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#32364a] text-[#d0bcff] font-bold text-[10px]">
                        Space
                      </span>
                    </button>
                  )}

                  {!isGuestMode && onRestartGame && (
                    <button
                      type="button"
                      onClick={() => {
                        onRestartGame();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-between font-mono text-[11px] font-bold transition-colors"
                      title="Khởi động lại game hiện tại mà không cần thoát phòng"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                        <span>Khởi động lại game</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold text-[10px]">
                        Reset
                      </span>
                    </button>
                  )}

                  {/* 1. ĐƯA NÚT HƯỚNG MÀN HÌNH VÀO DANH SÁCH THẢ XUỐNG */}
                  {onCycleOrientation && (
                    <button
                      type="button"
                      onClick={onCycleOrientation}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#cbc3d7] flex items-center justify-between font-mono text-[11px] transition-colors"
                      title="Đổi hướng hiển thị màn hình (Dọc / Ngang / Tự động)"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#4cd7f6]">
                          {orientationMode === 'auto'
                            ? 'screen_rotation'
                            : orientationMode === 'landscape'
                            ? 'stay_current_landscape'
                            : 'stay_current_portrait'}
                        </span>
                        <span>Hướng màn hình</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/20 text-[#4cd7f6] font-bold text-[10px]">
                        {orientationMode === 'auto'
                          ? 'Tự động (Auto)'
                          : orientationMode === 'landscape'
                          ? 'Ngang (Landscape)'
                          : 'Dọc (Portrait)'}
                      </span>
                    </button>
                  )}

                  {/* 2. ĐƯA NÚT XOAY 90 ĐỘ / 270 ĐỘ VÀO DANH SÁCH THẢ XUỐNG */}
                  {onToggleRotationAngle && (
                    <button
                      type="button"
                      onClick={onToggleRotationAngle}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#cbc3d7] flex items-center justify-between font-mono text-[11px] transition-colors"
                      title="Đảo chiều góc xoay màn hình (90° / 270°)"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#958ea0]">
                          {rotationAngleDeg === 90 ? 'rotate_90_degrees_cw' : 'rotate_90_degrees_ccw'}
                        </span>
                        <span>Đảo góc xoay</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#2a2c3d] text-[#cbc3d7] font-bold text-[10px]">
                        {rotationAngleDeg === 90 ? '90°' : '270°'}
                      </span>
                    </button>
                  )}

                  {/* 3. NÚT TUA LẠI VỚI TÙY CHỌN 5s, 10s, 15s (Ẩn với Guest) */}
                  {!isGuestMode && (
                    <div className="py-1.5 px-2.5 bg-[#1e202e] rounded-xl border border-[#494454]/40 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between font-mono text-[11px] text-[#cbc3d7]">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-indigo-400">replay</span>
                          <span>Tua lại thời gian:</span>
                        </span>
                        <span className="text-[10px] text-[#958ea0]">Chọn thời lượng</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[5, 10, 15].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => {
                              onTriggerRewind?.(sec);
                              setIsDropdownOpen(false);
                            }}
                            className="py-1.5 px-2 rounded-lg bg-[#27293b] hover:bg-indigo-600/30 border border-[#494454]/40 hover:border-indigo-400 text-indigo-300 font-mono text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm"
                            title={`Tua lại trò chơi ${sec} giây`}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {sec === 5 ? 'replay_5' : sec === 10 ? 'replay_10' : 'replay'}
                            </span>
                            <span>{sec}s</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Speed Cycle */}
                  {!isGuestMode && onCycleFastForward && (
                    <button
                      type="button"
                      onClick={onCycleFastForward}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] border border-[#494454]/40 text-[#cbc3d7] hover:text-[#4cd7f6] flex items-center justify-between font-mono text-[11px] transition-colors active:scale-95"
                      title="Chỉnh tốc độ tua nhanh game"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#4cd7f6]">fast_forward</span>
                        <span>Tốc độ tua nhanh</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#03b5d3]/20 text-[#4cd7f6] font-bold text-[10px]">
                        {fastForwardSpeed}x
                      </span>
                    </button>
                  )}

                  {/* 5. Movement Mode Switcher (D-Pad / Joystick) */}
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateConfig({
                        movementType: config.movementType === 'dpad' ? 'joystick' : 'dpad',
                      });
                      triggerHaptic(20);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#cbc3d7] flex items-center justify-between font-mono text-[11px] transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-[#4cd7f6]">
                        {config.movementType === 'dpad' ? 'drag_indicator' : 'control_camera'}
                      </span>
                      <span>Kiểu nút di chuyển</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/20 text-[#4cd7f6] font-bold text-[10px]">
                      {config.movementType === 'dpad' ? 'D-Pad' : 'Joystick'}
                    </span>
                  </button>

                  {/* 6. Detailed Gamepad Modal Trigger (Opacity, Hide/Show Buttons, Haptics) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-xl bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] flex items-center justify-between font-mono text-[11px] font-bold transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">tune</span>
                      <span>Tùy chỉnh phím (ẩn/hiện, độ rung...)</span>
                    </span>
                    <span className="material-symbols-outlined text-xs">chevron_right</span>
                  </button>

                  {/* 7. Quick Opacity Slider */}
                  <div className="py-1 px-2.5 bg-[#0e1017] rounded-xl border border-[#494454]/30 flex items-center justify-between text-[10px] font-mono text-[#958ea0]">
                    <span>Độ mờ phím:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="25"
                        max="100"
                        value={config.opacity}
                        onChange={(e) => handleUpdateConfig({ opacity: Number(e.target.value) })}
                        className="w-16 h-1 accent-[#4cd7f6] cursor-pointer"
                      />
                      <span className="text-[#4cd7f6] font-bold w-7 text-right">{config.opacity}%</span>
                    </div>
                  </div>

                  {/* 8. Visual CRT Filters */}
                  {onOpenVisualSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenVisualSettings();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#cbc3d7] flex items-center justify-between font-mono text-[11px] transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#d0bcff]">display_settings</span>
                        <span>Bộ lọc màn hình CRT / Pixel</span>
                      </span>
                      <span className="text-[10px] text-[#958ea0] font-mono">F8</span>
                    </button>
                  )}

                  {/* 9. PC Mode Toggle */}
                  {onTogglePCMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onTogglePCMode();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[#1e202e] hover:bg-[#282a3c] border border-[#494454]/40 text-[#958ea0] hover:text-white flex items-center gap-1.5 font-mono text-[11px] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">computer</span>
                      <span>Chuyển về giao diện PC</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Shoulder R */}
          {config.showShoulders && hasShoulders ? (
            <button
              onPointerDown={(e) => handlePress('r', e)}
              onPointerUp={(e) => handleRelease('r', e)}
              onPointerCancel={(e) => handleRelease('r', e)}
              className={`h-9 px-3.5 sm:px-5 rounded-xl ${
                isGBA
                  ? 'bg-gradient-to-b from-[#2d3045] to-[#1c1e2b] border-[#818cf8]/60 text-[#c7d2fe]'
                  : 'bg-[#171922]/90 border-[#494454]/70 text-white'
              } border font-mono font-bold text-xs flex items-center gap-1.5 active:bg-[#4cd7f6] active:text-[#003641] shadow-lg backdrop-blur-md active:scale-95 transition-all shrink-0`}
            >
              <span className="text-[10px] text-[#958ea0]">{isGBA ? 'BUMPER' : 'TRIG'}</span>
              <span className="text-[#4cd7f6] text-sm font-bold">R</span>
            </button>
          ) : (
            <div className="w-12 shrink-0"></div>
          )}
        </div>

        {/* Bottom Clusters: Left Thumb (Movement), Center Bottom (Select & Start), Right Thumb (Actions) */}
        <div className="w-full flex items-end justify-between px-4 sm:px-6 pb-3 sm:pb-4 pointer-events-none">
          {/* LEFT THUMB ZONE */}
          <div
            className="pointer-events-auto flex flex-col items-center transition-transform duration-75"
            style={{
              transform: `translate(${config.touchOffsets?.dpadOffsetX || 0}px, ${config.touchOffsets?.dpadOffsetY || 0}px) scale(${config.touchOffsets?.dpadScale || 1})`,
              transformOrigin: 'bottom left',
            }}
          >
            {config.showMovement && (
              <div className="p-1">
                {config.movementType === 'joystick' ? (
                  <VirtualJoystick
                    onDirectionChange={handleJoystickDirections}
                    size={140}
                    onHaptic={triggerHaptic}
                    rotationAngle={rotationAngle}
                  />
                ) : (
                  <DPadCluster onInput={onInput} onHaptic={triggerHaptic} />
                )}
              </div>
            )}
          </div>

          {/* CENTER BOTTOM: SELECT & START PILLS */}
          {config.showSystemButtons && (
            <div className="pointer-events-auto flex items-center gap-2.5 sm:gap-4 bg-[#12141c]/90 backdrop-blur-md px-3.5 sm:px-4 py-1.5 rounded-full border border-[#494454]/50 shadow-2xl mb-1">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onPointerDown={(e) => handlePress('select', e)}
                  onPointerUp={(e) => handleRelease('select', e)}
                  onPointerCancel={(e) => handleRelease('select', e)}
                  className="w-11 h-4 sm:w-13 sm:h-4.5 rounded-full bg-[#252733] border border-[#494454]/80 -rotate-12 active:bg-[#4cd7f6] active:scale-95 transition-all shadow-md"
                  title={isGenesis ? "MODE" : "SELECT"}
                ></button>
                <span className="font-mono text-[9px] text-[#958ea0] tracking-wider uppercase mt-1">
                  {isGenesis ? 'Mode' : 'Select'}
                </span>
              </div>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onPointerDown={(e) => handlePress('start', e)}
                  onPointerUp={(e) => handleRelease('start', e)}
                  onPointerCancel={(e) => handleRelease('start', e)}
                  className="w-11 h-4 sm:w-13 sm:h-4.5 rounded-full bg-[#252733] border border-[#4cd7f6]/60 -rotate-12 active:bg-[#4cd7f6] active:scale-95 transition-all shadow-md"
                  title="START"
                ></button>
                <span className="font-mono text-[9px] text-[#4cd7f6] font-bold tracking-wider uppercase mt-1">
                  Start
                </span>
              </div>
            </div>
          )}

          {/* RIGHT THUMB ZONE */}
          <div
            className="pointer-events-auto flex flex-col items-end gap-2 sm:gap-3 transition-transform duration-75"
            style={{
              transform: `translate(${config.touchOffsets?.actionOffsetX || 0}px, ${config.touchOffsets?.actionOffsetY || 0}px) scale(${config.touchOffsets?.actionScale || 1})`,
              transformOrigin: 'bottom right',
            }}
          >
            {/* Auto Buttons Row (Auto-A & Auto-B) */}
            {config.showAutoButtons && !isGenesis && (
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
                platform={platform}
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
        {config.showShoulders && hasShoulders ? (
          <button
            onPointerDown={(e) => handlePress('l', e)}
            onPointerUp={(e) => handleRelease('l', e)}
            onPointerCancel={(e) => handleRelease('l', e)}
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl ${
              isGBA
                ? 'bg-gradient-to-b from-[#2d3045] to-[#1c1e2b] border-[#818cf8]/60 text-[#c7d2fe]'
                : 'bg-[#242735] border-[#494454]/70 text-[#cbc3d7]'
            } border flex items-center justify-center gap-1 font-mono text-xs active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-md shrink-0 min-w-[44px] xs:min-w-[52px] sm:min-w-[60px]`}
          >
            <span className="font-bold text-[#4cd7f6] text-sm">L</span>
            <span className="text-[9px] text-[#958ea0] font-mono hidden xs:inline">{isGBA ? 'BUMPER' : 'TRIG'}</span>
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

          {/* Quick Tools Shortcuts (Ẩn Save/Pause/Restart với Guest) */}
          {config.showQuickTools && !isGuestMode && (
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
              {onRestartGame && (
                <button
                  type="button"
                  onClick={onRestartGame}
                  className="h-7 w-7 rounded-lg bg-[#252837] text-amber-400 hover:text-amber-300 flex items-center justify-center transition-colors"
                  title="Khởi động lại game (Reset)"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
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
        {config.showShoulders && hasShoulders ? (
          <button
            onPointerDown={(e) => handlePress('r', e)}
            onPointerUp={(e) => handleRelease('r', e)}
            onPointerCancel={(e) => handleRelease('r', e)}
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl ${
              isGBA
                ? 'bg-gradient-to-b from-[#2d3045] to-[#1c1e2b] border-[#818cf8]/60 text-[#c7d2fe]'
                : 'bg-[#242735] border-[#494454]/70 text-[#cbc3d7]'
            } border flex items-center justify-center gap-1 font-mono text-xs active:bg-[#4cd7f6] active:text-[#003641] active:scale-95 transition-all shadow-md shrink-0 min-w-[44px] xs:min-w-[52px] sm:min-w-[60px]`}
          >
            <span className="text-[9px] text-[#958ea0] font-mono hidden xs:inline">{isGBA ? 'BUMPER' : 'TRIG'}</span>
            <span className="font-bold text-[#4cd7f6] text-sm">R</span>
          </button>
        ) : (
          <div className="w-11 shrink-0"></div>
        )}
      </div>

      {/* 2. AUTO-FIRE BUTTONS ROW (Auto A & Auto B) */}
      {config.showAutoButtons && !isGenesis && (
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
        <div
          className="flex-1 flex justify-start items-center min-w-0 transition-transform duration-75"
          style={{
            transform: `translate(${config.touchOffsets?.dpadOffsetX || 0}px, ${config.touchOffsets?.dpadOffsetY || 0}px) scale(${config.touchOffsets?.dpadScale || 1})`,
            transformOrigin: 'center left',
          }}
        >
          {config.showMovement ? (
            config.movementType === 'joystick' ? (
              <VirtualJoystick
                onDirectionChange={handleJoystickDirections}
                size={116}
                onHaptic={triggerHaptic}
                rotationAngle={rotationAngle}
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
                  title={isGenesis ? "MODE" : "SELECT"}
                ></button>
                <span className="font-mono text-[8px] sm:text-[9px] tracking-wider text-[#958ea0] uppercase mt-0.5">
                  {isGenesis ? 'Mode' : 'Select'}
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
        <div
          className="flex-1 flex justify-end items-center min-w-0 pr-0 sm:pr-0.5 transition-transform duration-75"
          style={{
            transform: `translate(${config.touchOffsets?.actionOffsetX || 0}px, ${config.touchOffsets?.actionOffsetY || 0}px) scale(${config.touchOffsets?.actionScale || 1})`,
            transformOrigin: 'center right',
          }}
        >
          {config.showActionButtons ? (
            <ActionButtonsCluster
              platform={platform}
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
// SUB-COMPONENT: ADVANCED 8-WAY D-PAD WITH TOUCH-SLIDING & DIAGONALS
// =========================================================================
interface DPadClusterProps {
  onInput: (btn: keyof EmulatorInputState, pressed: boolean) => void;
  onHaptic?: (ms: number) => void;
}

const DPadCluster: React.FC<DPadClusterProps> = ({ onInput, onHaptic }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeDirsRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const [activeVisuals, setActiveVisuals] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  const updateDirections = useCallback(
    (dirs: { up: boolean; down: boolean; left: boolean; right: boolean }) => {
      const current = activeDirsRef.current;
      let changed = false;

      (['up', 'down', 'left', 'right'] as const).forEach((d) => {
        if (current[d] !== dirs[d]) {
          current[d] = dirs[d];
          onInput(d, dirs[d]);
          changed = true;
        }
      });

      if (changed) {
        setActiveVisuals({ ...current });
        if (dirs.up || dirs.down || dirs.left || dirs.right) {
          onHaptic?.(14);
        }
      }
    },
    [onInput, onHaptic]
  );

  const resolvePointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      // Deadzone threshold (under 12px from center counts as released)
      if (dist < 12) {
        updateDirections({ up: false, down: false, left: false, right: false });
        return;
      }

      // Convert dx, dy to angle in degrees (-180 to 180)
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      // 8-way sector resolving:
      let up = false;
      let down = false;
      let left = false;
      let right = false;

      if (angle >= -67.5 && angle <= 67.5) right = true;
      if (angle >= 22.5 && angle <= 157.5) down = true;
      if (angle >= 112.5 || angle <= -112.5) left = true;
      if (angle >= -157.5 && angle <= -22.5) up = true;

      updateDirections({ up, down, left, right });
    },
    [updateDirections]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    resolvePointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.buttons > 0 || e.pressure > 0) {
      resolvePointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    updateDirections({ up: false, down: false, left: false, right: false });
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-[122px] h-[122px] sm:w-34 sm:h-34 rounded-full bg-[#0c0e14]/95 p-1 flex items-center justify-center border-2 border-[#494454]/60 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md select-none shrink-0 touch-none cursor-pointer"
      title="Cụm D-Pad 8 hướng cảm ứng (chạm hoặc trượt ngón tay để di chuyển chéo)"
    >
      {/* 4 Diagonal Guide Indicators in Background */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {/* Up-Left */}
        <div
          className={`absolute top-2 left-2 w-5 h-5 rounded-full transition-all duration-150 ${
            activeVisuals.up && activeVisuals.left
              ? 'bg-[#4cd7f6]/40 scale-125 shadow-[0_0_8px_#4cd7f6]'
              : 'opacity-10 bg-white/20'
          }`}
        />
        {/* Up-Right */}
        <div
          className={`absolute top-2 right-2 w-5 h-5 rounded-full transition-all duration-150 ${
            activeVisuals.up && activeVisuals.right
              ? 'bg-[#4cd7f6]/40 scale-125 shadow-[0_0_8px_#4cd7f6]'
              : 'opacity-10 bg-white/20'
          }`}
        />
        {/* Down-Left */}
        <div
          className={`absolute bottom-2 left-2 w-5 h-5 rounded-full transition-all duration-150 ${
            activeVisuals.down && activeVisuals.left
              ? 'bg-[#4cd7f6]/40 scale-125 shadow-[0_0_8px_#4cd7f6]'
              : 'opacity-10 bg-white/20'
          }`}
        />
        {/* Down-Right */}
        <div
          className={`absolute bottom-2 right-2 w-5 h-5 rounded-full transition-all duration-150 ${
            activeVisuals.down && activeVisuals.right
              ? 'bg-[#4cd7f6]/40 scale-125 shadow-[0_0_8px_#4cd7f6]'
              : 'opacity-10 bg-white/20'
          }`}
        />
      </div>

      {/* D-Pad Cross */}
      <div className="relative w-[108px] h-[108px] sm:w-[116px] sm:h-[116px] pointer-events-none">
        {/* UP ARM */}
        <div
          className={`absolute top-0 left-[35px] sm:left-[39px] w-[38px] h-[38px] rounded-t-xl border-t-2 border-x border-[#494454]/80 flex items-center justify-center transition-all ${
            activeVisuals.up
              ? 'bg-[#4cd7f6] text-[#003641] shadow-[0_0_12px_#4cd7f6] scale-105 z-10'
              : 'bg-gradient-to-b from-[#2a2c3a] to-[#1c1e28] text-[#958ea0]'
          }`}
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_drop_up</span>
        </div>

        {/* DOWN ARM */}
        <div
          className={`absolute bottom-0 left-[35px] sm:left-[39px] w-[38px] h-[38px] rounded-b-xl border-b-2 border-x border-[#494454]/80 flex items-center justify-center transition-all ${
            activeVisuals.down
              ? 'bg-[#4cd7f6] text-[#003641] shadow-[0_0_12px_#4cd7f6] scale-105 z-10'
              : 'bg-gradient-to-t from-[#2a2c3a] to-[#1c1e28] text-[#958ea0]'
          }`}
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_drop_down</span>
        </div>

        {/* LEFT ARM */}
        <div
          className={`absolute top-[35px] sm:top-[39px] left-0 w-[38px] h-[38px] rounded-l-xl border-l-2 border-y border-[#494454]/80 flex items-center justify-center transition-all ${
            activeVisuals.left
              ? 'bg-[#4cd7f6] text-[#003641] shadow-[0_0_12px_#4cd7f6] scale-105 z-10'
              : 'bg-gradient-to-r from-[#2a2c3a] to-[#1c1e28] text-[#958ea0]'
          }`}
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_left</span>
        </div>

        {/* RIGHT ARM */}
        <div
          className={`absolute top-[35px] sm:top-[39px] right-0 w-[38px] h-[38px] rounded-r-xl border-r-2 border-y border-[#494454]/80 flex items-center justify-center transition-all ${
            activeVisuals.right
              ? 'bg-[#4cd7f6] text-[#003641] shadow-[0_0_12px_#4cd7f6] scale-105 z-10'
              : 'bg-gradient-to-l from-[#2a2c3a] to-[#1c1e28] text-[#958ea0]'
          }`}
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl">arrow_right</span>
        </div>

        {/* CENTER PIVOT */}
        <div className="absolute top-[35px] sm:top-[39px] left-[35px] sm:left-[39px] w-[38px] h-[38px] bg-[#151722] rounded-sm border border-[#494454]/50 flex items-center justify-center shadow-inner">
          <div
            className={`w-3 h-3 rounded-full transition-all ${
              activeVisuals.up || activeVisuals.down || activeVisuals.left || activeVisuals.right
                ? 'bg-[#4cd7f6] scale-110 shadow-[0_0_6px_#4cd7f6]'
                : 'bg-[#252837] border border-[#494454]'
            }`}
          ></div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: PLATFORM-OPTIMIZED ACTION FACE BUTTONS CLUSTER
// (NES 2-Button / GBA Angled / GENESIS 3-Arc / SNES Diamond)
// =========================================================================
interface ActionButtonsClusterProps {
  platform: string;
  onPress: (btn: keyof EmulatorInputState, e: React.PointerEvent) => void;
  onRelease: (btn: keyof EmulatorInputState, e: React.PointerEvent) => void;
}

const ActionButtonsCluster: React.FC<ActionButtonsClusterProps> = ({
  platform,
  onPress,
  onRelease,
}) => {
  const upperPlat = (platform || 'SNES').toUpperCase();
  const isNES = upperPlat === 'NES';
  const isGBA = upperPlat === 'GBA' || upperPlat.includes('ADVANCE') || upperPlat === 'GB' || upperPlat === 'GBC';
  const isGenesis = upperPlat === 'GENESIS' || upperPlat === 'MEGADRIVE' || upperPlat === 'SEGA';

  // 1. NES AUTHENTIC DUAL BUTTON CLUSTER (CLASSIC HORIZONTAL B & A)
  if (isNES) {
    return (
      <div className="relative w-[126px] h-[122px] sm:w-36 sm:h-34 rounded-2xl bg-gradient-to-b from-[#1a1c24] to-[#0c0e14] p-2 flex flex-col items-center justify-between border-2 border-[#d9383a]/60 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md select-none shrink-0">
        <div className="w-full flex items-center justify-between px-1">
          <span className="text-[9px] font-mono font-bold tracking-widest text-[#d9383a] uppercase">NES PAD</span>
          <span className="text-[8px] font-mono text-[#958ea0]">DUAL ACTION</span>
        </div>

        <div className="flex items-center justify-center gap-3 my-auto -rotate-6">
          {/* Button B (Left - Crimson) */}
          <div className="flex flex-col items-center">
            <button
              onPointerDown={(e) => onPress('b', e)}
              onPointerUp={(e) => onRelease('b', e)}
              onPointerCancel={(e) => onRelease('b', e)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-[#e74c3c] to-[#992d22] border-2 border-[#ff7979] text-white font-mono font-black text-sm sm:text-base flex items-center justify-center shadow-lg active:scale-90 active:from-[#ff7675] active:to-[#d63031] transition-all"
              title="NES Nút B"
            >
              B
            </button>
            <span className="font-mono text-[9px] text-[#ff7979] font-bold mt-1 uppercase">Run / Atk</span>
          </div>

          {/* Button A (Right - Crimson) */}
          <div className="flex flex-col items-center">
            <button
              onPointerDown={(e) => onPress('a', e)}
              onPointerUp={(e) => onRelease('a', e)}
              onPointerCancel={(e) => onRelease('a', e)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-[#e74c3c] to-[#992d22] border-2 border-[#ff7979] text-white font-mono font-black text-sm sm:text-base flex items-center justify-center shadow-lg active:scale-90 active:from-[#ff7675] active:to-[#d63031] transition-all"
              title="NES Nút A"
            >
              A
            </button>
            <span className="font-mono text-[9px] text-[#ff7979] font-bold mt-1 uppercase">Jump / OK</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. GBA AUTHENTIC ANGLED DUAL CLUSTER (INDIGO B & A)
  if (isGBA) {
    return (
      <div className="relative w-[124px] h-[122px] sm:w-36 sm:h-34 rounded-2xl bg-gradient-to-b from-[#1c1e2b] to-[#0c0e14] p-2 flex flex-col items-center justify-between border-2 border-[#818cf8]/60 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md select-none shrink-0">
        <div className="w-full flex items-center justify-between px-1">
          <span className="text-[9px] font-mono font-bold tracking-widest text-[#818cf8] uppercase">GBA ACTION</span>
          <span className="text-[8px] font-mono text-[#958ea0]">32-BIT</span>
        </div>

        <div className="relative w-full h-[84px] flex items-center justify-center">
          {/* Button B (Lower-Left) */}
          <div className="absolute bottom-1 left-2 flex flex-col items-center">
            <button
              onPointerDown={(e) => onPress('b', e)}
              onPointerUp={(e) => onRelease('b', e)}
              onPointerCancel={(e) => onRelease('b', e)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-[#4f46e5] to-[#312e81] border-2 border-[#a5b4fc] text-white font-mono font-black text-sm sm:text-base flex items-center justify-center shadow-lg active:scale-90 active:from-[#6366f1] active:to-[#3730a3] transition-all"
              title="GBA Nút B"
            >
              B
            </button>
            <span className="font-mono text-[9px] text-[#a5b4fc] font-bold mt-0.5">B</span>
          </div>

          {/* Button A (Upper-Right) */}
          <div className="absolute top-1 right-2 flex flex-col items-center">
            <button
              onPointerDown={(e) => onPress('a', e)}
              onPointerUp={(e) => onRelease('a', e)}
              onPointerCancel={(e) => onRelease('a', e)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-[#4f46e5] to-[#312e81] border-2 border-[#a5b4fc] text-white font-mono font-black text-sm sm:text-base flex items-center justify-center shadow-lg active:scale-90 active:from-[#6366f1] active:to-[#3730a3] transition-all"
              title="GBA Nút A"
            >
              A
            </button>
            <span className="font-mono text-[9px] text-[#a5b4fc] font-bold mt-0.5">A</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. GENESIS 3-BUTTON CURVED ARC (A, B, C)
  if (isGenesis) {
    return (
      <div className="relative w-[132px] h-[122px] sm:w-40 sm:h-34 rounded-2xl bg-gradient-to-b from-[#1a1b24] to-[#0c0e14] p-2 flex flex-col items-center justify-between border-2 border-[#38bdf8]/50 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md select-none shrink-0">
        <div className="w-full flex items-center justify-between px-1">
          <span className="text-[9px] font-mono font-bold tracking-widest text-[#38bdf8] uppercase">SEGA ARC</span>
          <span className="text-[8px] font-mono text-[#958ea0]">3-BUTTON</span>
        </div>

        <div className="flex items-center justify-center gap-1.5 sm:gap-2 my-auto">
          {/* Genesis A (Maps to 'b') */}
          <div className="flex flex-col items-center">
            <button
              onPointerDown={(e) => onPress('b', e)}
              onPointerUp={(e) => onRelease('b', e)}
              onPointerCancel={(e) => onRelease('b', e)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#252837] to-[#12131b] border-2 border-[#38bdf8]/80 text-[#38bdf8] font-mono font-black text-xs sm:text-sm flex items-center justify-center shadow-md active:scale-90 active:bg-[#38bdf8] active:text-[#002b36] transition-all"
              title="Genesis Nút A"
            >
              A
            </button>
            <span className="font-mono text-[8px] text-[#958ea0] mt-0.5">Btn A</span>
          </div>

          {/* Genesis B (Maps to 'a') */}
          <div className="flex flex-col items-center -translate-y-1">
            <button
              onPointerDown={(e) => onPress('a', e)}
              onPointerUp={(e) => onRelease('a', e)}
              onPointerCancel={(e) => onRelease('a', e)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#252837] to-[#12131b] border-2 border-[#38bdf8]/80 text-[#38bdf8] font-mono font-black text-xs sm:text-sm flex items-center justify-center shadow-md active:scale-90 active:bg-[#38bdf8] active:text-[#002b36] transition-all"
              title="Genesis Nút B"
            >
              B
            </button>
            <span className="font-mono text-[8px] text-[#958ea0] mt-0.5">Btn B</span>
          </div>

          {/* Genesis C (Maps to 'y') */}
          <div className="flex flex-col items-center -translate-y-2">
            <button
              onPointerDown={(e) => onPress('y', e)}
              onPointerUp={(e) => onRelease('y', e)}
              onPointerCancel={(e) => onRelease('y', e)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#252837] to-[#12131b] border-2 border-[#38bdf8]/80 text-[#38bdf8] font-mono font-black text-xs sm:text-sm flex items-center justify-center shadow-md active:scale-90 active:bg-[#38bdf8] active:text-[#002b36] transition-all"
              title="Genesis Nút C"
            >
              C
            </button>
            <span className="font-mono text-[8px] text-[#958ea0] mt-0.5">Btn C</span>
          </div>
        </div>
      </div>
    );
  }

  // 4. SNES 4-BUTTON DIAMOND (SUPER FAMICOM / SNES ICONIC)
  return (
    <div className="relative w-[122px] h-[122px] sm:w-34 sm:h-34 rounded-full bg-[#0c0e14]/95 p-1.5 sm:p-2 flex items-center justify-center border-2 border-[#494454]/60 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md select-none shrink-0">
      <div className="relative w-[108px] h-[108px] sm:w-28 sm:h-28">
        {/* X (Top - Sky Blue) */}
        <button
          onPointerDown={(e) => onPress('x', e)}
          onPointerUp={(e) => onRelease('x', e)}
          onPointerCancel={(e) => onRelease('x', e)}
          className="absolute top-0 left-[36px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#2a3749] to-[#16202c] border-2 border-[#38bdf8] text-[#38bdf8] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#38bdf8] active:text-[#082f49] transition-all"
          title="SNES Nút X"
        >
          X
        </button>

        {/* Y (Left - Emerald) */}
        <button
          onPointerDown={(e) => onPress('y', e)}
          onPointerUp={(e) => onRelease('y', e)}
          onPointerCancel={(e) => onRelease('y', e)}
          className="absolute top-[36px] sm:top-9 left-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#233f37] to-[#132520] border-2 border-[#34d399] text-[#34d399] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#34d399] active:text-[#022c22] transition-all"
          title="SNES Nút Y"
        >
          Y
        </button>

        {/* A (Right - Crimson Red) */}
        <button
          onPointerDown={(e) => onPress('a', e)}
          onPointerUp={(e) => onRelease('a', e)}
          onPointerCancel={(e) => onRelease('a', e)}
          className="absolute top-[36px] sm:top-9 right-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#42252b] to-[#261317] border-2 border-[#f43f5e] text-[#f43f5e] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#f43f5e] active:text-[#4c0519] transition-all"
          title="SNES Nút A"
        >
          A
        </button>

        {/* B (Bottom - Golden Amber) */}
        <button
          onPointerDown={(e) => onPress('b', e)}
          onPointerUp={(e) => onRelease('b', e)}
          onPointerCancel={(e) => onRelease('b', e)}
          className="absolute bottom-0 left-[36px] sm:left-9 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-[#42331d] to-[#261c0e] border-2 border-[#fbbf24] text-[#fbbf24] font-bold text-xs sm:text-sm flex items-center justify-center shadow-lg active:scale-90 active:bg-[#fbbf24] active:text-[#451a03] transition-all"
          title="SNES Nút B"
        >
          B
        </button>

        {/* Center Cross Accent */}
        <div className="absolute top-[38px] sm:top-[38px] left-[38px] sm:left-[38px] w-8 h-8 rounded-full bg-[#12141c]/80 border border-[#494454]/40 flex items-center justify-center pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-[#494454]"></div>
        </div>
      </div>
    </div>
  );
};
