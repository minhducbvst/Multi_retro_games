import React from 'react';

export interface MobileGamepadConfig {
  movementType: 'dpad' | 'joystick';
  showMovement: boolean;
  showActionButtons: boolean;
  showAutoButtons: boolean;
  showShoulders: boolean;
  showSystemButtons: boolean;
  showQuickTools: boolean;
  opacity: number; // 20 - 100
  scale: 'compact' | 'normal' | 'large';
  turboRate: number; // 10, 15, 20 Hz
  turboLockMode: boolean; // false = hold to turbo, true = tap to toggle lock
  hapticsEnabled: boolean;
  orientationMode: 'auto' | 'portrait' | 'landscape';
}

export const DEFAULT_GAMEPAD_CONFIG: MobileGamepadConfig = {
  movementType: 'dpad',
  showMovement: true,
  showActionButtons: true,
  showAutoButtons: true,
  showShoulders: true,
  showSystemButtons: true,
  showQuickTools: true,
  opacity: 85,
  scale: 'normal',
  turboRate: 15,
  turboLockMode: false,
  hapticsEnabled: true,
  orientationMode: 'auto',
};

interface MobileGamepadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MobileGamepadConfig;
  onChange: (updated: Partial<MobileGamepadConfig>) => void;
  onReset: () => void;
}

export const MobileGamepadSettingsModal: React.FC<MobileGamepadSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  onReset,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="w-full max-w-md bg-[#13151d] border border-[#494454]/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#494454]/40 flex items-center justify-between bg-[#191b26]">
          <div className="flex items-center gap-2 text-white font-mono text-sm font-bold">
            <span className="material-symbols-outlined text-[#4cd7f6] text-xl">tune</span>
            <span>Tùy chỉnh tay cầm cảm ứng</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#282a38] text-[#cbc3d7] hover:text-white flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs font-mono text-[#cbc3d7]">
          {/* Movement Control Option (D-Pad vs Joystick) */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Kiểu nút di chuyển (Movement Control)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onChange({ movementType: 'dpad' })}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  config.movementType === 'dpad'
                    ? 'bg-[#4cd7f6]/15 border-[#4cd7f6] text-[#4cd7f6] shadow-[0_0_12px_rgba(76,215,246,0.25)]'
                    : 'bg-[#1a1c26] border-[#494454]/40 hover:border-[#676176]'
                }`}
              >
                <span className="material-symbols-outlined text-2xl">drag_indicator</span>
                <span className="font-bold text-xs">D-Pad cổ điển</span>
                <span className="text-[10px] text-[#958ea0]">Phím 4 hướng chuẩn</span>
              </button>

              <button
                type="button"
                onClick={() => onChange({ movementType: 'joystick' })}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  config.movementType === 'joystick'
                    ? 'bg-[#4cd7f6]/15 border-[#4cd7f6] text-[#4cd7f6] shadow-[0_0_12px_rgba(76,215,246,0.25)]'
                    : 'bg-[#1a1c26] border-[#494454]/40 hover:border-[#676176]'
                }`}
              >
                <span className="material-symbols-outlined text-2xl">control_camera</span>
                <span className="font-bold text-xs">Cần xoay Joystick</span>
                <span className="text-[10px] text-[#958ea0]">Analog 360° đa hướng</span>
              </button>
            </div>
          </div>

          {/* Button Visibility Toggles */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Ẩn / Hiện các nút (Button Visibility)
            </label>
            <div className="bg-[#191b26] rounded-xl border border-[#494454]/30 divide-y divide-[#494454]/20 overflow-hidden">
              {/* Auto Buttons AutoA & AutoB */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ffb95f] text-base">bolt</span>
                  <div>
                    <div className="font-bold text-white text-xs">Nút bắn nhanh Auto-A & Auto-B</div>
                    <div className="text-[10px] text-[#958ea0]">Tự động nhấp phím liên thanh (Turbo)</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showAutoButtons}
                  onChange={(e) => onChange({ showAutoButtons: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>

              {/* Movement D-Pad / Joystick */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-base">sports_esports</span>
                  <div>
                    <div className="font-bold text-white text-xs">Cụm di chuyển (D-Pad / Joystick)</div>
                    <div className="text-[10px] text-[#958ea0]">Nút điều hướng bên trái</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showMovement}
                  onChange={(e) => onChange({ showMovement: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>

              {/* Action Buttons X, Y, A, B */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#d0bcff] text-base">radio_button_checked</span>
                  <div>
                    <div className="font-bold text-white text-xs">Nút thao tác chính (X, Y, A, B)</div>
                    <div className="text-[10px] text-[#958ea0]">Phím hành động bên phải</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showActionButtons}
                  onChange={(e) => onChange({ showActionButtons: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>

              {/* Shoulder Buttons L, R */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-base">swipe_vertical</span>
                  <div>
                    <div className="font-bold text-white text-xs">Nút vai (Triggers L & R)</div>
                    <div className="text-[10px] text-[#958ea0]">Phím L/R góc trên</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showShoulders}
                  onChange={(e) => onChange({ showShoulders: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>

              {/* System Buttons (Select & Start) */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#cbc3d7] text-base">smart_button</span>
                  <div>
                    <div className="font-bold text-white text-xs">Nút Select & Start</div>
                    <div className="text-[10px] text-[#958ea0]">Các phím menu hệ thống</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showSystemButtons}
                  onChange={(e) => onChange({ showSystemButtons: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>

              {/* Quick Tools */}
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-base">bookmark</span>
                  <div>
                    <div className="font-bold text-white text-xs">Thanh tiện ích nhanh (Quick Tools)</div>
                    <div className="text-[10px] text-[#958ea0]">Lưu nhanh, nạp nhanh, tua lại, tốc độ</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.showQuickTools}
                  onChange={(e) => onChange({ showQuickTools: e.target.checked })}
                  className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Auto-Fire Pulse Speed & Mode */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Tùy chọn bắn liên thanh (Auto-Fire / Turbo Settings)
            </label>
            <div className="bg-[#191b26] p-3 rounded-xl border border-[#494454]/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white text-xs">Tốc độ nhấp phím (Tần số Turbo):</span>
                <div className="flex items-center gap-1 bg-[#12131a] p-1 rounded-lg border border-[#494454]/40">
                  {[10, 15, 20].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => onChange({ turboRate: rate })}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        config.turboRate === rate
                          ? 'bg-[#ffb95f] text-[#2a1700] font-bold'
                          : 'text-[#958ea0] hover:text-white'
                      }`}
                    >
                      {rate}Hz
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#494454]/20">
                <div>
                  <div className="font-bold text-white text-xs">Chế độ khóa Auto-Fire</div>
                  <div className="text-[10px] text-[#958ea0]">
                    {config.turboLockMode ? 'Chạm một lần để khóa bắn liên tục' : 'Giữ ngón tay để bắn liên thanh'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.turboLockMode}
                  onChange={(e) => onChange({ turboLockMode: e.target.checked })}
                  className="w-4 h-4 accent-[#ffb95f] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Opacity & Scale */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
                Độ mờ đục (Opacity): <span className="text-[#4cd7f6] font-bold">{config.opacity}%</span>
              </label>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={config.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="w-full h-1.5 accent-[#4cd7f6] bg-[#282a38] rounded cursor-pointer"
            />

            <div className="flex items-center justify-between pt-2">
              <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
                Kích thước nút (Scale)
              </label>
              <div className="flex items-center gap-1.5 bg-[#191b26] p-1 rounded-lg border border-[#494454]/30">
                {(['compact', 'normal', 'large'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => onChange({ scale: sc })}
                    className={`px-2.5 py-1 rounded text-[11px] uppercase transition-colors ${
                      config.scale === sc
                        ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                        : 'text-[#958ea0] hover:text-white'
                    }`}
                  >
                    {sc === 'compact' ? 'Nhỏ' : sc === 'normal' ? 'Chuẩn' : 'Lớn'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#494454]/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-base">vibration</span>
                <span className="text-white text-xs">Rung phản hồi (Haptic Touch)</span>
              </div>
              <input
                type="checkbox"
                checked={config.hapticsEnabled}
                onChange={(e) => onChange({ hapticsEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#4cd7f6] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#191b26] border-t border-[#494454]/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-[#958ea0] hover:text-white hover:bg-[#282a38] transition-colors text-xs font-mono"
          >
            Mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold font-mono text-xs transition-colors shadow-md"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
