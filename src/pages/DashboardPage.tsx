import React, { useState } from 'react';
import { Game, Platform } from '../types';
import { useLibraryStore, libraryStore, getCartridgeCoverArt } from '../services/games/libraryStore';
import { parseRom } from '../emulator/romParser';
import { romStorage } from '../services/roms/romStorage';
import { auth } from '../services/firebase';

interface DashboardPageProps {
  onSelectGame: (gameId: string) => void;
  onPlayGame: (gameId: string) => void;
  onOpenSaves?: () => void;
  onOpenNetPlay: (roomId?: string) => void;
  onOpenRomVault?: (mode?: 'local' | 'drive') => void;
  favorites: string[];
  onToggleFavorite: (gameId: string) => void;
  searchQuery?: string;
  filterMode?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onSelectGame,
  onPlayGame,
  onOpenSaves = () => {},
  onOpenNetPlay,
  onOpenRomVault = () => {},
  favorites,
  onToggleFavorite,
  searchQuery = '',
  filterMode = 'all',
}) => {
  // Reactive subscription to libraryStore - updates instantly when ROMs are uploaded or scanned from Drive
  const games = useLibraryStore();

  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter games based on search, platform, and sort
  const filteredGames = games
    .filter((game) => {
      if (filterMode === 'favorites' && !favorites.includes(game.id)) {
        return false;
      }

      const matchesSearch =
        !searchQuery ||
        game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.genre && game.genre.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (game.developer && game.developer.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPlatform = selectedPlatform === 'all' || game.platform === selectedPlatform;
      return matchesSearch && matchesPlatform;
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'year') return (b.year || 0) - (a.year || 0);
      return 0; // Default order
    });

  // Calculate platform counts dynamically based on real games
  const nesCount = games.filter((g) => g.platform === 'NES').length;
  const snesCount = games.filter((g) => g.platform === 'SNES').length;
  const gbaCount = games.filter((g) => g.platform === 'GBA').length;

  const featuredHeroGame = games.length > 0 ? games[0] : null;

  // Direct Drag & Drop onto Dashboard
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      let added = 0;

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const header = parseRom(bytes, file.name);
          const plat = header.platform === 'UNKNOWN' ? 'NES' : header.platform;
          const title = header.internalTitle || file.name.replace(/\.[^/.]+$/, '');

          const newGame: Game = {
            id: `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            title,
            platform: plat,
            year: 1995,
            developer: 'Tải lên từ máy',
            genre: 'Custom / Backup',
            rating: 5.0,
            ratingCount: 1,
            boxArt: getCartridgeCoverArt(title, plat),
            description: `Tệp ROM: ${file.name}. Checksum: ${header.crc32}`,
            features: ['Client WASM', 'SRAM Battery', header.coProcessor],
            batterySave: header.hasBattery,
            source: 'local',
            romFilename: file.name,
            crc32: header.crc32,
          };

          romStorage.saveRom(newGame.id, file.name, plat, bytes);
          libraryStore.addGame(newGame);
          added++;
        } catch (err) {
          console.error('Error importing dropped ROM', err);
        }
      }

      if (added > 0) {
        showToast(`Đã thêm thành công ${added} tựa game vào thư viện!`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDeleteGame = (e: React.MouseEvent, gameId: string, gameTitle: string) => {
    e.stopPropagation();
    if (window.confirm(`Bạn có chắc muốn xóa "${gameTitle}" khỏi thư viện?`)) {
      libraryStore.removeGame(gameId);
      romStorage.clear(gameId);
      showToast(`Đã xóa "${gameTitle}" khỏi thư viện.`);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="space-y-6 max-w-[1440px] mx-auto select-none relative"
    >
      {/* Toast confirmation */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-xl bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Drag Active Screen Glow */}
      {dragActive && (
        <div className="fixed inset-0 z-40 bg-[#4cd7f6]/10 border-4 border-dashed border-[#4cd7f6] flex items-center justify-center pointer-events-none backdrop-blur-xs">
          <div className="p-6 bg-[#0c0e14] border border-[#4cd7f6] rounded-2xl text-center shadow-2xl">
            <span className="material-symbols-outlined text-5xl text-[#4cd7f6] animate-bounce">upload_file</span>
            <p className="text-white font-bold text-lg mt-2 font-mono">Thả tệp ROM vào đây để thêm vào thư viện</p>
            <p className="text-[#958ea0] text-xs font-mono mt-1">Hỗ trợ các định dạng .nes, .smc, .sfc, .gba</p>
          </div>
        </div>
      )}

      {/* ================= TELEMETRY WELCOME BAR ================= */}
      <section className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-xl bg-[#191b22] border border-[#494454]/30 backdrop-blur-sm shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-0.5 rounded border border-[#4cd7f6]/20">
              RETROVERSE ENGINE
            </span>
            <span className="font-mono text-[#958ea0] text-xs">WebAssembly Core Sandbox</span>
          </div>
          <h1 className="text-xl lg:text-2xl text-white font-bold tracking-tight mt-1.5 font-sans">
            Thư viện trò chơi cá nhân
          </h1>
        </div>

        {/* Dynamic Telemetry Stats */}
        <div className="flex items-center gap-6 divide-x divide-[#494454]/30">
          <div className="flex flex-col pr-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Hệ Giả Lập</span>
            <span className="text-lg text-white font-bold font-mono">
              3 <span className="text-xs font-normal text-[#958ea0]">NES • SNES • GBA</span>
            </span>
          </div>
          <div className="flex flex-col pl-4 pr-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Trò Chơi Trong Thư Viện</span>
            <span className="text-lg text-[#4cd7f6] font-bold font-mono">
              {games.length} <span className="text-xs font-normal text-[#958ea0]">Tựa Game</span>
            </span>
          </div>
          <div className="flex flex-col pl-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Google Drive</span>
            <span className="text-lg text-emerald-400 font-bold flex items-center gap-1 font-mono">
              {auth.currentUser ? 'Đã kết nối' : 'Sẵn sàng'}
              <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
            </span>
          </div>
        </div>
      </section>

      {/* ================= HERO SECTION ================= */}
      {games.length === 0 ? (
        /* Empty Library Onboarding Hero */
        <section className="relative overflow-hidden rounded-2xl border border-[#4cd7f6]/30 bg-gradient-to-br from-[#191b22] via-[#111319] to-[#0c0e14] shadow-2xl p-6 sm:p-10">
          <div className="absolute -right-20 -top-20 w-96 h-96 bg-[#4cd7f6]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-[#a078ff]/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 text-[#4cd7f6] text-xs font-mono font-bold">
              <span className="material-symbols-outlined text-sm">sports_esports</span>
              <span>Thư viện sạch &amp; không có dữ liệu mẫu</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Sẵn sàng trải nghiệm các tựa game yêu thích của bạn
            </h2>

            <p className="text-sm text-[#cbc3d7] leading-relaxed">
              Toàn bộ dữ liệu game mẫu đã được gỡ bỏ. Thư viện chỉ hiển thị các tệp ROM có sẵn trên Google Drive sau khi quét hoặc các tệp ROM bạn trực tiếp tải lên từ thiết bị.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onOpenRomVault('drive')}
                className="px-5 py-3 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#4cd7f6]/20 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">cloud_sync</span>
                <span>Quét Danh Mục Google Drive</span>
              </button>

              <button
                onClick={() => onOpenRomVault('local')}
                className="px-5 py-3 rounded-xl bg-[#282a30] hover:bg-[#34373f] text-white border border-[#494454]/50 font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                <span>Tải ROM Từ Máy Tính</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* Real Featured User Game Hero */
        featuredHeroGame && (
          <section className="relative overflow-hidden rounded-xl border border-[#a078ff]/40 bg-[#191b22] shadow-2xl shadow-primary/10">
            <div className="absolute -right-20 -top-20 w-96 h-96 bg-[#a078ff]/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-[#4cd7f6]/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 md:p-8 items-center">
              {/* Box Art Mockup */}
              <div
                className="lg:col-span-4 relative group cursor-pointer"
                onClick={() => onPlayGame(featuredHeroGame.id)}
              >
                <div className="relative overflow-hidden rounded-lg border border-[#494454]/60 shadow-lg aspect-[4/3] bg-[#0c0e14]">
                  <img
                    className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                    alt={featuredHeroGame.title}
                    src={featuredHeroGame.boxArt}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-transparent to-transparent opacity-80 pointer-events-none"></div>
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded font-mono text-xs bg-indigo-950/80 border border-indigo-500 text-indigo-300 backdrop-blur-md">
                      {featuredHeroGame.platform}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-xs bg-[#0c0e14]/80 border border-[#494454]/40 text-[#4cd7f6]">
                      {featuredHeroGame.source === 'drive' ? 'GOOGLE DRIVE' : 'ĐÃ TẢI LÊN'}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-1 text-[#e2e2eb] text-xs font-mono">
                    <span className="material-symbols-outlined text-xs text-[#4cd7f6]">sports_esports</span>
                    <span>Nhấn để khởi động giả lập</span>
                  </div>
                </div>
              </div>

              {/* Information */}
              <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#958ea0]">
                    <span className="flex items-center gap-1 text-[#4cd7f6]">
                      <span className="material-symbols-outlined text-sm">verified</span>
                      Trò chơi đã xác thực
                    </span>
                    <span>•</span>
                    <span className="text-[#cbc3d7]">{featuredHeroGame.developer || 'Personal ROM'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">battery_charging_full</span>
                      SRAM Battery Ready
                    </span>
                  </div>

                  <h2 className="text-2xl lg:text-3xl font-headline font-bold text-white tracking-tight mt-2">
                    {featuredHeroGame.title}
                  </h2>

                  <p className="text-xs lg:text-sm text-[#cbc3d7] mt-2 line-clamp-2 leading-relaxed">
                    {featuredHeroGame.description}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => onPlayGame(featuredHeroGame.id)}
                    className="px-5 py-2.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#4cd7f6]/20 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">play_arrow</span>
                    Chơi Ngay (WASM 60 FPS)
                  </button>

                  <button
                    onClick={() => onSelectGame(featuredHeroGame.id)}
                    className="px-4 py-2.5 rounded-lg bg-[#282a30] border border-[#494454]/50 text-[#e2e2eb] hover:border-[#958ea0] font-mono text-xs flex items-center gap-2 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">info</span>
                    Thông Tin Chi Tiết
                  </button>
                </div>
              </div>
            </div>
          </section>
        )
      )}

      {/* ================= PLATFORM FILTERS & SORT BAR ================= */}
      <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-2 border-b border-[#494454]/30">
        {/* Platform Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`px-3.5 py-1.5 rounded-lg font-mono text-xs flex items-center gap-2 transition-all ${
              selectedPlatform === 'all'
                ? 'bg-[#33343b] text-[#4cd7f6] border border-[#4cd7f6]/40 shadow-sm font-bold'
                : 'bg-[#191b22] hover:bg-[#282a30] border border-[#494454]/30 text-[#cbc3d7]'
            }`}
          >
            <span>Tất Cả Game</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0c0e14] text-white">{games.length}</span>
          </button>

          <button
            onClick={() => setSelectedPlatform('NES')}
            className={`px-3.5 py-1.5 rounded-lg font-mono text-xs flex items-center gap-2 transition-all ${
              selectedPlatform === 'NES'
                ? 'bg-[#33343b] text-rose-300 border border-rose-500/50 shadow-sm font-bold'
                : 'bg-[#191b22] hover:bg-[#282a30] border border-[#494454]/30 text-[#cbc3d7]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Nintendo (NES)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40">
              {nesCount}
            </span>
          </button>

          <button
            onClick={() => setSelectedPlatform('SNES')}
            className={`px-3.5 py-1.5 rounded-lg font-mono text-xs flex items-center gap-2 transition-all ${
              selectedPlatform === 'SNES'
                ? 'bg-[#33343b] text-indigo-300 border border-indigo-500/50 shadow-sm font-bold'
                : 'bg-[#191b22] hover:bg-[#282a30] border border-[#494454]/30 text-[#cbc3d7]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            <span>Super Nintendo (SNES)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/40">
              {snesCount}
            </span>
          </button>

          <button
            onClick={() => setSelectedPlatform('GBA')}
            className={`px-3.5 py-1.5 rounded-lg font-mono text-xs flex items-center gap-2 transition-all ${
              selectedPlatform === 'GBA'
                ? 'bg-[#33343b] text-sky-300 border border-sky-500/50 shadow-sm font-bold'
                : 'bg-[#191b22] hover:bg-[#282a30] border border-[#494454]/30 text-[#cbc3d7]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <span>Game Boy Advance (GBA)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40">
              {gbaCount}
            </span>
          </button>
        </div>

        {/* Sorting Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-[#191b22] border border-[#494454]/40 text-[#e2e2eb] font-mono text-xs focus:outline-none focus:border-[#4cd7f6] cursor-pointer"
            >
              <option value="recent">Mới Thêm Gần Đây</option>
              <option value="rating">Đánh Giá Cao</option>
              <option value="year">Năm Phát Hành</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-sm text-[#958ea0]">
              unfold_more
            </span>
          </div>
        </div>
      </section>

      {/* ================= MAIN GAME LIBRARY GRID ================= */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg text-white font-bold">
              Danh Mục Trò Chơi ({filteredGames.length} Tựa Game)
            </h3>
            <p className="text-xs text-[#958ea0]">
              Dữ liệu game được lưu trong bộ nhớ trình duyệt và đồng bộ với Google Drive của bạn.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenRomVault('drive')}
              className="px-3 py-1.5 rounded-lg bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Quét ROM từ Google Drive"
            >
              <span className="material-symbols-outlined text-sm">cloud_sync</span>
              <span>Quét Google Drive</span>
            </button>

            <button
              onClick={() => onOpenRomVault('local')}
              className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] border border-[#494454]/40 text-[#cbc3d7] hover:text-white font-mono text-xs flex items-center gap-1.5 transition-colors"
              title="Tải ROM từ máy tính"
            >
              <span className="material-symbols-outlined text-sm">upload_file</span>
              <span>Tải Tệp ROM</span>
            </button>
          </div>
        </div>

        {/* Empty State */}
        {filteredGames.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#191b22] border-2 border-dashed border-[#494454]/40 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#1e1f26] border border-[#494454]/40 flex items-center justify-center text-[#4cd7f6]">
              <span className="material-symbols-outlined text-3xl">sports_esports</span>
            </div>
            <div>
              <h4 className="text-white font-bold text-base">Chưa có trò chơi nào hiển thị</h4>
              <p className="text-xs text-[#958ea0] max-w-md mt-1 font-mono">
                {searchQuery || selectedPlatform !== 'all'
                  ? 'Không tìm thấy tựa game nào phù hợp với bộ lọc hiện tại.'
                  : 'Hãy bấm "Quét Google Drive" để tìm các tệp ROM có sẵn hoặc "Tải Tệp ROM" từ máy tính để thêm vào thư viện.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpenRomVault('drive')}
                className="px-4 py-2 rounded-lg bg-[#4cd7f6] text-[#003641] font-mono font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <span className="material-symbols-outlined text-sm">cloud_sync</span>
                <span>Quét Google Drive</span>
              </button>
              <button
                onClick={() => onOpenRomVault('local')}
                className="px-4 py-2 rounded-lg bg-[#282a30] text-white border border-[#494454]/50 font-mono text-xs flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">folder_open</span>
                <span>Chọn tệp từ máy tính</span>
              </button>
            </div>
          </div>
        ) : (
          /* Bento / Card Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredGames.map((game) => {
              const isFav = favorites.includes(game.id);

              return (
                <div
                  key={game.id}
                  onClick={() => onSelectGame(game.id)}
                  className="group relative rounded-xl bg-[#191b22] border border-[#494454]/30 hover:border-[#4cd7f6] overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-md cursor-pointer flex flex-col justify-between"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-[#0c0e14]">
                    <img
                      className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                      alt={game.title}
                      src={game.boxArt}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-transparent to-transparent opacity-90 pointer-events-none"></div>

                    {/* Platform Badge */}
                    <span
                      className={`absolute top-2 left-2 px-1.5 py-0.5 rounded font-mono text-[10px] ${
                        game.platform === 'SNES'
                          ? 'bg-indigo-950/80 border border-indigo-400 text-indigo-300'
                          : game.platform === 'GBA'
                          ? 'bg-sky-950/80 border border-sky-400 text-sky-300'
                          : 'bg-rose-950/80 border border-rose-400 text-rose-300'
                      }`}
                    >
                      {game.platform}
                    </span>

                    {/* Source Origin Badge */}
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded font-mono text-[9px] bg-black/80 border border-[#494454]/40 text-[#4cd7f6] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">
                        {game.source === 'drive' ? 'cloud' : 'computer'}
                      </span>
                      <span>{game.source === 'drive' ? 'Drive' : 'Máy'}</span>
                    </span>

                    {/* Star Favorite Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(game.id);
                      }}
                      className={`absolute top-2 right-2 hover:scale-110 transition-transform ${
                        isFav ? 'text-amber-400' : 'text-[#958ea0] hover:text-amber-400'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg ${isFav ? 'fill-icon' : ''}`}>star</span>
                    </button>

                    {/* Hover Quick Action Overlay */}
                    <div className="absolute inset-0 bg-[#0c0e14]/85 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayGame(game.id);
                        }}
                        className="w-full py-1.5 rounded bg-[#4cd7f6] text-[#003641] font-mono text-xs font-bold flex items-center justify-center gap-1 shadow-md hover:bg-[#70e0f8]"
                      >
                        <span className="material-symbols-outlined text-sm">play_arrow</span> Chơi Ngay
                      </button>
                      <div className="flex items-center gap-1 w-full justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectGame(game.id);
                          }}
                          className="p-1.5 rounded bg-[#282a30] text-[#cbc3d7] hover:text-white"
                          title="Chi tiết & cài đặt"
                        >
                          <span className="material-symbols-outlined text-xs">info</span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteGame(e, game.id, game.title)}
                          className="p-1.5 rounded bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-500/30"
                          title="Xóa khỏi thư viện"
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-[#4cd7f6] transition-colors">
                      {game.title}
                    </h4>
                    <p className="font-mono text-[10px] text-[#958ea0] mt-0.5 truncate">
                      {game.developer || (game.source === 'drive' ? 'Google Drive' : 'Máy tính')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= FOOTER BAR ================= */}
      <footer className="p-4 rounded-xl bg-[#0c0e14] border border-[#494454]/30 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#958ea0]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[#e2e2eb]">
            <span className="material-symbols-outlined text-[#4cd7f6] text-base">inventory_2</span>
            <span>Thư viện: <strong className="text-white">{games.length} trò chơi</strong></span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>SRAM Battery Autosave Bật</span>
          </div>
          <span>•</span>
          <div className="text-[#cbc3d7]">
            Google Account: <span className="text-white">{auth.currentUser?.email || 'Chưa đăng nhập'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenRomVault('drive')}
            className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#4cd7f6]/40 font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">cloud_sync</span>
            <span>Đồng bộ Drive</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
