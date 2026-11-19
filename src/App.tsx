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
import { NetPlayLobbyPage, ActiveNetplayLaunch } from './pages/NetPlayLobbyPage';
import { SettingsPage } from './pages/SettingsPage';
import { SavesPage } from './pages/SavesPage';
import { RomVaultPage } from './pages/RomVaultPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChangelogPage } from './pages/ChangelogPage';
import { Game } from './types';
import { RomHeaderInfo } from './emulator/romParser';
import { romStorage } from './services/roms/romStorage';
import { roomService } from './services/multiplayer/roomService';
import { webrtcNetplay } from './services/multiplayer/webrtcNetplay';
import { auth } from './services/firebase';

import { libraryStore, useLibraryStore, getCartridgeCoverArt } from './services/games/libraryStore';

function getInitialRoomCodeFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room')?.trim();
    return code ? code.toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}

export default function App() {
  const libraryGames = useLibraryStore();
  const [initialRoomCode, setInitialRoomCode] = useState<string | undefined>(() => getInitialRoomCodeFromUrl());
  const [currentTab, setCurrentTab] = useState<string>(() => (getInitialRoomCodeFromUrl() ? 'rooms' : 'browse'));
  const [activeView, setActiveView] = useState<'main' | 'game-detail' | 'emulator' | 'netplay'>(() =>
    getInitialRoomCodeFromUrl() ? 'netplay' : 'main'
  );
  const [selectedGameId, setSelectedGameId] = useState<string>(() => libraryStore.getGames()[0]?.id || '');
  const [activeSaveSlot, setActiveSaveSlot] = useState<number>(1);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [vaultSourceMode, setVaultSourceMode] = useState<'local' | 'drive'>('local');
  const [netplayRoomId, setNetplayRoomId] = useState<string | undefined>(undefined);
  const [preselectedNetplayGameId, setPreselectedNetplayGameId] = useState<string | undefined>(undefined);
  const [netplaySession, setNetplaySession] = useState<ActiveNetplayLaunch | null>(null);
  const [lockedGuestSession, setLockedGuestSession] = useState<ActiveNetplayLaunch | null>(null);
  const [showGuestStandbyCard, setShowGuestStandbyCard] = useState<boolean>(false);
  const [guestRoomClosedNotice, setGuestRoomClosedNotice] = useState<{
    code: string;
    gameTitle: string;
    hostName: string;
  } | null>(null);

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

  // Initialize IndexedDB ROM storage on mount
  useEffect(() => {
    romStorage.init();
  }, []);

  // Sync locked Guest standby screen with live room updates (auto-detect Host close or game changes)
  useEffect(() => {
    if (!lockedGuestSession) return;
    const roomId = lockedGuestSession.room.id;
    const unsub = roomService.subscribeToRoom(roomId, (updated) => {
      if (!updated) {
        setGuestRoomClosedNotice({
          code: lockedGuestSession.room.code,
          gameTitle: lockedGuestSession.room.gameTitle,
          hostName: lockedGuestSession.room.hostName,
        });
        setShowGuestStandbyCard(true);
        setActiveView('main');
        try {
          if (new URLSearchParams(window.location.search).has('room')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {}
        return;
      }
      setLockedGuestSession((prev) =>
        prev && prev.room.id === updated.id ? { ...prev, room: updated } : prev
      );
      setSelectedGameId(updated.gameId);
    });
    return () => unsub();
  }, [lockedGuestSession?.room.id]);

  // Global ⌘K / Ctrl+K keyboard shortcut listener for Search (disabled in locked Guest invite mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lockedGuestSession) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockedGuestSession]);

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

  const cleanupHostedRoomIfActive = () => {
    const currentUid = auth.currentUser?.uid;
    const hostedRoom =
      (netplaySession?.role === 'host' ? netplaySession.room : null) ||
      roomService.getActiveRoom();
    if (hostedRoom && currentUid && hostedRoom.hostUid === currentUid) {
      webrtcNetplay.stopSession();
      void roomService.leaveRoom(hostedRoom.id, currentUid);
      try {
        if (new URLSearchParams(window.location.search).has('room')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch {}
      setNetplaySession(null);
      setNetplayRoomId(undefined);
      setInitialRoomCode(undefined);
      setPreselectedNetplayGameId(undefined);
    }
  };

  const handleSelectGame = (gameId: string) => {
    cleanupHostedRoomIfActive();
    setSelectedGameId(gameId);
    setActiveView('game-detail');
  };

  const handlePlayGame = (gameId: string, slot: number = 1) => {
    cleanupHostedRoomIfActive();
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
    cleanupHostedRoomIfActive();
    const saved = libraryStore.addGame(customGame);
    romStorage.saveRom(saved.id, saved.romFilename || saved.title, saved.platform, romData);
    setSelectedGameId(saved.id);
    setActiveView('emulator');
  };

  const handleLaunchRomFromVault = (romData: Uint8Array, headerInfo: RomHeaderInfo) => {
    cleanupHostedRoomIfActive();
    const plat = headerInfo.platform === 'UNKNOWN' ? 'NES' : headerInfo.platform;
    const title = headerInfo.internalTitle || headerInfo.filename;
    const customGame: Game = {
      id: `custom-${Date.now()}`,
      title,
      platform: plat,
      year: 1995,
      developer: 'Tải lên từ máy tính',
      genre: 'Custom / Backup',
      rating: 5.0,
      ratingCount: 1,
      boxArt: getCartridgeCoverArt(title, plat),
      description: `Tệp ROM: ${headerInfo.filename}. Checksum: ${headerInfo.crc32}. Chạy trực tiếp trong WebAssembly sandbox.`,
      players: '1-2 Players',
      releaseDate: 'Physical Backup',
      features: ['Client WASM', 'SRAM Battery', headerInfo.coProcessor],
      batterySave: headerInfo.hasBattery,
      source: 'local',
      romFilename: headerInfo.filename,
      crc32: headerInfo.crc32,
      md5: headerInfo.md5,
      compatibilityScore: 100
    };
    const saved = libraryStore.addGame(customGame);
    romStorage.saveRom(saved.id, headerInfo.filename, plat, romData);
    setSelectedGameId(saved.id);
    setActiveView('emulator');
  };

  const handleNavigate = (tab: string, param?: string) => {
    // Locked Guest invited via link cannot browse Library or select another game
    if (lockedGuestSession) {
      return;
    }

    if (tab === 'rooms' || tab === 'netplay') {
      const activeRoom = roomService.getActiveRoom();
      if (activeRoom) {
        if (!param || param === activeRoom.id) {
          // Clicking Multiplayer/Rooms while already in a room keeps the active room alive
          setNetplayRoomId(activeRoom.id);
          setActiveView('netplay');
          setCurrentTab('rooms');
          return;
        }
        cleanupHostedRoomIfActive();
      }
      setNetplayRoomId(param || undefined);
      setPreselectedNetplayGameId(undefined);
      setActiveView('netplay');
      setCurrentTab('rooms');
      return;
    }

    cleanupHostedRoomIfActive();

    if (tab === 'game-detail' && param) {
      setSelectedGameId(param);
      setActiveView('game-detail');
      return;
    }
    if (tab === 'emulator' && param) {
      handlePlayGame(param);
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

  const handleLeaveNetplayMatch = (roomClosed: boolean = false) => {
    if (lockedGuestSession) {
      webrtcNetplay.stopSession();
      setNetplaySession(null);
      if (roomClosed) {
        setGuestRoomClosedNotice({
          code: lockedGuestSession.room.code,
          gameTitle: lockedGuestSession.room.gameTitle,
          hostName: lockedGuestSession.room.hostName,
        });
        try {
          if (new URLSearchParams(window.location.search).has('room')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {}
      }
      setShowGuestStandbyCard(true);
      setActiveView('main');
      return;
    }

    if (!netplaySession) {
      setActiveView(selectedGameId ? 'game-detail' : 'main');
      return;
    }

    const returnRoomId = netplaySession.room.id;
    if (netplaySession.role === 'host') {
      // Host exiting game deletes the room immediately
      webrtcNetplay.stopSession();
      void roomService.leaveRoom(returnRoomId, netplaySession.playerUid);
      try {
        if (new URLSearchParams(window.location.search).has('room')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch {}
      setNetplaySession(null);
      setNetplayRoomId(undefined);
      setInitialRoomCode(undefined);
      setPreselectedNetplayGameId(undefined);
      setCurrentTab('rooms');
      setActiveView('netplay');
      return;
    }

    setNetplaySession(null);
    if (roomClosed) {
      try {
        if (new URLSearchParams(window.location.search).has('room')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch {}
      setNetplayRoomId(undefined);
    } else {
      setNetplayRoomId(returnRoomId);
    }
    setCurrentTab('rooms');
    setActiveView('netplay');
  };

  return (
    <div className="min-h-screen bg-[#111319] text-[#e2e2eb] font-sans antialiased flex flex-col selection:bg-[#4cd7f6]/30 selection:text-[#4cd7f6]">
      {/* 1. Global Top Navigation Bar (Hidden in Locked Guest Invite Mode so guest sees only game) */}
      {!lockedGuestSession && (
        <TopNavBar
          currentTab={activeView === 'netplay' ? 'rooms' : currentTab}
          onNavigate={handleNavigate}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setSearchModalOpen(true);
          }}
          guestLockedRoom={null}
        />
      )}

      {/* 2. Main Body Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation Rail (Hidden in Emulator & Locked Guest Invite Mode) */}
        {activeView !== 'emulator' && !lockedGuestSession && (
          <aside className="hidden lg:block w-64 xl:w-72 border-r border-[#494454]/20 bg-[#16171e]/70 shrink-0 overflow-y-auto">
            <SideNavBar
              currentTab={activeView === 'netplay' ? 'rooms' : currentTab}
              onNavigate={handleNavigate}
              favoriteCount={favorites.length}
              totalGameCount={libraryGames.length}
              saveCount={recentGames.length}
              onCustomRomLoaded={handleCustomRomLoaded}
            />
          </aside>
        )}

        {/* Dynamic Center Viewport */}
        <main
          className={`flex-1 overflow-y-auto ${
            activeView === 'emulator' || lockedGuestSession
              ? 'p-0'
              : 'p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8'
          }`}
        >
          {/* View 1: Playable In-Game Emulator Screen */}
          {activeView === 'emulator' && (
            <EmulatorPage
              gameId={selectedGameId}
              initialSlot={activeSaveSlot}
              netplaySession={
                netplaySession
                  ? {
                      room: netplaySession.room,
                      role: netplaySession.role,
                      playerUid: netplaySession.playerUid,
                      onLeaveMatch: handleLeaveNetplayMatch,
                    }
                  : null
              }
              onExit={() => {
                if (netplaySession) {
                  handleLeaveNetplayMatch(false);
                } else {
                  setActiveView(selectedGameId ? 'game-detail' : 'main');
                }
              }}
              onOpenSettings={() => {
                if (netplaySession) {
                  const wasHost = netplaySession.role === 'host';
                  handleLeaveNetplayMatch(false);
                  if (wasHost) {
                    setActiveView('main');
                    setCurrentTab('settings');
                  }
                } else {
                  setActiveView('main');
                  setCurrentTab('settings');
                }
              }}
            />
          )}

          {/* View 2: Game Detail Cartridge Inspection Screen */}
          {activeView === 'game-detail' && (
            <GameDetailPage
              gameId={selectedGameId}
              onBack={() => setActiveView('main')}
              onPlayGame={(id, slot) => handlePlayGame(id, slot)}
              onOpenNetPlay={(gId) => {
                setPreselectedNetplayGameId(gId || selectedGameId);
                setNetplayRoomId(undefined);
                setInitialRoomCode(undefined);
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
              initialRoomCode={initialRoomCode}
              preselectedGameId={preselectedNetplayGameId}
              onConsumePreselectedGame={() => setPreselectedNetplayGameId(undefined)}
              onLockInviteRoom={(inviteLock) => {
                setLockedGuestSession(inviteLock);
                setSelectedGameId(inviteLock.room.gameId);
                setNetplayRoomId(inviteLock.room.id);
                setShowGuestStandbyCard(false);
              }}
              onLaunchNetplayMatch={(launch) => {
                setNetplaySession(launch);
                setSelectedGameId(launch.room.gameId);
                setNetplayRoomId(launch.room.id);
                if (launch.lockToRoom && launch.role !== 'host') {
                  setLockedGuestSession(launch);
                  setShowGuestStandbyCard(false);
                }
                setActiveView('emulator');
              }}
              onLeaveRoom={() => {
                if (lockedGuestSession) {
                  setShowGuestStandbyCard(true);
                  setActiveView('main');
                  return;
                }
                setNetplayRoomId(undefined);
                setInitialRoomCode(undefined);
                setPreselectedNetplayGameId(undefined);
                setNetplaySession(null);
                setActiveView('main');
                setCurrentTab('browse');
              }}
            />
          )}

          {/* View 4: Locked Guest Invite Standby Screen (Never allows picking other games) */}
          {activeView === 'main' && lockedGuestSession && showGuestStandbyCard && (
            <div className="min-h-[65vh] flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-[#191b22] border border-[#4cd7f6]/40 rounded-2xl p-7 text-center space-y-5 shadow-2xl">
                <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${
                  guestRoomClosedNotice
                    ? 'bg-rose-500/10 border border-rose-500/40 text-rose-400'
                    : 'bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 text-[#4cd7f6]'
                }`}>
                  <span className="material-symbols-outlined text-3xl">
                    {guestRoomClosedNotice ? 'meeting_room' : 'sports_esports'}
                  </span>
                </div>
                {guestRoomClosedNotice ? (
                  <>
                    <div className="space-y-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold">
                        PHÒNG #{guestRoomClosedNotice.code} ĐÃ ĐÓNG
                      </span>
                      <h2 className="font-headline font-bold text-xl text-white pt-1">
                        Chủ phòng đã thoát game
                      </h2>
                      <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
                        Chủ phòng ({guestRoomClosedNotice.hostName}) đã rời khỏi ván chơi {guestRoomClosedNotice.gameTitle}, phòng chơi đã được xóa tự động.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setLockedGuestSession(null);
                        setGuestRoomClosedNotice(null);
                        setShowGuestStandbyCard(false);
                        setNetplayRoomId(undefined);
                        setInitialRoomCode(undefined);
                        setCurrentTab('browse');
                        setActiveView('main');
                      }}
                      className="w-full py-3 px-5 rounded-xl bg-[#282a30] hover:bg-[#33343b] text-white border border-[#494454]/50 font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">home</span>
                      Quay Về Trang Chủ
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#a078ff]/20 border border-[#a078ff]/40 text-[#d0bcff] font-mono text-[10px] font-bold">
                        PHÒNG MỜI #{lockedGuestSession.room.code}
                      </span>
                      <h2 className="font-headline font-bold text-xl text-white pt-1">
                        {lockedGuestSession.room.gameTitle}
                      </h2>
                      <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
                        Bạn đang tham gia bằng link mời ở chế độ Port 2. Trò chơi được cố định theo Chủ phòng ({lockedGuestSession.room.hostName}) và không thể đổi sang game khác.
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      <button
                        onClick={() => {
                          if (lockedGuestSession.room.status === 'playing') {
                            setNetplaySession(lockedGuestSession);
                            setSelectedGameId(lockedGuestSession.room.gameId);
                            setShowGuestStandbyCard(false);
                            setActiveView('emulator');
                          } else {
                            setNetplayRoomId(lockedGuestSession.room.id);
                            setShowGuestStandbyCard(false);
                            setActiveView('netplay');
                          }
                        }}
                        className="w-full py-3 px-5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">play_arrow</span>
                        {lockedGuestSession.room.status === 'playing'
                          ? 'Quay Lại Màn Hình Chơi'
                          : 'Quay Lại Phòng Chờ Sẵn Sàng'}
                      </button>
                      <button
                        onClick={async () => {
                          webrtcNetplay.stopSession();
                          await roomService.leaveRoom(
                            lockedGuestSession.room.id,
                            lockedGuestSession.playerUid
                          );
                          try {
                            if (new URLSearchParams(window.location.search).has('room')) {
                              window.history.replaceState({}, '', window.location.pathname);
                            }
                          } catch {}
                          setLockedGuestSession(null);
                          setGuestRoomClosedNotice(null);
                          setShowGuestStandbyCard(false);
                          setNetplayRoomId(undefined);
                          setInitialRoomCode(undefined);
                          setCurrentTab('browse');
                          setActiveView('main');
                        }}
                        className="w-full py-2.5 px-5 rounded-xl bg-[#282a30] hover:bg-rose-500/20 text-[#cbc3d7] hover:text-rose-300 border border-[#494454]/50 hover:border-rose-500/40 font-mono text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">logout</span>
                        Rời Phòng Hẳn &amp; Mở Port 2
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* View 4B: Main Tabs (Blocked when in Locked Guest Invite Mode) */}
          {activeView === 'main' && !lockedGuestSession && (
            <>
              {(currentTab === 'browse' || currentTab === 'library' || currentTab === 'favorites' || currentTab === 'recent') && (
                <DashboardPage
                  onSelectGame={handleSelectGame}
                  onPlayGame={(id) => handlePlayGame(id, 1)}
                  onOpenNetPlay={(gId) => {
                    setNetplayRoomId(undefined);
                    setInitialRoomCode(undefined);
                    setPreselectedNetplayGameId(gId || '__create__');
                    setActiveView('netplay');
                    setCurrentTab('rooms');
                  }}
                  onOpenRomVault={(mode) => {
                    setVaultSourceMode(mode || 'local');
                    setCurrentTab('vault');
                  }}
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

      {/* 3. Mobile / Tablet Bottom Navigation Bar */}
      {activeView !== 'emulator' && !lockedGuestSession && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0c0e14]/95 backdrop-blur-md border-t border-[#494454]/40 px-2 py-1.5 flex items-center justify-around font-mono text-[10px]">
          {[
            { id: 'browse', label: 'Thư viện', icon: 'sports_esports', active: activeView === 'main' && (currentTab === 'browse' || currentTab === 'library' || currentTab === 'favorites' || currentTab === 'recent') },
            { id: 'rooms', label: 'Phòng Chơi', icon: 'hub', active: activeView === 'netplay' },
            { id: 'vault', label: 'Kho ROM', icon: 'folder_zip', active: activeView === 'main' && currentTab === 'vault' },
            { id: 'saves', label: 'Bản Lưu', icon: 'cloud_sync', active: activeView === 'main' && currentTab === 'saves' },
            { id: 'settings', label: 'Cài Đặt', icon: 'tune', active: activeView === 'main' && currentTab === 'settings' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                item.active ? 'text-[#4cd7f6] bg-[#4cd7f6]/10 font-bold' : 'text-[#958ea0] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* 4. Global Command Palette Modal (⌘K) */}
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
