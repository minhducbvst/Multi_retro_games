import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, logoutUser } from '../services/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { saveManager } from '../services/saves/saveManager';
import { romStorage } from '../services/roms/romStorage';
import { useLibraryStore } from '../services/games/libraryStore';

interface TopNavBarProps {
  currentTab: string;
  onNavigate: (tab: string, param?: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  currentTab,
  onNavigate,
  searchQuery,
  onSearchChange
}) => {
  const games = useLibraryStore();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [totalStorageText, setTotalStorageText] = useState('4.2MB');

  useEffect(() => {
    const updateStorage = () => {
      const romBytes = romStorage.getTotalBytes();
      const saveBytes = saveManager.getAllSaves().reduce((acc, s) => acc + (s.sizeBytes || 0), 0);
      const total = romBytes + saveBytes;
      if (total > 1024 * 1024) {
        setTotalStorageText(`${(total / (1024 * 1024)).toFixed(1)}MB`);
      } else if (total > 0) {
        setTotalStorageText(`${(total / 1024).toFixed(0)}KB`);
      } else {
        setTotalStorageText('4.2MB');
      }
    };
    updateStorage();
    const t = setInterval(updateStorage, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      setShowProfileMenu(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setShowProfileMenu(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className="w-full px-4 lg:px-8 flex items-center justify-between h-16 sticky top-0 z-40 bg-[#0c0e14]/85 backdrop-blur-md shadow-2xl shadow-primary/5 border-b border-[#494454]/30 select-none">
      {/* Brand Logo & Version */}
      <div className="flex items-center gap-4 lg:gap-6">
        <button
          onClick={() => onNavigate('browse')}
          className="font-headline-lg text-xl lg:text-2xl tracking-wider text-[#d0bcff] flex items-center gap-2 uppercase font-bold focus:outline-none"
        >
          <span className="w-9 h-9 rounded-lg bg-[#33343b] border border-[#494454]/40 flex items-center justify-center text-[#4cd7f6] shadow-sm">
            <span className="material-symbols-outlined fill-icon text-xl">sports_esports</span>
          </span>
          <span className="tracking-tight text-white flex items-baseline">
            Retro<span className="text-[#a078ff]">Verse</span>
          </span>
        </button>
        <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs bg-[#282a30] border border-[#494454]/30 text-[#4cd7f6]">
          v2.4 Core
        </span>
      </div>

      {/* Center Search Bar */}
      <div className="hidden lg:flex items-center flex-1 max-w-lg mx-6">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#958ea0]">
            <span className="material-symbols-outlined text-sm">search</span>
          </div>
          <input
            className="w-full pl-9 pr-12 py-1.5 rounded-lg bg-[#191b22] border border-[#494454]/40 text-[#e2e2eb] placeholder:text-[#958ea0] font-mono text-xs focus:outline-none focus:border-[#4cd7f6] focus:ring-1 focus:ring-[#4cd7f6]/50 transition-all duration-150"
            placeholder="Tìm kiếm trò chơi trong thư viện... (Ctrl+K)"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[#958ea0] bg-[#1e1f26] border border-[#494454]/40 rounded">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Navigation Links & Profile Actions */}
      <div className="flex items-center gap-3 lg:gap-4">
        <nav className="hidden xl:flex items-center gap-6 mr-2">
          <button
            onClick={() => onNavigate('browse')}
            className={`font-mono text-xs pb-1 transition-colors ${
              currentTab === 'browse'
                ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6]'
                : 'text-[#cbc3d7] hover:text-white'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => onNavigate('rooms')}
            className={`font-mono text-xs pb-1 transition-colors ${
              currentTab === 'rooms'
                ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6]'
                : 'text-[#cbc3d7] hover:text-white'
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => onNavigate('saves')}
            className={`font-mono text-xs pb-1 transition-colors ${
              currentTab === 'saves'
                ? 'text-[#4cd7f6] border-b-2 border-[#4cd7f6]'
                : 'text-[#cbc3d7] hover:text-white'
            }`}
          >
            Cloud Vault
          </button>
        </nav>

        {/* Cloud Sync Status Pill */}
        <button
          onClick={() => onNavigate('saves')}
          className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#282a30] border border-[#494454]/30 hover:border-[#4cd7f6] transition-colors cursor-pointer"
          title="Xem kho lưu trữ Cloud & bản lưu Pin SRAM"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4cd7f6] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4cd7f6]"></span>
          </span>
          <span className="material-symbols-outlined text-[#4cd7f6] text-sm fill-icon">cloud_done</span>
          <span className="font-mono text-[11px] text-[#cbc3d7]">
            {currentUser ? `Đồng bộ: ${totalStorageText}` : `Bộ nhớ máy: ${totalStorageText}`}
          </span>
        </button>

        {/* Notifications Icon Button */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg bg-[#191b22] border border-[#494454]/30 text-[#cbc3d7] hover:text-[#4cd7f6] hover:border-[#4cd7f6] transition-colors relative cursor-pointer"
            title="Thông báo hệ thống"
          >
            <span className="material-symbols-outlined text-lg">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4cd7f6] ring-2 ring-[#0c0e14]"></span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#1e1f26] border border-[#494454] shadow-2xl p-3 z-50 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#494454]/40 font-bold text-white">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-[#4cd7f6]">info</span>
                  <span>Trạng thái hệ thống</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">HOẠT ĐỘNG</span>
              </div>
              <div className="py-2 space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-[#141620] border border-[#494454]/30 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm text-[#4cd7f6] mt-0.5">sports_esports</span>
                  <div>
                    <div className="font-bold text-white">Thư viện ROM</div>
                    <div className="text-[11px] text-[#958ea0]">{games.length} trò chơi đã sẵn sàng chơi</div>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-[#141620] border border-[#494454]/30 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm text-amber-400 mt-0.5">battery_charging_full</span>
                  <div>
                    <div className="font-bold text-white">Lưu Pin SRAM Tự Động</div>
                    <div className="text-[11px] text-[#958ea0]">Auto-sync 25s liên tục bảo vệ file save in-game</div>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-[#141620] border border-[#494454]/30 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-400 mt-0.5">gamepad</span>
                  <div>
                    <div className="font-bold text-white">Bộ điều khiển Gamepad</div>
                    <div className="text-[11px] text-[#958ea0]">8 hướng D-Pad cảm ứng & Gamepad API tiêu chuẩn</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Account Profile Pill */}
        <div className="relative">
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 pl-2 py-1 pr-3 rounded-full bg-[#191b22] border border-[#494454]/40 hover:border-[#958ea0] transition-colors cursor-pointer"
          >
            {currentUser?.photoURL ? (
              <img
                className="w-7 h-7 rounded-full object-cover border border-[#4cd7f6]/40"
                alt="Avatar"
                src={currentUser.photoURL}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center font-bold text-xs">
                {currentUser?.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'M'}
              </div>
            )}
            <div className="hidden md:flex flex-col text-left">
              <span className="text-[13px] leading-tight text-[#e2e2eb] font-semibold truncate max-w-[120px]">
                {currentUser?.displayName || "Tài khoản Game"}
              </span>
              <span className="font-mono text-[10px] text-[#4cd7f6]">
                {currentUser ? "Đã liên kết Google" : "Nhấn để cài đặt"}
              </span>
            </div>
            <span className="material-symbols-outlined text-[#958ea0] text-sm">expand_more</span>
          </div>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#1e1f26] border border-[#494454] shadow-2xl p-3 z-50 text-xs">
              <div className="pb-2.5 border-b border-[#494454]/40 mb-2">
                <div className="font-bold text-white text-sm">
                  {currentUser?.displayName || "Người chơi (Guest)"}
                </div>
                <div className="text-[11px] text-[#958ea0] truncate font-mono">
                  {currentUser?.email || "Dữ liệu lưu an toàn trên máy"}
                </div>
                <div className="inline-flex items-center gap-1 mt-1 text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {currentUser ? 'Firebase Cloud Synced' : 'Offline / Local Ready'}
                </div>
              </div>

              {!currentUser && (
                <div className="mb-2">
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full py-2 px-3 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">login</span>
                    <span>Đăng nhập Google Drive</span>
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <button
                  onClick={() => {
                    onNavigate('saves');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#282a30] text-[#cbc3d7] hover:text-white text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">cloud_sync</span>
                  <span>Quản lý bản lưu (SRAM & States)</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#282a30] text-[#cbc3d7] hover:text-white text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">tune</span>
                  <span>Cài đặt tay cầm & hiển thị</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('vault');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#282a30] text-[#cbc3d7] hover:text-white text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">inventory_2</span>
                  <span>Kho ROM & Quét Google Drive</span>
                </button>
              </div>

              {currentUser && (
                <div className="pt-2 border-t border-[#494454]/40 mt-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-rose-950/40 text-rose-300 transition-colors text-left cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    <span>Đăng xuất tài khoản</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
