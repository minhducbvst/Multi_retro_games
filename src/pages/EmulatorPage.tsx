import React, { useEffect, useRef, useState } from 'react';
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

  const [game, setGame] = useState<Game>(() => getGameById(gameId) || FEATURED_GAMES[0]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentSlot, setCurrentSlot] = useState<number>(initialSlot);
  const [fastForwardSpeed, setFastForwardSpeed] = useState<number>(1);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(true);
  const [inspectorTab, setInspectorTab] = useState<'controls' | 'states' | 'visuals' | 'cheats'>('controls');
  const [showVisualSettingsModal, setShowVisualSettingsModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isHandheldTouchMode, setIsHandheldTouchMode] = useState<boolean>(false);
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

  // Detect mobile width on mount
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsHandheldTouchMode(true);
      setShowInspector(false);
    }
  }, []);

  // Initialize and run emulator engine
  useEffect(() => {
    const targetGame = getGameById(gameId) || FEATURED_GAMES[0];
    setGame(targetGame);

    const engine = new RetroEmulatorEngine();
    engineRef.current = engine;

    if (canvasRef.current) {
      engine.initialize(canvasRef.current);
      engine.loadGame(targetGame);
      engine.start();
    }

    // Interval to refresh telemetry
    const telemetryInterval = setInterval(() => {
      if (engineRef.current) {
        setFpsDisplay(engineRef.current.telemetry.fps);
      }
    }, 500);

    return () => {
      clearInterval(telemetryInterval);
      engine.dispose();
      engineRef.current = null;
    };
  }, [gameId]);

  // Keyboard mapping listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!engineRef.current) return;

      // Global hotkeys
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'F2') {
        e.preventDefault();
        triggerQuickSave();
      } else if (e.code === 'F4') {
        e.preventDefault();
        triggerQuickLoad();
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        triggerRewind();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        cycleFastForward();
      } else if (e.code === 'F8') {
        e.preventDefault();
        cycleShader();
      } else if (e.code === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'F12') {
        e.preventDefault();
        triggerScreenshot();
      }

      // Game controller inputs
      mapKeyCodeToInput(e.code, true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      mapKeyCodeToInput(e.code, false);
    };

    const mapKeyCodeToInput = (code: string, pressed: boolean) => {
      if (!engineRef.current) return;
      const eng = engineRef.current;

      switch (code) {
        case 'ArrowUp':
        case 'KeyW':
          eng.setInput('up', pressed);
          updateSignal('UP', pressed);
          break;
        case 'ArrowDown':
        case 'KeyS':
          eng.setInput('down', pressed);
          updateSignal('DOWN', pressed);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          eng.setInput('left', pressed);
          updateSignal('LEFT', pressed);
          break;
        case 'ArrowRight':
        case 'KeyD':
          eng.setInput('right', pressed);
          updateSignal('RIGHT', pressed);
          break;
        case 'KeyZ':
          eng.setInput('b', pressed);
          updateSignal('B', pressed);
          break;
        case 'KeyX':
          eng.setInput('a', pressed);
          updateSignal('A', pressed);
          break;
        case 'KeyA':
          eng.setInput('x', pressed);
          updateSignal('X', pressed);
          break;
        case 'KeyS':
          eng.setInput('y', pressed);
          updateSignal('Y', pressed);
          break;
        case 'KeyQ':
          eng.setInput('l', pressed);
          updateSignal('L', pressed);
          break;
        case 'KeyE':
          eng.setInput('r', pressed);
          updateSignal('R', pressed);
          break;
        case 'Enter':
          eng.setInput('start', pressed);
          updateSignal('START', pressed);
          break;
        case 'Space':
          eng.setInput('select', pressed);
          updateSignal('SELECT', pressed);
          break;
      }
    };

    const updateSignal = (btn: string, val: boolean) => {
      setActiveSignals(prev => ({ ...prev, [btn]: val }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPaused, currentSlot, fastForwardSpeed, visualSettings]);

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
  useEffect(() => {
    let animId: number;

    const pollGamepad = () => {
      if (engineRef.current && !isPaused) {
        const { inputs } = gamepadService.poll(engineRef.current.inputs);
        for (const btn in inputs) {
          const k = btn as keyof EmulatorInputState;
          if (inputs[k] !== engineRef.current.inputs[k]) {
            engineRef.current.setInput(k, inputs[k]);
            setActiveSignals((prev) => ({ ...prev, [k.toUpperCase()]: inputs[k] }));
          }
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isPaused]);

  const togglePlayPause = () => {
    if (!engineRef.current) return;
    if (isPaused) {
      engineRef.current.resume();
      setIsPaused(false);
      showToast("Emulation Resumed");
    } else {
      engineRef.current.pause();
      setIsPaused(true);
      showToast("Emulation Paused");
    }
  };

  const triggerRewind = () => {
    if (engineRef.current) {
      engineRef.current.rewindSeconds(10);
      showToast("Rewound 10 Seconds");
    }
  };

  const cycleFastForward = () => {
    const nextSpeed = fastForwardSpeed === 1 ? 2 : fastForwardSpeed === 2 ? 4 : fastForwardSpeed === 4 ? 8 : 1;
    setFastForwardSpeed(nextSpeed);
    if (engineRef.current) {
      engineRef.current.setFastForward(nextSpeed);
    }
    showToast(`Fast Forward: ${nextSpeed}x`);
  };

  const triggerQuickSave = () => {
    if (engineRef.current) {
      const stateData = engineRef.current.saveState(currentSlot);
      saveManager.saveLocal({
        id: `${game.id}-slot${currentSlot}`,
        ownerUid: 'local-user',
        gameId: game.id,
        gameTitle: game.title,
        platform: game.platform,
        slot: currentSlot,
        type: 'state',
        locationName: currentSlot === 1 ? 'Sanctuary Crypt' : `Slot ${currentSlot} Checkpoint`,
        sizeBytes: 524288,
        checksum: 'a7f893b1',
        rawBase64Data: stateData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      gamepadService.vibrate(0.3, 0.6, 150);
      showToast(`State saved to Slot #${currentSlot} [F2 / Gamepad]`);
    }
  };

  const triggerQuickLoad = () => {
    if (engineRef.current) {
      const allSaves = saveManager.getSavesForGame(game.id);
      const match = allSaves.find(s => s.slot === currentSlot);
      if (match && match.rawBase64Data) {
        engineRef.current.loadState(match.rawBase64Data);
      }
      gamepadService.vibrate(0.5, 0.8, 180);
      showToast(`Loaded State from Slot #${currentSlot} [F4 / Gamepad]`);
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

  const handleVirtualInput = (btn: keyof EmulatorInputState, pressed: boolean) => {
    if (engineRef.current) {
      engineRef.current.setInput(btn, pressed);
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
      {/* ================= TOP HEADER (Docked) ================= */}
      <header className="bg-[#0c0e14]/90 backdrop-blur-md w-full px-4 lg:px-6 flex items-center justify-between h-14 border-b border-[#494454]/30 z-40 flex-shrink-0">
        {/* Left Cluster */}
        <div className="flex items-center gap-4">
          <div className="font-bold text-[#d0bcff] flex items-center gap-1.5 uppercase text-sm tracking-wider">
            <span className="material-symbols-outlined text-[#4cd7f6] fill-icon">sports_esports</span>
            <span>RetroVerse</span>
          </div>
          <div className="h-5 w-px bg-[#494454]/40 hidden md:block"></div>

          {/* Navigation Back */}
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors font-mono text-xs group"
          >
            <span className="material-symbols-outlined text-sm group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            <span className="truncate max-w-[140px] sm:max-w-xs">{game.title}</span>
            <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 border border-indigo-400 text-indigo-300 text-[10px] ml-1">
              {game.platform}
            </span>
          </button>
        </div>

        {/* Center Badges: Engine Metrics & Gamepad Status */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#1e1f26] border border-[#494454]/40 text-xs font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-white font-bold">{fpsDisplay.toFixed(1)} FPS</span>
            <span className="text-[#494454]">|</span>
            <span className="text-[#958ea0]">{game.recommendedCore}</span>
          </div>

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono transition-all ${
              connectedGamepad
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 shadow-sm'
                : 'bg-[#191b22] border-[#494454]/30 text-[#958ea0] hover:text-[#cbc3d7]'
            }`}
            title={connectedGamepad ? `Controller Active: ${connectedGamepad.id} (Click to calibrate)` : 'Connect USB or Bluetooth Gamepad (Plug & Play)'}
          >
            <span className="material-symbols-outlined text-xs text-[#4cd7f6]">sports_esports</span>
            <span>{connectedGamepad ? `${connectedGamepad.id.substring(0, 16)}... (Port 1)` : 'Gamepad Ready'}</span>
            {connectedGamepad && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#191b22] border border-[#494454]/30 text-xs font-mono text-[#958ea0]">
            <span className="material-symbols-outlined text-xs text-[#4cd7f6]">graphic_eq</span>
            <span>44.1kHz DSP-1</span>
          </div>
        </div>

        {/* Right Cluster: Actions */}
        <div className="flex items-center gap-2">
          {/* Handheld Touch Mode Switcher */}
          <button
            onClick={() => setIsHandheldTouchMode(!isHandheldTouchMode)}
            className={`px-2.5 py-1 rounded-lg border font-mono text-xs flex items-center gap-1 transition-all ${
              isHandheldTouchMode
                ? 'bg-[#4cd7f6]/20 border-[#4cd7f6] text-[#4cd7f6]'
                : 'bg-[#191b22] border-[#494454]/40 text-[#cbc3d7] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">phone_iphone</span>
            <span className="hidden sm:inline">Handheld Touch</span>
          </button>

          {/* Visual Settings Menu Button */}
          <button
            onClick={() => setShowVisualSettingsModal(true)}
            className="px-2.5 py-1 rounded-lg border border-[#494454]/40 bg-[#191b22] text-[#cbc3d7] hover:text-[#4cd7f6] hover:border-[#4cd7f6]/60 font-mono text-xs flex items-center gap-1.5 transition-all"
            title="Visual Settings Menu: CRT Scanlines, Pixelated, LCD Grid (F8)"
          >
            <span className="material-symbols-outlined text-base text-[#d0bcff]">display_settings</span>
            <span className="hidden sm:inline">{visualSettings.filter}</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-[#cbc3d7] hover:text-white hover:bg-[#282a30] rounded-lg transition-colors"
            title="Settings & Keybindings"
          >
            <span className="material-symbols-outlined text-lg">tune</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-[#cbc3d7] hover:text-[#4cd7f6] hover:bg-[#282a30] rounded-lg transition-colors"
            title="Toggle Fullscreen (F11)"
          >
            <span className="material-symbols-outlined text-lg">fullscreen</span>
          </button>

          {/* Power / Exit */}
          <button
            onClick={onExit}
            className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
            title="Exit Session"
          >
            <span className="material-symbols-outlined text-lg">power_settings_new</span>
          </button>
        </div>
      </header>

      {/* ================= MAIN EMULATOR WORKSPACE ================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PRIMARY STAGE (Retro Game Viewport Canvas 4:3) */}
        <section className="flex-1 relative flex flex-col items-center justify-center p-2 lg:p-4 bg-[#0c0e14] overflow-hidden">
          {/* Subtle Ambient Glow Backdrop */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 blur-3xl">
            <div className="w-[500px] h-[380px] bg-[#a078ff] rounded-full mix-blend-screen"></div>
            <div className="w-[400px] h-[320px] bg-[#4cd7f6] rounded-full mix-blend-screen -ml-32"></div>
          </div>

          {/* Emulation Screen Bezel Frame (Dynamic Aspect Ratio & CRT Curvature/Bloom) */}
          <div className={`relative w-full max-w-[900px] ${aspectRatioClass} max-h-[calc(100vh-11rem)] flex items-center justify-center group rounded-lg overflow-hidden border border-[#494454]/50 bg-black shadow-2xl ${curvatureClass} ${bloomClass}`}>
            {/* Real Canvas Display */}
            <canvas
              ref={canvasRef}
              width={256}
              height={224}
              className={`w-full h-full object-contain ${visualSettings.filter === 'Pixelated' ? 'filter-pixelated' : '[image-rendering:pixelated]'}`}
              style={colorTintStyle}
            />

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
                <span className="px-1.5 py-0.2 rounded bg-[#03b5d3]/20 border border-[#03b5d3]/40 text-[#4cd7f6] font-mono text-[10px]">
                  60 FPS V-SYNC
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-emerald-400">JIT: 99.8%</span>
                <span className="text-[#ffb95f]">SPEED: {fastForwardSpeed}x</span>
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

          {/* Virtual Gamepad for Handheld Mode */}
          {isHandheldTouchMode && (
            <div className="w-full max-w-lg mt-2">
              <VirtualGamepad onInput={handleVirtualInput} />
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
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Active
                      </span>
                    </div>

                    <div className="bg-[#0c0e14] p-2.5 rounded-lg border border-[#494454]/20 space-y-1">
                      <div className="flex justify-between text-[#e2e2eb]">
                        <span>Xbox Wireless Controller</span>
                        <span className="text-[#4cd7f6]">Port 1</span>
                      </div>
                      <div className="flex justify-between text-[#958ea0]">
                        <span>Polling Rate: 0.8ms (1000Hz)</span>
                        <span className="text-emerald-400">Low Jitter</span>
                      </div>
                    </div>

                    {/* Active Signals Tester */}
                    <div>
                      <span className="text-[#958ea0] text-[10px] uppercase block mb-1">Active Signals:</span>
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
                      <span className="text-white font-bold">SNES Keybindings</span>
                      <button onClick={() => showToast("Reset default bindings")} className="text-[#4cd7f6] text-[10px] hover:underline">
                        Reset Default
                      </button>
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">D-Pad Movement</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">Arrow Keys</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">A Button (Dash/Talk)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">X</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">B Button (Attack)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">Z</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">Y Button (Equipped Item)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">S</span>
                      </div>
                      <div className="flex items-center justify-between py-1 px-2 rounded bg-[#0c0e14]/60 border border-[#494454]/20">
                        <span className="text-[#cbc3d7]">X Button (World Map)</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#33343b] text-white font-bold">A</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {inspectorTab === 'states' && (
                <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold">Active Slot #{currentSlot} Snapshot</span>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">cloud_done</span> Synced
                    </span>
                  </div>

                  <div className="relative rounded-lg overflow-hidden border border-[#494454]/40">
                    <img
                      className="w-full h-28 object-cover"
                      alt="Thumbnail"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBIuaP3h1LTu8D0xLJ5_SBvdOPERU8LbEHmusl5AubWk_TgDaPVZROGdlpgPpMc4x6rOtz7mNrCrz7DHFfcuDqdG0LwcChV9GpXFVwbT4w87sPvJ-1mXetV0a6jd2rZgCRuRcPgpNFmYFgHXZEWWZbXVbTvA1zNsMwrCtc081Lwo7rKCx6RrBeGjir5IpOKvss9_x8TkAeKzPmlPp2ZV8Pnn4fDRJ-55jZT_hPXy3reHtJz6Rwva8wTag"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-transparent to-transparent flex items-end p-2 justify-between">
                      <div>
                        <p className="text-white font-bold text-xs">Hyrule Castle Crypt</p>
                        <p className="text-[#958ea0] text-[10px]">Today 14:22:15</p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-[#d0bcff]/20 text-[#d0bcff] text-[10px]">512 KB</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={triggerQuickSave}
                      className="py-2 px-3 rounded-lg bg-[#a078ff]/20 border border-[#a078ff]/40 text-[#d0bcff] hover:bg-[#a078ff] hover:text-[#340080] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
                      <span>New State</span>
                    </button>
                    <button
                      onClick={triggerQuickLoad}
                      className="py-2 px-3 rounded-lg bg-[#33343b] border border-[#494454]/30 text-white hover:border-[#4cd7f6] hover:text-[#4cd7f6] flex items-center justify-center gap-1 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">history</span>
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === 'cheats' && (
                <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                  <span className="text-white font-bold block">Game Genie / Pro Action Replay</span>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-2 rounded bg-[#0c0e14] border border-[#494454]/20 cursor-pointer">
                      <span>Infinite Health Hearts</span>
                      <input type="checkbox" defaultChecked className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454]" />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded bg-[#0c0e14] border border-[#494454]/20 cursor-pointer">
                      <span>Infinite Magic Meter</span>
                      <input type="checkbox" defaultChecked className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454]" />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded bg-[#0c0e14] border border-[#494454]/20 cursor-pointer">
                      <span>999 Rupee Max Cap</span>
                      <input type="checkbox" className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454]" />
                    </label>
                  </div>
                </div>
              )}

              {inspectorTab === 'visuals' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[#4cd7f6] text-base">display_settings</span>
                        Display Filters
                      </span>
                      <button
                        onClick={() => setShowVisualSettingsModal(true)}
                        className="text-[10px] text-[#4cd7f6] hover:underline flex items-center gap-0.5"
                      >
                        Advanced <span className="material-symbols-outlined text-xs">open_in_new</span>
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
                        <span className="text-[#cbc3d7]">Filter Intensity</span>
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
                        <span className="text-[#cbc3d7]">CRT Tube Curvature</span>
                        <input
                          type="checkbox"
                          checked={visualSettings.enableCurvature}
                          onChange={(e) => handleUpdateVisualSettings({ enableCurvature: e.target.checked })}
                          className="rounded text-[#4cd7f6] bg-[#33343b] border-[#494454] cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between p-1.5 rounded bg-[#0c0e14]/60 border border-[#494454]/20 cursor-pointer">
                        <span className="text-[#cbc3d7]">Phosphor Glow / Bloom</span>
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
                      <span className="text-[#958ea0] text-[10px] block mb-1.5">Aspect Ratio:</span>
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
                      <span>Open Full Visual Settings Menu</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time Telemetry Card */}
              <div className="p-3.5 rounded-xl bg-[#1e1f26] border border-[#494454]/30 space-y-2">
                <span className="text-white font-bold block">Core Telemetry</span>
                <div className="space-y-1.5 text-[11px] text-[#cbc3d7]">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Buffer Health (Wasm JIT)</span>
                      <span className="text-emerald-400">99.8%</span>
                    </div>
                    <div className="w-full bg-[#0c0e14] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full w-[99.8%]"></div>
                    </div>
                  </div>
                  <div className="flex justify-between py-1 border-t border-[#494454]/20">
                    <span>WebAudio Latency:</span>
                    <span className="text-[#4cd7f6] font-bold">8.2 ms</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-[#494454]/20">
                    <span>Dropped Frames:</span>
                    <span className="text-white">0 (0.00%)</span>
                  </div>
                </div>
              </div>
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
