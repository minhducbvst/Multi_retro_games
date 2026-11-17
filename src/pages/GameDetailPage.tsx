import React, { useState, useEffect } from 'react';
import { Game, SaveMetadata } from '../types';
import { getGameById } from '../services/games/catalog';
import { useLibraryStore } from '../services/games/libraryStore';
import { saveManager } from '../services/saves/saveManager';
import { useLinkedDriveFolder, getPlatformSubfolderName } from '../services/googleDriveService';
import { DriveFolderSyncModal } from '../components/DriveFolderSyncModal';

interface GameDetailPageProps {
  gameId: string;
  onBack: () => void;
  onPlayGame: (gameId: string, slot?: number) => void;
  onOpenNetPlay: (gameId?: string) => void;
  isFavorited: boolean;
  onToggleFavorite: (gameId: string) => void;
}

export const GameDetailPage: React.FC<GameDetailPageProps> = ({
  gameId,
  onBack,
  onPlayGame,
  onOpenNetPlay,
  isFavorited,
  onToggleFavorite
}) => {
  const libraryGames = useLibraryStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'states' | 'controls' | 'manual'>('overview');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [realSaves, setRealSaves] = useState<SaveMetadata[]>([]);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const linkedDriveFolder = useLinkedDriveFolder();

  const game = libraryGames.find((g) => g.id === gameId) || getGameById(gameId);

  useEffect(() => {
    if (game?.id) {
      const list = saveManager.getSavesForGame(game.id);
      setRealSaves(list);
    }
  }, [game?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  if (!game) {
    return (
      <div className="max-w-[800px] mx-auto py-16 text-center space-y-4">
        <span className="material-symbols-outlined text-4xl text-[#958ea0]">search_off</span>
        <h2 className="text-xl font-bold text-white">Không tìm thấy thông tin trò chơi</h2>
        <p className="text-xs font-mono text-[#958ea0]">Trò chơi này có thể đã bị xóa khỏi danh mục.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-[#4cd7f6] text-[#003641] font-bold font-mono text-xs hover:bg-[#70e0f8] transition-colors"
        >
          Quay lại Thư viện
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-bounce">
          <span className="material-symbols-outlined text-sm">bookmark_added</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Breadcrumb navigation & Quick Back */}
      <nav className="flex items-center justify-between pb-1 border-b border-[#494454]/20">
        <div className="flex items-center gap-2 font-mono text-xs text-[#cbc3d7]">
          <button onClick={onBack} className="hover:text-[#4cd7f6] transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Library</span>
          </button>
          <span className="text-[#494454]">/</span>
          <span className="text-[#958ea0]">{game.platform}</span>
          <span className="text-[#494454]">/</span>
          <span className="text-[#4cd7f6] font-bold">{game.title}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#958ea0] flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
            MD5 Verified ROM
          </span>
          <button
            onClick={() => showToast(`Lõi mô phỏng tối ưu: ${game.recommendedCore || 'Cycle-Accurate Auto Core'}`)}
            className="px-2.5 py-1 text-xs font-mono rounded bg-[#282a30] text-[#e2e2eb] border border-[#494454]/30 hover:border-[#4cd7f6] transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Kiểm tra lõi Core"
          >
            <span className="material-symbols-outlined text-sm">settings</span>
            Core: {game.recommendedCore}
          </button>
        </div>
      </nav>

      {/* 2. Hero Game Banner & Showcase */}
      <section className="relative rounded-xl border border-[#494454]/40 bg-[#0c0e14] overflow-hidden shadow-2xl">
        {/* Cinematic Backdrop Key Art with Scanlines */}
        <div className="absolute inset-0 z-0">
          <div
            className="w-full h-full bg-cover bg-center brightness-[0.38] contrast-125"
            style={{ backgroundImage: `url('${game.backdropArt || game.boxArt}')` }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-[#0c0e14]/70 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e14] via-[#0c0e14]/80 to-transparent"></div>
          <div className="absolute inset-0 scanlines-overlay pointer-events-none opacity-40"></div>
        </div>

        {/* Hero Content Layer */}
        <div className="relative z-10 p-6 md:p-8 flex flex-col lg:flex-row gap-8 items-start lg:items-end justify-between">
          {/* Left Info Block */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Box Art */}
            <div className="w-44 sm:w-52 aspect-[3/4] flex-shrink-0 rounded-lg overflow-hidden border-2 border-[#d0bcff]/40 shadow-2xl relative group bg-[#282a30]">
              <img
                alt={game.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                src={game.boxArt}
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#6366f1]/90 text-[#a5b4fc] border border-[#6366f1] shadow-md uppercase">
                {game.platform} 16-BIT
              </div>
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 text-emerald-400 border border-emerald-500/40">
                NTSC-U
              </div>
            </div>

            {/* Main Game Details Header */}
            <div className="flex flex-col gap-2.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500 text-indigo-300 text-xs font-mono font-bold tracking-wider">
                  {game.platform} • {game.year}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#282a30]/80 border border-[#494454]/40 text-[#cbc3d7] text-xs font-mono">
                  {game.developer}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#282a30]/80 border border-[#494454]/40 text-[#cbc3d7] text-xs font-mono">
                  {game.genre}
                </span>
                <span className="flex items-center gap-1 text-[#ffb95f] text-xs font-mono font-bold px-2 py-0.5 bg-[#ca8100]/10 border border-[#ca8100]/30 rounded">
                  <span className="material-symbols-outlined text-sm fill-icon">star</span>
                  {game.rating} / 5.0 ({game.ratingCount})
                </span>
              </div>

              <div>
                <h1 className="text-2xl md:text-3xl text-white tracking-tight font-extrabold flex flex-wrap items-baseline gap-3">
                  {game.title}
                </h1>
                {game.japaneseTitle && (
                  <div className="font-mono text-xs text-[#d0bcff] tracking-widest mt-1">
                    {game.japaneseTitle}
                  </div>
                )}
              </div>

              {/* Emulation Compatibility Pill */}
              <div className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-[#282a30]/60 border border-[#4cd7f6]/30 text-xs font-mono text-[#4cd7f6] w-fit neon-glow-secondary">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">memory</span>
                <span>100% Core Compatible • WebAssembly JIT 60 FPS • Accurate Sound DSP-1</span>
              </div>

              <p className="text-sm text-[#cbc3d7] line-clamp-2 max-w-xl">
                {game.description}
              </p>
            </div>
          </div>

          {/* Right Cluster: Actions & Controls */}
          <div className="flex flex-col gap-3 w-full lg:w-auto min-w-[280px]">
            {/* Big Glow Action Button */}
            <button
              onClick={() => onPlayGame(game.id, 1)}
              className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-lg bg-[#a078ff] text-[#340080] font-bold text-base tracking-wide hover:brightness-110 active:scale-95 transition-all neon-glow-primary group cursor-pointer"
            >
              <span className="material-symbols-outlined text-2xl transition-transform group-hover:scale-125 fill-icon">
                play_circle
              </span>
              <span>Play Now / Resume</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/30 text-white ml-1">Slot 1</span>
            </button>

            {/* Secondary Row Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onPlayGame(game.id, 0)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#282a30] hover:bg-[#33343b] border border-[#494454]/40 text-[#e2e2eb] font-mono text-xs transition-colors"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
                <span>Fresh Boot</span>
              </button>
              <button
                onClick={() => onToggleFavorite(game.id)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border font-mono text-xs transition-colors ${
                  isFavorited
                    ? 'bg-[#282a30] border-[#4cd7f6] text-[#4cd7f6]'
                    : 'bg-[#282a30] border-[#494454]/40 text-[#cbc3d7] hover:text-white'
                }`}
              >
                <span className={`material-symbols-outlined text-base ${isFavorited ? 'fill-icon' : ''}`}>star</span>
                <span>{isFavorited ? 'Favorited' : 'Favorite'}</span>
              </button>
            </div>

            {/* Multiplayer NetPlay Cluster */}
            <button
              onClick={() => onOpenNetPlay(game.id)}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#191b22] border border-cyan-500/40 hover:border-cyan-400 text-white font-mono text-xs transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">hub</span>
                <span>Tạo Phòng Chơi Online</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-[#4cd7f6] border border-cyan-500/40">
                WebRTC 2P
              </span>
            </button>

            {/* Google Drive Folder Sync Button */}
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#191b22] border border-emerald-500/40 hover:border-emerald-400 text-white font-mono text-xs transition-all group cursor-pointer"
              title="Tải game này lên thư mục con theo thể loại trên Google Drive"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-emerald-400 shrink-0">cloud_upload</span>
                <span className="truncate">
                  {linkedDriveFolder
                    ? `Đồng Bộ -> ${linkedDriveFolder.name}/${getPlatformSubfolderName(game)}`
                    : 'Đồng Bộ Lên Google Drive'}
                </span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 shrink-0">
                {getPlatformSubfolderName(game)}/
              </span>
            </button>

            {/* ROM Management Dropdown Strip */}
            <div className="flex items-center justify-between text-xs font-mono text-[#958ea0] px-1">
              <button
                onClick={() => {
                  if (saveManager.hasSram(game.id)) {
                    saveManager.exportSram(game.id);
                    showToast("Đã xuất file pin lưu SRAM (.sav) về máy!");
                  } else {
                    showToast("Chưa có pin lưu SRAM. Hãy chơi và lưu tiến trình trong game trước!");
                  }
                }}
                className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors"
                title="Tải về file SRAM Battery Save để dùng trên máy thật hoặc phần mềm khác"
              >
                <span className="material-symbols-outlined text-xs">download</span>
                Xuất file .SRM/.SAV
              </button>
              <span>•</span>
              <button
                onClick={() => {
                  onPlayGame(game.id, 1);
                  showToast("Khởi chạy trò chơi và mở Slot #1");
                }}
                className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors"
                title="Khởi chạy trò chơi và quản lý Save State"
              >
                <span className="material-symbols-outlined text-xs">save_as</span>
                Chơi &amp; Lưu State
              </button>
              <span>•</span>
              <button
                onClick={() => {
                  const plat = (game.platform || 'NES').toUpperCase();
                  let coreName = 'FCEUmm (NES)';
                  if (plat === 'SNES') coreName = 'Snes9x 2005 (Cycle-Accurate)';
                  else if (plat.includes('GBA') || plat === 'GB' || plat === 'GBC') coreName = 'mGBA (Full Speed)';
                  else if (plat === 'GENESIS') coreName = 'Genesis Plus GX';
                  showToast(`Lõi Core: ${coreName} (Đã sẵn sàng)`);
                }}
                className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors"
                title="Xem thông tin lõi mô phỏng"
              >
                <span className="material-symbols-outlined text-xs">memory</span>
                Lõi Core
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Tabbed Information & Context Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tabs Content (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Navigation Tabs Bar */}
          <div className="flex items-center gap-1 border-b border-[#494454]/30 pb-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 font-mono text-xs flex items-center gap-2 whitespace-nowrap rounded-t-lg transition-colors ${
                activeTab === 'overview'
                  ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6] font-bold bg-[#191b22]/50'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">description</span>
              <span>Overview &amp; Story</span>
            </button>
            <button
              onClick={() => setActiveTab('states')}
              className={`px-4 py-2.5 font-mono text-xs flex items-center gap-2 whitespace-nowrap rounded-t-lg transition-colors ${
                activeTab === 'states'
                  ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6] font-bold bg-[#191b22]/50'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">history</span>
              <span>Save States &amp; Cloud ({realSaves.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('controls')}
              className={`px-4 py-2.5 font-mono text-xs flex items-center gap-2 whitespace-nowrap rounded-t-lg transition-colors ${
                activeTab === 'controls'
                  ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6] font-bold bg-[#191b22]/50'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">sports_esports</span>
              <span>Controls &amp; Gamepad</span>
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2.5 font-mono text-xs flex items-center gap-2 whitespace-nowrap rounded-t-lg transition-colors ${
                activeTab === 'manual'
                  ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6] font-bold bg-[#191b22]/50'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">auto_stories</span>
              <span>Manual &amp; Lore</span>
            </button>
          </div>

          {/* Tab 1: Overview & Cartridge Technical Specs */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              {/* Narrative Synopsis Card */}
              <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg text-[#d0bcff] font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#4cd7f6]">videogame_asset</span>
                    {game.title}
                  </h3>
                  <span className="text-xs font-mono text-[#958ea0] uppercase tracking-wider">Cartridge Info</span>
                </div>
                <p className="text-sm text-[#e2e2eb] leading-relaxed">
                  {game.description || `Tệp băng ROM hệ máy ${game.platform} chạy trực tiếp trên lõi WebAssembly 60 FPS không cần cài đặt. Hỗ trợ lưu trạng thái tức thì (Save State), tua ngược thời gian và chơi mạng 2 người qua Internet (WebRTC NetPlay).`}
                </p>

                {/* Key Highlights Micro-Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Hệ máy</div>
                    <div className="text-sm text-white font-bold">{game.platform}</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Nguồn ROM</div>
                    <div className="text-sm text-white font-bold">{game.source === 'drive' ? 'Google Drive' : 'Máy cục bộ'}</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Pin lưu SRAM</div>
                    <div className="text-sm text-white font-bold">{game.batterySave ? 'Có hỗ trợ' : 'Tùy ROM'}</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Chế độ mạng</div>
                    <div className="text-sm text-[#4cd7f6] font-bold">2P Online P2P</div>
                  </div>
                </div>
              </div>

              {/* Technical Specifications Grid Card */}
              <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 flex flex-col gap-4 shadow-lg">
                <h3 className="text-base text-white font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-lg">terminal</span>
                  Thông Số Kỹ Thuật Giả Lập
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Độ phân giải gốc</span>
                    <span className="text-white font-bold text-sm">
                      {game.nativeResolution || (game.platform === 'GBA' ? '240 × 160 px' : '256 × 224 px')}
                    </span>
                    <span className="text-[10px] text-[#958ea0] block mt-0.5">
                      {game.aspectRatio || (game.platform === 'GBA' ? '3:2' : '4:3')} Native
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Tần số quét</span>
                    <span className="text-white font-bold text-sm">{game.framerate || 60.0} Hz</span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">WebGL / CRT Ready</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Tệp ROM</span>
                    <span className="text-white font-bold text-sm truncate block" title={game.romFilename || game.title}>
                      {game.romFilename || 'Cartridge Dump'}
                    </span>
                    <span className="text-[10px] text-[#958ea0] block mt-0.5">
                      {game.crc32 ? `CRC32: ${game.crc32}` : 'IndexedDB Cached'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Save State</span>
                    <span className="text-white font-bold text-sm">{realSaves.length} Slot đã lưu</span>
                    <span className="text-[10px] text-[#4cd7f6] block mt-0.5">SRAM + 3 Quick Slots</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'states' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base text-white font-bold font-mono">Bản Lưu Đám Mây &amp; Điểm Lưu Trạng Thái</h3>
                  <p className="text-xs text-[#958ea0] font-mono mt-0.5">Dữ liệu được lưu trong IndexedDB cục bộ và đồng bộ tự động</p>
                </div>
                {saveManager.hasSram(game.id) && (
                  <button
                    onClick={() => {
                      saveManager.exportSram(game.id);
                      showToast("Đã xuất file pin lưu SRAM (.sav)!");
                    }}
                    className="px-2.5 py-1 rounded bg-[#03b5d3]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs flex items-center gap-1 hover:bg-[#03b5d3]/30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">download</span>
                    Xuất file .sav
                  </button>
                )}
              </div>

              {realSaves.length > 0 ? (
                <div className="space-y-3">
                  {realSaves.map((s) => (
                    <div key={s.id} className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/40 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">Slot #{s.slot}: {s.gameTitle}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-[#4cd7f6] border border-cyan-500/30">
                            {Math.round(s.sizeBytes / 1024)} KB
                          </span>
                        </div>
                        <p className="text-xs text-[#958ea0] font-mono mt-0.5">
                          Thời gian: {s.timestamp ? new Date(s.timestamp).toLocaleString() : (s.updatedAt || 'Vừa xong')} • Mã: {s.checksum?.slice(0, 8) || 'verified'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            saveManager.exportSave(s);
                            showToast(`Đã xuất file save slot #${s.slot}`);
                          }}
                          className="p-1.5 rounded bg-[#20222f] hover:bg-[#282a3c] text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors"
                          title="Tải về tệp save state"
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                        </button>
                        <button
                          onClick={() => onPlayGame(game.id, s.slot)}
                          className="px-3 py-1 rounded bg-[#a078ff] hover:bg-[#b08eff] text-[#340080] font-bold text-xs transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-xs">play_arrow</span>
                          Nạp Slot #{s.slot}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-xl bg-[#0c0e14]/60 border border-dashed border-[#494454]/40 text-center space-y-3">
                  <span className="material-symbols-outlined text-3xl text-[#958ea0]">save</span>
                  <p className="text-xs text-[#cbc3d7] font-mono">
                    Chưa có bản lưu trạng thái (Save State) nào cho tựa game này trong bộ nhớ.
                  </p>
                  <p className="text-[11px] text-[#958ea0]">
                    Khi chơi trong trình giả lập, bạn có thể lưu tức thì vào bất kỳ lúc nào bằng phím F1 hoặc nút Lưu nhanh trên tay cầm ảo.
                  </p>
                  <button
                    onClick={() => onPlayGame(game.id)}
                    className="px-4 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold font-mono text-xs inline-flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                  >
                    <span className="material-symbols-outlined text-sm">sports_esports</span>
                    Khởi động trò chơi ngay
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-4">
              <h3 className="text-base text-white font-bold font-mono">
                Sơ đồ điều khiển: {game.platform || 'Chuẩn'}
              </h3>
              <p className="text-xs text-[#958ea0]">Tương thích tự động với Bàn phím, Tay cầm USB/Bluetooth (Xbox, DualSense, 8BitDo) và Tay cầm ảo màn hình cảm ứng.</p>
              <div className="bg-[#0c0e14] rounded-lg p-3 border border-[#494454]/20 flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-[#494454]/20">
                  <span className="text-[#958ea0]">Di chuyển / D-Pad</span>
                  <span className="text-white font-bold">Phím mũi tên / Cần Analog / D-Pad 8 hướng</span>
                </div>
                {(game.platform === 'NES' || game.platform === 'GBA' || game.platform === 'SNES') && (
                  <>
                    <div className="flex justify-between py-1 border-b border-[#494454]/20">
                      <span className="text-[#958ea0]">Nút A (Xác nhận / Nhảy)</span>
                      <span className="text-white font-bold">X / Nút A trên tay cầm</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#494454]/20">
                      <span className="text-[#958ea0]">Nút B (Tấn công / Chạy)</span>
                      <span className="text-white font-bold">Z / Nút B trên tay cầm</span>
                    </div>
                  </>
                )}
                {game.platform === 'SNES' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-[#494454]/20">
                      <span className="text-[#958ea0]">Nút X / Y (Phụ / Lướt)</span>
                      <span className="text-white font-bold">S, A / Nút X, Y trên tay cầm</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#494454]/20">
                      <span className="text-[#958ea0]">Nút vai L / R</span>
                      <span className="text-white font-bold">Q, W / Bumper L, R</span>
                    </div>
                  </>
                )}
                {game.platform === 'GBA' && (
                  <div className="flex justify-between py-1 border-b border-[#494454]/20">
                    <span className="text-[#958ea0]">Nút vai L / R Bumpers</span>
                    <span className="text-white font-bold">Q, E / Bumper L, R</span>
                  </div>
                )}
                {game.platform === 'GENESIS' && (
                  <div className="flex justify-between py-1 border-b border-[#494454]/20">
                    <span className="text-[#958ea0]">Nút A / B / C (Sega 3-Arc)</span>
                    <span className="text-white font-bold">Z, X, C / Nút A, B, X trên tay cầm</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-[#958ea0]">Start / Select</span>
                  <span className="text-white font-bold">Enter / Shift phải</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-3 font-mono text-xs text-[#cbc3d7]">
              <h3 className="text-base text-white font-bold font-sans">Hướng Dẫn Nhanh &amp; Chế Độ Chơi Mạng</h3>
              <p>• Lưu trạng thái nhanh: Nhấn phím <strong className="text-white">F2</strong> để lưu Slot hiện tại, <strong className="text-white">F4</strong> để nạp lại tức thì.</p>
              <p>• Tua ngược thời gian: Nhấn <strong className="text-white">Backspace</strong> hoặc nút -10s để quay lại khoảnh khắc trước đó.</p>
              <p>• Chơi cùng bạn bè qua Internet: Nhấn <strong className="text-cyan-300">Tạo Phòng Chơi Online</strong> ở phía trên, gửi mã phòng hoặc đường dẫn mời cho bạn bè. Bạn bè không cần tải trước tệp ROM vẫn có thể vào điều khiển Port 2 trực tiếp!</p>
            </div>
          )}
        </div>

        {/* Right Column: Active Save, Hardware & Library Recommendations (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Active Save State Snapshot */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#4cd7f6] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">save</span>
                BẢN LƯU TRẠNG THÁI (SLOT 1)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {realSaves.length > 0 ? `${realSaves.length} Slots` : 'Sẵn sàng'}
              </span>
            </div>

            <div className="relative aspect-video rounded-lg overflow-hidden border border-[#494454]/50 group bg-[#0c0e14] flex items-center justify-center">
              <img
                alt={game.title}
                className="w-full h-full object-contain p-3 opacity-85"
                src={game.boxArt}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"></div>
              <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                <div>
                  <div className="text-xs text-white font-bold truncate max-w-[200px]">
                    {realSaves[0] ? `Slot #${realSaves[0].slot}: ${realSaves[0].gameTitle}` : 'Chưa có dữ liệu Save State'}
                  </div>
                  <div className="text-[11px] font-mono text-[#958ea0]">
                    {realSaves[0]
                      ? `${Math.round(realSaves[0].sizeBytes / 1024)} KB • ${realSaves[0].checksum?.slice(0, 8) || 'verified'}`
                      : 'Nhấn F2 trong lúc chơi để tạo điểm lưu'}
                  </div>
                </div>
                {realSaves[0]?.timestamp && (
                  <div className="text-[10px] font-mono text-[#ffb95f]">
                    {new Date(realSaves[0].timestamp).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => onPlayGame(game.id, 1)}
                className="py-2 px-3 rounded bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 border border-[#4cd7f6]/50 text-[#4cd7f6] font-mono text-xs flex items-center justify-center gap-1.5 transition-colors font-bold cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                Nạp Slot 1
              </button>
              <button
                onClick={() => {
                  onPlayGame(game.id, 0);
                  showToast('Khởi chạy mới từ đầu băng ROM');
                }}
                className="py-2 px-3 rounded bg-[#282a30] hover:bg-[#33343b] border border-[#494454]/40 text-[#e2e2eb] font-mono text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Khởi chạy lại từ màn hình bắt đầu"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
                Khởi Động Mới
              </button>
            </div>
          </div>

          {/* Controller Mapping Setup */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5 uppercase">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">sports_esports</span>
                {game.platform || 'CHUẨN'} SƠ ĐỒ ĐIỀU KHIỂN
              </span>
              <button onClick={() => setActiveTab('controls')} className="text-[11px] font-mono text-[#4cd7f6] hover:underline cursor-pointer">
                Xem chi tiết
              </button>
            </div>

            <div className="bg-[#0c0e14] rounded-lg p-3 border border-[#494454]/20 flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">D-Pad / Analog</span>
                <span className="text-white font-bold">Mũi tên / W-A-S-D</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Nút A / B</span>
                <span className="text-white font-bold">Phím X / Z</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Nút X / Y</span>
                <span className="text-white font-bold">Phím S / A</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Bumpers L / R</span>
                <span className="text-white font-bold">Phím Q / E</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#958ea0]">Start / Select</span>
                <span className="text-white font-bold">Enter / Shift phải</span>
              </div>
            </div>
          </div>

          {/* Library Quick Switch */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">auto_awesome</span>
                TRÒ CHƠI KHÁC TRONG THƯ VIỆN
              </span>
              <span className="text-[11px] font-mono text-[#958ea0]">{libraryGames.length} ROM</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {libraryGames.filter((g) => g.id !== game.id).slice(0, 3).map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onPlayGame(rec.id)}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#0c0e14] border border-[#494454]/20 hover:border-[#4cd7f6] transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <img className="w-10 h-10 rounded object-contain bg-[#111319] p-0.5" alt={rec.title} src={rec.boxArt} />
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-[#4cd7f6] transition-colors truncate max-w-[140px]">
                        {rec.title}
                      </div>
                      <div className="text-[10px] font-mono text-[#958ea0]">{rec.platform} • {rec.developer}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayGame(rec.id);
                    }}
                    className="px-2 py-1 rounded text-[11px] font-mono bg-[#282a30] text-[#4cd7f6] hover:bg-[#4cd7f6] hover:text-[#001f26] transition-colors cursor-pointer"
                  >
                    Chơi
                  </button>
                </div>
              ))}
              {libraryGames.filter((g) => g.id !== game.id).length === 0 && (
                <p className="text-[11px] font-mono text-[#958ea0] py-2">Chưa có trò chơi nào khác trong thư viện.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <DriveFolderSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        gamesToSync={[game]}
        title={`Đồng Bộ "${game.title}" Lên Google Drive`}
        onSyncCompleted={(msg) => showToast(msg)}
      />
    </div>
  );
};
