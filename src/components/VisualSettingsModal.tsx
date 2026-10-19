import React from 'react';

export type DisplayFilterType = 'CRT Scanlines' | 'Pixelated' | 'LCD Grid' | 'Bilinear Smooth';
export type AspectRatioType = '4:3' | '8:7' | '16:9' | '1:1';
export type ColorTintType = 'neutral' | 'warm-crt' | 'cool-trinitron' | 'dmg-green';

export interface VisualSettingsConfig {
  filter: DisplayFilterType;
  filterIntensity: number; // 20 to 100
  enableCurvature: boolean;
  enableBloom: boolean;
  aspectRatio: AspectRatioType;
  colorTint: ColorTintType;
}

interface VisualSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VisualSettingsConfig;
  onChange: (updated: Partial<VisualSettingsConfig>) => void;
  onReset: () => void;
}

export const VisualSettingsModal: React.FC<VisualSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  onReset
}) => {
  if (!isOpen) return null;

  const filtersList: {
    id: DisplayFilterType;
    label: string;
    description: string;
    icon: string;
    badge: string;
    previewBg: string;
  }[] = [
    {
      id: 'CRT Scanlines',
      label: 'CRT Scanlines',
      description: 'Authentic 90s cathode ray tube with horizontal phosphor scanlines & RGB triad matrix.',
      icon: 'tv',
      badge: 'RECOMMENDED',
      previewBg: 'filter-crt-scanlines'
    },
    {
      id: 'Pixelated',
      label: 'Pixelated',
      description: 'Raw nearest-neighbor integer scaling with razor-sharp edges and zero blur.',
      icon: 'grid_on',
      badge: 'RAW PIXEL',
      previewBg: 'filter-pixelated'
    },
    {
      id: 'LCD Grid',
      label: 'LCD Grid',
      description: 'Handheld reflective dot-matrix LCD grid with visible subpixel borders.',
      icon: 'stay_current_portrait',
      badge: 'HANDHELD',
      previewBg: 'filter-lcd-grid'
    },
    {
      id: 'Bilinear Smooth',
      label: 'Bilinear Smooth',
      description: 'Soft 90s composite video interpolation with gentle edge antialiasing.',
      icon: 'blur_on',
      badge: 'SMOOTH',
      previewBg: 'opacity-40 crt-overlay'
    }
  ];

  const aspectRatios: { id: AspectRatioType; label: string; desc: string }[] = [
    { id: '4:3', label: '4:3 Standard', desc: 'Original CRT Broadcast Aspect' },
    { id: '8:7', label: '8:7 Native PAR', desc: 'SNES Internal Pixel Aspect Ratio' },
    { id: '16:9', label: '16:9 Stretch', desc: 'Full Widescreen Expansion' },
    { id: '1:1', label: '1:1 Square', desc: 'Exact Square Pixels' }
  ];

  const colorTints: { id: ColorTintType; label: string; colorDot: string }[] = [
    { id: 'neutral', label: 'Standard RGB (Neutral)', colorDot: 'bg-zinc-200' },
    { id: 'warm-crt', label: 'Warm 90s Tube (D65)', colorDot: 'bg-amber-400' },
    { id: 'cool-trinitron', label: 'Sony Trinitron (9300K)', colorDot: 'bg-cyan-400' },
    { id: 'dmg-green', label: 'Game Boy DMG (Pea Soup)', colorDot: 'bg-lime-500' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none">
      <div
        className="w-full max-w-2xl bg-[#13151b] border border-[#494454]/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#191b24] border-b border-[#494454]/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/40 flex items-center justify-center text-[#4cd7f6] glow-cyan">
              <span className="material-symbols-outlined text-xl">tune</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Display & Visual Settings
                <span className="px-2 py-0.5 rounded-full bg-[#a078ff]/20 border border-[#a078ff]/40 text-[#d0bcff] font-mono text-[10px]">
                  Realtime Overlays
                </span>
              </h2>
              <p className="text-xs text-[#958ea0] font-mono">
                Select visual shaders and adjust hardware CRT / LCD reproduction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Main Display Filter (CRT Scanlines, Pixelated, LCD Grid) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-[#d0bcff] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">display_settings</span>
                Display Filter Preset
              </label>
              <span className="text-[11px] font-mono text-[#958ea0]">
                Active: <span className="text-[#4cd7f6] font-bold">{settings.filter}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtersList.map((f) => {
                const isSelected = settings.filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => onChange({ filter: f.id })}
                    className={`relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between group overflow-hidden ${
                      isSelected
                        ? 'bg-[#1e202b] border-[#4cd7f6] ring-1 ring-[#4cd7f6]/60 shadow-lg glow-cyan'
                        : 'bg-[#181a22] border-[#494454]/40 hover:border-[#494454] hover:bg-[#1e2029]'
                    }`}
                  >
                    {/* Visual miniature banner representing the filter */}
                    <div className="relative w-full h-12 rounded-lg bg-black/80 border border-[#494454]/40 mb-2.5 overflow-hidden flex items-center justify-center">
                      <div className="font-mono text-[10px] text-zinc-400 z-10 flex items-center gap-1">
                        <span className="text-emerald-400 font-bold">16-BIT</span>
                        <span className="text-zinc-600">•</span>
                        <span>256x224</span>
                      </div>
                      {/* Overlay preview on miniature */}
                      {f.id === 'CRT Scanlines' && (
                        <div className="absolute inset-0 filter-crt-scanlines opacity-75 pointer-events-none" />
                      )}
                      {f.id === 'LCD Grid' && (
                        <div className="absolute inset-0 filter-lcd-grid opacity-90 pointer-events-none" />
                      )}
                      {f.id === 'Bilinear Smooth' && (
                        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[0.5px] pointer-events-none" />
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-[#4cd7f6]">{f.icon}</span>
                        {f.label}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-[#4cd7f6]/20 text-[#4cd7f6] font-bold border border-[#4cd7f6]/40'
                            : 'bg-[#282a30] text-[#958ea0]'
                        }`}
                      >
                        {f.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#958ea0] mt-1 line-clamp-2 leading-relaxed">
                      {f.description}
                    </p>

                    {isSelected && (
                      <div className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full bg-[#4cd7f6] text-black">
                        <span className="material-symbols-outlined text-xs font-black">check</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Filter Intensity & Enhancements */}
          <div className="p-4 rounded-xl bg-[#181a22] border border-[#494454]/40 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#d0bcff] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#4cd7f6]">sliders</span>
              Filter Fine-Tuning & CRT Geometry
            </h3>

            {/* Filter Intensity Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="text-[#cbc3d7]">Overlay Intensity</span>
                <span className="text-[#4cd7f6] font-bold">{settings.filterIntensity}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={settings.filterIntensity}
                onChange={(e) => onChange({ filterIntensity: Number(e.target.value) })}
                className="w-full h-1.5 bg-[#282a30] rounded-lg appearance-none cursor-pointer accent-[#4cd7f6]"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#958ea0] mt-1">
                <span>Subtle (20%)</span>
                <span>Balanced (60%)</span>
                <span>Heavy Vintage (100%)</span>
              </div>
            </div>

            {/* Toggles: Curvature & Bloom */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#494454]/30">
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#12141a] border border-[#494454]/30 cursor-pointer hover:border-[#4cd7f6]/50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-[#4cd7f6]">panorama_fish_eye</span>
                  <div>
                    <div className="text-xs font-bold text-white">CRT Curvature</div>
                    <div className="text-[10px] text-[#958ea0]">Curved glass tube shadow</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableCurvature}
                  onChange={(e) => onChange({ enableCurvature: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#282a30] border-[#494454] text-[#4cd7f6] accent-[#4cd7f6] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#12141a] border border-[#494454]/30 cursor-pointer hover:border-[#4cd7f6]/50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-[#d0bcff]">flare</span>
                  <div>
                    <div className="text-xs font-bold text-white">Phosphor Bloom</div>
                    <div className="text-[10px] text-[#958ea0]">CRT ambient radiant glow</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableBloom}
                  onChange={(e) => onChange({ enableBloom: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#282a30] border-[#494454] text-[#4cd7f6] accent-[#4cd7f6] cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Section 3: Aspect Ratio Selection */}
          <div>
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-[#d0bcff] flex items-center gap-1.5 mb-2.5">
              <span className="material-symbols-outlined text-sm text-[#4cd7f6]">aspect_ratio</span>
              Screen Aspect Ratio
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {aspectRatios.map((ar) => (
                <button
                  key={ar.id}
                  onClick={() => onChange({ aspectRatio: ar.id })}
                  className={`p-2.5 rounded-xl border text-center font-mono text-xs transition-all ${
                    settings.aspectRatio === ar.id
                      ? 'bg-[#1e202b] border-[#4cd7f6] text-[#4cd7f6] font-bold shadow-sm'
                      : 'bg-[#181a22] border-[#494454]/40 text-[#cbc3d7] hover:text-white hover:border-[#494454]'
                  }`}
                >
                  <div className="text-sm font-bold">{ar.label}</div>
                  <div className="text-[9px] text-[#958ea0] mt-0.5 truncate">{ar.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Color Temperature Profile */}
          <div>
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-[#d0bcff] flex items-center gap-1.5 mb-2.5">
              <span className="material-symbols-outlined text-sm text-[#4cd7f6]">palette</span>
              Color Temperature & Phosphor Tint
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {colorTints.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => onChange({ colorTint: ct.id })}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 text-xs font-mono transition-all ${
                    settings.colorTint === ct.id
                      ? 'bg-[#1e202b] border-[#4cd7f6] text-white shadow-sm'
                      : 'bg-[#181a22] border-[#494454]/40 text-[#cbc3d7] hover:text-white'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${ct.colorDot} shadow-sm flex-shrink-0`}></span>
                  <span className="truncate">{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#191b24] border-t border-[#494454]/40 flex items-center justify-between">
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Reset Defaults
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#38bada] text-[#003640] font-bold font-mono text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm font-bold">check</span>
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
