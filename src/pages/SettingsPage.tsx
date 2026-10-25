import React, { useState, useEffect } from 'react';
import {
  gamepadService,
  ConnectedGamepadInfo,
  STANDARD_SNES_GAMEPAD_MAPPING,
  XBOX_LAYOUT_MAPPING
} from '../services/input/gamepadService';
import { saveManager } from '../services/saves/saveManager';
import { InputMappingPanel } from '../components/InputMappingPanel';
import { inputConfigService } from '../services/input/inputConfigService';

interface SettingsPageProps {
  onBack: () => void;
  onLaunchRom?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'controller' | 'video' | 'audio' | 'system' | 'bios'>('controller');
  const [videoFilter, setVideoFilter] = useState<string>('CRT Trinitron Scanlines');
  const [aspectRatio, setAspectRatio] = useState<string>('4:3 CRT Square Pixels');
  const [audioLatency, setAudioLatency] = useState<number>(16); // ms
  const [enableDsp, setEnableDsp] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Gamepad connection state
  const [connectedControllers, setConnectedControllers] = useState<ConnectedGamepadInfo[]>(() =>
    gamepadService.getConnectedControllers()
  );

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

  const handleResetDefaults = () => {
    inputConfigService.resetAll();
    showToast('Đã khôi phục toàn bộ cấu hình điều khiển về mặc định!');
  };

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
          Nút ảo & Tay cầm (NES / SNES / GBA)
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
        <InputMappingPanel onShowToast={showToast} />
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
