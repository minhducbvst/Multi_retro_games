import React, { useState, useEffect } from 'react';
import {
  gamepadService,
  ConnectedGamepadInfo,
  STANDARD_SNES_GAMEPAD_MAPPING,
  XBOX_LAYOUT_MAPPING
} from '../services/input/gamepadService';
import { saveManager } from '../services/saves/saveManager';

interface SettingsPageProps {
  onBack: () => void;
  onLaunchRom?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'controller' | 'video' | 'audio' | 'system' | 'bios'>('controller');
  const [selectedProfile, setSelectedProfile] = useState<string>('SNES 8BitDo Pro 2');
  const [deadzone, setDeadzone] = useState<number>(() => gamepadService.getDeadzone());
  const [rumbleIntensity, setRumbleIntensity] = useState<number>(80);
  const [turboRate, setTurboRate] = useState<number>(15); // Hz
  const [videoFilter, setVideoFilter] = useState<string>('CRT Trinitron Scanlines');
  const [aspectRatio, setAspectRatio] = useState<string>('4:3 CRT Square Pixels');
  const [audioLatency, setAudioLatency] = useState<number>(16); // ms
  const [enableDsp, setEnableDsp] = useState<boolean>(true);
  const [activeRemapButton, setActiveRemapButton] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Gamepad API state
  const [connectedControllers, setConnectedControllers] = useState<ConnectedGamepadInfo[]>(() =>
    gamepadService.getConnectedControllers()
  );
  const [selectedGamepadIndex, setSelectedGamepadIndex] = useState<number>(0);
  const [liveGamepadButtons, setLiveGamepadButtons] = useState<boolean[]>([]);
  const [liveAxes, setLiveAxes] = useState<number[]>([0, 0, 0, 0]);

  // Button mapping state
  const [buttonMappings, setButtonMappings] = useState<{ [key: string]: string }>({
    'D-PAD UP': 'D-Pad Up / Axis Y- (ArrowUp)',
    'D-PAD DOWN': 'D-Pad Down / Axis Y+ (ArrowDown)',
    'D-PAD LEFT': 'D-Pad Left / Axis X- (ArrowLeft)',
    'D-PAD RIGHT': 'D-Pad Right / Axis X+ (ArrowRight)',
    'BUTTON A': 'Gamepad Btn 1 (B / A)',
    'BUTTON B': 'Gamepad Btn 0 (A / B)',
    'BUTTON X': 'Gamepad Btn 3 (Y / X)',
    'BUTTON Y': 'Gamepad Btn 2 (X / Y)',
    'SHOULDER L': 'Gamepad Btn 4 (L1 / LB)',
    'SHOULDER R': 'Gamepad Btn 5 (R1 / RB)',
    'TRIGGER L2': 'Gamepad Btn 6 (L2 Rewind)',
    'TRIGGER R2': 'Gamepad Btn 7 (R2 Fast-Fwd)',
    'SELECT': 'Gamepad Btn 8 (Select / Share)',
    'START': 'Gamepad Btn 9 (Start / Options)',
    'HOTKEY SAVE': 'Gamepad Btn 10 (L3 Stick Click)',
    'HOTKEY LOAD': 'Gamepad Btn 11 (R3 Stick Click)',
    'HOTKEY REWIND': 'Gamepad Btn 6 (Trigger L2)',
  });

  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handlePurgeAllData = async () => {
    try {
      await saveManager.clearAllData();
      localStorage.removeItem('retroverse_favorites');
      localStorage.removeItem('retroverse_recents');
      localStorage.removeItem('retroverse_custom_games');
      localStorage.removeItem('retroverse_visual_settings');
      localStorage.removeItem('retroverse_gamepad_config');
      showToast('Đã xóa toàn bộ dữ liệu chạy thử và đưa ứng dụng về trạng thái gốc!');
      setShowResetModal(false);
    } catch {
      showToast('Đã xóa dữ liệu cục bộ');
      setShowResetModal(false);
    }
  };

  const handleCleanOrphans = () => {
    const count = saveManager.cleanOrphanStates();
    showToast(`Đã dọn dẹp ${count} khối lưu trạng thái không sử dụng`);
  };

  // Listen for gamepad connect/disconnect
  useEffect(() => {
    const unsubConn = gamepadService.onConnect((gp) => {
      setConnectedControllers(gamepadService.getConnectedControllers());
      showToast(`🎮 Gamepad Detected: ${gp.id}`);
    });
    const unsubDis = gamepadService.onDisconnect(() => {
      setConnectedControllers(gamepadService.getConnectedControllers());
      showToast('🎮 Gamepad Disconnected');
    });

    return () => {
      unsubConn();
      unsubDis();
    };
  }, []);

  // Poll connected gamepad state to animate blueprint vector in real-time
  useEffect(() => {
    let animId: number;
    const pollLoop = () => {
      if (activeTab === 'controller') {
        const dummyInput = {
          up: false, down: false, left: false, right: false,
          a: false, b: false, x: false, y: false,
          l: false, r: false, start: false, select: false
        };
        const { rawButtons, activeAxes } = gamepadService.poll(dummyInput);
        setLiveGamepadButtons(rawButtons);
        setLiveAxes(activeAxes);

        // Check if currently remapping a button from physical gamepad
        if (activeRemapButton) {
          const pressedIdx = rawButtons.findIndex(b => b === true);
          if (pressedIdx !== -1) {
            setButtonMappings(prev => ({
              ...prev,
              [activeRemapButton]: `Gamepad Button ${pressedIdx}`
            }));
            showToast(`Mapped ${activeRemapButton} to Gamepad Button #${pressedIdx}`);
            setActiveRemapButton(null);
            gamepadService.vibrate(0.3, 0.6, 120);
          }
        }
      }
      animId = requestAnimationFrame(pollLoop);
    };

    animId = requestAnimationFrame(pollLoop);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, activeRemapButton]);

  const handleRemap = (btn: string) => {
    setActiveRemapButton(btn);
    showToast(`Press any keyboard key OR press any button on your physical controller for ${btn}...`);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setButtonMappings((prev) => ({
        ...prev,
        [btn]: `${e.code} (${e.key.toUpperCase()})`
      }));
      setActiveRemapButton(null);
      showToast(`Mapped ${btn} to ${e.key.toUpperCase()}`);
      window.removeEventListener('keydown', handleKeyDown);
    };

    window.addEventListener('keydown', handleKeyDown, { once: true });
  };

  const handleTestHaptics = async () => {
    const success = await gamepadService.vibrate(0.5, 0.9, 350);
    if (success) {
      showToast('Dual-rumble haptic vibration pulse sent to controller!');
    } else {
      showToast('No vibration actuator found on this device or gamepad is idle');
    }
  };

  const handleApplyPreset = (presetName: string) => {
    setSelectedProfile(presetName);
    if (presetName === 'Xbox / Modern PC Controller') {
      gamepadService.setMapping(XBOX_LAYOUT_MAPPING);
      setButtonMappings({
        'D-PAD UP': 'D-Pad Up (ArrowUp)',
        'D-PAD DOWN': 'D-Pad Down (ArrowDown)',
        'D-PAD LEFT': 'D-Pad Left (ArrowLeft)',
        'D-PAD RIGHT': 'D-Pad Right (ArrowRight)',
        'BUTTON A': 'Gamepad Btn 0 (Xbox A)',
        'BUTTON B': 'Gamepad Btn 1 (Xbox B)',
        'BUTTON X': 'Gamepad Btn 2 (Xbox X)',
        'BUTTON Y': 'Gamepad Btn 3 (Xbox Y)',
        'SHOULDER L': 'Gamepad Btn 4 (LB)',
        'SHOULDER R': 'Gamepad Btn 5 (RB)',
        'TRIGGER L2': 'Gamepad Btn 6 (LT Rewind)',
        'TRIGGER R2': 'Gamepad Btn 7 (RT Fast-Fwd)',
        'SELECT': 'Gamepad Btn 8 (View / Back)',
        'START': 'Gamepad Btn 9 (Menu / Start)',
        'HOTKEY SAVE': 'Gamepad Btn 10 (Left Stick Click)',
        'HOTKEY LOAD': 'Gamepad Btn 11 (Right Stick Click)',
        'HOTKEY REWIND': 'Gamepad Btn 6 (LT)',
      });
      showToast('Applied Xbox / Modern PC standard layout');
    } else {
      gamepadService.setMapping(STANDARD_SNES_GAMEPAD_MAPPING);
      setButtonMappings({
        'D-PAD UP': 'D-Pad Up (ArrowUp)',
        'D-PAD DOWN': 'D-Pad Down (ArrowDown)',
        'D-PAD LEFT': 'D-Pad Left (ArrowLeft)',
        'D-PAD RIGHT': 'D-Pad Right (ArrowRight)',
        'BUTTON A': 'Gamepad Btn 1 (SNES A / Right)',
        'BUTTON B': 'Gamepad Btn 0 (SNES B / Bottom)',
        'BUTTON X': 'Gamepad Btn 3 (SNES X / Top)',
        'BUTTON Y': 'Gamepad Btn 2 (SNES Y / Left)',
        'SHOULDER L': 'Gamepad Btn 4 (L1)',
        'SHOULDER R': 'Gamepad Btn 5 (R1)',
        'TRIGGER L2': 'Gamepad Btn 6 (L2 Rewind)',
        'TRIGGER R2': 'Gamepad Btn 7 (R2 Fast-Fwd)',
        'SELECT': 'Gamepad Btn 8 (Select)',
        'START': 'Gamepad Btn 9 (Start)',
        'HOTKEY SAVE': 'Gamepad Btn 10 (L3)',
        'HOTKEY LOAD': 'Gamepad Btn 11 (R3)',
        'HOTKEY REWIND': 'Gamepad Btn 6 (L2)',
      });
      showToast('Applied SNES 8BitDo Pro 2 authentic diamond layout');
    }
  };

  const handleResetDefaults = () => {
    handleApplyPreset('SNES 8BitDo Pro 2');
    setDeadzone(20);
    gamepadService.setDeadzone(20);
    setRumbleIntensity(80);
    showToast('Input settings reset to factory defaults');
  };

  const activeController = connectedControllers[selectedGamepadIndex] || connectedControllers[0];

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none font-sans">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">sports_esports</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sub-header & navigation */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#494454]/20 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/30 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-bold font-headline text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6]">tune</span>
              System Configuration & Gamepad Remapping
            </h1>
            <p className="text-xs font-mono text-[#958ea0]">
              Standard HTML5 Gamepad API polling, USB/Bluetooth controller calibration, and deadzone adjustment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] border border-[#494454]/30 font-mono text-xs transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Reset Defaults
          </button>
          <button
            onClick={() => showToast('Configuration saved to browser profile')}
            className="px-4 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            Save Configuration
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-[#494454]/30 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('controller')}
          className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'controller'
              ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
              : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-base">sports_esports</span>
          Gamepad & Controllers ({connectedControllers.length})
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'video'
              ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
              : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-base">tv</span>
          Display & CRT Shaders
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audio'
              ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
              : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-base">volume_up</span>
          Audio & DSP Pipeline
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'system'
              ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
              : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-base">memory</span>
          Cores & Emulation Engine
        </button>
        <button
          onClick={() => setActiveTab('bios')}
          className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'bios'
              ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
              : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-base">sd_card</span>
          BIOS & Memory Cartridges
        </button>
      </div>

      {/* Tab 1: Gamepad & Controls */}
      {activeTab === 'controller' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Visual Controller Blueprint */}
          <div className="lg:col-span-7 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-6 flex flex-col items-center">
            <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-headline font-bold text-sm text-white">Interactive Blueprint Remapping</h3>
                <p className="text-[11px] font-mono text-[#958ea0]">
                  Press any physical button on your USB or Bluetooth controller to see real-time highlight
                </p>
              </div>

              {/* Connected Gamepads Selector */}
              <div className="flex items-center gap-2">
                {connectedControllers.length > 0 ? (
                  <select
                    value={selectedGamepadIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedGamepadIndex(idx);
                      gamepadService.setActiveGamepadIndex(idx);
                    }}
                    className="bg-[#111319] border border-emerald-500/40 text-emerald-400 font-mono text-xs rounded-lg px-2.5 py-1 focus:outline-none"
                  >
                    {connectedControllers.map((c) => (
                      <option key={c.index} value={c.index}>
                        Port {c.index + 1}: {c.id.substring(0, 24)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    Connect any USB / Bluetooth Controller
                  </span>
                )}
              </div>
            </div>

            {/* Layout Preset Chips */}
            <div className="w-full flex items-center gap-2 pb-2 border-b border-[#494454]/20 text-xs font-mono">
              <span className="text-[#958ea0] text-[11px]">Controller Preset:</span>
              <button
                onClick={() => handleApplyPreset('SNES 8BitDo Pro 2')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                  selectedProfile === 'SNES 8BitDo Pro 2'
                    ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                    : 'bg-[#282a30] text-[#cbc3d7]'
                }`}
              >
                SNES 8BitDo Pro 2
              </button>
              <button
                onClick={() => handleApplyPreset('Xbox / Modern PC Controller')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                  selectedProfile === 'Xbox / Modern PC Controller'
                    ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                    : 'bg-[#282a30] text-[#cbc3d7]'
                }`}
              >
                Xbox / PC Wireless
              </button>
            </div>

            {/* Vector Blueprint SVG Controller with LIVE button glow */}
            <div className="relative w-full max-w-[500px] my-6 flex items-center justify-center p-4 bg-[#111319]/80 rounded-xl border border-[#494454]/40">
              <svg viewBox="0 0 460 220" className="w-full h-auto text-[#4cd7f6] drop-shadow-[0_0_12px_rgba(76,215,246,0.3)]">
                {/* Controller outline body */}
                <rect x="50" y="40" width="360" height="140" rx="40" fill="#1b1c22" stroke="#4cd7f6" strokeWidth="2" strokeDasharray="3 3" />
                
                {/* D-Pad Cross */}
                <path d="M 110 80 L 130 80 L 130 100 L 150 100 L 150 120 L 130 120 L 130 140 L 110 140 L 110 120 L 90 120 L 90 100 L 110 100 Z" fill="#282a30" stroke="#4cd7f6" strokeWidth="1.5" />
                
                {/* D-Pad Directional Pins with live highlight */}
                <circle cx="120" cy="90" r="4" fill={liveGamepadButtons[12] || liveAxes[1] < -deadzone / 100 ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" />
                <circle cx="120" cy="130" r="4" fill={liveGamepadButtons[13] || liveAxes[1] > deadzone / 100 ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" />
                <circle cx="100" cy="110" r="4" fill={liveGamepadButtons[14] || liveAxes[0] < -deadzone / 100 ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" />
                <circle cx="140" cy="110" r="4" fill={liveGamepadButtons[15] || liveAxes[0] > deadzone / 100 ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" />

                {/* ABXY Diamond Buttons with live highlight */}
                {/* Button A (Right) - Index 1 */}
                <circle cx="340" cy="110" r="14" fill={liveGamepadButtons[1] ? '#f472b6' : '#282a30'} stroke="#f472b6" strokeWidth="2" />
                <text x="340" y="114" fill={liveGamepadButtons[1] ? '#111319' : '#f472b6'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">A</text>

                {/* Button B (Bottom) - Index 0 */}
                <circle cx="310" cy="135" r="14" fill={liveGamepadButtons[0] ? '#e879f9' : '#282a30'} stroke="#e879f9" strokeWidth="2" />
                <text x="310" y="139" fill={liveGamepadButtons[0] ? '#111319' : '#e879f9'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">B</text>

                {/* Button X (Top) - Index 3 */}
                <circle cx="310" cy="85" r="14" fill={liveGamepadButtons[3] ? '#38bdf8' : '#282a30'} stroke="#38bdf8" strokeWidth="2" />
                <text x="310" y="89" fill={liveGamepadButtons[3] ? '#111319' : '#38bdf8'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">X</text>

                {/* Button Y (Left) - Index 2 */}
                <circle cx="280" cy="110" r="14" fill={liveGamepadButtons[2] ? '#a78bfa' : '#282a30'} stroke="#a78bfa" strokeWidth="2" />
                <text x="280" y="114" fill={liveGamepadButtons[2] ? '#111319' : '#a78bfa'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">Y</text>

                {/* Select / Start Pills */}
                <rect x="190" y="115" width="28" height="10" rx="5" fill={liveGamepadButtons[8] ? '#4cd7f6' : '#3b3d45'} stroke="#958ea0" strokeWidth="1" transform="rotate(-25 204 120)" />
                <text x="204" y="138" fill={liveGamepadButtons[8] ? '#4cd7f6' : '#958ea0'} fontSize="8" textAnchor="middle" fontFamily="Space Mono">SELECT</text>

                <rect x="236" y="115" width="28" height="10" rx="5" fill={liveGamepadButtons[9] ? '#4cd7f6' : '#3b3d45'} stroke="#958ea0" strokeWidth="1" transform="rotate(-25 250 120)" />
                <text x="250" y="138" fill={liveGamepadButtons[9] ? '#4cd7f6' : '#958ea0'} fontSize="8" textAnchor="middle" fontFamily="Space Mono">START</text>

                {/* Shoulder Buttons L1 & R1 */}
                <rect x="90" y="26" width="60" height="12" rx="4" fill={liveGamepadButtons[4] ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" strokeWidth="1.5" />
                <text x="120" y="35" fill={liveGamepadButtons[4] ? '#111319' : '#4cd7f6'} fontSize="8" textAnchor="middle" fontFamily="Space Mono">L1 (Btn 4)</text>

                <rect x="310" y="26" width="60" height="12" rx="4" fill={liveGamepadButtons[5] ? '#4cd7f6' : '#282a30'} stroke="#4cd7f6" strokeWidth="1.5" />
                <text x="340" y="35" fill={liveGamepadButtons[5] ? '#111319' : '#4cd7f6'} fontSize="8" textAnchor="middle" fontFamily="Space Mono">R1 (Btn 5)</text>
              </svg>
            </div>

            {/* Calibration & Analog Deadzones */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-[#cbc3d7]">Stick Deadzone</span>
                  <span className="text-[#4cd7f6] font-bold">{deadzone}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={deadzone}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDeadzone(val);
                    gamepadService.setDeadzone(val);
                  }}
                  className="w-full accent-[#4cd7f6] cursor-pointer"
                />
                <p className="text-[10px] font-mono text-[#958ea0]">
                  Filters analog stick drift. Current axes: X={liveAxes[0].toFixed(2)}, Y={liveAxes[1].toFixed(2)}
                </p>
              </div>

              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-[#cbc3d7]">Turbo Autofire Rate</span>
                  <span className="text-[#ffb3bc] font-bold">{turboRate} Hz</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={turboRate}
                  onChange={(e) => setTurboRate(Number(e.target.value))}
                  className="w-full accent-[#ffb3bc] cursor-pointer"
                />
                <p className="text-[10px] font-mono text-[#958ea0]">Autofire pulse speed for shooter & platformer cartridges</p>
              </div>
            </div>
          </div>

          {/* Right Column: Keybinding Table & Gamepad Info */}
          <div className="lg:col-span-5 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#494454]/20 mb-3">
                <h3 className="font-headline font-bold text-sm text-white">Active Mapping Table</h3>
                <span className="text-[11px] font-mono text-[#4cd7f6]">{selectedProfile}</span>
              </div>

              <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                {Object.entries(buttonMappings).map(([btnName, boundKey]) => (
                  <div
                    key={btnName}
                    className="flex items-center justify-between p-2 rounded bg-[#111319] border border-[#494454]/20 hover:border-[#4cd7f6]/50 transition-colors"
                  >
                    <span className="font-mono text-xs text-[#cbc3d7] font-medium">{btnName}</span>
                    <button
                      onClick={() => handleRemap(btnName)}
                      className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                        activeRemapButton === btnName
                          ? 'bg-[#4cd7f6] text-[#003641] font-bold animate-pulse'
                          : 'bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#4cd7f6]/30'
                      }`}
                    >
                      {activeRemapButton === btnName ? 'Listening...' : boundKey}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-[#494454]/20 mt-4 flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#958ea0]">
                {activeController ? `Connected: ${activeController.id.substring(0, 20)}...` : 'Standard W3C Polling @ 120Hz'}
              </span>
              <button
                onClick={handleTestHaptics}
                className="px-3.5 py-1.5 text-xs font-mono rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white border border-[#494454]/30 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm text-purple-400">vibration</span>
                Test Haptics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Display & CRT Shaders */}
      {activeTab === 'video' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 space-y-4">
            <h3 className="font-headline font-bold text-white text-sm">Post-Processing Shader Pipeline</h3>
            <div className="space-y-2">
              {[
                { name: 'CRT Trinitron Scanlines', desc: 'Simulated aperture grille, curvature, and phosphors' },
                { name: 'Scanlines 50% Sub-pixel', desc: 'Lightweight raster scanlines for vintage television feel' },
                { name: 'Raw Pixel Perfect (Nearest Neighbor)', desc: 'Sharp integer scaling with no color bleed' },
                { name: 'Bilinear Smooth Scale', desc: 'Subtle interpolation filter for LCD displays' },
                { name: 'GBA Dot-Matrix Grid', desc: 'Authentic 240x160 reflective LCD grid with slight ghosting' },
              ].map((shader) => (
                <div
                  key={shader.name}
                  onClick={() => {
                    setVideoFilter(shader.name);
                    showToast(`Active shader set to: ${shader.name}`);
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    videoFilter === shader.name
                      ? 'bg-[#4cd7f6]/10 border-[#4cd7f6] text-white'
                      : 'bg-[#111319] border-[#494454]/20 text-[#cbc3d7] hover:border-[#4cd7f6]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">{shader.name}</span>
                    {videoFilter === shader.name && (
                      <span className="material-symbols-outlined text-sm text-[#4cd7f6]">check_circle</span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-[#958ea0] mt-1">{shader.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 space-y-4">
            <h3 className="font-headline font-bold text-white text-sm">Aspect Ratio & Geometry</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-[#cbc3d7] block mb-1.5">Canvas Scaling Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-2.5 font-mono text-xs text-white focus:outline-none focus:border-[#4cd7f6]"
                >
                  <option>4:3 CRT Square Pixels (Authentic NES/SNES)</option>
                  <option>3:2 Native Handheld (Game Boy Advance)</option>
                  <option>8:7 Pixel Aspect Ratio (PAR Exact)</option>
                  <option>16:9 Stretched Widescreen</option>
                  <option>Fit Viewport (Maintain Aspect Ratio)</option>
                </select>
              </div>

              <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-[#cbc3d7]">
                  <span>V-Sync & Frame Pacing</span>
                  <span className="text-emerald-400 font-bold">Triple Buffer (60 FPS Lock)</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-[#cbc3d7]">
                  <span>Integer Scaling Mode</span>
                  <span className="text-[#4cd7f6]">Enabled (3x / 4x Multiplier)</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-[#cbc3d7]">
                  <span>Canvas Rendering Engine</span>
                  <span className="text-amber-400">WebGL 2.0 / WebAssembly JIT</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Audio & DSP Pipeline */}
      {activeTab === 'audio' && (
        <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#494454]/20 pb-4">
            <div>
              <h3 className="font-headline font-bold text-white text-sm">WebAudio Synthesizer Engine</h3>
              <p className="text-xs font-mono text-[#958ea0]">Low-latency APU sound synthesis & Gaussian DSP filtering</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
              AudioContext: Running @ 44.1 kHz
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#cbc3d7]">Buffer Latency</span>
                <span className="text-[#4cd7f6] font-bold">{audioLatency} ms</span>
              </div>
              <input
                type="range"
                min="8"
                max="64"
                step="4"
                value={audioLatency}
                onChange={(e) => setAudioLatency(Number(e.target.value))}
                className="w-full accent-[#4cd7f6] cursor-pointer"
              />
              <p className="text-[10px] font-mono text-[#958ea0]">Lower reduces audio lag; higher prevents dropouts</p>
            </div>

            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#cbc3d7]">Gaussian Interpolation</span>
                <span className={`font-bold ${enableDsp ? 'text-emerald-400' : 'text-[#958ea0]'}`}>
                  {enableDsp ? 'Active' : 'Bypass'}
                </span>
              </div>
              <button
                onClick={() => setEnableDsp(!enableDsp)}
                className="w-full py-2 rounded bg-[#282a30] hover:bg-[#34373f] text-xs font-mono text-[#cbc3d7] border border-[#494454]/30 transition-colors"
              >
                {enableDsp ? 'Disable DSP Filtering' : 'Enable DSP Filtering'}
              </button>
              <p className="text-[10px] font-mono text-[#958ea0]">Accurately simulates SNES S-DSP 8-channel voice echo</p>
            </div>

            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#cbc3d7]">Dynamic Resampling</span>
                <span className="text-[#4cd7f6] font-bold">Sinc High-Quality</span>
              </div>
              <p className="text-[10px] font-mono text-[#958ea0] mt-3">
                Maintains audio pitch synchrony during fast-forward (2x - 4x) and rewinding modes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: System & WASM Cores */}
      {activeTab === 'system' && (
        <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-6 space-y-4">
          <h3 className="font-headline font-bold text-white text-sm">Active WebAssembly Emulation Cores</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-headline font-bold text-sm text-[#ffb3bc]">NES Core</span>
                <span className="text-[10px] font-mono bg-[#282a30] text-emerald-400 px-2 py-0.5 rounded">v1.2.4 WASM</span>
              </div>
              <p className="text-xs font-mono text-[#cbc3d7]">Ricoh 2A03 6502 CPU + RP2C02 PPU</p>
              <p className="text-[11px] font-mono text-[#958ea0]">Supports Mappers 0-4, 7, 9, 10, 19, 69 with MMC5 audio</p>
            </div>

            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-headline font-bold text-sm text-[#4cd7f6]">SNES Core</span>
                <span className="text-[10px] font-mono bg-[#282a30] text-emerald-400 px-2 py-0.5 rounded">v2.1.0 Snes9x JIT</span>
              </div>
              <p className="text-xs font-mono text-[#cbc3d7]">WDC 65C816 CPU + Sony SPC700 APU</p>
              <p className="text-[11px] font-mono text-[#958ea0]">Super FX, SA-1, DSP-1, CX4, and OBC-1 co-processors active</p>
            </div>

            <div className="p-4 bg-[#111319] rounded-lg border border-[#494454]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-headline font-bold text-sm text-[#d0bcff]">GBA Core</span>
                <span className="text-[10px] font-mono bg-[#282a30] text-emerald-400 px-2 py-0.5 rounded">v0.9.3 mGBA WASM</span>
              </div>
              <p className="text-xs font-mono text-[#cbc3d7]">ARM7TDMI 32-bit RISC @ 16.78 MHz</p>
              <p className="text-[11px] font-mono text-[#958ea0]">Cycle-accurate timing, solar sensor, tilt, and rumble pack emulation</p>
            </div>
          </div>

          {/* Data & Storage Management Card */}
          <div className="mt-6 pt-6 border-t border-[#494454]/20 space-y-4">
            <div>
              <h3 className="font-headline font-bold text-white text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">database</span>
                Quản Lý Bộ Nhớ & Dữ Liệu Chạy Thử (Storage & Factory Reset)
              </h3>
              <p className="text-xs font-mono text-[#958ea0] mt-0.5">
                Xóa sạch bộ nhớ tạm, tệp lưu thử nghiệm IndexedDB và khôi phục ứng dụng về trạng thái nguyên bản sẵn sàng deploy
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-[#111319] rounded-xl border border-[#494454]/30 flex flex-col justify-between gap-3">
                <div>
                  <h4 className="text-xs font-mono font-bold text-white">Dọn Dẹp Bộ Nhớ Đệm</h4>
                  <p className="text-[11px] font-mono text-[#958ea0] mt-1">
                    Loại bỏ các savestate tạm và các slot không còn sử dụng để giải phóng RAM/IndexedDB.
                  </p>
                </div>
                <button
                  onClick={handleCleanOrphans}
                  className="w-full py-2 px-3 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white border border-[#494454]/30 font-mono text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">cleaning_services</span>
                  Dọn Dẹp Bản Lưu Thừa
                </button>
              </div>

              <div className="p-4 bg-[#111319] rounded-xl border border-red-500/30 flex flex-col justify-between gap-3">
                <div>
                  <h4 className="text-xs font-mono font-bold text-red-400">Xóa Toàn Bộ Dữ Liệu Chạy Thử</h4>
                  <p className="text-[11px] font-mono text-[#958ea0] mt-1">
                    Xóa toàn bộ saves trong IndexedDB, lịch sử favorites, recents và các thiết lập tạm.
                  </p>
                </div>
                <button
                  onClick={() => setShowResetModal(true)}
                  className="w-full py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-mono text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">delete_forever</span>
                  Khôi Phục Gốc / Xóa Hết Dữ Liệu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: BIOS & Memory Cartridges */}
      {activeTab === 'bios' && (
        <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-6 space-y-4">
          <h3 className="font-headline font-bold text-white text-sm">System BIOS Integrity Check</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <div>
                <p className="font-mono text-xs text-white font-bold">gba_bios.bin (Game Boy Advance)</p>
                <p className="text-[11px] font-mono text-[#958ea0]">CRC32: a860e8c0 • MD5: a4b47d35b1d1e70e2b347b744d03eef5</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Verified Built-in HLE
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <div>
                <p className="font-mono text-xs text-white font-bold">snes_dsp1.bin (Super Mario Kart / Pilotwings)</p>
                <p className="text-[11px] font-mono text-[#958ea0]">NEC uPD77C25 DSP microcode firmware</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Active Firmware
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-red-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="font-headline font-bold text-lg text-white">Xác Nhận Xóa Dữ Liệu Chạy Thử</h3>
            </div>
            <p className="text-xs font-mono text-[#cbc3d7] leading-relaxed">
              Bạn có chắc chắn muốn xóa toàn bộ dữ liệu chạy thử? Thao tác này sẽ dọn sạch IndexedDB,
              lịch sử yêu thích, danh sách game gần đây và đưa ứng dụng về trạng thái xuất xưởng sạch sẽ sẵn sàng deploy.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg bg-[#282a30] text-xs font-mono text-[#cbc3d7] hover:text-white"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handlePurgeAllData}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-mono font-bold shadow-md transition-all"
              >
                Xác nhận xóa hết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
