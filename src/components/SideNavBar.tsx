import React, { useRef } from 'react';
import { parseRom } from '../emulator/romParser';
import { Game } from '../types';
import { getCartridgeCoverArt } from '../services/games/libraryStore';
import { gamepadService } from '../services/input/gamepadService';

interface SideNavBarProps {
  currentTab: string;
  onNavigate: (tab: string, param?: string) => void;
  favoriteCount: number;
  totalGameCount: number;
  saveCount: number;
  onCustomRomLoaded?: (game: Game, romData: Uint8Array) => void;
}

export const SideNavBar: React.FC<SideNavBarProps> = ({
  currentTab,
  onNavigate,
  favoriteCount,
  totalGameCount,
  saveCount,
  onCustomRomLoaded
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processRomFile(file);
  };

  const processRomFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        const header = parseRom(file.name, reader.result);
        const customGame: Game = {
          id: `custom-${Date.now()}`,
          title: header.internalTitle,
          platform: header.platform === 'UNKNOWN' ? 'NES' : header.platform,
          year: 1995,
          developer: 'Custom Cartridge',
          genre: 'Action / Custom ROM',
          rating: 5.0,
          ratingCount: 1,
          boxArt: getCartridgeCoverArt(header.internalTitle || file.name, header.platform),
          description: `Loaded from local file: ${file.name}. Header: ${header.romSpeedAndType}, Checksum: ${header.crc32}`,
          features: ['Battery SRAM', 'Save State Ready', header.coProcessor],
          batterySave: header.hasBattery,
          sramSize: header.sramSize,
          nativeResolution: header.platform === 'GBA' ? '240 × 160 px' : '256 × 224 px',
          aspectRatio: header.platform === 'GBA' ? '3:2' : '4:3',
          framerate: 60.0,
          multiplayer: { supported: false, type: 'Single Player', maxPlayers: 1 },
          recommendedCore: header.platform === 'GBA' ? 'mGBA v0.10.2' : header.platform === 'NES' ? 'Nestopia UE v1.52' : 'Snes9x 2010',
          compatibility: 100,
          crc32: header.crc32,
          md5: header.md5
        };

        if (onCustomRomLoaded) {
          onCustomRomLoaded(customGame, new Uint8Array(reader.result));
        } else {
          onNavigate('play', customGame.id);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processRomFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <aside className="fixed top-16 left-0 h-[calc(100vh-4rem)] w-64 z-30 bg-[#191b22] border-r border-[#494454]/30 shadow-xl shadow-[#0c0e14]/50 flex flex-col justify-between p-4 overflow-y-auto select-none">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".nes,.sfc,.smc,.gba,.zip"
        className="hidden"
      />

      {/* Top Rail Navigation */}
      <div className="flex flex-col gap-4">
        {/* Rail Branding Sub-Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#494454]/20">
          <div>
            <div className="text-base text-[#d0bcff] font-bold">RetroVerse</div>
            <div className="font-mono text-[10px] text-[#958ea0] tracking-wider">V2.4 EMULATOR</div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-[#4cd7f6] bg-[#4cd7f6]/10 border border-[#4cd7f6]/20">
            READY
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-col gap-1">
          {/* Library */}
          <button
            onClick={() => onNavigate('browse')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'browse' || currentTab === 'library'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg fill-icon">sports_esports</span>
            <span className="flex-1">Library</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e1f26] text-[#4cd7f6] font-mono">
              {totalGameCount}
            </span>
          </button>

          {/* Favorites */}
          <button
            onClick={() => onNavigate('favorites')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'favorites'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">star</span>
            <span className="flex-1">Favorites</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#282a30] text-[#958ea0] font-mono">
              {favoriteCount}
            </span>
          </button>

          {/* Saved Games */}
          <button
            onClick={() => onNavigate('saves')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'saves'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">cloud_download</span>
            <span className="flex-1">Saved Games</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#282a30] text-[#4cd7f6] font-mono">
              {saveCount}
            </span>
          </button>

          {/* Multiplayer */}
          <button
            onClick={() => onNavigate('rooms')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'rooms'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="flex-1">Multiplayer</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4cd7f6] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4cd7f6]"></span>
            </span>
          </button>

          {/* ROM Vault */}
          <button
            onClick={() => onNavigate('vault')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'vault'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">folder_zip</span>
            <span className="flex-1">ROM Vault</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => onNavigate('settings')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'settings'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">tune</span>
            <span className="flex-1">Settings</span>
          </button>

          {/* User Profile */}
          <button
            onClick={() => onNavigate('profile')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-all text-left ${
              currentTab === 'profile'
                ? 'bg-[#33343b] text-[#4cd7f6] border-l-2 border-[#4cd7f6] shadow-sm font-semibold'
                : 'text-[#cbc3d7] hover:bg-[#282a30]/60 hover:text-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-lg">military_tech</span>
            <span className="flex-1">Rank & Profile</span>
          </button>
        </nav>

        {/* Dual CTA: Local Machine / Google Drive ROM */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => onNavigate('vault', 'local')}
            className="w-full py-2 px-3 rounded-lg bg-[#a078ff] hover:bg-[#a078ff]/90 text-[#340080] font-mono text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#a078ff]/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">computer</span>
            <span>Import from Machine</span>
          </button>

          <button
            onClick={() => onNavigate('vault', 'drive')}
            className="w-full py-2 px-3 rounded-lg bg-[#111319] hover:bg-[#1e1f26] border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">cloud_sync</span>
            <span>Google Drive ROMs</span>
          </button>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="p-3 border border-dashed border-[#494454]/60 rounded-xl bg-[#1e1f26]/40 flex flex-col items-center justify-center text-center group hover:border-[#4cd7f6]/60 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[#958ea0] group-hover:text-[#4cd7f6] transition-colors text-2xl mb-1">
            upload_file
          </span>
          <span className="font-mono text-[11px] text-[#cbc3d7] font-medium">Drag &amp; Drop ROMs</span>
          <span className="font-mono text-[9px] text-[#958ea0] mt-0.5">.nes, .sfc, .gba, .zip</span>
        </div>
      </div>

      {/* Bottom Status & Peripherals Card */}
      <div className="flex flex-col gap-3 pt-3 border-t border-[#494454]/30">
        {/* Controller Hardware Indicator */}
        <div className="p-2.5 rounded-lg bg-[#1e1f26] border border-[#494454]/40 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#33343b] flex items-center justify-center text-[#e2e2eb]">
            <span className="material-symbols-outlined text-sm">gamepad</span>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="font-mono text-[11px] text-[#e2e2eb] font-semibold truncate">
              {gamepadService.getPrimaryController()?.id || 'Bàn phím & Cảm ứng'}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${gamepadService.getPrimaryController() ? 'bg-emerald-400' : 'bg-[#958ea0]'}`}></span>
              <span className="font-mono text-[9px] text-[#958ea0]">
                {gamepadService.getPrimaryController() ? 'Tay cầm đã kết nối' : 'Phím ảo / Bàn phím'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Mini-Links */}
        <div className="flex items-center justify-between text-[#958ea0] text-[11px] font-mono px-1">
          <button
            onClick={() => onNavigate('saves')}
            className="flex items-center gap-1 hover:text-[#4cd7f6] transition-colors"
          >
            <span className="material-symbols-outlined text-xs">cloud_sync</span>
            Cloud Sync
          </button>
          <button
            onClick={() => onNavigate('vault')}
            className="flex items-center gap-1 hover:text-[#4cd7f6] transition-colors"
          >
            <span className="material-symbols-outlined text-xs">menu_book</span>
            Docs
          </button>
        </div>
      </div>
    </aside>
  );
};
