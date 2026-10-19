/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TopNavBar } from './components/TopNavBar';
import { SideNavBar } from './components/SideNavBar';
import { SearchModal } from './components/SearchModal';
import { DashboardPage } from './pages/DashboardPage';
import { GameDetailPage } from './pages/GameDetailPage';
import { EmulatorPage } from './pages/EmulatorPage';
import { NetPlayLobbyPage } from './pages/NetPlayLobbyPage';
import { SettingsPage } from './pages/SettingsPage';
import { SavesPage } from './pages/SavesPage';
import { RomVaultPage } from './pages/RomVaultPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChangelogPage } from './pages/ChangelogPage';
import { FEATURED_GAMES, getGameById } from './services/games/catalog';
import { Game } from './types';
import { RomHeaderInfo } from './emulator/romParser';
import { romStorage } from './services/roms/romStorage';

export default function App() {
  // Navigation & View state
  const [currentTab, setCurrentTab] = useState<string>('browse');
  const [activeView, setActiveView] = useState<'main' | 'game-detail' | 'emulator' | 'netplay'>('main');
  const [selectedGameId, setSelectedGameId] = useState<string>('zelda-alttp');
  const [activeSaveSlot, setActiveSaveSlot] = useState<number>(1);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [vaultSourceMode, setVaultSourceMode] = useState<'local' | 'drive'>('local');
  const [netplayRoomId, setNetplayRoomId] = useState<string | undefined>(undefined);

  // User State (Clean production: starts empty, populates on user actions)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('retroverse_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [recentGames, setRecentGames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('retroverse_recents');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Global ⌘K / Ctrl+K keyboard shortcut listener for Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleFavorite = (gameId: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId];
      try {
        localStorage.setItem('retroverse_favorites', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleSelectGame = (gameId: string) => {
    setSelectedGameId(gameId);
    setActiveView('game-detail');
  };

  const handlePlayGame = (gameId: string, slot: number = 1) => {
    setSelectedGameId(gameId);
    setActiveSaveSlot(slot);
    setActiveView('emulator');

    // Update recents
    setRecentGames((prev) => {
      const filtered = prev.filter((id) => id !== gameId);
      const updated = [gameId, ...filtered].slice(0, 8);
      try {
        localStorage.setItem('retroverse_recents', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleCustomRomLoaded = (customGame: Game, romData: Uint8Array) => {
    romStorage.saveRom(customGame.id, customGame.title, customGame.platform, romData);
    FEATURED_GAMES.unshift(customGame);
    setSelectedGameId(customGame.id);
    setActiveView('emulator');
  };

  const handleLaunchRomFromVault = (romData: Uint8Array, headerInfo: RomHeaderInfo) => {
    const customGame: Game = {
      id: `custom-${Date.now()}`,
      title: headerInfo.internalTitle || headerInfo.filename,
      platform: headerInfo.platform === 'UNKNOWN' ? 'NES' : headerInfo.platform,
      year: 1995,
      developer: 'Imported Cartridge',
      genre: 'Custom / Homebrew',
      rating: 5.0,
      ratingCount: 1,
      boxArt: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
      artwork: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
      description: `Locally loaded ROM file: ${headerInfo.filename}. Type: ${headerInfo.romSpeedAndType}, Checksum: ${headerInfo.crc32}. Running client-side via WebAssembly sandbox.`,
      players: '1-2 Players',
      releaseDate: 'Physical Backup',
      features: ['Client WASM', 'SRAM Battery', 'Raw Pixel Perfect'],
      compatibilityScore: 99
    };
    romStorage.saveRom(customGame.id, headerInfo.filename, customGame.platform, romData);
    FEATURED_GAMES.unshift(customGame);
    setSelectedGameId(customGame.id);
    setActiveView('emulator');
  };

  const handleNavigate = (tab: string, param?: string) => {
    if (tab === 'game-detail' && param) {
      setSelectedGameId(param);
      setActiveView('game-detail');
      return;
    }
    if (tab === 'emulator' && param) {
      handlePlayGame(param);
      return;
    }
    if (tab === 'rooms' || tab === 'netplay') {
      setNetplayRoomId(param || undefined);
      setActiveView('netplay');
      setCurrentTab('rooms');
      return;
    }
    if (tab === 'vault') {
      if (param === 'drive' || param === 'local') {
        setVaultSourceMode(param);
      }
      setCurrentTab('vault');
      setActiveView('main');
      return;
    }

    setCurrentTab(tab);
    setActiveView('main');
  };

  return (
    <div className="min-h-screen bg-[#111319] text-[#e2e2eb] font-sans antialiased flex flex-col selection:bg-[#4cd7f6]/30 selection:text-[#4cd7f6]">
      {/* 1. Global Top Navigation Bar */}
      <TopNavBar
        currentTab={activeView === 'netplay' ? 'rooms' : currentTab}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setSearchModalOpen(true);
        }}
      />

      {/* 2. Main Body Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation Rail (Hidden when actively in Emulator page to give full screen focus) */}
        {activeView !== 'emulator' && (
          <aside className="hidden lg:block w-64 xl:w-72 border-r border-[#494454]/20 bg-[#16171e]/70 shrink-0 overflow-y-auto">
            <SideNavBar
              currentTab={activeView === 'netplay' ? 'rooms' : currentTab}
              onNavigate={handleNavigate}
              favoriteCount={favorites.length}
              totalGameCount={128}
              saveCount={5}
              onCustomRomLoaded={handleCustomRomLoaded}
            />
          </aside>
        )}

        {/* Dynamic Center Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* View 1: Playable In-Game Emulator Screen */}
          {activeView === 'emulator' && (
            <EmulatorPage
              gameId={selectedGameId}
              initialSlot={activeSaveSlot}
              onExit={() => setActiveView(selectedGameId ? 'game-detail' : 'main')}
              onOpenSettings={() => {
                setActiveView('main');
                setCurrentTab('settings');
              }}
            />
          )}

          {/* View 2: Game Detail Cartridge Inspection Screen */}
          {activeView === 'game-detail' && (
            <GameDetailPage
              gameId={selectedGameId}
              onBack={() => setActiveView('main')}
              onPlayGame={(id, slot) => handlePlayGame(id, slot)}
              onOpenNetPlay={() => {
                setActiveView('netplay');
                setCurrentTab('rooms');
              }}
              isFavorited={favorites.includes(selectedGameId)}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {/* View 3: NetPlay WebRTC Multiplayer Lobby */}
          {activeView === 'netplay' && (
            <NetPlayLobbyPage
              roomId={netplayRoomId}
              onLaunchGame={(gameId) => handlePlayGame(gameId)}
              onLeaveRoom={() => {
                setNetplayRoomId(undefined);
                setActiveView('main');
                setCurrentTab('browse');
              }}
            />
          )}

          {/* View 4: Main Tabs (Dashboard, Settings, Saves, Vault, Profile, Changelog) */}
          {activeView === 'main' && (
            <>
              {(currentTab === 'browse' || currentTab === 'library' || currentTab === 'favorites' || currentTab === 'recent') && (
                <DashboardPage
                  onSelectGame={handleSelectGame}
                  onPlayGame={(id) => handlePlayGame(id, 1)}
                  onOpenNetPlay={() => {
                    setNetplayRoomId(undefined);
                    setActiveView('netplay');
                    setCurrentTab('rooms');
                  }}
                  onOpenRomVault={() => setCurrentTab('vault')}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  filterMode={
                    currentTab === 'favorites' ? 'favorites' : currentTab === 'recent' ? 'recent' : 'all'
                  }
                />
              )}

              {currentTab === 'settings' && (
                <SettingsPage
                  onBack={() => setCurrentTab('browse')}
                  onLaunchRom={() => setCurrentTab('vault')}
                />
              )}

              {currentTab === 'saves' && (
                <SavesPage
                  onPlayGame={(id, slot) => handlePlayGame(id, slot)}
                  onBack={() => setCurrentTab('browse')}
                  onNavigateToVault={() => setCurrentTab('vault')}
                />
              )}

              {currentTab === 'vault' && (
                <RomVaultPage
                  initialSourceMode={vaultSourceMode}
                  onLaunchRom={handleLaunchRomFromVault}
                  onBack={() => setCurrentTab('browse')}
                  onAddCustomGame={(game, bytes) => handleCustomRomLoaded(game, bytes)}
                />
              )}

              {currentTab === 'profile' && (
                <ProfilePage
                  onBack={() => setCurrentTab('browse')}
                  onPlayGame={(id) => handlePlayGame(id, 1)}
                />
              )}

              {currentTab === 'changelog' && (
                <ChangelogPage
                  onBack={() => setCurrentTab('browse')}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* 3. Global Command Palette Modal (⌘K) */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectGame={(id) => {
          handleSelectGame(id);
          setSearchModalOpen(false);
        }}
        onPlayGame={(id) => {
          handlePlayGame(id);
          setSearchModalOpen(false);
        }}
      />
    </div>
  );
}
