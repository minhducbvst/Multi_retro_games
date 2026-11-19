import React, { useRef } from 'react';

export type HapticIntensityMode = 'off' | 'light' | 'medium' | 'strong' | 'heartbeat';

export interface TouchLayoutOffsets {
  dpadOffsetX: number; // -120 to +120 px
  dpadOffsetY: number; // -100 to +100 px
  dpadScale: number; // 0.70 to 1.50
  actionOffsetX: number; // -120 to +120 px
  actionOffsetY: number; // -100 to +100 px
  actionScale: number; // 0.70 to 1.50
  systemScale?: number; // 0.75 to 1.40
}

export const DEFAULT_TOUCH_OFFSETS: TouchLayoutOffsets = {
  dpadOffsetX: 0,
  dpadOffsetY: 0,
  dpadScale: 1.0,
  actionOffsetX: 0,
  actionOffsetY: 0,
  actionScale: 1.0,
  systemScale: 1.0,
};

export interface MobileGamepadConfig {
  movementType: 'dpad' | 'joystick';
  showMovement: boolean;
  showActionButtons: boolean;
  showAutoButtons: boolean;
  showShoulders: boolean;
  showSystemButtons: boolean;
  showQuickTools: boolean;
  showMacroBar: boolean;
  opacity: number; // 20 - 100
  scale: 'compact' | 'normal' | 'large';
  buttonScale?: number; // 0.70 to 1.50 overall control scale
  turboRate: number; // 10, 15, 20, 30, 60 Hz
  turboLockMode: boolean; // false = hold to turbo, true = tap to toggle lock
  hapticsEnabled: boolean;
  hapticIntensity: HapticIntensityMode;
  soundEnabled: boolean;
  orientationMode: 'auto' | 'portrait' | 'landscape';
  touchOffsets: TouchLayoutOffsets;
}

export const DEFAULT_GAMEPAD_CONFIG: MobileGamepadConfig = {
  movementType: 'dpad',
  showMovement: true,
  showActionButtons: true,
  showAutoButtons: true,
  showShoulders: true,
  showSystemButtons: true,
  showQuickTools: true,
  showMacroBar: true,
  opacity: 85,
  scale: 'normal',
  buttonScale: 1.0,
  turboRate: 20,
  turboLockMode: false,
  hapticsEnabled: true,
  hapticIntensity: 'medium',
  soundEnabled: false,
  orientationMode: 'auto',
  touchOffsets: { ...DEFAULT_TOUCH_OFFSETS },
};

interface MobileGamepadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MobileGamepadConfig;
  onChange: (updated: Partial<MobileGamepadConfig>) => void;
  onReset: () => void;
  isVirtualRotated?: boolean;
  rotationAngleDeg?: number;
}

interface SwitchToggleRowProps {
  icon: string;
  iconColorClass: string;
  title: string;
  subtitle: string;
  checked: boolean;
  accentColor?: 'cyan' | 'amber' | 'violet';
  onToggle: (next: boolean) => void;
}

const SwitchToggleRow: React.FC<SwitchToggleRowProps> = ({
  icon,
  iconColorClass,
  title,
  subtitle,
  checked,
  accentColor = 'cyan',
  onToggle,
}) => {
  const activeTrackClass =
    accentColor === 'amber'
      ? 'bg-[#ffb95f] border-[#ffd699]'
      : accentColor === 'violet'
      ? 'bg-[#d0bcff] border-[#e8ddff]'
      : 'bg-[#4cd7f6] border-[#9beeff]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(!checked);
      }}
      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors cursor-pointer touch-manipulation"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`material-symbols-outlined text-base shrink-0 ${iconColorClass}`}>{icon}</span>
        <div className="min-w-0">
          <div className="font-bold text-white text-xs">{title}</div>
          <div className="text-[10px] text-[#958ea0] leading-snug">{subtitle}</div>
        </div>
      </div>

      <span
        className={`relative inline-flex items-center shrink-0 w-11 h-6 rounded-full border transition-colors ${
          checked ? activeTrackClass : 'bg-[#262837] border-[#494454]/70'
        }`}
      >
        <span
          className={`inline-block w-4.5 h-4.5 rounded-full shadow-md transition-transform ${
            checked ? 'translate-x-5.5 bg-[#0e1118]' : 'translate-x-0.5 bg-[#958ea0]'
          }`}
        />
      </span>
    </button>
  );
};

export const MobileGamepadSettingsModal: React.FC<MobileGamepadSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  onReset,
  isVirtualRotated = false,
  rotationAngleDeg = 90,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchDragRef = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef<boolean>(false);

  if (!isOpen) return null;

  const overallScale =
    typeof config.buttonScale === 'number'
      ? config.buttonScale
      : config.scale === 'compact'
      ? 0.85
      : config.scale === 'large'
      ? 1.2
      : 1.0;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none pointer-events-auto touch-manipulation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#13151d] border border-[#494454]/60 rounded-2xl shadow-2xl flex flex-col max-h-[88%] overflow-hidden pointer-events-auto"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#494454]/40 flex items-center justify-between bg-[#191b26] shrink-0">
          <div className="flex items-center gap-2 text-white font-mono text-sm font-bold">
            <span className="material-symbols-outlined text-[#4cd7f6] text-xl">tune</span>
            <span>Tùy chỉnh tay cầm cảm ứng</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#282a38] text-[#cbc3d7] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollRef}
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: isVirtualRotated ? 'none' : 'pan-y',
          }}
          onTouchStart={(e) => {
            if (!isVirtualRotated) return;
            const target = e.target as HTMLElement | null;
            if (target?.tagName === 'INPUT') return;
            const t = e.touches[0];
            if (t) {
              touchDragRef.current = { lastX: t.clientX, lastY: t.clientY, moved: false };
              suppressClickRef.current = false;
            }
          }}
          onTouchMove={(e) => {
            if (!isVirtualRotated) return;
            const st = touchDragRef.current;
            const el = scrollRef.current;
            const t = e.touches[0];
            if (!st || !el || !t) return;
            const dx = t.clientX - st.lastX;
            const deltaLocalY = rotationAngleDeg === -90 ? -dx : dx;
            if (Math.abs(deltaLocalY) > 2) {
              st.moved = true;
              suppressClickRef.current = true;
            }
            if (deltaLocalY !== 0) {
              el.scrollTop += deltaLocalY;
            }
            st.lastX = t.clientX;
            st.lastY = t.clientY;
          }}
          onTouchEnd={() => {
            if (touchDragRef.current?.moved) {
              setTimeout(() => {
                suppressClickRef.current = false;
              }, 120);
            }
            touchDragRef.current = null;
          }}
          onClickCapture={(e) => {
            if (suppressClickRef.current) {
              e.preventDefault();
              e.stopPropagation();
              suppressClickRef.current = false;
            }
          }}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5 text-xs font-mono text-[#cbc3d7]"
        >
          {/* Movement Control Option (D-Pad vs Joystick) */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Kiểu nút di chuyển (Movement Control)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onChange({ movementType: 'dpad' })}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
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
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
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

          {/* Button Size Controls (Prominent Control Key Sizing) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">photo_size_select_large</span>
                <span>Kích thước phím điều khiển</span>
              </label>
              <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/15 border border-[#4cd7f6]/40 text-[#4cd7f6] font-bold text-[11px] tabular-nums">
                {Math.round(overallScale * 100)}%
              </span>
            </div>

            <div className="bg-[#191b26] p-3.5 rounded-xl border border-[#4cd7f6]/30 space-y-3">
              {/* Overall Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white font-bold">Kích cỡ tổng thể tất cả phím</span>
                  <span className="text-[#4cd7f6] font-bold tabular-nums">{Math.round(overallScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={overallScale}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChange({
                      buttonScale: val,
                      scale: val <= 0.9 ? 'compact' : val >= 1.15 ? 'large' : 'normal',
                    });
                  }}
                  className="w-full h-1.5 accent-[#4cd7f6] bg-[#282a38] rounded cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[
                    { label: 'Nhỏ 80%', val: 0.8, key: 'compact' as const },
                    { label: 'Chuẩn 100%', val: 1.0, key: 'normal' as const },
                    { label: 'Lớn 120%', val: 1.2, key: 'large' as const },
                    { label: 'Đại 140%', val: 1.4, key: 'large' as const },
                  ].map((preset) => {
                    const isActive = Math.abs(overallScale - preset.val) < 0.03;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          onChange({
                            buttonScale: preset.val,
                            scale: preset.key,
                          })
                        }
                        className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#4cd7f6] text-[#003641]'
                            : 'bg-[#252837] text-[#cbc3d7] hover:text-white border border-[#494454]/40'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-group Individual Sizes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#494454]/25">
                <div>
                  <div className="flex justify-between text-[10px] text-[#958ea0] mb-1">
                    <span>D-Pad / Stick</span>
                    <span className="text-[#4cd7f6] font-bold tabular-nums">
                      {Math.round((config.touchOffsets?.dpadScale || 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={config.touchOffsets?.dpadScale || 1.0}
                    onChange={(e) =>
                      onChange({
                        touchOffsets: {
                          ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                          dpadScale: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1 accent-[#4cd7f6] bg-[#282a38] rounded cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-[#958ea0] mb-1">
                    <span>Nút B / A / X / Y</span>
                    <span className="text-[#ffb95f] font-bold tabular-nums">
                      {Math.round((config.touchOffsets?.actionScale || 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={config.touchOffsets?.actionScale || 1.0}
                    onChange={(e) =>
                      onChange({
                        touchOffsets: {
                          ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                          actionScale: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1 accent-[#ffb95f] bg-[#282a38] rounded cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-[#958ea0] mb-1">
                    <span>Select / Start / L-R</span>
                    <span className="text-[#d0bcff] font-bold tabular-nums">
                      {Math.round((config.touchOffsets?.systemScale || 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={config.touchOffsets?.systemScale || 1.0}
                    onChange={(e) =>
                      onChange({
                        touchOffsets: {
                          ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                          systemScale: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1 accent-[#d0bcff] bg-[#282a38] rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Button Visibility Toggles */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Ẩn / Hiện các nút (Button Visibility)
            </label>
            <div className="bg-[#191b26] rounded-xl border border-[#494454]/30 divide-y divide-[#494454]/20 overflow-hidden">
              <SwitchToggleRow
                icon="bolt"
                iconColorClass="text-[#ffb95f]"
                title="Nút bắn nhanh Auto-A & Auto-B"
                subtitle="Tự động nhấp phím liên thanh (Turbo)"
                checked={config.showAutoButtons}
                accentColor="amber"
                onToggle={(v) => onChange({ showAutoButtons: v })}
              />
              <SwitchToggleRow
                icon="sports_esports"
                iconColorClass="text-[#4cd7f6]"
                title="Cụm di chuyển (D-Pad / Joystick)"
                subtitle="Nút điều hướng bên trái"
                checked={config.showMovement}
                onToggle={(v) => onChange({ showMovement: v })}
              />
              <SwitchToggleRow
                icon="radio_button_checked"
                iconColorClass="text-[#d0bcff]"
                title="Nút thao tác chính (X, Y, A, B)"
                subtitle="Phím hành động bên phải"
                checked={config.showActionButtons}
                onToggle={(v) => onChange({ showActionButtons: v })}
              />
              <SwitchToggleRow
                icon="swipe_vertical"
                iconColorClass="text-[#4cd7f6]"
                title="Nút vai (Triggers L & R)"
                subtitle="Phím L/R góc trên"
                checked={config.showShoulders}
                onToggle={(v) => onChange({ showShoulders: v })}
              />
              <SwitchToggleRow
                icon="smart_button"
                iconColorClass="text-[#cbc3d7]"
                title="Nút Select & Start"
                subtitle="Các phím menu hệ thống"
                checked={config.showSystemButtons}
                onToggle={(v) => onChange({ showSystemButtons: v })}
              />
              <SwitchToggleRow
                icon="bookmark"
                iconColorClass="text-emerald-400"
                title="Thanh tiện ích nhanh (Quick Tools)"
                subtitle="Lưu nhanh, nạp nhanh, tua lại, tốc độ"
                checked={config.showQuickTools}
                onToggle={(v) => onChange({ showQuickTools: v })}
              />
              <SwitchToggleRow
                icon="sports_mma"
                iconColorClass="text-rose-400"
                title="Thanh chiêu thức Macro (Combo Bar)"
                subtitle="Hadouken, Shoryuken, Sonic Spin Dash, Konami 30 mạng"
                checked={config.showMacroBar}
                onToggle={(v) => onChange({ showMacroBar: v })}
              />
            </div>
          </div>

          {/* Auto-Fire Pulse Speed & Mode */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#958ea0] font-bold">
              Tùy chọn bắn liên thanh (Auto-Fire / Turbo Settings)
            </label>
            <div className="bg-[#191b26] rounded-xl border border-[#494454]/30 overflow-hidden">
              <div className="p-3 flex items-center justify-between gap-2">
                <span className="text-white text-xs">Tần số Turbo:</span>
                <div className="flex items-center gap-1 bg-[#12131a] p-1 rounded-lg border border-[#494454]/40 flex-wrap">
                  {[10, 15, 20, 30, 60].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => onChange({ turboRate: rate })}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
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

              <div className="border-t border-[#494454]/20">
                <SwitchToggleRow
                  icon={config.turboLockMode ? 'lock' : 'touch_app'}
                  iconColorClass={config.turboLockMode ? 'text-[#ffb95f]' : 'text-[#958ea0]'}
                  title="Chế độ khóa Auto-Fire"
                  subtitle={
                    config.turboLockMode
                      ? 'Đang BẬT — Chạm 1 lần để khóa bắn liên tục, chạm lại để tắt'
                      : 'Đang TẮT — Giữ ngón tay vào nút Auto để bắn liên thanh'
                  }
                  checked={Boolean(config.turboLockMode)}
                  accentColor="amber"
                  onToggle={(v) => onChange({ turboLockMode: v })}
                />
              </div>
            </div>
          </div>

          {/* Opacity */}
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

            {/* Haptic Intensity Modes */}
            <div className="space-y-2 pt-2 border-t border-[#494454]/20">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-base">vibration</span>
                  <span className="text-white text-xs">Cường độ rung (Haptics)</span>
                </div>
                <div className="flex items-center gap-1 bg-[#12131a] p-1 rounded-lg border border-[#494454]/40">
                  {(
                    [
                      { id: 'off', label: 'Tắt' },
                      { id: 'light', label: 'Nhẹ' },
                      { id: 'medium', label: 'Vừa' },
                      { id: 'strong', label: 'Mạnh' },
                      { id: 'heartbeat', label: 'Nhịp đập' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          hapticIntensity: m.id,
                          hapticsEnabled: m.id !== 'off',
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                        config.hapticIntensity === m.id
                          ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                          : 'text-[#958ea0] hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Retro 8-bit Sound Effects */}
            <div className="bg-[#191b26] rounded-xl border border-[#494454]/30 overflow-hidden">
              <SwitchToggleRow
                icon="volume_up"
                iconColorClass="text-[#d0bcff]"
                title="Âm thanh bấm phím 8-bit (Sound FX)"
                subtitle="Tiếng click và fan-fare hoài niệm cổ điển"
                checked={config.soundEnabled}
                accentColor="violet"
                onToggle={(v) => onChange({ soundEnabled: v })}
              />
            </div>

            {/* Custom Layout Offsets */}
            <div className="p-3 bg-[#191b26] rounded-xl border border-[#4cd7f6]/30 space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4cd7f6]">
                  <span className="material-symbols-outlined text-base">open_with</span>
                  <span>Căn chỉnh vị trí cụm phím</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      buttonScale: 1.0,
                      scale: 'normal',
                      touchOffsets: { ...DEFAULT_TOUCH_OFFSETS },
                    })
                  }
                  className="text-[10px] text-[#958ea0] hover:text-white px-2 py-0.5 rounded bg-[#282a38] transition-colors cursor-pointer"
                >
                  Đặt lại vị trí &amp; cỡ
                </button>
              </div>

              {/* D-Pad Horizontal & Vertical Offset */}
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between text-[#cbc3d7]">
                  <span>Vị trí D-Pad / Cần di chuyển (Ngang: {config.touchOffsets?.dpadOffsetX || 0}px, Dọc: {config.touchOffsets?.dpadOffsetY || 0}px)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-[#958ea0]">Ngang (X)</span>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      value={config.touchOffsets?.dpadOffsetX || 0}
                      onChange={(e) =>
                        onChange({
                          touchOffsets: {
                            ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                            dpadOffsetX: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-1 accent-[#4cd7f6] bg-[#282a38] rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#958ea0]">Dọc (Y)</span>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      value={config.touchOffsets?.dpadOffsetY || 0}
                      onChange={(e) =>
                        onChange({
                          touchOffsets: {
                            ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                            dpadOffsetY: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-1 accent-[#4cd7f6] bg-[#282a38] rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Action Cluster Horizontal & Vertical Offset */}
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between text-[#cbc3d7]">
                  <span>Vị trí Cụm nút bấm A/B/X/Y (Ngang: {config.touchOffsets?.actionOffsetX || 0}px, Dọc: {config.touchOffsets?.actionOffsetY || 0}px)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-[#958ea0]">Ngang (X)</span>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      value={config.touchOffsets?.actionOffsetX || 0}
                      onChange={(e) =>
                        onChange({
                          touchOffsets: {
                            ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                            actionOffsetX: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-1 accent-[#ffb95f] bg-[#282a38] rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#958ea0]">Dọc (Y)</span>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      value={config.touchOffsets?.actionOffsetY || 0}
                      onChange={(e) =>
                        onChange({
                          touchOffsets: {
                            ...(config.touchOffsets || DEFAULT_TOUCH_OFFSETS),
                            actionOffsetY: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full h-1 accent-[#ffb95f] bg-[#282a38] rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#191b26] border-t border-[#494454]/40 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-[#958ea0] hover:text-white hover:bg-[#282a38] transition-colors text-xs font-mono cursor-pointer"
          >
            Mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold font-mono text-xs transition-colors shadow-md cursor-pointer"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};

