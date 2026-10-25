import React, { useState, useEffect, useRef } from 'react';
import {
  inputConfigService,
  InputConfigService,
  TargetSystem,
  VirtualControllerButton,
  SYSTEM_BUTTONS,
  KeyBinding,
  GamepadBinding,
} from '../services/input/inputConfigService';
import { gamepadService, ConnectedGamepadInfo } from '../services/input/gamepadService';

interface InputMappingPanelProps {
  onShowToast?: (msg: string) => void;
}

export const InputMappingPanel: React.FC<InputMappingPanelProps> = ({ onShowToast }) => {
  const [selectedSystem, setSelectedSystem] = useState<TargetSystem>('SNES');
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<'all' | 'keyboard' | 'gamepad'>('all');
  const [activeListening, setActiveListening] = useState<{
    button: VirtualControllerButton;
    device: 'keyboard' | 'gamepad';
  } | null>(null);

  // Live input testing feedback
  const [livePressedButtons, setLivePressedButtons] = useState<{ [key: string]: boolean }>({});
  const [connectedControllers, setConnectedControllers] = useState<ConnectedGamepadInfo[]>(() =>
    gamepadService.getConnectedControllers()
  );
  const [activeGamepadIndex, setActiveGamepadIndex] = useState<number>(0);
  const [deadzone, setDeadzone] = useState<number>(() => gamepadService.getDeadzone());
  const [turboRate, setTurboRate] = useState<number>(15);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Audio Context for keypress sound feedback
  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = (msg: string) => {
    if (onShowToast) {
      onShowToast(msg);
    } else {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const playFeedbackBeep = (freq: number = 440) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 0.08);
      }
    } catch {}
  };

  // Re-read configuration on system change or updates
  const [sysConfig, setSysConfig] = useState(() => inputConfigService.getSystemConfig(selectedSystem));

  useEffect(() => {
    setSysConfig(inputConfigService.getSystemConfig(selectedSystem));
    const unsub = inputConfigService.onChange(() => {
      setSysConfig({ ...inputConfigService.getSystemConfig(selectedSystem) });
    });
    return unsub;
  }, [selectedSystem]);

  // Gamepad connection listener
  useEffect(() => {
    const unsubConn = gamepadService.onConnect((gp) => {
      setConnectedControllers(gamepadService.getConnectedControllers());
      showToast(`Tay cầm đã kết nối: ${gp.id}`);
    });
    const unsubDis = gamepadService.onDisconnect(() => {
      setConnectedControllers(gamepadService.getConnectedControllers());
      showToast('Tay cầm đã ngắt kết nối');
    });

    return () => {
      unsubConn();
      unsubDis();
    };
  }, []);

  // Keyboard mapping listener
  useEffect(() => {
    if (!activeListening || activeListening.device !== 'keyboard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels remapping
      if (e.code === 'Escape') {
        setActiveListening(null);
        showToast('Đã hủy gán phím');
        return;
      }

      // Delete or Backspace clears binding if holding Alt or Shift
      if ((e.code === 'Delete' || e.code === 'Backspace') && (e.altKey || e.shiftKey)) {
        inputConfigService.clearBinding(selectedSystem, 'keyboard', activeListening.button);
        setActiveListening(null);
        showToast(`Đã xóa gán phím cho ${activeListening.button}`);
        playFeedbackBeep(260);
        return;
      }

      const formatted = InputConfigService.formatKeyCode(e.code, e.key);
      const newBinding: KeyBinding = {
        code: e.code,
        label: formatted,
      };

      inputConfigService.setKeyboardBinding(selectedSystem, activeListening.button, newBinding);
      playFeedbackBeep(660);
      showToast(`Đã gán "${activeListening.button}" vào phím [${formatted}]`);
      setActiveListening(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [activeListening, selectedSystem]);

  // Live polling loop: gamepad inputs & listening mode detection
  useEffect(() => {
    let animId: number;

    const pollLoop = () => {
      // 1. Live poll active controllers
      const dummyInput = {
        up: false, down: false, left: false, right: false,
        a: false, b: false, x: false, y: false,
        l: false, r: false, start: false, select: false
      };
      const { rawButtons, activeAxes } = gamepadService.poll(dummyInput, selectedSystem);

      // Check if listening for Gamepad input
      if (activeListening && activeListening.device === 'gamepad') {
        const pressedIdx = rawButtons.findIndex((b) => b === true);
        if (pressedIdx !== -1) {
          const newBinding: GamepadBinding = {
            buttonIndex: pressedIdx,
            label: `Btn ${pressedIdx}`,
          };
          inputConfigService.setGamepadBinding(selectedSystem, activeListening.button, newBinding);
          playFeedbackBeep(780);
          gamepadService.vibrate(0.4, 0.7, 120);
          showToast(`Đã gán "${activeListening.button}" vào Nút tay cầm #${pressedIdx}`);
          setActiveListening(null);
        }
      }

      // Update live signal highlights on blueprint
      const signals: { [key: string]: boolean } = {};

      // Gamepad buttons to virtual signal
      const gpMap = sysConfig.gamepad;
      for (const [btnKey, binding] of Object.entries(gpMap)) {
        if (binding.buttonIndex >= 0 && rawButtons[binding.buttonIndex]) {
          signals[btnKey] = true;
        }
      }

      // Axes for D-Pad
      const dz = deadzone / 100;
      if (activeAxes[1] < -dz) signals.up = true;
      if (activeAxes[1] > dz) signals.down = true;
      if (activeAxes[0] < -dz) signals.left = true;
      if (activeAxes[0] > dz) signals.right = true;

      setLivePressedButtons((prev) => {
        const allKeys = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select'];
        let hasChange = false;
        for (const k of allKeys) {
          const isPressed = !!signals[k];
          if (!!prev[k] !== isPressed) {
            hasChange = true;
            break;
          }
        }
        if (!hasChange) return prev;
        return signals;
      });

      animId = requestAnimationFrame(pollLoop);
    };

    animId = requestAnimationFrame(pollLoop);
    return () => cancelAnimationFrame(animId);
  }, [activeListening, selectedSystem, sysConfig, deadzone]);

  // Live keyboard tester
  useEffect(() => {
    const handleTestKeyDown = (e: KeyboardEvent) => {
      if (activeListening) return; // Don't trigger test during remapping
      const virtualBtn = inputConfigService.getVirtualButtonForKeyboard(e.code, selectedSystem);
      if (virtualBtn) {
        setLivePressedButtons((prev) => ({ ...prev, [virtualBtn]: true }));
        playFeedbackBeep(520);
      }
    };

    const handleTestKeyUp = (e: KeyboardEvent) => {
      const virtualBtn = inputConfigService.getVirtualButtonForKeyboard(e.code, selectedSystem);
      if (virtualBtn) {
        setLivePressedButtons((prev) => ({ ...prev, [virtualBtn]: false }));
      }
    };

    window.addEventListener('keydown', handleTestKeyDown);
    window.addEventListener('keyup', handleTestKeyUp);
    return () => {
      window.removeEventListener('keydown', handleTestKeyDown);
      window.removeEventListener('keyup', handleTestKeyUp);
    };
  }, [selectedSystem, activeListening]);

  const handleStartRemap = (button: VirtualControllerButton, device: 'keyboard' | 'gamepad') => {
    setActiveListening({ button, device });
    playFeedbackBeep(880);
    if (device === 'keyboard') {
      showToast(`Đang chờ phím bàn phím cho [${button.toUpperCase()}]... (Nhấn Esc để hủy)`);
    } else {
      showToast(`Đang chờ nút trên tay cầm cho [${button.toUpperCase()}]...`);
    }
  };

  const handleTestHaptics = async () => {
    const success = await gamepadService.vibrate(0.5, 0.9, 350);
    if (success) {
      showToast('Đã gửi xung rung haptic đến tay cầm!');
    } else {
      showToast('Không tìm thấy mô-tơ rung hoặc tay cầm đang ở chế độ chờ.');
    }
  };

  const availableButtons = SYSTEM_BUTTONS[selectedSystem];

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">sports_esports</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Controls: Console System Switcher + Presets */}
      <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* System Tabs */}
        <div>
          <label className="text-xs font-mono text-[#958ea0] block mb-1.5 uppercase tracking-wider">
            Chọn hệ máy cần cấu hình nút ảo
          </label>
          <div className="inline-flex rounded-lg bg-[#111319] p-1 border border-[#494454]/30 gap-1">
            {(['NES', 'SNES', 'GBA'] as TargetSystem[]).map((sys) => (
              <button
                key={sys}
                onClick={() => {
                  setSelectedSystem(sys);
                  setActiveListening(null);
                }}
                className={`px-4 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                  selectedSystem === sys
                    ? 'bg-[#4cd7f6] text-[#003641] shadow-md shadow-[#4cd7f6]/20'
                    : 'text-[#cbc3d7] hover:text-white hover:bg-[#282a30]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {sys === 'GBA' ? 'videogame_asset' : sys === 'NES' ? 'hardware' : 'sports_esports'}
                </span>
                <span>{sys} Controller</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({sys === 'NES' ? '8 nút' : sys === 'GBA' ? '10 nút' : '12 nút'})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Presets & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Keyboard Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#958ea0]">Mẫu phím:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  inputConfigService.applyPreset(selectedSystem, e.target.value as any);
                  showToast(`Đã áp dụng mẫu bàn phím: ${e.target.options[e.target.selectedIndex].text}`);
                }
              }}
              defaultValue=""
              className="bg-[#111319] border border-[#494454]/40 text-[#cbc3d7] font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#4cd7f6]"
            >
              <option value="" disabled>
                -- Mẫu Bàn Phím --
              </option>
              <option value="retro_arrow">Mũi tên cổ điển (Arrows + ZX)</option>
              <option value="wasd_gamer">WASD + JK Gamer (Chuẩn PC)</option>
              <option value="numpad_compact">Bàn phím số Numpad</option>
            </select>
          </div>

          {/* Gamepad Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#958ea0]">Mẫu tay cầm:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  inputConfigService.applyGamepadPreset(selectedSystem, e.target.value as any);
                  showToast(`Đã áp dụng mẫu tay cầm: ${e.target.options[e.target.selectedIndex].text}`);
                }
              }}
              defaultValue=""
              className="bg-[#111319] border border-[#494454]/40 text-[#cbc3d7] font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#4cd7f6]"
            >
              <option value="" disabled>
                -- Mẫu Tay Cầm --
              </option>
              <option value="snes_standard">SNES 8BitDo / Nintendo Pro</option>
              <option value="xbox_pc">Xbox / PC Wireless Controller</option>
              <option value="playstation">PlayStation DualShock / DualSense</option>
            </select>
          </div>

          <button
            onClick={() => {
              inputConfigService.resetSystem(selectedSystem);
              showToast(`Đã khôi phục cài đặt gốc cho tay cầm ${selectedSystem}`);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] border border-[#494454]/30 font-mono text-xs transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Đặt lại mặc định
          </button>
        </div>
      </div>

      {/* Main Grid: Visual Blueprint + Remapping Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Visual Controller Blueprint */}
        <div className="lg:col-span-5 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 flex flex-col items-center justify-between">
          <div className="w-full flex items-center justify-between pb-3 border-b border-[#494454]/20">
            <div>
              <h3 className="font-headline font-bold text-sm text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">gamepad</span>
                Sơ đồ tay cầm ảo {selectedSystem}
              </h3>
              <p className="text-[11px] font-mono text-[#958ea0]">
                Bấm vào nút trên sơ đồ hoặc bảng bên phải để gán lại phím
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30">
              Live Interactive
            </span>
          </div>

          {/* Blueprint SVG per System */}
          <div className="w-full my-4 flex items-center justify-center p-3 bg-[#111319]/90 rounded-xl border border-[#494454]/40 relative min-h-[220px]">
            {/* Active Listening Overlay on Blueprint */}
            {activeListening && (
              <div className="absolute inset-0 bg-[#111319]/80 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center z-10 p-4 text-center">
                <span className="w-3 h-3 rounded-full bg-[#4cd7f6] animate-ping mb-2"></span>
                <span className="font-mono text-xs font-bold text-[#4cd7f6] animate-pulse">
                  Đang chờ tín hiệu cho: {activeListening.button.toUpperCase()}
                </span>
                <p className="text-[11px] font-mono text-[#cbc3d7] mt-1">
                  {activeListening.device === 'keyboard'
                    ? 'Nhấn phím bất kỳ trên bàn phím (Esc để hủy)'
                    : 'Bấm nút hoặc gạt cần trên tay cầm USB/Bluetooth'}
                </p>
                <button
                  onClick={() => setActiveListening(null)}
                  className="mt-3 px-3 py-1 text-[11px] font-mono rounded bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/40"
                >
                  Hủy thao tác (Esc)
                </button>
              </div>
            )}

            {/* NES Controller Blueprint */}
            {selectedSystem === 'NES' && (
              <svg viewBox="0 0 440 180" className="w-full h-auto max-w-[420px]">
                {/* Controller Outer Body */}
                <rect x="20" y="20" width="400" height="140" rx="6" fill="#202228" stroke="#494454" strokeWidth="2" />
                {/* Red outline accent line */}
                <rect x="25" y="25" width="390" height="130" rx="4" fill="none" stroke="#d9383a" strokeWidth="2" />
                {/* Center Brushed Aluminum Plate */}
                <rect x="40" y="38" width="360" height="104" rx="3" fill="#30333d" stroke="#1d1e24" strokeWidth="1" />

                {/* Nintendo NES Brand Typography */}
                <text x="220" y="58" fill="#d9383a" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="Space Grotesk">
                  NINTENDO
                </text>
                <text x="220" y="68" fill="#d9383a" fontSize="7" textAnchor="middle" fontFamily="Space Mono">
                  ENTERTAINMENT SYSTEM
                </text>

                {/* D-Pad Cross */}
                <g
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('up', 'keyboard')}
                >
                  <path
                    d="M 90 60 L 110 60 L 110 80 L 130 80 L 130 100 L 110 100 L 110 120 L 90 120 L 90 100 L 70 100 L 70 80 L 90 80 Z"
                    fill="#18191f"
                    stroke="#111319"
                    strokeWidth="2"
                  />
                  {/* D-Pad Up */}
                  <circle
                    cx="100"
                    cy="70"
                    r="6"
                    fill={livePressedButtons.up ? '#4cd7f6' : '#282a30'}
                    onClick={(e) => { e.stopPropagation(); handleStartRemap('up', 'keyboard'); }}
                  />
                  {/* D-Pad Down */}
                  <circle
                    cx="100"
                    cy="110"
                    r="6"
                    fill={livePressedButtons.down ? '#4cd7f6' : '#282a30'}
                    onClick={(e) => { e.stopPropagation(); handleStartRemap('down', 'keyboard'); }}
                  />
                  {/* D-Pad Left */}
                  <circle
                    cx="80"
                    cy="90"
                    r="6"
                    fill={livePressedButtons.left ? '#4cd7f6' : '#282a30'}
                    onClick={(e) => { e.stopPropagation(); handleStartRemap('left', 'keyboard'); }}
                  />
                  {/* D-Pad Right */}
                  <circle
                    cx="120"
                    cy="90"
                    r="6"
                    fill={livePressedButtons.right ? '#4cd7f6' : '#282a30'}
                    onClick={(e) => { e.stopPropagation(); handleStartRemap('right', 'keyboard'); }}
                  />
                </g>

                {/* Center Select & Start */}
                <g className="cursor-pointer">
                  {/* Select */}
                  <rect
                    x="180"
                    y="95"
                    width="26"
                    height="8"
                    rx="3"
                    fill={livePressedButtons.select ? '#4cd7f6' : '#18191f'}
                    stroke="#494454"
                    strokeWidth="1"
                    onClick={() => handleStartRemap('select', 'keyboard')}
                  />
                  <text x="193" y="115" fill="#d9383a" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                    SELECT
                  </text>

                  {/* Start */}
                  <rect
                    x="230"
                    y="95"
                    width="26"
                    height="8"
                    rx="3"
                    fill={livePressedButtons.start ? '#4cd7f6' : '#18191f'}
                    stroke="#494454"
                    strokeWidth="1"
                    onClick={() => handleStartRemap('start', 'keyboard')}
                  />
                  <text x="243" y="115" fill="#d9383a" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                    START
                  </text>
                </g>

                {/* Red Circular Action Buttons B and A */}
                <g className="cursor-pointer">
                  {/* Button B */}
                  <rect x="295" y="80" width="36" height="42" rx="4" fill="#202228" stroke="#111319" strokeWidth="1" />
                  <circle
                    cx="313"
                    cy="98"
                    r="12"
                    fill={livePressedButtons.b ? '#ff6b6b' : '#d9383a'}
                    stroke="#8c1b1c"
                    strokeWidth="2"
                    onClick={() => handleStartRemap('b', 'keyboard')}
                  />
                  <text x="313" y="132" fill="#d9383a" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                    B
                  </text>

                  {/* Button A */}
                  <rect x="345" y="80" width="36" height="42" rx="4" fill="#202228" stroke="#111319" strokeWidth="1" />
                  <circle
                    cx="363"
                    cy="98"
                    r="12"
                    fill={livePressedButtons.a ? '#ff6b6b' : '#d9383a'}
                    stroke="#8c1b1c"
                    strokeWidth="2"
                    onClick={() => handleStartRemap('a', 'keyboard')}
                  />
                  <text x="363" y="132" fill="#d9383a" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                    A
                  </text>
                </g>
              </svg>
            )}

            {/* SNES Controller Blueprint */}
            {selectedSystem === 'SNES' && (
              <svg viewBox="0 0 460 210" className="w-full h-auto max-w-[440px]">
                {/* Controller outline body */}
                <rect x="45" y="35" width="370" height="145" rx="42" fill="#22242c" stroke="#4cd7f6" strokeWidth="1.5" strokeDasharray="3 3" />
                <rect x="52" y="42" width="356" height="131" rx="36" fill="#2c2e38" />

                {/* Shoulder L & R */}
                <rect
                  x="80"
                  y="20"
                  width="70"
                  height="16"
                  rx="5"
                  fill={livePressedButtons.l ? '#4cd7f6' : '#1f2026'}
                  stroke="#4cd7f6"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('l', 'keyboard')}
                />
                <text x="115" y="31" fill={livePressedButtons.l ? '#003641' : '#4cd7f6'} fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  L
                </text>

                <rect
                  x="310"
                  y="20"
                  width="70"
                  height="16"
                  rx="5"
                  fill={livePressedButtons.r ? '#4cd7f6' : '#1f2026'}
                  stroke="#4cd7f6"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('r', 'keyboard')}
                />
                <text x="345" y="31" fill={livePressedButtons.r ? '#003641' : '#4cd7f6'} fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  R
                </text>

                {/* D-Pad Cross */}
                <path
                  d="M 105 75 L 125 75 L 125 95 L 145 95 L 145 115 L 125 115 L 125 135 L 105 135 L 105 115 L 85 115 L 85 95 L 105 95 Z"
                  fill="#1b1c22"
                  stroke="#494454"
                  strokeWidth="1.5"
                />
                <circle cx="115" cy="85" r="5" fill={livePressedButtons.up ? '#4cd7f6' : '#32343e'} className="cursor-pointer" onClick={() => handleStartRemap('up', 'keyboard')} />
                <circle cx="115" cy="125" r="5" fill={livePressedButtons.down ? '#4cd7f6' : '#32343e'} className="cursor-pointer" onClick={() => handleStartRemap('down', 'keyboard')} />
                <circle cx="95" cy="105" r="5" fill={livePressedButtons.left ? '#4cd7f6' : '#32343e'} className="cursor-pointer" onClick={() => handleStartRemap('left', 'keyboard')} />
                <circle cx="135" cy="105" r="5" fill={livePressedButtons.right ? '#4cd7f6' : '#32343e'} className="cursor-pointer" onClick={() => handleStartRemap('right', 'keyboard')} />

                {/* Center Select & Start */}
                <rect
                  x="185"
                  y="108"
                  width="26"
                  height="9"
                  rx="4.5"
                  fill={livePressedButtons.select ? '#4cd7f6' : '#1b1c22'}
                  stroke="#494454"
                  transform="rotate(-20 198 112)"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('select', 'keyboard')}
                />
                <text x="198" y="130" fill={livePressedButtons.select ? '#4cd7f6' : '#958ea0'} fontSize="7" textAnchor="middle" fontFamily="Space Mono">
                  SELECT
                </text>

                <rect
                  x="235"
                  y="108"
                  width="26"
                  height="9"
                  rx="4.5"
                  fill={livePressedButtons.start ? '#4cd7f6' : '#1b1c22'}
                  stroke="#494454"
                  transform="rotate(-20 248 112)"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('start', 'keyboard')}
                />
                <text x="248" y="130" fill={livePressedButtons.start ? '#4cd7f6' : '#958ea0'} fontSize="7" textAnchor="middle" fontFamily="Space Mono">
                  START
                </text>

                {/* ABXY Diamond Buttons */}
                {/* Button X (Top - Sky Blue) */}
                <circle
                  cx="330"
                  cy="80"
                  r="13"
                  fill={livePressedButtons.x ? '#38bdf8' : '#1b1c22'}
                  stroke="#38bdf8"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('x', 'keyboard')}
                />
                <text x="330" y="84" fill={livePressedButtons.x ? '#111319' : '#38bdf8'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  X
                </text>

                {/* Button A (Right - Pink/Red) */}
                <circle
                  cx="360"
                  cy="105"
                  r="13"
                  fill={livePressedButtons.a ? '#f472b6' : '#1b1c22'}
                  stroke="#f472b6"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('a', 'keyboard')}
                />
                <text x="360" y="109" fill={livePressedButtons.a ? '#111319' : '#f472b6'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  A
                </text>

                {/* Button B (Bottom - Purple) */}
                <circle
                  cx="330"
                  cy="130"
                  r="13"
                  fill={livePressedButtons.b ? '#c084fc' : '#1b1c22'}
                  stroke="#c084fc"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('b', 'keyboard')}
                />
                <text x="330" y="134" fill={livePressedButtons.b ? '#111319' : '#c084fc'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  B
                </text>

                {/* Button Y (Left - Emerald/Green) */}
                <circle
                  cx="300"
                  cy="105"
                  r="13"
                  fill={livePressedButtons.y ? '#34d399' : '#1b1c22'}
                  stroke="#34d399"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('y', 'keyboard')}
                />
                <text x="300" y="109" fill={livePressedButtons.y ? '#111319' : '#34d399'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  Y
                </text>
              </svg>
            )}

            {/* GBA Handheld Blueprint */}
            {selectedSystem === 'GBA' && (
              <svg viewBox="0 0 460 200" className="w-full h-auto max-w-[440px]">
                {/* Indigo Handheld Wide Bezel */}
                <rect x="25" y="28" width="410" height="150" rx="36" fill="#1b1c26" stroke="#818cf8" strokeWidth="2" />
                <rect x="35" y="38" width="390" height="130" rx="28" fill="#242738" />

                {/* Shoulder L & R Bumpers */}
                <rect
                  x="55"
                  y="18"
                  width="75"
                  height="14"
                  rx="4"
                  fill={livePressedButtons.l ? '#818cf8' : '#14161f'}
                  stroke="#818cf8"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('l', 'keyboard')}
                />
                <text x="92" y="29" fill={livePressedButtons.l ? '#111319' : '#818cf8'} fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  L BUMPER
                </text>

                <rect
                  x="330"
                  y="18"
                  width="75"
                  height="14"
                  rx="4"
                  fill={livePressedButtons.r ? '#818cf8' : '#14161f'}
                  stroke="#818cf8"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('r', 'keyboard')}
                />
                <text x="367" y="29" fill={livePressedButtons.r ? '#111319' : '#818cf8'} fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  R BUMPER
                </text>

                {/* Center Handheld LCD Screen */}
                <rect x="145" y="48" width="170" height="110" rx="6" fill="#0d0e14" stroke="#494454" strokeWidth="1.5" />
                <rect x="155" y="58" width="150" height="90" rx="3" fill="#151b24" />
                <text x="230" y="100" fill="#4cd7f6" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="Space Grotesk">
                  GAME BOY ADVANCE
                </text>
                <text x="230" y="115" fill="#958ea0" fontSize="7" textAnchor="middle" fontFamily="Space Mono">
                  240 × 160 TFT LCD
                </text>

                {/* D-Pad on Left */}
                <path
                  d="M 80 80 L 96 80 L 96 96 L 112 96 L 112 112 L 96 112 L 96 128 L 80 128 L 80 112 L 64 112 L 64 96 L 80 96 Z"
                  fill="#14161f"
                  stroke="#494454"
                  strokeWidth="1"
                />
                <circle cx="88" cy="88" r="4" fill={livePressedButtons.up ? '#818cf8' : '#282a30'} className="cursor-pointer" onClick={() => handleStartRemap('up', 'keyboard')} />
                <circle cx="88" cy="120" r="4" fill={livePressedButtons.down ? '#818cf8' : '#282a30'} className="cursor-pointer" onClick={() => handleStartRemap('down', 'keyboard')} />
                <circle cx="72" cy="104" r="4" fill={livePressedButtons.left ? '#818cf8' : '#282a30'} className="cursor-pointer" onClick={() => handleStartRemap('left', 'keyboard')} />
                <circle cx="104" cy="104" r="4" fill={livePressedButtons.right ? '#818cf8' : '#282a30'} className="cursor-pointer" onClick={() => handleStartRemap('right', 'keyboard')} />

                {/* Select & Start below screen */}
                <rect
                  x="180"
                  y="162"
                  width="20"
                  height="7"
                  rx="3.5"
                  fill={livePressedButtons.select ? '#818cf8' : '#14161f'}
                  stroke="#494454"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('select', 'keyboard')}
                />
                <text x="190" y="178" fill="#958ea0" fontSize="6" textAnchor="middle" fontFamily="Space Mono">
                  SELECT
                </text>

                <rect
                  x="260"
                  y="162"
                  width="20"
                  height="7"
                  rx="3.5"
                  fill={livePressedButtons.start ? '#818cf8' : '#14161f'}
                  stroke="#494454"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('start', 'keyboard')}
                />
                <text x="270" y="178" fill="#958ea0" fontSize="6" textAnchor="middle" fontFamily="Space Mono">
                  START
                </text>

                {/* A & B Angled Buttons on Right */}
                <circle
                  cx="355"
                  cy="115"
                  r="13"
                  fill={livePressedButtons.b ? '#a78bfa' : '#14161f'}
                  stroke="#a78bfa"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('b', 'keyboard')}
                />
                <text x="355" y="119" fill={livePressedButtons.b ? '#111319' : '#a78bfa'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  B
                </text>

                <circle
                  cx="385"
                  cy="92"
                  r="13"
                  fill={livePressedButtons.a ? '#818cf8' : '#14161f'}
                  stroke="#818cf8"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onClick={() => handleStartRemap('a', 'keyboard')}
                />
                <text x="385" y="96" fill={livePressedButtons.a ? '#111319' : '#818cf8'} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Mono">
                  A
                </text>
              </svg>
            )}
          </div>

          {/* Controller Hardware Diagnostics / Haptics */}
          <div className="w-full pt-3 border-t border-[#494454]/20 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#958ea0] flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectedControllers.length > 0 ? 'bg-emerald-400' : 'bg-[#958ea0]'
                  }`}
                ></span>
                {connectedControllers.length > 0
                  ? `Đã nhận: ${connectedControllers[0].id.substring(0, 22)}...`
                  : 'Chưa có tay cầm USB/Bluetooth'}
              </span>
              <button
                onClick={handleTestHaptics}
                disabled={connectedControllers.length === 0}
                className="px-2.5 py-1 text-[11px] font-mono rounded bg-[#282a30] hover:bg-[#34373f] disabled:opacity-40 text-[#cbc3d7] hover:text-white border border-[#494454]/30 flex items-center gap-1 transition-all"
              >
                <span className="material-symbols-outlined text-xs text-purple-400">vibration</span>
                Rung thử
              </button>
            </div>

            {/* Stick Deadzone */}
            <div className="p-2.5 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-[#cbc3d7]">Độ trễ cần gạt (Stick Deadzone)</span>
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
            </div>
          </div>
        </div>

        {/* Right: Detailed Keybinding Matrix */}
        <div className="lg:col-span-7 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 flex flex-col justify-between">
          <div>
            {/* Table Header with Device Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#494454]/20 gap-2 mb-3">
              <div>
                <h3 className="font-headline font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6]">keyboard</span>
                  Bảng ánh xạ nút điều khiển ({selectedSystem})
                </h3>
                <p className="text-[11px] font-mono text-[#958ea0]">
                  Nhấn vào ô phím để gán nút mới từ bàn phím hoặc tay cầm
                </p>
              </div>

              {/* View filter */}
              <div className="flex items-center gap-1 bg-[#111319] p-0.5 rounded-lg border border-[#494454]/30">
                {(['all', 'keyboard', 'gamepad'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedDeviceFilter(mode)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                      selectedDeviceFilter === mode
                        ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                        : 'text-[#958ea0] hover:text-white'
                    }`}
                  >
                    {mode === 'all' ? 'Tất cả' : mode === 'keyboard' ? 'Bàn phím' : 'Tay cầm'}
                  </button>
                ))}
              </div>
            </div>

            {/* Matrix of mapped buttons */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {availableButtons.map(({ id, name, category }) => {
                const kbBinding = sysConfig.keyboard[id];
                const gpBinding = sysConfig.gamepad[id];
                const isListeningKb = activeListening?.button === id && activeListening?.device === 'keyboard';
                const isListeningGp = activeListening?.button === id && activeListening?.device === 'gamepad';
                const isLiveActive = livePressedButtons[id];

                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                      isLiveActive
                        ? 'bg-[#4cd7f6]/10 border-[#4cd7f6]'
                        : 'bg-[#111319] border-[#494454]/20 hover:border-[#4cd7f6]/40'
                    }`}
                  >
                    {/* Button identifier */}
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isLiveActive ? 'bg-[#4cd7f6] animate-pulse' : 'bg-[#494454]'
                        }`}
                      ></span>
                      <div>
                        <span className="font-mono text-xs text-white font-medium block">
                          {name}
                        </span>
                        <span className="text-[10px] font-mono text-[#958ea0] capitalize">
                          {category}
                        </span>
                      </div>
                    </div>

                    {/* Mappings */}
                    <div className="flex items-center gap-2">
                      {/* Keyboard Slot */}
                      {(selectedDeviceFilter === 'all' || selectedDeviceFilter === 'keyboard') && (
                        <button
                          onClick={() => handleStartRemap(id, 'keyboard')}
                          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 border ${
                            isListeningKb
                              ? 'bg-[#4cd7f6] text-[#003641] font-bold animate-pulse border-[#4cd7f6]'
                              : kbBinding && kbBinding.code
                              ? 'bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border-[#4cd7f6]/30'
                              : 'bg-[#1b1c22] text-[#958ea0] border-dashed border-[#494454]/40 hover:border-[#4cd7f6]'
                          }`}
                          title="Nhấp để gán phím bàn phím"
                        >
                          <span className="material-symbols-outlined text-[13px] opacity-70">
                            keyboard
                          </span>
                          <span>
                            {isListeningKb
                              ? 'Đang chờ phím...'
                              : kbBinding?.label || 'Chưa gán'}
                          </span>
                        </button>
                      )}

                      {/* Gamepad Slot */}
                      {(selectedDeviceFilter === 'all' || selectedDeviceFilter === 'gamepad') && (
                        <button
                          onClick={() => handleStartRemap(id, 'gamepad')}
                          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 border ${
                            isListeningGp
                              ? 'bg-[#c084fc] text-[#2e0854] font-bold animate-pulse border-[#c084fc]'
                              : gpBinding && gpBinding.buttonIndex >= 0
                              ? 'bg-[#282a30] hover:bg-[#34373f] text-[#c084fc] border-[#c084fc]/30'
                              : 'bg-[#1b1c22] text-[#958ea0] border-dashed border-[#494454]/40 hover:border-[#c084fc]'
                          }`}
                          title="Nhấp để gán nút tay cầm"
                        >
                          <span className="material-symbols-outlined text-[13px] opacity-70">
                            sports_esports
                          </span>
                          <span>
                            {isListeningGp
                              ? 'Bấm nút tay cầm...'
                              : gpBinding?.label || 'Chưa gán'}
                          </span>
                        </button>
                      )}

                      {/* Clear Button */}
                      <button
                        onClick={() => {
                          inputConfigService.clearBinding(selectedSystem, 'keyboard', id);
                          inputConfigService.clearBinding(selectedSystem, 'gamepad', id);
                          showToast(`Đã xóa gán phím cho ${name}`);
                        }}
                        className="p-1.5 text-[#958ea0] hover:text-[#ff6b6b] rounded hover:bg-[#282a30] transition-colors"
                        title="Xóa cả phím bàn phím & tay cầm"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="pt-4 border-t border-[#494454]/20 mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#958ea0]">
              <span className="material-symbols-outlined text-sm text-[#4cd7f6]">info</span>
              <span>Cấu hình tự động lưu vào trình duyệt và áp dụng ngay khi chơi game.</span>
            </div>

            <button
              onClick={() => showToast('Cấu hình đã được lưu thành công vào hồ sơ!')}
              className="px-4 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
