import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Game } from '../types';
import { getGameById, FEATURED_GAMES } from '../services/games/catalog';
import { RetroEmulatorEngine, EmulatorInputState } from '../emulator/engine';
import { VirtualGamepad } from '../components/VirtualGamepad';
import { saveManager } from '../services/saves/saveManager';
import { gamepadService, ConnectedGamepadInfo } from '../services/input/gamepadService';
import {
  VisualSettingsModal,
  VisualSettingsConfig,
  DisplayFilterType
} from '../components/VisualSettingsModal';
import { Nostalgist } from 'nostalgist';
import { romStorage } from '../services/roms/romStorage';
import { parseRom } from '../emulator/romParser';
import { downloadDriveFile } from '../services/googleDriveService';
import { inputConfigService, TargetSystem } from '../services/input/inputConfigService';
import { libraryStore } from '../services/games/libraryStore';

const FALLBACK_GAME: Game = {
  id: 'custom-unloaded',
  title: 'Chờ nạp ROM',
  platform: 'NES',
  year: 1995,
  developer: 'Retro Cartridge',
  genre: 'Retro',
  rating: 5.0,
  ratingCount: 1,
  boxArt: '',
  description: 'Vui lòng nạp tệp ROM để bắt đầu chơi.',
  features: [],
};

interface EmulatorPageProps {
  gameId: string;
  initialSlot?: number;
  onExit: () => void;
  onOpenSettings: () => void;
}

export const EmulatorPage: React.FC<EmulatorPageProps> = ({
  gameId,
  initialSlot = 1,
  onExit,
  onOpenSettings
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RetroEmulatorEngine | null>(null);
  const nostalgistRef = useRef<Nostalgist | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [game, setGame] = useState<Game>(() => getGameById(gameId) || FEATURED_GAMES[0] || FALLBACK_GAME);
  const [hasRom, setHasRom] = useState<boolean>(() => romStorage.hasRom(gameId));
  const [isLoadingCore, setIsLoadingCore] = useState<boolean>(false);
  const [coreLoadingStatus, setCoreLoadingStatus] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentSlot, setCurrentSlot] = useState<number>(initialSlot);
  const [fastForwardSpeed, setFastForwardSpeed] = useState<number>(1);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(true);
  const [inspectorTab, setInspectorTab] = useState<'controls' | 'states' | 'visuals' | 'cheats'>('controls');
  const [showVisualSettingsModal, setShowVisualSettingsModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isHandheldTouchMode, setIsHandheldTouchMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 840 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
    return false;
  });
  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  const [orientationMode, setOrientationMode] = useState<'auto' | 'portrait' | 'landscape'>('auto');

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isWindowLandscape = windowDimensions.width > windowDimensions.height;
  const effectiveOrientation: 'portrait' | 'landscape' =
    orientationMode === 'auto'
      ? isWindowLandscape
        ? 'landscape'
        : 'portrait'
      : orientationMode;

  const cycleOrientation = () => {
    if (orientationMode === 'auto') {
      const next = effectiveOrientation === 'portrait' ? 'landscape' : 'portrait';
      setOrientationMode(next);
      showToast(`Đã cố định: ${next === 'landscape' ? 'Màn hình ngang' : 'Màn hình dọc'}`);
    } else if (orientationMode === 'portrait') {
      setOrientationMode('landscape');
      showToast('Đã chuyển sang màn hình ngang');
    } else {
      setOrientationMode('auto');
      showToast('Tự động xoay theo màn hình');
    }
  };

  const [fpsDisplay, setFpsDisplay] = useState<number>(60.0);
  const [activeSignals, setActiveSignals] = useState<{ [key: string]: boolean }>({});
  const [connectedGamepad, setConnectedGamepad] = useState<ConnectedGamepadInfo | null>(() => gamepadService.getPrimaryController());

  // Visual Display Filter Settings ('CRT Scanlines', 'Pixelated', 'LCD Grid', 'Bilinear Smooth')
  const [visualSettings, setVisualSettings] = useState<VisualSettingsConfig>(() => {
    try {
      const saved = localStorage.getItem('retroverse_visual_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      filter: 'CRT Scanlines',
      filterIntensity: 75,
      enableCurvature: true,
      enableBloom: true,
      aspectRatio: '4:3',
      colorTint: 'neutral'
    };
  });

  const handleUpdateVisualSettings = (updated: Partial<VisualSettingsConfig>) => {
    setVisualSettings(prev => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem('retroverse_visual_settings', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (updated.filter) {
      showToast(`Filter: ${updated.filter}`);
    }
  };

  const handleResetVisualSettings = () => {
    const defaults: VisualSettingsConfig = {
      filter: 'CRT Scanlines',
      filterIntensity: 75,
      enableCurvature: true,
      enableBloom: true,
      aspectRatio: '4:3',
      colorTint: 'neutral'
    };
    setVisualSettings(defaults);
    try {
      localStorage.setItem('retroverse_visual_settings', JSON.stringify(defaults));
    } catch {}
    showToast("Visual settings reset to default");
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  // Local core paths for zero-latency offline loading without CDN dependencies
  const LOCAL_CORES: Record<string, { name: string; js: string; wasm: string }> = {
    NES: {
      name: 'fceumm',
      js: '/cores/fceumm_libretro.js',
      wasm: '/cores/fceumm_libretro.wasm',
    },
    SNES: {
      name: 'snes9x2005',
      js: '/cores/snes9x2005_libretro.js',
      wasm: '/cores/snes9x2005_libretro.wasm',
    },
    GBA: {
      name: 'mgba',
      js: '/cores/mgba_libretro.js',
      wasm: '/cores/mgba_libretro.wasm',
    },
  };

  // Launch Nostalgist with a ROM
  const launchRealEmulator = async (romData: Uint8Array, filename: string, targetPlatform: string) => {
    setIsLoadingCore(true);
    setLoadError(null);

    const plat = (targetPlatform || 'NES').toUpperCase();
    const coreDef = plat.includes('GBA') || plat.includes('ADVANCE')
      ? LOCAL_CORES.GBA
      : plat === 'SNES' || plat.includes('SUPER')
      ? LOCAL_CORES.SNES
      : LOCAL_CORES.NES;

    let validFilename = filename || `game.${plat.toLowerCase()}`;
    if (!validFilename.includes('.')) {
      if (plat === 'NES') validFilename += '.nes';
      else if (plat.includes('GBA')) validFilename += '.gba';
      else validFilename += '.sfc';
    }

    setCoreLoadingStatus(`Đang nạp core ${coreDef.name} (RetroArch WebAssembly)...`);

    try {
      if (nostalgistRef.current) {
        try {
          nostalgistRef.current.exit({ removeCanvas: false });
        } catch {}
        nostalgistRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Khung hiển thị canvas không sẵn sàng');
      }

      setHasRom(true);

      const launchPromise = Nostalgist.launch({
        element: canvas,
        core: {
          name: coreDef.name,
          js: coreDef.js,
          wasm: coreDef.wasm,
        },
        rom: {
          fileName: validFilename,
          fileContent: romData,
        },
        retroarchConfig: {
          input_player1_analog_dpad_mode: 1,
          input_player1_up: 'up',
          input_player1_down: 'down',
          input_player1_left: 'left',
          input_player1_right: 'right',
          input_player1_a: 'x',
          input_player1_b: 'z',
          input_player1_x: 's',
          input_player1_y: 'a',
          input_player1_l: 'q',
          input_player1_r: 'e',
          input_player1_start: 'enter',
          input_player1_select: 'rshift',
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Khởi động WebAssembly quá thời gian chờ (15s).')), 15000);
      });

      const instance = await Promise.race([launchPromise, timeoutPromise]);

      // Patch Nostalgist emulator's internal fireKeyboardEvent to provide fully-formed mock events
      // with preventDefault and valid scancodes, preventing memory access out of bounds in RetroArch WASM
      try {
        const emulator = (instance as any).getEmulator?.();
        if (emulator && typeof emulator.fireKeyboardEvent === 'function') {
          const originalFire = emulator.fireKeyboardEvent.bind(emulator);
          emulator.fireKeyboardEvent = (type: string, code: string) => {
            try {
              const { JSEvents } = emulator.getEmscripten() || {};
              if (JSEvents && Array.isArray(JSEvents.eventHandlers)) {
                const codeMap: Record<string, { key: string; keyCode: number }> = {
                  ArrowUp: { key: 'ArrowUp', keyCode: 38 },
                  ArrowDown: { key: 'ArrowDown', keyCode: 40 },
                  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 },
                  ArrowRight: { key: 'ArrowRight', keyCode: 39 },
                  KeyX: { key: 'x', keyCode: 88 },
                  KeyZ: { key: 'z', keyCode: 90 },
                  KeyS: { key: 's', keyCode: 83 },
                  KeyA: { key: 'a', keyCode: 65 },
                  KeyQ: { key: 'q', keyCode: 81 },
                  KeyE: { key: 'e', keyCode: 69 },
                  KeyW: { key: 'w', keyCode: 87 },
                  Enter: { key: 'Enter', keyCode: 13 },
                  ShiftRight: { key: 'Shift', keyCode: 16 },
                };
                const mapped = codeMap[code] || { key: code, keyCode: 0 };
                const mockEvent = {
                  type,
                  code,
                  key: mapped.key,
                  keyCode: mapped.keyCode,
                  which: mapped.keyCode,
                  charCode: 0,
                  location: 0,
                  ctrlKey: false,
                  shiftKey: false,
                  altKey: false,
                  metaKey: false,
                  repeat: false,
                  timeStamp: performance.now(),
                  target: emulator.options?.element || canvas,
                  preventDefault: () => {},
                  stopPropagation: () => {},
                };
                for (const handler of JSEvents.eventHandlers) {
                  if (handler && handler.eventTypeString === type && typeof handler.eventListenerFunc === 'function') {
                    try {
                      handler.eventListenerFunc(mockEvent);
                    } catch {}
                  }
                }
                return;
              }
            } catch {}
            originalFire(type, code);
          };
        }
      } catch (patchErr) {
        console.warn('Could not wrap emulator.fireKeyboardEvent:', patchErr);
      }

      nostalgistRef.current = instance;
      setIsLoadingCore(false);
      showToast(`Đã nạp ROM: ${validFilename}`);
    } catch (err: any) {
      console.error('Failed to launch Nostalgist:', err);
      setIsLoadingCore(false);
      setLoadError(err?.message || 'Không thể tải core giả lập. Vui lòng kiểm tra lại tệp ROM.');
    }
  };

  const launchCanvasFallback = () => {
    if (!canvasRef.current) return;
    setLoadError(null);
    setIsLoadingCore(false);
    if (nostalgistRef.current) {
      try { nostalgistRef.current.exit({ removeCanvas: false }); } catch {}
      nostalgistRef.current = null;
    }
    const engine = new RetroEmulatorEngine();
    engine.initialize(canvasRef.current);
    engine.loadGame(game);
    engine.start();
    engineRef.current = engine;
    setHasRom(true);
    showToast("Đang chạy bằng Canvas Retro Engine dự phòng");
  };

  const handleDirectRomFile = async (file: File) => {
    try {
      setIsLoadingCore(true);
      setCoreLoadingStatus(`Đang đọc tệp "${file.name}"...`);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const header = parseRom(bytes, file.name);
      const detectedPlatform = header.platform === 'UNKNOWN' ? game.platform : header.platform;

      const updatedGame: Game = {
        ...game,
        id: game.id === 'custom-unloaded' ? `custom-${Date.now()}` : game.id,
        title: header.internalTitle || file.name,
        platform: detectedPlatform,
        romFilename: file.name,
        source: 'local',
      };

      romStorage.saveRom(updatedGame.id, file.name, detectedPlatform, bytes);
      libraryStore.addGame(updatedGame);
      setGame(updatedGame);

      await launchRealEmulator(bytes, file.name, detectedPlatform);
    } catch (err: any) {
      console.error(err);
      setIsLoadingCore(false);
      setLoadError('Lỗi đọc tệp ROM từ máy tính: ' + (err?.message || ''));
    }
  };

  // Detect mobile width on mount
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsHandheldTouchMode(true);
      setShowInspector(false);
    }
  }, []);

  // Initialize and run emulator engine
  useEffect(() => {
    let isCancelled = false;
    const targetGame = getGameById(gameId) || FEATURED_GAMES[0] || FALLBACK_GAME;
    setGame(targetGame);

    const initRom = async () => {
      // 1. Check synchronous memory cache first
      let stored = romStorage.getRom(gameId);
      // 2. If not in memory (e.g. after page refresh), query IndexedDB
      if (!stored) {
        stored = await romStorage.getRomAsync(gameId);
      }

      if (isCancelled) return;

      if (stored && stored.data && stored.data.length > 0) {
        setHasRom(true);
        launchRealEmulator(stored.data, stored.filename, stored.platform || targetGame.platform);
      } else if (targetGame?.driveFileId) {
        setIsLoadingCore(true);
        setCoreLoadingStatus(`Đang tải ROM "${targetGame.romFilename || targetGame.title}" từ Google Drive...`);
        try {
          const buf = await downloadDriveFile(targetGame.driveFileId);
          if (isCancelled) return;
          const bytes = new Uint8Array(buf);
          romStorage.saveRom(targetGame.id, targetGame.romFilename || targetGame.title, targetGame.platform, bytes);
          setHasRom(true);
          launchRealEmulator(bytes, targetGame.romFilename || targetGame.title, targetGame.platform);
        } catch (err: any) {
          if (isCancelled) return;
          setIsLoadingCore(false);
          setLoadError(`Không thể tải tệp từ Google Drive: ${err?.message || 'Lỗi kết nối'}. Vui lòng thử nạp lại.`);
        }
      } else {
        setHasRom(false);
      }
    };

    initRom();

    return () => {
      isCancelled = true;
      if (nostalgistRef.current) {
        try {
          nostalgistRef.current.exit({ removeCanvas: false });
        } catch (e) {
          console.error(e);
        }
        nostalgistRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [gameId]);

  // RetroArch Emscripten and DOM synthetic key mapping table
  const RETRO_KEY_MAPPING: Record<
    keyof EmulatorInputState,
    { code: string; key: string; keyCode: number; retroButton: string }
  > = {
    up: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38, retroButton: 'up' },
    down: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40, retroButton: 'down' },
    left: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37, retroButton: 'left' },
    right: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39, retroButton: 'right' },
    a: { code: 'KeyX', key: 'x', keyCode: 88, retroButton: 'a' },
    b: { code: 'KeyZ', key: 'z', keyCode: 90, retroButton: 'b' },
    x: { code: 'KeyS', key: 's', keyCode: 83, retroButton: 'x' },
    y: { code: 'KeyA', key: 'a', keyCode: 65, retroButton: 'y' },
    l: { code: 'KeyQ', key: 'q', keyCode: 81, retroButton: 'l' },
    r: { code: 'KeyE', key: 'e', keyCode: 69, retroButton: 'r' },
    start: { code: 'Enter', key: 'Enter', keyCode: 13, retroButton: 'start' },
    select: { code: 'ShiftRight', key: 'Shift', keyCode: 16, retroButton: 'select' },
  };

  // Helper to map KeyboardEvent code to Virtual Button name for UI signals / fallback engine
  const getButtonFromCode = (code: string): keyof EmulatorInputState | null => {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        return 'up';
      case 'ArrowDown':
      case 'KeyS':
        return 'down';
      case 'ArrowLeft':
      case 'KeyA':
        return 'left';
      case 'ArrowRight':
      case 'KeyD':
        return 'right';
      case 'KeyZ':
        return 'b';
      case 'KeyX':
        return 'a';
      case 'KeyS':
        return 'x';
      case 'KeyA':
        return 'y';
      case 'KeyQ':
        return 'l';
      case 'KeyE':
        return 'r';
      case 'Enter':
        return 'start';
      case 'ShiftRight':
      case 'Space':
        return 'select';
      default:
        return null;
    }
  };

  // Unified Input Router: used strictly for On-Screen Virtual Controller & Gamepads
  const handleVirtualInput = useCallback((btn: keyof EmulatorInputState, pressed: boolean) => {
    // 1. Update visual signals for HUD and test panel (bailout if unchanged to prevent re-render cascading)
    const sigKey = btn.toUpperCase();
    setActiveSignals((prev) => {
      if (prev[sigKey] === pressed) return prev;
      return { ...prev, [sigKey]: pressed };
    });

    // 2. Route to Canvas Fallback Engine if active
    if (engineRef.current) {
      engineRef.current.setInput(btn, pressed);
    }

    // 3. Route to Nostalgist WebAssembly Core (RetroArch) safely via official API (no DOM event dispatch)
    if (nostalgistRef.current) {
      const mapping = RETRO_KEY_MAPPING[btn];
      if (mapping) {
        try {
          if (pressed) {
            nostalgistRef.current.pressDown(mapping.retroButton as any);
          } else {
            nostalgistRef.current.pressUp(mapping.retroButton as any);
          }
        } catch (err) {
          console.warn('Nostalgist pressDown/pressUp error:', err);
        }
      }
    }
  }, []);

  // Keyboard mapping listeners
  useEffect(() => {
    const getTargetSystem = (): TargetSystem => {
      const plat = (game?.platform || '').toUpperCase();
      if (plat === 'NES') return 'NES';
      if (plat === 'GBA' || plat.includes('ADVANCE')) return 'GBA';
      return 'SNES';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Strictly ignore untrusted/synthetic events to prevent recursion loops
      if (!e.isTrusted) return;

      // 2. Ignore if user is currently typing in an input, textarea, or select element
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT')
      ) {
        return;
      }

      // 3. Global hotkeys
      if (e.code === 'Space' && (e.target === document.body || e.target === canvasRef.current)) {
        e.preventDefault();
        togglePlayPause();
        return;
      } else if (e.code === 'F2') {
        e.preventDefault();
        triggerQuickSave();
        return;
      } else if (e.code === 'F4') {
        e.preventDefault();
        triggerQuickLoad();
        return;
      } else if (e.code === 'Backspace' && (e.target === document.body || e.target === canvasRef.current)) {
        e.preventDefault();
        triggerRewind();
        return;
      } else if (e.code === 'Tab') {
        e.preventDefault();
        cycleFastForward();
        return;
      } else if (e.code === 'F8') {
        e.preventDefault();
        cycleShader();
        return;
      } else if (e.code === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      } else if (e.code === 'F12') {
        e.preventDefault();
        triggerScreenshot();
        return;
      }

      // 4. Custom configured hotkeys
      const sys = getTargetSystem();
      const customAction = inputConfigService.getVirtualButtonForKeyboard(e.code, sys);
      if (customAction) {
        if (customAction === 'quickSave') {
          triggerQuickSave();
          e.preventDefault();
          return;
        }
        if (customAction === 'quickLoad') {
          triggerQuickLoad();
          e.preventDefault();
          return;
        }
        if (customAction === 'rewind') {
          triggerRewind();
          e.preventDefault();
          return;
        }
        if (customAction === 'fastForward') {
          cycleFastForward();
          e.preventDefault();
          return;
        }
        if (customAction === 'pause') {
          togglePlayPause();
          e.preventDefault();
          return;
        }
      }

      // 5. Prevent page scrolling for direction keys and Space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      // 6. Update visual HUD signals
      const btn = (customAction as keyof EmulatorInputState) || getButtonFromCode(e.code);
      if (btn && btn in RETRO_KEY_MAPPING) {
        setActiveSignals((prev) => ({ ...prev, [btn.toUpperCase()]: true }));
      }

      // 7. Route to Canvas Fallback Engine if active (Nostalgist not active)
      if (engineRef.current && !nostalgistRef.current && btn) {
        engineRef.current.setInput(btn, true);
      }
      // Note: If Nostalgist IS active, RetroArch natively receives physical keyboard events directly via Emscripten document listeners.
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT')
      ) {
        return;
      }

      const sys = getTargetSystem();
      const customAction = inputConfigService.getVirtualButtonForKeyboard(e.code, sys);
      const btn = (customAction as keyof EmulatorInputState) || getButtonFromCode(e.code);
      if (btn && btn in RETRO_KEY_MAPPING) {
        setActiveSignals((prev) => ({ ...prev, [btn.toUpperCase()]: false }));
      }

      if (engineRef.current && !nostalgistRef.current && btn) {
        engineRef.current.setInput(btn, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPaused, currentSlot, fastForwardSpeed, visualSettings, game?.platform]);

  // Gamepad Connection and Action Event Listeners
  useEffect(() => {
    const unsubConnect = gamepadService.onConnect((gp) => {
      setConnectedGamepad(gp);
      showToast(`🎮 Controller Connected: ${gp.id}`);
      gamepadService.vibrate(0.3, 0.6, 200);
    });

    const unsubDisconnect = gamepadService.onDisconnect(() => {
      setConnectedGamepad(gamepadService.getPrimaryController());
      showToast("🎮 Controller Disconnected");
    });

    const unsubAction = gamepadService.onAction((action) => {
      if (action === 'save') triggerQuickSave();
      else if (action === 'load') triggerQuickLoad();
      else if (action === 'rewind') triggerRewind();
      else if (action === 'fastforward') cycleFastForward();
      else if (action === 'pause') togglePlayPause();
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubAction();
    };
  }, [currentSlot, fastForwardSpeed, isPaused]);

  // Gamepad 60 FPS Polling Loop
  const prevGamepadInputsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let animId: number;

    const pollGamepad = () => {
      if (!isPaused && (engineRef.current || nostalgistRef.current)) {
        const plat = (game?.platform || '').toUpperCase();
        const sys: TargetSystem = plat === 'NES' ? 'NES' : plat === 'GBA' || plat.includes('ADVANCE') ? 'GBA' : 'SNES';

        const dummyBaseState: EmulatorInputState = {
          up: false,
          down: false,
          left: false,
          right: false,
          a: false,
          b: false,
          x: false,
          y: false,
          l: false,
          r: false,
          start: false,
          select: false,
        };

        const { inputs } = gamepadService.poll(dummyBaseState, sys);
        const prev = prevGamepadInputsRef.current;

        for (const btn in inputs) {
          const k = btn as keyof EmulatorInputState;
          const isPressed = !!inputs[k];
          if (prev[k] !== isPressed) {
            prev[k] = isPressed;
            handleVirtualInput(k, isPressed);
          }
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isPaused, game?.platform]);

  const togglePlayPause = () => {
    if (nostalgistRef.current) {
      if (isPaused) {
        nostalgistRef.current.resume();
        setIsPaused(false);
        showToast("Tiếp tục chơi");
      } else {
        nostalgistRef.current.pause();
        setIsPaused(true);
        showToast("Đã tạm dừng");
      }
    }
  };

  const triggerRewind = () => {
    if (nostalgistRef.current) {
      nostalgistRef.current.sendCommand('REWIND');
      showToast("Tua lại");
    }
  };

  const cycleFastForward = () => {
    const nextSpeed = fastForwardSpeed === 1 ? 2 : fastForwardSpeed === 2 ? 4 : fastForwardSpeed === 4 ? 8 : 1;
    setFastForwardSpeed(nextSpeed);
    if (nostalgistRef.current) {
      nostalgistRef.current.sendCommand('FAST_FORWARD');
    }
    showToast(`Tua nhanh: ${nextSpeed}x`);
  };

  const triggerQuickSave = async () => {
    if (nostalgistRef.current) {
      try {
        const { state } = await nostalgistRef.current.saveState();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          saveManager.saveLocal({
            id: `${game.id}-slot${currentSlot}`,
            ownerUid: 'local-user',
            gameId: game.id,
            gameTitle: game.title,
            platform: game.platform,
            slot: currentSlot,
            type: 'state',
            locationName: `Bản lưu Slot ${currentSlot}`,
            sizeBytes: state.size,
            checksum: 'real-save',
            rawBase64Data: base64,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          gamepadService.vibrate(0.3, 0.6, 150);
          showToast(`Đã lưu trạng thái Slot #${currentSlot}`);
        };
        reader.readAsDataURL(state);
      } catch (e) {
        console.error(e);
        showToast(`Lỗi khi lưu trạng thái`);
      }
    }
  };

  const triggerQuickLoad = async () => {
    if (nostalgistRef.current) {
      const allSaves = saveManager.getSavesForGame(game.id);
      const match = allSaves.find(s => s.slot === currentSlot);
      if (match && match.rawBase64Data) {
        try {
          const res = await fetch(match.rawBase64Data);
          const blob = await res.blob();
          await nostalgistRef.current.loadState(blob);
          gamepadService.vibrate(0.5, 0.8, 180);
          showToast(`Đã nạp lại bản lưu Slot #${currentSlot}`);
        } catch (e) {
          console.error(e);
          showToast(`Lỗi khi nạp bản lưu`);
        }
      } else {
        showToast(`Chưa có bản lưu cho Slot #${currentSlot}`);
      }
    }
  };

  const cycleShader = () => {
    const filters: DisplayFilterType[] = ['CRT Scanlines', 'Pixelated', 'LCD Grid', 'Bilinear Smooth'];
    const currentIdx = filters.indexOf(visualSettings.filter);
    const nextIdx = (currentIdx + 1) % filters.length;
    handleUpdateVisualSettings({ filter: filters[nextIdx] });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const triggerScreenshot = () => {
    if (engineRef.current) {
      const dataUrl = engineRef.current.captureScreenshot();
      if (dataUrl) {
        showToast("Screenshot captured to memory & gallery (1080p)");
      }
    }
  };

  const aspectRatioClass =
    visualSettings.aspectRatio === '8:7' ? 'aspect-[8/7]' :
    visualSettings.aspectRatio === '16:9' ? 'aspect-[16/9]' :
    visualSettings.aspectRatio === '1:1' ? 'aspect-square' :
    'aspect-[4/3]';

  const curvatureClass = visualSettings.enableCurvature ? 'filter-crt-curvature' : '';
  const bloomClass = visualSettings.enableBloom ? 'crt-bloom' : '';

  const colorTintStyle =
    visualSettings.colorTint === 'warm-crt' ? { filter: 'sepia(0.2) saturate(1.15)' } :
    visualSettings.colorTint === 'cool-trinitron' ? { filter: 'hue-rotate(10deg) saturate(1.1)' } :
    visualSettings.colorTint === 'dmg-green' ? { filter: 'sepia(0.8) hue-rotate(65deg) saturate(2.5)' } :
    undefined;

  return (
    <div className="fixed inset-0 top-0 left-0 w-screen h-screen bg-[#0c0e14] text-[#e2e2eb] flex flex-col z-50 overflow-hidden select-none">
      {/* ================= TOP HEADER (Docked - hidden in landscape touch mode for max screen area) ================= */}
      {!(isHandheldTouchMode && effectiveOrientation === 'landscape') && (
        <header className="bg-[#0c0e14]/90 backdrop-blur-md w-full px-2 sm:px-4 lg:px-6 flex items-center justify-between h-12 sm:h-14 border-b border-[#494454]/30 z-40 flex-shrink-0 max-w-full overflow-hidden">
          {/* Left Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-4 min-w-0 flex-shrink">
            <div className="font-bold text-[#d0bcff] flex items-center gap-1 uppercase text-xs sm:text-sm tracking-wider shrink-0">
              <span className="material-symbols-outlined text-[#4cd7f6] fill-icon text-lg sm:text-xl">sports_esports</span>
              <span className="hidden sm:inline">RetroVerse</span>
            </div>
            <div className="h-4 sm:h-5 w-px bg-[#494454]/40 hidden md:block"></div>

            {/* Navigation Back */}
            <button
              onClick={onExit}
              className="flex items-center gap-1 text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors font-mono text-xs group min-w-0"
              title="Quay lại danh sách trò chơi"
            >
              <span className="material-symbols-outlined text-sm group-hover:-translate-x-0.5 transition-transform shrink-0">arrow_back</span>
              <span className="truncate max-w-[85px] xs:max-w-[130px] sm:max-w-xs">{game.title}</span>
              <span className="px-1 py-0.2 rounded bg-indigo-500/10 border border-indigo-400 text-indigo-300 text-[10px] shrink-0">
                {game.platform}
              </span>
            </button>
          </div>

          {/* Center: Game Platform Info */}
          <div className="hidden lg:flex items-center gap-2">
            {connectedGamepad && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-400">
                <span className="material-symbols-outlined text-xs">sports_esports</span>
                <span>Tay cầm đã kết nối</span>
              </div>
            )}
          </div>

          {/* Right Cluster: Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Orientation Switcher for Handheld Mode */}
            {isHandheldTouchMode && (
              <button
                onClick={cycleOrientation}
                className="p-1 sm:px-2.5 sm:py-1 rounded-lg border border-[#4cd7f6]/40 bg-[#4cd7f6]/10 text-[#4cd7f6] hover:bg-[#4cd7f6]/20 font-mono text-xs flex items-center gap-1 transition-all"
                title="Đổi hướng màn hình (Dọc / Ngang / Tự động)"
              >
                <span className="material-symbols-outlined text-base sm:text-sm">
                  {orientationMode === 'auto'
                    ? 'screen_rotation'
                    : effectiveOrientation === 'portrait'
                    ? 'stay_current_portrait'
                    : 'stay_current_landscape'}
                </span>
                <span className="hidden sm:inline">
                  {orientationMode === 'auto'
                    ? 'Tự động'
                    : effectiveOrientation === 'portrait'
                    ? 'Dọc'
                    : 'Ngang'}
                </span>
              </button>
            )}

            {/* Handheld Touch Mode Switcher */}
            <button
              onClick={() => setIsHandheldTouchMode(!isHandheldTouchMode)}
              className={`p-1 sm:px-2.5 sm:py-1 rounded-lg border font-mono text-xs flex items-center gap-1 transition-all ${
                isHandheldTouchMode
                  ? 'bg-[#4cd7f6]/20 border-[#4cd7f6] text-[#4cd7f6]'
                  : 'bg-[#191b22] border-[#494454]/40 text-[#cbc3d7] hover:text-white'
              }`}
              title="Chế độ tay cầm cảm ứng"
            >
              <span className="material-symbols-outlined text-base sm:text-sm">phone_iphone</span>
              <span className="hidden md:inline">Touch</span>
            </button>

            {/* Visual Settings Menu Button */}
            <button
              onClick={() => setShowVisualSettingsModal(true)}
              className="p-1 sm:px-2.5 sm:py-1 rounded-lg border border-[#494454]/40 bg-[#191b22] text-[#cbc3d7] hover:text-[#4cd7f6] hover:border-[#4cd7f6]/60 font-mono text-xs flex items-center gap-1 transition-all"
              title="Bộ lọc hình ảnh CRT / Pixel (F8)"
            >
              <span className="material-symbols-outlined text-base text-[#d0bcff]">display_settings</span>
              <span className="hidden md:inline">{visualSettings.filter}</span>
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="p-1 sm:p-1.5 text-[#cbc3d7] hover:text-white hover:bg-[#282a30] rounded-lg transition-colors"
              title="Cài đặt & Phím bấm"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">tune</span>
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1 sm:p-1.5 text-[#cbc3d7] hover:text-[#4cd7f6] hover:bg-[#282a30] rounded-lg transition-colors hidden xs:flex"
              title="Toàn màn hình (F11)"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">fullscreen</span>
            </button>

            {/* Power / Exit */}
            <button
              onClick={onExit}
              className="p-1 sm:p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
              title="Thoát trò chơi"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">power_settings_new</span>
            </button>
          </div>
        </header>
      )}

      {/* ================= MAIN EMULATOR WORKSPACE ================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PRIMARY STAGE (Retro Game Viewport Canvas 4:3) */}
        <section
          className={
            !isHandheldTouchMode
              ? 'flex-1 relative flex flex-col items-center justify-center p-2 lg:p-4 bg-[#0c0e14] overflow-hidden'
              : effectiveOrientation === 'landscape'
              ? 'flex-1 w-full h-full relative flex items-center justify-center overflow-hidden bg-black'
              : 'flex-1 w-full h-full flex flex-col justify-between items-center p-0 sm:p-1 bg-[#080a12] overflow-hidden relative max-w-full'
          }
        >
          {/* Subtle Ambient Glow Backdrop */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 blur-3xl">
            <div className="w-[500px] h-[380px] bg-[#a078ff] rounded-full mix-blend-screen"></div>
            <div className="w-[400px] h-[320px] bg-[#4cd7f6] rounded-full mix-blend-screen -ml-32"></div>
          </div>

          {/* Top Canvas Container Wrapper (ensures un-squashed 4:3 aspect ratio in portrait handheld mode) */}
          <div
            className={
              isHandheldTouchMode && effectiveOrientation === 'portrait'
                ? 'flex-1 min-h-0 w-full flex items-center justify-center p-1 relative'
                : 'contents'
            }
          >
            {/* Emulation Screen Bezel Frame (Dynamic Aspect Ratio & CRT Curvature/Bloom) */}
            <div
              className={
                !isHandheldTouchMode
                  ? `relative w-full max-w-[900px] ${aspectRatioClass} max-h-[calc(100vh-11rem)] flex items-center justify-center group rounded-lg overflow-hidden border border-[#494454]/50 bg-black shadow-2xl ${curvatureClass} ${bloomClass}`
                  : effectiveOrientation === 'landscape'
                  ? `relative h-full max-h-screen aspect-[4/3] max-w-full flex items-center justify-center bg-black overflow-hidden shadow-2xl ${curvatureClass} ${bloomClass}`
                  : `relative h-full max-h-full aspect-[4/3] max-w-full flex items-center justify-center group rounded-2xl overflow-hidden border-2 sm:border-4 border-[#242735] bg-black shadow-2xl ${curvatureClass} ${bloomClass}`
              }
            >
            {/* Real Canvas Display */}
            <canvas
              ref={canvasRef}
              width={256}
              height={224}
              tabIndex={0}
              onClick={() => canvasRef.current?.focus()}
              className={`w-full h-full object-contain outline-none ${visualSettings.filter === 'Pixelated' ? 'filter-pixelated' : '[image-rendering:pixelated]'}`}
              style={colorTintStyle}
            />

            {/* Standby screen when no ROM cartridge is loaded */}
            {!hasRom && (
              <div className="absolute inset-0 bg-[#0c0e14] flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-16 h-16 rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/40 flex items-center justify-center mb-3 text-[#4cd7f6] shadow-lg shadow-[#4cd7f6]/10">
                  <span className="material-symbols-outlined text-3xl">sports_esports</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                  {game.title}
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono text-[11px]">
                    Hệ máy {game.platform}
                  </span>
                  <span className="text-[#958ea0] font-mono text-[11px]">• Chờ nạp tệp ROM</span>
                </div>
                <p className="text-xs text-[#958ea0] max-w-md mb-6 leading-relaxed">
                  Để trải nghiệm trò chơi thực tế, vui lòng chọn tệp ROM ({game.platform}: .nes, .smc, .sfc, .gba) từ máy tính của bạn.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#4cd7f6]/20 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">upload_file</span>
                    <span>Chọn tệp ROM từ máy tính</span>
                  </button>
                  <button
                    onClick={onExit}
                    className="px-4 py-2.5 rounded-xl bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] border border-[#494454]/40 text-xs transition-colors"
                  >
                    Quay lại
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".nes,.smc,.sfc,.gba,.bin,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDirectRomFile(file);
                  }}
                />
              </div>
            )}

            {/* Loading WASM Core Overlay */}
            {isLoadingCore && (
              <div className="absolute inset-0 bg-[#0c0e14]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                <div className="w-12 h-12 rounded-full border-2 border-[#4cd7f6] border-t-transparent animate-spin"></div>
                <p className="text-sm font-mono text-[#4cd7f6] font-bold">{coreLoadingStatus}</p>
                <p className="text-xs font-mono text-[#958ea0]">Đang xử lý trong WebAssembly Sandbox</p>
              </div>
            )}

            {/* Error Overlay */}
            {loadError && (
              <div className="absolute inset-0 bg-[#0c0e14]/95 flex flex-col items-center justify-center p-6 text-center z-30">
                <span className="material-symbols-outlined text-rose-400 text-4xl mb-2">error</span>
                <p className="text-sm text-rose-300 font-mono mb-2 max-w-md">{loadError}</p>
                <p className="text-xs text-[#958ea0] mb-5 max-w-sm">
                  Đảm bảo tệp ROM có định dạng hợp lệ ({game.platform}: .nes, .smc, .sfc, .gba) hoặc thử tải lại.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={async () => {
                      let stored = romStorage.getRom(game.id);
                      if (!stored) {
                        stored = await romStorage.getRomAsync(game.id);
                      }
                      if (stored) {
                        launchRealEmulator(stored.data, stored.filename, stored.platform || game.platform);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#4cd7f6] text-[#003641] font-bold text-xs flex items-center gap-1.5 shadow-md hover:bg-[#70e0f8] transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    <span>Thử lại WebAssembly</span>
                  </button>
                  <button
                    onClick={launchCanvasFallback}
                    className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">view_in_ar</span>
                    <span>Chạy bằng Engine Canvas</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-[#1e1f26] border border-[#494454]/40 text-[#e2e2eb] hover:border-[#4cd7f6] hover:text-[#4cd7f6] font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">upload_file</span>
                    <span>Chọn tệp ROM khác</span>
                  </button>
                  <button
                    onClick={onExit}
                    className="px-4 py-2 rounded-lg bg-[#1e1f26] border border-[#494454]/30 text-[#958ea0] hover:text-white text-xs transition-colors"
                  >
                    Quay lại
                  </button>
                </div>
              </div>
            )}

            {/* Visual Overlays: CRT Scanlines, LCD Grid, Bilinear Smooth */}
            {visualSettings.filter === 'CRT Scanlines' && (
              <div
                className="absolute inset-0 pointer-events-none filter-crt-scanlines"
                style={{ opacity: visualSettings.filterIntensity / 100 }}
              />
            )}
            {visualSettings.filter === 'LCD Grid' && (
              <div
                className="absolute inset-0 pointer-events-none filter-lcd-grid"
                style={{ opacity: visualSettings.filterIntensity / 100 }}
              />
            )}
            {visualSettings.filter === 'Bilinear Smooth' && (
              <div
                className="absolute inset-0 pointer-events-none crt-overlay"
                style={{ opacity: (visualSettings.filterIntensity / 100) * 0.4 }}
              />
            )}

            {/* Floating Top In-Screen HUD */}
            <div className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#1e1f26]/80 backdrop-blur border border-[#494454]/40 font-mono text-xs text-white">
                  {game.title}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#03b5d3]/20 border border-[#03b5d3]/40 text-[#4cd7f6] font-mono text-[10px]">
                  {game.platform}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                {fastForwardSpeed > 1 && (
                  <span className="text-[#ffb95f]">SPEED: {fastForwardSpeed}x</span>
                )}
              </div>
            </div>

            {/* Paused Overlay */}
            {isPaused && (
              <div
                onClick={togglePlayPause}
                className="absolute inset-0 bg-[#0c0e14]/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 cursor-pointer z-30"
              >
                <div className="w-16 h-16 rounded-full bg-[#d0bcff]/20 border border-[#d0bcff] flex items-center justify-center glow-violet animate-pulse">
                  <span className="material-symbols-outlined text-3xl text-[#d0bcff] fill-icon">pause</span>
                </div>
                <span className="text-lg text-[#d0bcff] font-bold tracking-widest uppercase font-mono">
                  EMULATION PAUSED
                </span>
                <span className="font-mono text-xs text-[#cbc3d7]">Press SPACE or Click to Resume</span>
              </div>
            )}

            {/* Toast inside bezel */}
            {toastMessage && (
              <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded bg-[#282a30]/90 backdrop-blur-md border border-[#4cd7f6]/50 text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-lg z-40">
                <span className="material-symbols-outlined text-sm">bookmark_added</span>
                <span>{toastMessage}</span>
              </div>
            )}
          </div>
        </div>

          {/* DOCKED FLOATING EMULATOR CONTROL BAR */}
          {!isHandheldTouchMode && (
            <div className="w-full max-w-[920px] mt-2.5 px-3 py-2 rounded-xl bg-[#191b22]/90 backdrop-blur-xl border border-[#494454]/30 shadow-2xl flex flex-wrap items-center justify-between gap-2 z-20">
              {/* Left Sub-Cluster */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePlayPause}
                  className="h-8 w-8 rounded-lg bg-[#a078ff]/30 border border-[#a078ff]/50 text-[#d0bcff] hover:bg-[#a078ff] hover:text-[#340080] flex items-center justify-center active:scale-95 transition-all glow-violet"
                  title="Pause / Resume (Space)"
                >
                  <span className="material-symbols-outlined text-base fill-icon">
                    {isPaused ? 'play_arrow' : 'pause'}
                  </span>
                </button>

                <button
                  onClick={triggerRewind}
                  className="h-8 px-2.5 rounded-lg bg-[#1e1f26] border border-[#494454]/30 text-[#cbc3d7] hover:text-[#4cd7f6] hover:border-[#4cd7f6] flex items-center gap-1 active:scale-95 transition-all font-mono text-xs"
                  title="Rewind 10s (Backspace)"
                >
                  <span className="material-symbols-outlined text-sm">replay_10</span>
                  <span className="hidden sm:inline">-10s</span>
                </button>

                <button
                  onClick={cycleFastForward}
                  className={`h-8 px-2.5 rounded-lg border font-mono text-xs flex items-center gap-1 active:scale-95 transition-all ${
                    fastForwardSpeed > 1
                      ? 'bg-[#03b5d3]/20 border-[#4cd7f6] text-[#4cd7f6] glow-cyan'
                      : 'bg-[#1e1f26] border-[#494454]/30 text-[#cbc3d7]'
                  }`}
                  title="Fast Forward (Tab)"
                >
                  <span className="material-symbols-outlined text-sm">fast_forward</span>
                  <span>{fastForwardSpeed}x</span>
                </button>

                <div className="h-4 w-px bg-[#494454]/30 mx-1"></div>

                <button
                  onClick={triggerQuickSave}
                  className="h-8 px-2.5 rounded-lg bg-[#1e1f26] border border-[#494454]/30 text-[#e2e2eb] hover:border-emerald-500 hover:text-emerald-400 flex items-center gap-1 active:scale-95 transition-all font-mono text-xs"
                  title="Quick Save (F2)"
                >
                  <span className="material-symbols-outlined text-sm text-emerald-400">save</span>
                  <span>Save <span className="text-[#958ea0] text-[10px]">F2</span></span>
                </button>

                <button
                  onClick={triggerQuickLoad}
                  className="h-8 px-2.5 rounded-lg bg-[#1e1f26] border border-[#494454]/30 text-[#e2e2eb] hover:border-[#4cd7f6] hover:text-[#4cd7f6] flex items-center gap-1 active:scale-95 transition-all font-mono text-xs"
                  title="Quick Load (F4)"
                >
                  <span className="material-symbols-outlined text-sm text-[#4cd7f6]">file_open</span>
                  <span>Load <span className="text-[#958ea0] text-[10px]">F4</span></span>
                </button>
              </div>

              {/* Center: Slot & Shader Switcher */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#0c0e14] px-1.5 py-0.5 rounded-lg border border-[#494454]/40 text-xs font-mono">
                  <span className="text-[#958ea0] text-[10px] uppercase px-1">Slot:</span>
                  {[1, 2, 3].map(slotNum => (
                    <button
                      key={slotNum}
                      onClick={() => {
                        setCurrentSlot(slotNum);
                        showToast(`Switched to Save Slot #${slotNum}`);
                      }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        currentSlot === slotNum
                          ? 'bg-[#33343b] text-[#4cd7f6] border border-[#4cd7f6]/50 font-bold'
                          : 'text-[#958ea0] hover:text-white'
                      }`}
                    >
                      {slotNum}
                    </button>
                  ))}
                </div>

                {/* Visual Settings Menu Button with Quick Cycle */}
                <div className="flex items-center bg-[#1e1f26] rounded-lg border border-[#494454]/30 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setShowVisualSettingsModal(true)}
                    className="h-8 px-2.5 text-[#cbc3d7] hover:text-[#4cd7f6] hover:bg-[#282a30] flex items-center gap-1.5 font-mono text-xs transition-colors"
                    title="Open Visual Settings Menu (F8)"
                  >
                    <span className="material-symbols-outlined text-sm text-[#d0bcff]">display_settings</span>
                    <span>{visualSettings.filter}</span>
                  </button>
                  <button
                    onClick={cycleShader}
                    className="h-8 w-7 hover:bg-[#282a30] text-[#958ea0] hover:text-[#4cd7f6] flex items-center justify-center transition-colors border-l border-[#494454]/30"
                    title="Cycle to next display filter ('CRT Scanlines', 'Pixelated', 'LCD Grid', 'Bilinear Smooth')"
                  >
                    <span className="material-symbols-outlined text-xs">sync_alt</span>
                  </button>
                </div>
              </div>

              {/* Right: Audio, Screenshot, Inspector */}
              <div className="flex items-center gap-1.5">
                {/* Volume slider */}
                <div className="flex items-center gap-1 bg-[#1e1f26] px-2 py-0.5 rounded-lg border border-[#494454]/30">
                  <button
                    onClick={() => {
                      const newMute = !isMuted;
                      setIsMuted(newMute);
                      if (engineRef.current) engineRef.current.setMute(newMute);
                      showToast(newMute ? "Audio Muted" : "Audio Unmuted");
                    }}
                    className="text-[#cbc3d7] hover:text-white"
                  >
                    <span className="material-symbols-outlined text-base">
                      {isMuted ? 'volume_off' : 'volume_up'}
                    </span>
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      setIsMuted(false);
                      if (engineRef.current) {
                        engineRef.current.setMute(false);
                        engineRef.current.setVolume(v / 100);
                      }
                    }}
                    className="w-14 h-1 accent-[#4cd7f6] cursor-pointer"
                  />
                </div>

                {/* Screenshot */}
                <button
                  onClick={triggerScreenshot}
                  className="h-8 w-8 rounded-lg bg-[#1e1f26] border border-[#494454]/30 text-[#cbc3d7] hover:text-[#4cd7f6] hover:border-[#4cd7f6] flex items-center justify-center active:scale-95 transition-all"
                  title="Capture Screenshot (F12)"
                >
                  <span className="material-symbols-outlined text-base">photo_camera</span>
                </button>

                {/* Toggle Inspector */}
                <button
                  onClick={() => setShowInspector(!showInspector)}
                  className={`h-8 w-8 rounded-lg border flex items-center justify-center active:scale-95 transition-all ${
                    showInspector
                      ? 'bg-[#4cd7f6]/20 border-[#4cd7f6] text-[#4cd7f6]'
                      : 'bg-[#1e1f26] border-[#494454]/30 text-[#cbc3d7] hover:text-white'
                  }`}
                  title="Toggle Auxiliary Inspector"
                >
                  <span className="material-symbols-outlined text-base">dock_to_left</span>
                </button>
              </div>
            </div>
          )}

          {/* PORTRAIT HANDHELD CONSOLE DECK */}
          {isHandheldTouchMode && effectiveOrientation === 'portrait' && (
            <div className="flex-shrink-0 w-full max-w-md mx-auto z-20 px-0.5 sm:px-1">
              <VirtualGamepad
                layout="portrait"
                onInput={handleVirtualInput}
                platform={game?.platform}
                onTriggerQuickSave={triggerQuickSave}
                onTriggerQuickLoad={triggerQuickLoad}
                onTriggerRewind={triggerRewind}
                onCycleFastForward={cycleFastForward}
                onTogglePause={togglePlayPause}
                isPaused={isPaused}
                fastForwardSpeed={fastForwardSpeed}
                currentSlot={currentSlot}
              />
            </div>
          )}

          {/* LANDSCAPE MINIMAL TOP HUD PILL */}
          {isHandheldTouchMode && effectiveOrientation === 'landscape' && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#12141c]/85 backdrop-blur-md px-3.5 py-1 rounded-full border border-[#494454]/40 shadow-xl pointer-events-auto">
              <button
                onClick={onExit}
                className="text-xs text-[#cbc3d7] hover:text-white flex items-center gap-1 font-mono transition-colors"
                title="Thoát trò chơi"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span className="truncate max-w-[120px]">{game.title}</span>
              </button>
              <div className="w-px h-3.5 bg-[#494454]/40"></div>
              <button
                onClick={cycleOrientation}
                className="text-[#4cd7f6] text-[11px] font-mono flex items-center gap-0.5 hover:text-white transition-colors"
                title="Đổi hướng màn hình (Dọc / Ngang / Tự động)"
              >
                <span className="material-symbols-outlined text-xs">
                  {orientationMode === 'auto'
                    ? 'screen_rotation'
                    : 'stay_current_landscape'}
                </span>
                <span>{orientationMode === 'auto' ? 'Auto' : 'Ngang'}</span>
              </button>
              <div className="w-px h-3.5 bg-[#494454]/40"></div>
              <button
                onClick={() => setShowVisualSettingsModal(true)}
                className="text-[#d0bcff] text-[11px] font-mono flex items-center gap-0.5 hover:text-white transition-colors"
                title="Bộ lọc hình ảnh CRT / Pixel"
              >
                <span className="material-symbols-outlined text-xs">display_settings</span>
              </button>
              <div className="w-px h-3.5 bg-[#494454]/40"></div>
              <button
                onClick={() => setIsHandheldTouchMode(false)}
                className="text-[#cbc3d7] text-[11px] font-mono flex items-center gap-0.5 hover:text-white transition-colors"
                title="Chuyển sang chế độ PC"
              >
                <span className="material-symbols-outlined text-xs">computer</span>
              </button>
            </div>
          )}

          {/* LANDSCAPE FLOATING OVERLAY GAMEPAD */}
          {isHandheldTouchMode && effectiveOrientation === 'landscape' && (
            <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between">
              <VirtualGamepad
                layout="landscape"
                onInput={handleVirtualInput}
                platform={game?.platform}
                onTriggerQuickSave={triggerQuickSave}
                onTriggerQuickLoad={triggerQuickLoad}
                onTriggerRewind={triggerRewind}
                onCycleFastForward={cycleFastForward}
                onTogglePause={togglePlayPause}
                isPaused={isPaused}
                fastForwardSpeed={fastForwardSpeed}
                currentSlot={currentSlot}
              />
            </div>
          )}
        </section>

        {/* RIGHT AUXILIARY INSPECTOR PANEL (Collapsible Drawer) */}
        {showInspector && !isHandheldTouchMode && (
          <aside className="w-80 lg:w-96 bg-[#191b22] border-l border-[#494454]/30 flex flex-col h-[calc(100vh-3.5rem)] transition-all duration-300 z-30 flex-shrink-0">
            {/* Panel Header Tabs */}
            <div className="flex items-center border-b border-[#494454]/30 bg-[#0c0e14]/60 px-2 pt-2">
              <button
                onClick={() => setInspectorTab('controls')}
                className={`flex-1 py-2 text-center font-mono text-xs flex items-center justify-center gap-1 transition-colors ${
                  inspectorTab === 'controls'
                    ? 'border-b-2 border-[#4cd7f6] text-[#4cd7f6] font-bold'
                    : 'text-[#cbc3d7] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">sports_esports</span>
                <span>Controls</span>
              </button>
              <button
                onClick={() => setInspectorTab('states')}
                className={`flex-1 py-2 text-center font-mono text-xs flex items-center justify-center gap-1 transition-colors ${
                  inspectorTab === 'states'
                    ? 'border-b-2 border-[#4cd7f6] text-[#4cd7f6] font-bold'
                    : 'text-[#cbc3d7] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                <span>States</span>
              </button>
              <button
                onClick={() => setInspectorTab('visuals')}
                className={`flex-1 py-2 text-center font-mono text-xs flex items-center justify-center gap-1 transition-colors ${
                  inspectorTab === 'visuals'
                    ? 'border-b-2 border-[#4cd7f6] text-[#4cd7f6] font-bold'
                    : 'text-[#cbc3d7] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm text-[#d0bcff]">display_settings</span>
                <span>Visuals</span>
              </button>
              <button
                onClick={() => setInspectorTab('cheats')}
                className={`flex-1 py-2 text-center font-mono text-xs flex items-center justify-center gap-1 transition-colors ${
                  inspectorTab === 'cheats'
                    ? 'border-b-2 border-[#4cd7f6] text-[#4cd7f6] font-bold'
                    : 'text-[#cbc3d7] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">terminal</span>
                <span>Cheats</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
              {inspectorTab === 'controls' && (
                <>
                  {/* Gamepad Hardware Card */}
                  <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#4cd7f6] text-lg">gamepad</span>
                        <span className="text-white font-bold">Game Controller</span>
                      </div>
                      {connectedGamepad ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                          Đã kết nối
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#33343b] text-[#958ea0] border border-[#494454]/30 text-[10px]">
                          Chưa cắm tay cầm
                        </span>
                      )}
                    </div>

                    {connectedGamepad ? (
                      <div className="bg-[#0c0e14] p-2.5 rounded-lg border border-[#494454]/20 space-y-1">
                        <div className="flex justify-between text-[#e2e2eb]">
                          <span className="truncate max-w-[180px]">{connectedGamepad.id}</span>
                          <span className="text-[#4cd7f6]">Port {connectedGamepad.index + 1}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#0c0e14] p-2.5 rounded-lg border border-[#494454]/20 text-[11px] text-[#958ea0]">
                        <span>Dùng bàn phím máy tính hoặc phím ảo cảm ứng để điều khiển game.</span>
                      </div>
                    )}

                    {/* Active Signals Tester */}
                    <div>
                      <span className="text-[#958ea0] text-[10px] uppercase block mb-1">Tín hiệu phím:</span>
                      <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
                        {['UP', 'DOWN', 'B', 'A', 'Y', 'X'].map(sig => (
                          <span
                            key={sig}
                            className={`py-1 rounded border transition-colors ${
                              activeSignals[sig]
                                ? 'bg-[#33343b] border-[#4cd7f6] text-[#4cd7f6] font-bold glow-cyan'
                                : 'bg-[#282a30] border-[#494454]/30 text-[#958ea0]'
                            }`}
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Keybindings Table */}
                  <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{game.platform} Keybindings</span>
                      <button onClick={() => showToast("Reset default bindings")} className="text-[#4cd7f6] text-[10px] hover:underline">
                        Mặc định
                      </button>
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Di chuyển (D-Pad)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">Phím mũi tên</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Nút A (Tương tác / Nhảy)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">X</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Nút B (Tấn công / Chạy)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">Z</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Nút Y (Vật phẩm phụ)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">S</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Nút X (Bản đồ / Menu)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">A</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {inspectorTab === 'states' && (
                <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold">Slot lưu #{currentSlot}</span>
                  </div>

                  <div className="p-4 rounded-lg bg-[#0c0e14] border border-[#494454]/30 text-center space-y-2">
                    <span className="material-symbols-outlined text-3xl text-[#958ea0]">save</span>
                    <p className="text-xs text-[#cbc3d7]">
                      {saveManager.getAllSaves().some(s => s.gameId === game.id && s.slot === currentSlot)
                        ? `Đã có bản lưu cho Slot #${currentSlot}`
                        : `Slot #${currentSlot} hiện đang trống`}
                    </p>
                    <p className="text-[10px] text-[#958ea0]">
                      Nhấn "Lưu trạng thái" (F2) hoặc "Nạp lại" (F4) để ghi nhận tiến trình.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={triggerQuickSave}
                      className="py-2 px-3 rounded-lg bg-[#a078ff]/20 border border-[#a078ff]/40 text-[#d0bcff] hover:bg-[#a078ff] hover:text-[#340080] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">save</span>
                      <span>Lưu (F2)</span>
                    </button>
                    <button
                      onClick={triggerQuickLoad}
                      className="py-2 px-3 rounded-lg bg-[#33343b] border border-[#494454]/30 text-white hover:border-[#4cd7f6] hover:text-[#4cd7f6] flex items-center justify-center gap-1 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">history</span>
                      <span>Nạp (F4)</span>
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === 'cheats' && (
                <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                  <span className="text-white font-bold block">Game Genie / Action Replay</span>
                  <p className="text-[11px] text-[#958ea0]">
                    Nhập mã cheat tương thích để kích hoạt trong phiên chơi.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Mã cheat (ví dụ: 7E001003 hoặc D020-0FAD)"
                      className="w-full px-2.5 py-1.5 rounded bg-[#0c0e14] border border-[#494454]/40 text-xs text-white placeholder-[#958ea0]/50 uppercase font-mono"
                    />
                    <button
                      onClick={() => showToast("Đã lưu mã cheat")}
                      className="w-full py-1.5 rounded bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-bold text-xs hover:bg-[#4cd7f6]/30 transition-colors"
                    >
                      Áp dụng mã cheat
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === 'visuals' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[#4cd7f6] text-base">display_settings</span>
                        Bộ lọc hiển thị
                      </span>
                      <button
                        onClick={() => setShowVisualSettingsModal(true)}
                        className="text-[10px] text-[#4cd7f6] hover:underline flex items-center gap-0.5"
                      >
                        Nâng cao <span className="material-symbols-outlined text-xs">open_in_new</span>
                      </button>
                    </div>

                    {/* Filter Presets Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {(['CRT Scanlines', 'Pixelated', 'LCD Grid', 'Bilinear Smooth'] as DisplayFilterType[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => handleUpdateVisualSettings({ filter: f })}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            visualSettings.filter === f
                              ? 'bg-[#33343b] border-[#4cd7f6] text-[#4cd7f6] font-bold shadow-sm'
                              : 'bg-[#181a22] border-[#494454]/40 text-[#cbc3d7] hover:text-white'
                          }`}
                        >
                          <div className="text-xs truncate">{f}</div>
                          <div className="text-[9px] text-[#958ea0] mt-0.5">
                            {f === 'CRT Scanlines' ? 'Phosphor Lines' : f === 'Pixelated' ? 'Sharp Raw' : f === 'LCD Grid' ? 'Handheld Dot' : 'Composite'}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Filter Intensity Slider */}
                    <div className="pt-2 border-t border-[#494454]/20">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-[#cbc3d7]">Cường độ bộ lọc</span>
                        <span className="text-[#4cd7f6] font-bold">{visualSettings.filterIntensity}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        step="5"
                        value={visualSettings.filterIntensity}
                        onChange={(e) => handleUpdateVisualSettings({ filterIntensity: Number(e.target.value) })}
                        className="w-full h-1 bg-[#0c0e14] rounded appearance-none accent-[#4cd7f6] cursor-pointer"
                      />
                    </div>

                    {/* Curvature & Bloom */}
                    <div className="space-y-1.5 pt-2 border-t border-[#494454]/20 text-[11px]">
                      <label className="flex items-center justify-between p-1.5 rounded bg-[#0c0e14]/60 border border-[#494454]/20 cursor-pointer">
                        <span className="text-[#cbc3d7]">Độ cong bóng đèn CRT</span>
                        <input
                          type="checkbox"
                          checked={visualSettings.enableCurvature}
                          onChange={(e) => handleUpdateVisualSettings({ enableCurvature: e.target.checked })}
                          className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454] cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between p-1.5 rounded bg-[#0c0e14]/60 border border-[#494454]/20 cursor-pointer">
                        <span className="text-[#cbc3d7]">Phát quang Phosphor Glow</span>
                        <input
                          type="checkbox"
                          checked={visualSettings.enableBloom}
                          onChange={(e) => handleUpdateVisualSettings({ enableBloom: e.target.checked })}
                          className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454] cursor-pointer"
                        />
                      </label>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="pt-2 border-t border-[#494454]/20">
                      <span className="text-[#958ea0] text-[10px] block mb-1.5">Tỉ lệ khung hình:</span>
                      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                        {(['4:3', '8:7', '16:9', '1:1'] as const).map((ar) => (
                          <button
                            key={ar}
                            onClick={() => handleUpdateVisualSettings({ aspectRatio: ar })}
                            className={`py-1 rounded border transition-colors ${
                              visualSettings.aspectRatio === ar
                                ? 'bg-[#33343b] border-[#4cd7f6] text-[#4cd7f6] font-bold'
                                : 'bg-[#0c0e14] border-[#494454]/30 text-[#cbc3d7]'
                            }`}
                          >
                            {ar}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowVisualSettingsModal(true)}
                      className="w-full py-2 rounded-lg bg-[#4cd7f6]/10 border border-[#4cd7f6]/40 text-[#4cd7f6] hover:bg-[#4cd7f6]/20 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">tune</span>
                      <span>Mở bảng tinh chỉnh hình ảnh chi tiết</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Footer */}
            <div className="p-3 bg-[#0c0e14] border-t border-[#494454]/30 flex items-center justify-between text-xs font-mono text-[#958ea0]">
              <span className="truncate">MD5: {game.crc32 || 'a2479e0...fc18'}</span>
              <span className="text-[#d0bcff] font-bold">Snes9x v1.62.3</span>
            </div>
          </aside>
        )}
      </div>

      {/* Visual Settings Menu Modal */}
      <VisualSettingsModal
        isOpen={showVisualSettingsModal}
        onClose={() => setShowVisualSettingsModal(false)}
        settings={visualSettings}
        onChange={handleUpdateVisualSettings}
        onReset={handleResetVisualSettings}
      />
    </div>
  );
};
