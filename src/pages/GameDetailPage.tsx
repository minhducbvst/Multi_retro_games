import React, { useState } from 'react';
import { Game } from '../types';
import { getGameById, FEATURED_GAMES } from '../services/games/catalog';

interface GameDetailPageProps {
  gameId: string;
  onBack: () => void;
  onPlayGame: (gameId: string, slot?: number) => void;
  onOpenNetPlay: (roomId?: string) => void;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'states' | 'controls' | 'manual' | 'speedruns'>('overview');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const game = getGameById(gameId) || FEATURED_GAMES[0];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

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
          <button className="px-2.5 py-1 text-xs font-mono rounded bg-[#282a30] text-[#e2e2eb] border border-[#494454]/30 hover:border-[#4cd7f6] transition-colors flex items-center gap-1.5">
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
              onClick={() => onOpenNetPlay('room-7402')}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#191b22] border border-cyan-500/40 hover:border-cyan-400 text-white font-mono text-xs transition-all group"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">hub</span>
                <span>Create Co-Op Room</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-[#4cd7f6] border border-cyan-500/40">
                NetPlay Ready
              </span>
            </button>

            {/* ROM Management Dropdown Strip */}
            <div className="flex items-center justify-between text-xs font-mono text-[#958ea0] px-1">
              <button onClick={() => showToast(".SRM Battery Save Exported to Downloads (8KB)")} className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors">
                <span className="material-symbols-outlined text-xs">download</span>
                Export .SRM
              </button>
              <span>•</span>
              <button onClick={() => showToast("State Snapshot Captured (512 KB)")} className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors">
                <span className="material-symbols-outlined text-xs">save_as</span>
                Save State
              </button>
              <span>•</span>
              <button onClick={() => showToast("Switched to Snes9x 2010 Cycle-Accurate Core")} className="hover:text-[#4cd7f6] flex items-center gap-1 transition-colors">
                <span className="material-symbols-outlined text-xs">swap_horiz</span>
                Cores
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
              <span>Save States &amp; Cloud (3)</span>
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

          {/* Tab 1: Overview & Story */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              {/* Narrative Synopsis Card */}
              <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg text-[#d0bcff] font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#4cd7f6]">swords</span>
                    The Golden Land Awaits
                  </h3>
                  <span className="text-xs font-mono text-[#958ea0] uppercase tracking-wider">Campaign Synopsis</span>
                </div>
                <p className="text-sm text-[#e2e2eb] leading-relaxed">
                  Centuries before the awakening of the Hero of Time, the dark wizard Agahnim usurps the royal throne of Hyrule, breaking the seal cast by the Seven Wise Men. Telepathically guided by Princess Zelda during a thunderstorm, the young apprentice Link uncovers his ancestral destiny.
                </p>
                <p className="text-sm text-[#cbc3d7] leading-relaxed">
                  By wielding the legendary Master Sword, traversing through mystical Magic Mirrors, and shifting freely between the idyllic Light World and the cursed Dark World, you must reclaim the three Pendants of Virtue and retrieve the Golden Power before Ganon claims total dominion.
                </p>

                {/* Key Highlights Micro-Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Dungeons</div>
                    <div className="text-sm text-white font-bold">12 Total + Caves</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Items &amp; Magic</div>
                    <div className="text-sm text-white font-bold">24 Collectibles</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Heart Containers</div>
                    <div className="text-sm text-white font-bold">20 Max Hearts</div>
                  </div>
                  <div className="bg-[#0c0e14] p-2.5 rounded border border-[#494454]/20">
                    <div className="text-[11px] font-mono text-[#958ea0]">Avg Completion</div>
                    <div className="text-sm text-white font-bold">14 - 16 Hours</div>
                  </div>
                </div>
              </div>

              {/* Technical Specifications Grid Card */}
              <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 flex flex-col gap-4 shadow-lg">
                <h3 className="text-base text-white font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-lg">terminal</span>
                  Technical Emulation Specifications
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Native Resolution</span>
                    <span className="text-white font-bold text-sm">256 × 224 px</span>
                    <span className="text-[10px] text-[#958ea0] block mt-0.5">Mode 7 Enabled</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Display Standard</span>
                    <span className="text-white font-bold text-sm">4:3 NTSC (60.098Hz)</span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">Zero Tear V-Sync</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Cartridge ROM Size</span>
                    <span className="text-white font-bold text-sm">1.0 MB (8 Megabits)</span>
                    <span className="text-[10px] text-[#958ea0] block mt-0.5">SHA1: d6d0...c1a9</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/20">
                    <span className="text-[#958ea0] block mb-1">Save State System</span>
                    <span className="text-white font-bold text-sm">8KB SRAM + 5 Slots</span>
                    <span className="text-[10px] text-[#4cd7f6] block mt-0.5">Cloud Mirror Synced</span>
                  </div>
                </div>
              </div>

              {/* Direct Phosphor Feed Gallery */}
              <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 flex flex-col gap-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-base text-white font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#4cd7f6] text-lg">photo_library</span>
                    Phosphor Capture Gallery (Direct Feed)
                  </h3>
                  <span className="text-xs font-mono text-[#958ea0]">Click to zoom 4:3 CRT</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-[#494454]/40 bg-black cursor-pointer hover:border-[#4cd7f6] transition-all">
                    <img
                      alt="Hyrule Castle Rain"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHQzUCnum_fUzgFP5dIY9JuYRJasCjLkO9mN6-pQfE1woEV6v8q2YKxqQ0ZhbVBZ3vcDhRqP-VUVZ4KsI8GC53y-Z4yjYETlaoj907SiTQq9geIfAoaAuBoZd9TH0qp-tVbuUIb5c4KqIk6mk8cev3WwOVg7n4MKVqKj4rCt97NkeP-xNxWMdq9ejfsjfgNdjfN1O1F3LhtoXIAxiCgpscRPqeMHNTVoM5T0g9kPu45LMBL07gK30eLA"
                    />
                    <div className="absolute inset-0 scanlines-overlay opacity-30"></div>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                      Hyrule Castle Rain
                    </div>
                  </div>

                  <div className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-[#494454]/40 bg-black cursor-pointer hover:border-[#4cd7f6] transition-all">
                    <img
                      alt="Lost Woods Sanctuary"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDvvFi0MqraGDizApVbSMpUAxRRCzLFII_Bh7aZ-exNkOiD05pf0IM5OM-HBkZA9rHCUkbksST2YbWiYZSTbB4k4aqViWkBHb9IxI751UjsBi_tVEKsevAYxoh4dBb_UsART1R1rCfPOkVRTRVpG77CtfkEJCuJJ3XkOVw6ZnDASHPPh_s8k4up0YkBC1P4LAaZ_Z8VcGX5KFqNJpQNENWJasd4XVjekdUMS6g3fzmB4Uyu9ZY3GUvd7Q"
                    />
                    <div className="absolute inset-0 scanlines-overlay opacity-30"></div>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                      Lost Woods Sanctuary
                    </div>
                  </div>

                  <div className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-[#494454]/40 bg-black cursor-pointer hover:border-[#4cd7f6] transition-all">
                    <img
                      alt="Dark World Pyramid"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3qa7ZcOe4b3q7JXFcuIUn9pbiu-Z_nyNoPKAEB9zlYKUNJlfix_xsXv8sord3CP1KcXmagcEcZrQ0O-Whx3LfWTUH6IYrFxTa20v7TcJUzQCDppVOP4Q8YEaveSvHpyQZY5Q956d6QihD1IEGdmB76M24M-owfPGpcTfObLRMxwyGbLSDdbBXJ-2-PYSwk3f1t_XHDeJJAYLsW7xnWaN4DY3jmgxResE69vBQy2m6Wq56Agfdh4HmEw"
                    />
                    <div className="absolute inset-0 scanlines-overlay opacity-30"></div>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                      Dark World Pyramid
                    </div>
                  </div>

                  <div className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-[#494454]/40 bg-black cursor-pointer hover:border-[#4cd7f6] transition-all">
                    <img
                      alt="Eastern Palace Boss"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuCBD-9DDN4YXFHn_ZC_LWteVITIyKZpnKvs_PNBoyaOU6v9IO4OKXm1siEmcWf3H_Xu1a28HLsJhVHrvJGYdEPi7WcUSYvWDcjBh3a0Qo36hkgAN459lb3SqJ7pTxgCN4uJNWYcC60r5sOyDD5L5_T6UjoqfSXjrnRTryRF2SCarhoYjRQwQNfQ1GWMmsokctxlwnUa8GR2YmSqpuv6rj6jLy4OcKPS1fZJJd5Z9Wq0i4syc_TAn6csEQ"
                    />
                    <div className="absolute inset-0 scanlines-overlay opacity-30"></div>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                      Eastern Palace Boss
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'states' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-4">
              <h3 className="text-base text-white font-bold font-mono">Cloud Mirrors &amp; Battery Slots</h3>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/40 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-sm">Slot 1: Sanctuary Crypt</span>
                    <p className="text-xs text-[#958ea0] font-mono">512 KB • MD5: a7f893b1 • Synced 15m ago</p>
                  </div>
                  <button onClick={() => onPlayGame(game.id, 1)} className="px-3 py-1 rounded bg-[#a078ff] text-[#340080] font-bold text-xs">
                    Load Slot 1
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/40 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-sm">Slot 2: Dungeon 2 Boss</span>
                    <p className="text-xs text-[#958ea0] font-mono">1024 KB • State Revision #4 • Synced yesterday</p>
                  </div>
                  <button onClick={() => onPlayGame(game.id, 2)} className="px-3 py-1 rounded bg-[#282a30] text-[#e2e2eb] font-bold text-xs hover:border-[#4cd7f6]">
                    Load Slot 2
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-[#0c0e14] border border-[#494454]/40 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-sm">Slot 3: Overworld Patrol</span>
                    <p className="text-xs text-[#958ea0] font-mono">512 KB • Created 25m ago during session pause</p>
                  </div>
                  <button onClick={() => onPlayGame(game.id, 3)} className="px-3 py-1 rounded bg-[#282a30] text-[#e2e2eb] font-bold text-xs hover:border-[#4cd7f6]">
                    Load Slot 3
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-4">
              <h3 className="text-base text-white font-bold font-mono">Controller Profile: SNES Standard</h3>
              <p className="text-xs text-[#958ea0]">Compatible with Xbox, DualSense, 8BitDo, and keyboard bindings.</p>
              <div className="bg-[#0c0e14] rounded-lg p-3 border border-[#494454]/20 flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-[#494454]/20">
                  <span className="text-[#958ea0]">D-Pad Movement</span>
                  <span className="text-white font-bold">Arrow Keys / Analog Stick</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#494454]/20">
                  <span className="text-[#958ea0]">Attack / Sword</span>
                  <span className="text-white font-bold">Z / Button B</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#494454]/20">
                  <span className="text-[#958ea0]">Action / Dash</span>
                  <span className="text-white font-bold">X / Button A</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#494454]/20">
                  <span className="text-[#958ea0]">Item Use</span>
                  <span className="text-white font-bold">S / Button Y</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="p-6 rounded-xl bg-[#191b22] border border-[#494454]/30 space-y-3 font-mono text-xs text-[#cbc3d7]">
              <h3 className="text-base text-white font-bold font-sans">Official Instruction Booklet Excerpt</h3>
              <p>Long ago, in the beautiful kingdom of Hyrule surrounded by mountains and forests, legends told of an omnipotent and omniscient Golden Power that resided in a hidden land...</p>
              <p>Use the Magic Mirror to return to the Light World from anywhere in the Dark World. Remember to save your game frequently at Sanctuary or in dungeon vestibules.</p>
            </div>
          )}
        </div>

        {/* Right Column: Active Save, Hardware, Sessions & Recommendations (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Active Save State Snapshot */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#4cd7f6] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">save</span>
                ACTIVE SAVE STATE (SLOT 1)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Cloud Synced
              </span>
            </div>

            <div className="relative aspect-video rounded-lg overflow-hidden border border-[#494454]/50 group bg-[#0c0e14]">
              <img
                alt="Save State Thumbnail"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNPzVFiIt_8Zg5lXST7I4SWrMSBjSyDG-prJtsU3dsEHASHpRjBttPzAoZj4Wj23DT2CqTsqhWzRLyL1tXGcLG5mWWYsHY5TXci5JyOr0T66lBlp3y_QqxBrgu1fmiEfDrlzVXcuHAHLRopKNP9hC8yZ0RoQTlAbNBMU-YeZlmTU1N9BDOJElvqZhivfQ1IS8UbrTWdlp4AHojCqbPFhOE3yuwj1BU4ZmQCPQfze5vI9w55HH_aw3f8A"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
              <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                <div>
                  <div className="text-xs text-white font-bold">Sanctuary Crypt Entrance</div>
                  <div className="text-[11px] font-mono text-[#958ea0]">3 Pendants • 14 Hearts • Level 3 Sword</div>
                </div>
                <div className="text-[10px] font-mono text-[#ffb95f]">15m ago</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => onPlayGame(game.id, 1)}
                className="py-2 px-3 rounded bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 border border-[#4cd7f6]/50 text-[#4cd7f6] font-mono text-xs flex items-center justify-center gap-1.5 transition-colors font-bold"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                Load Slot 1
              </button>
              <button
                onClick={() => showToast("Save Slot 1 Overwritten with Current State")}
                className="py-2 px-3 rounded bg-[#282a30] hover:bg-[#33343b] border border-[#494454]/40 text-[#e2e2eb] font-mono text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-base">save</span>
                Overwrite
              </button>
            </div>
          </div>

          {/* Controller Mapping Setup */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">sports_esports</span>
                SNES CONTROLLER MAPPING
              </span>
              <button onClick={() => showToast("Navigating to Remapper in Settings...")} className="text-[11px] font-mono text-[#4cd7f6] hover:underline">
                Remap Keys
              </button>
            </div>

            <div className="bg-[#0c0e14] rounded-lg p-3 border border-[#494454]/20 flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">D-Pad / Left Stick</span>
                <span className="text-white font-bold">Move Link (8-Way)</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Button A (Xbox B)</span>
                <span className="text-white font-bold">Action / Lift / Speak</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Button B (Xbox A)</span>
                <span className="text-white font-bold">Attack / Spin Slash</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-[#494454]/20">
                <span className="text-[#958ea0]">Button Y (Xbox X)</span>
                <span className="text-white font-bold">Dash (Pegasus Boots)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#958ea0]">Bumpers L / R</span>
                <span className="text-white font-bold">Quick Cycle Inventory</span>
              </div>
            </div>
          </div>

          {/* Recent Sessions & Playtime Stats */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#4cd7f6]">query_stats</span>
              SESSION METRICS &amp; SPEEDRUN
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-[#0c0e14] border border-[#494454]/20">
                <div className="text-[10px] font-mono text-[#958ea0]">Total Play</div>
                <div className="text-sm text-white font-bold">18h 42m</div>
              </div>
              <div className="p-2 rounded bg-[#0c0e14] border border-[#494454]/20">
                <div className="text-[10px] font-mono text-[#958ea0]">Last Session</div>
                <div className="text-sm text-white font-bold">Today 14:20</div>
              </div>
              <div className="p-2 rounded bg-[#0c0e14] border border-[#494454]/20">
                <div className="text-[10px] font-mono text-[#4cd7f6]">Best Any%</div>
                <div className="text-sm text-[#4cd7f6] font-bold">1h 45m</div>
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#33343b]/40 border border-[#494454]/30 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ffb95f] text-base">leaderboard</span>
                <span className="text-white">Global Rank #842</span>
              </div>
              <span className="text-[#958ea0]">Top 12% in Hyrule</span>
            </div>
          </div>

          {/* Recommended Classics */}
          <div className="p-5 rounded-xl bg-[#191b22] border border-[#494454]/40 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4cd7f6]">auto_awesome</span>
                RECOMMENDED CLASSICS
              </span>
              <span className="text-[11px] font-mono text-[#958ea0]">Cross-Platform</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {FEATURED_GAMES.slice(1, 4).map(rec => (
                <div
                  key={rec.id}
                  onClick={() => onPlayGame(rec.id)}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#0c0e14] border border-[#494454]/20 hover:border-[#4cd7f6] transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <img className="w-10 h-10 rounded object-cover" alt={rec.title} src={rec.boxArt} />
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-[#4cd7f6] transition-colors">
                        {rec.title}
                      </div>
                      <div className="text-[10px] font-mono text-[#958ea0]">{rec.platform} • {rec.developer}</div>
                    </div>
                  </div>
                  <button className="px-2 py-1 rounded text-[11px] font-mono bg-[#282a30] text-[#4cd7f6] hover:bg-[#4cd7f6] hover:text-[#001f26] transition-colors">
                    Launch
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
