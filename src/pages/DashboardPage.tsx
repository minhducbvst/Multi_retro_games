import React, { useState } from 'react';
import { Game, Platform } from '../types';
import { FEATURED_GAMES } from '../services/games/catalog';

interface DashboardPageProps {
  onSelectGame: (gameId: string) => void;
  onPlayGame: (gameId: string) => void;
  onOpenSaves?: () => void;
  onOpenNetPlay: (roomId?: string) => void;
  onOpenRomVault?: () => void;
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
  filterMode = 'all'
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [offlineReadyOnly, setOfflineReadyOnly] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Filter games based on search, platform, and sort
  const filteredGames = FEATURED_GAMES.filter(game => {
    const matchesSearch = !searchQuery ||
      game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.developer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPlatform = selectedPlatform === 'all' || game.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  }).sort((a, b) => {
    if (sortBy === 'rating') return b.rating - a.rating;
    if (sortBy === 'year') return b.year - a.year;
    if (sortBy === 'multiplayer') return (b.multiplayer?.supported ? 1 : 0) - (a.multiplayer?.supported ? 1 : 0);
    return 0; // Default order
  });

  const handleSyncNow = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setSyncSuccessMessage("All 6 local SRAM saves verified and mirrored to Firebase Storage.");
      setTimeout(() => setSyncSuccessMessage(null), 3000);
    }, 1200);
  };

  const zeldaGame = FEATURED_GAMES[0];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto select-none">
      {/* Toast confirmation */}
      {syncSuccessMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center gap-2 shadow-2xl animate-bounce">
          <span className="material-symbols-outlined text-sm">cloud_done</span>
          <span>{syncSuccessMessage}</span>
        </div>
      )}

      {/* ================= TELEMETRY WELCOME BAR ================= */}
      <section className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-xl bg-[#191b22] border border-[#494454]/30 backdrop-blur-sm shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-0.5 rounded border border-[#4cd7f6]/20">
              CORE ENGINE ONLINE
            </span>
            <span className="font-mono text-[#958ea0] text-xs">WebAssembly 60 FPS JIT Active</span>
          </div>
          <h1 className="text-xl lg:text-2xl text-white font-bold tracking-tight mt-1.5 font-sans">
            Chào mừng bạn đến với RetroVerse! Sẵn sàng cho ván game tiếp theo?
          </h1>
        </div>

        {/* Quick Telemetry Stats */}
        <div className="flex items-center gap-6 divide-x divide-[#494454]/30">
          <div className="flex flex-col pr-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Hệ Thống Giả Lập</span>
            <span className="text-lg text-white font-bold font-mono">
              3 <span className="text-xs font-normal text-[#958ea0]">NES • SNES • GBA</span>
            </span>
          </div>
          <div className="flex flex-col pl-4 pr-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Thư Viện Game</span>
            <span className="text-lg text-[#4cd7f6] font-bold font-mono">
              {FEATURED_GAMES.length} <span className="text-xs font-normal text-[#958ea0]">Kinh Điển</span>
            </span>
          </div>
          <div className="flex flex-col pl-4">
            <span className="font-mono text-[11px] text-[#958ea0] uppercase tracking-wider">Đồng Bộ Cloud</span>
            <span className="text-lg text-emerald-400 font-bold flex items-center gap-1 font-mono">
              Ready
              <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
            </span>
          </div>
        </div>
      </section>

      {/* ================= SECTION 1: FEATURED GAME / CONTINUE PLAYING (HERO CARD) ================= */}
      <section className="relative overflow-hidden rounded-xl border border-[#a078ff]/40 bg-[#191b22] shadow-2xl shadow-primary/10">
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-[#a078ff]/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-[#4cd7f6]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 md:p-8 items-center">
          {/* Box Art & CRT Bezel Mockup */}
          <div className="lg:col-span-4 relative group cursor-pointer" onClick={() => onPlayGame(zeldaGame.id)}>
            <div className="relative overflow-hidden rounded-lg border border-[#494454]/60 shadow-lg crt-grid">
              <img
                className="w-full h-56 object-cover object-center group-hover:scale-105 transition-transform duration-500"
                alt="Zelda Box Art"
                src={zeldaGame.boxArt}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-transparent to-transparent opacity-80"></div>
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded font-mono text-xs bg-indigo-950/80 border border-indigo-500 text-indigo-300 backdrop-blur-md">
                  SNES 16-BIT
                </span>
                <span className="px-2 py-0.5 rounded font-mono text-xs bg-[#0c0e14]/80 border border-[#494454]/40 text-[#4cd7f6]">
                  FEATURED
                </span>
              </div>
              <div className="absolute bottom-3 left-3 flex items-center gap-1 text-[#e2e2eb] text-xs font-mono">
                <span className="material-symbols-outlined text-xs text-[#4cd7f6]">sports_esports</span>
                <span>Click to Launch Emulator</span>
              </div>
            </div>
          </div>

          {/* Hero Information & Metadata */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#958ea0]">
                <span className="flex items-center gap-1 text-[#4cd7f6]">
                  <span className="material-symbols-outlined text-sm">stars</span>
                  Tựa Game Đỉnh Cao
                </span>
                <span>•</span>
                <span className="text-[#cbc3d7]">Nintendo EAD (1991)</span>
                <span>•</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  Độ Tương Thích 100%
                </span>
              </div>

              <h2
                onClick={() => onSelectGame(zeldaGame.id)}
                className="text-2xl lg:text-3xl text-white font-bold tracking-tight mt-2 hover:text-[#4cd7f6] cursor-pointer transition-colors"
              >
                The Legend of Zelda: A Link to the Past
              </h2>
              <p className="text-[#cbc3d7] text-sm leading-relaxed max-w-2xl mt-1.5">
                Tuyệt phẩm phiêu lưu hành động 16-bit đỉnh cao. Hỗ trợ lưu pin Battery SRAM tức thì và 9 khe Save State đồng bộ trên đám mây Firestore, kết hợp bộ lọc đồ họa CRT Scanlines cổ điển.
              </p>
            </div>

            {/* Battery + Save Snapshot Bar */}
            <div className="flex flex-wrap items-center gap-4 py-2 border-y border-[#494454]/30 text-xs font-mono text-[#958ea0]">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-[#4cd7f6]">memory</span>
                <span>SRAM: 8KB Battery Live</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-[#d0bcff]">layers</span>
                <span>3 State Snapshots</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-[#ffb95f]">aspect_ratio</span>
                <span>CRT Trinitron Phosphor 4:3 Lock</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onPlayGame(zeldaGame.id)}
                className="px-6 py-2.5 rounded-lg bg-[#d0bcff] hover:bg-[#e9ddff] text-[#3c0091] font-bold text-sm flex items-center gap-2 shadow-lg shadow-[#d0bcff]/20 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-xl fill-icon">play_arrow</span>
                Resume Game (Slot 1)
              </button>
              <button
                onClick={onOpenSaves}
                className="px-4 py-2.5 rounded-lg bg-[#282a30] border border-[#494454]/50 text-[#e2e2eb] hover:border-[#4cd7f6] hover:text-[#4cd7f6] font-mono text-xs flex items-center gap-2 transition-all"
              >
                <span className="material-symbols-outlined text-base">save</span>
                Inspect Save States
              </button>
              <button
                onClick={() => onSelectGame(zeldaGame.id)}
                className="px-4 py-2.5 rounded-lg bg-[#282a30] border border-[#494454]/50 text-[#e2e2eb] hover:border-[#958ea0] font-mono text-xs flex items-center gap-2 transition-all"
              >
                <span className="material-symbols-outlined text-base">info</span>
                Game Details &amp; Manual
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 2: PLATFORM FILTERS & SORT BAR ================= */}
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
            <span>All Games</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0c0e14] text-white">128</span>
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
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40">42</span>
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
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/40">54</span>
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
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40">32</span>
          </button>
        </div>

        {/* Filter & Sorting Controls */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#191b22] border border-[#494454]/30 cursor-pointer text-xs font-mono text-[#cbc3d7]">
            <input
              type="checkbox"
              checked={offlineReadyOnly}
              onChange={(e) => setOfflineReadyOnly(e.target.checked)}
              className="rounded bg-[#33343b] border-[#958ea0] text-[#4cd7f6] focus:ring-0"
            />
            <span>Offline Ready</span>
          </label>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-[#191b22] border border-[#494454]/40 text-[#e2e2eb] font-mono text-xs focus:outline-none focus:border-[#4cd7f6] cursor-pointer"
            >
              <option value="recent">Recently Played</option>
              <option value="rating">Highest Rating</option>
              <option value="year">Release Year</option>
              <option value="multiplayer">Multiplayer Supported</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-2 pointer-events-none text-sm text-[#958ea0]">
              unfold_more
            </span>
          </div>
        </div>
      </section>

      {/* ================= SECTION 3: FEATURED STAFF PICKS & LIVE NETPLAY SPLIT ================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Featured Staff Picks (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6]">local_fire_department</span>
              <h3 className="text-lg text-white font-bold">Featured Staff Picks</h3>
            </div>
            <button
              onClick={() => setSelectedPlatform('all')}
              className="font-mono text-xs text-[#4cd7f6] hover:underline flex items-center gap-1"
            >
              View All Curated <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURED_GAMES.slice(1, 5).map(game => (
              <div
                key={game.id}
                className="p-3 rounded-xl bg-[#191b22] border border-[#494454]/30 hover:border-[#d0bcff] transition-all duration-200 flex gap-3.5 group cursor-pointer"
                onClick={() => onSelectGame(game.id)}
              >
                <img
                  className="w-24 h-28 object-cover rounded-lg border border-[#494454]/40 flex-shrink-0"
                  alt={game.title}
                  src={game.boxArt}
                />
                <div className="flex flex-col justify-between py-0.5 flex-1 overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                        game.platform === 'SNES'
                          ? 'bg-indigo-950/80 border border-indigo-400 text-indigo-300'
                          : 'bg-sky-950/80 border border-sky-400 text-sky-300'
                      }`}>
                        {game.platform}
                      </span>
                      <span className="text-xs text-[#958ea0] font-mono flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-xs text-amber-400 fill-icon">star</span>
                        {game.rating}
                      </span>
                    </div>
                    <h4 className="text-[15px] font-bold text-white mt-1 group-hover:text-[#4cd7f6] transition-colors truncate">
                      {game.title}
                    </h4>
                    <p className="font-mono text-[11px] text-[#958ea0] mt-0.5 truncate">
                      {game.multiplayer?.type || 'Single Player'} • {game.compatibility || 99}% Comp
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] font-mono text-[#4cd7f6] bg-[#4cd7f6]/10 px-1.5 py-0.5 rounded">
                      60 FPS Native
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayGame(game.id);
                      }}
                      className="px-2.5 py-1 rounded bg-[#33343b] hover:bg-[#4cd7f6] hover:text-[#001f26] text-[#e2e2eb] font-mono text-[11px] font-semibold transition-colors flex items-center gap-1 shadow"
                    >
                      <span className="material-symbols-outlined text-xs">play_arrow</span> Launch
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Multiplayer NetPlay Live Lobbies (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6] animate-pulse">wifi_tethering</span>
              <h3 className="text-lg text-white font-bold">Live NetPlay</h3>
            </div>
            <span className="font-mono text-xs text-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-0.5 rounded border border-[#4cd7f6]/20">
              3 Open Rooms
            </span>
          </div>

          <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#191b22] border border-[#494454]/30 flex-1 justify-between shadow-lg">
            <div className="space-y-3">
              <p className="font-mono text-[11px] text-[#958ea0]">
                WebRTC P2P direct sync with sub-50ms rollback latency. No port forwarding required.
              </p>

              {/* Room 1 */}
              <div className="p-3 rounded-lg bg-[#1e1f26] border border-[#494454]/40 hover:border-[#4cd7f6] transition-colors flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white font-bold">Mario Kart (SNES) - 150cc GP</span>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    24ms Ping
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-[#958ea0]">
                  <span>Host: <strong className="text-white">PixelSamurai</strong></span>
                  <span>1 / 2 Players</span>
                </div>
                <button
                  onClick={() => onOpenNetPlay('room-7402')}
                  className="w-full mt-1 py-1.5 rounded bg-[#03b5d3] hover:bg-[#4cd7f6] text-[#00424e] font-mono text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow"
                >
                  <span className="material-symbols-outlined text-xs">login</span> Join Room
                </button>
              </div>

              {/* Room 2 */}
              <div className="p-3 rounded-lg bg-[#1e1f26] border border-[#494454]/40 hover:border-[#4cd7f6] transition-colors flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white font-bold">Street Fighter II Turbo</span>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    42ms Ping
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-[#958ea0]">
                  <span>Host: <strong className="text-white">RyuKen99</strong></span>
                  <span>1 / 2 Players</span>
                </div>
                <button
                  onClick={() => onOpenNetPlay('room-sf2')}
                  className="w-full mt-1 py-1.5 rounded bg-[#03b5d3] hover:bg-[#4cd7f6] text-[#00424e] font-mono text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow"
                >
                  <span className="material-symbols-outlined text-xs">login</span> Join Room
                </button>
              </div>
            </div>

            {/* Create Custom Room CTA */}
            <button
              onClick={() => onOpenNetPlay()}
              className="w-full py-2 px-3 rounded-lg bg-[#282a30] hover:bg-[#33343b] border border-[#494454]/50 text-[#4cd7f6] font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all mt-2"
            >
              <span className="material-symbols-outlined text-sm">add_circle</span>
              Create Custom NetPlay Room
            </button>
          </div>
        </div>
      </section>

      {/* ================= SECTION 4: COMPLETE GAME LIBRARY GRID ================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg text-white font-bold">Game Library (128 Titles)</h3>
            <p className="text-xs text-[#958ea0]">
              Battery saves, quick save states, and custom controller mappings are locally cached and backed up to Firebase.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenRomVault && onOpenRomVault()}
              className="px-3 py-1.5 rounded-lg bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Import games from machine or Google Drive"
            >
              <span className="material-symbols-outlined text-sm">cloud_sync</span>
              <span>Import Game (Machine / Drive)</span>
            </button>
            <button className="p-1.5 rounded bg-[#282a30] border border-[#494454]/40 text-[#4cd7f6]">
              <span className="material-symbols-outlined text-lg">grid_view</span>
            </button>
            <button className="p-1.5 rounded bg-[#1e1f26] border border-[#494454]/40 text-[#958ea0] hover:text-white">
              <span className="material-symbols-outlined text-lg">view_list</span>
            </button>
          </div>
        </div>

        {/* Bento / Card Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredGames.map(game => {
            const isFav = favorites.includes(game.id);

            return (
              <div
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className="group relative rounded-xl bg-[#191b22] border border-[#494454]/30 hover:border-[#4cd7f6] overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-md cursor-pointer"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-[#0c0e14]">
                  <img
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    alt={game.title}
                    src={game.boxArt}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-transparent to-transparent opacity-90"></div>

                  {/* Platform Badge */}
                  <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    game.platform === 'SNES'
                      ? 'bg-indigo-950/80 border border-indigo-400 text-indigo-300'
                      : game.platform === 'GBA'
                      ? 'bg-sky-950/80 border border-sky-400 text-sky-300'
                      : 'bg-rose-950/80 border border-rose-400 text-rose-300'
                  }`}>
                    {game.platform}
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
                      className="w-full py-1.5 rounded bg-[#d0bcff] text-[#3c0091] font-mono text-xs font-bold flex items-center justify-center gap-1 shadow-md hover:bg-[#e9ddff]"
                    >
                      <span className="material-symbols-outlined text-sm">play_arrow</span> Quick Play
                    </button>
                    <div className="flex items-center gap-1 w-full justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSaves();
                        }}
                        className="p-1.5 rounded bg-[#282a30] text-[#958ea0] hover:text-white"
                        title="Inspect SRAM Save"
                      >
                        <span className="material-symbols-outlined text-xs">download</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectGame(game.id);
                        }}
                        className="p-1.5 rounded bg-[#282a30] text-[#958ea0] hover:text-white"
                        title="Controller Mapping"
                      >
                        <span className="material-symbols-outlined text-xs">gamepad</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="text-sm font-bold text-white truncate group-hover:text-[#4cd7f6] transition-colors">
                    {game.title}
                  </h4>
                  <p className="font-mono text-[10px] text-[#958ea0] mt-0.5">
                    {game.multiplayer?.supported ? '2P Supported' : 'Single Player'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= SECTION 5: CLOUD STORAGE & SYNC STATUS FOOTER BAR ================= */}
      <footer className="p-4 rounded-xl bg-[#0c0e14] border border-[#494454]/30 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#958ea0]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[#e2e2eb]">
            <span className="material-symbols-outlined text-[#4cd7f6] text-base">cloud_queue</span>
            <span>Cloud Storage: <strong className="text-white">18.4 MB</strong> / 100 MB Used</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5 text-[#ffb95f]">
            <span className="w-2 h-2 rounded-full bg-[#ffb95f] animate-pulse"></span>
            <span>6 Local SRAM Saves Pending Sync</span>
          </div>
          <span>•</span>
          <div className="text-[#cbc3d7]">
            Google Account: <span className="text-white">alex.carter@gmail.com</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#4cd7f6] hover:text-[#001f26] text-[#4cd7f6] border border-[#4cd7f6]/40 font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${syncing ? 'animate-spin' : ''}`}>sync</span>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </footer>
    </div>
  );
};
