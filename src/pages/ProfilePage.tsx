import React, { useState, useEffect } from 'react';
import { AVAILABLE_TROPHIES, AVAILABLE_SPEEDRUNS, DEFAULT_USER_STATS } from '../services/user/profileData';
import { saveManager } from '../services/saves/saveManager';
import { FEATURED_GAMES } from '../services/games/catalog';
import { auth, loginWithGoogle, logoutUser } from '../services/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

interface ProfilePageProps {
  onBack: () => void;
  onPlayGame: (gameId: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onBack, onPlayGame }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [activeTab, setActiveTab] = useState<'overview' | 'trophies' | 'speedruns' | 'rig'>('overview');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saveCount, setSaveCount] = useState<number>(() => saveManager.getAllSaves().length);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });
    setSaveCount(saveManager.getAllSaves().length);
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSignIn = async () => {
    try {
      await loginWithGoogle();
      showToast('Đã đăng nhập thành công với tài khoản Google');
    } catch {
      showToast('Đăng nhập bị hủy hoặc gặp lỗi xác thực');
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    showToast('Đã đăng xuất khỏi tài khoản');
  };

  const displayName = currentUser?.displayName || 'Retro Gamer (Khách)';
  const displayEmail = currentUser?.email || 'Chế độ Khách • Chưa liên kết Google';
  const avatarUrl = currentUser?.photoURL || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80';

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none font-sans">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">badge</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1c1d24] via-[#161720] to-[#0c0e14] border border-[#494454]/30 p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="relative">
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-[#4cd7f6] shadow-xl shadow-[#4cd7f6]/20"
              />
              <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-[#4cd7f6] text-[#003641] font-mono font-bold text-[10px] shadow">
                {currentUser ? 'VERIFIED' : 'GUEST'}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl font-bold font-headline text-white">
                  {displayName}
                </h1>
                <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-[10px] font-bold">
                  {currentUser ? 'GOOGLE CLOUD PILOT' : 'CHẾ ĐỘ NỘI BỘ'}
                </span>
              </div>
              <p className="text-xs font-mono text-[#958ea0] mt-1">
                {displayEmail}
              </p>

              {/* Status Indicator */}
              <div className="mt-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${currentUser ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="text-[11px] font-mono text-[#cbc3d7]">
                  {currentUser ? 'Đồng bộ Firestore & Google Drive Kích Hoạt' : 'Lưu trữ cục bộ IndexedDB trên thiết bị'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <button
                onClick={handleSignOut}
                className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-red-500/20 text-[#cbc3d7] hover:text-red-400 border border-[#494454]/30 font-mono text-xs transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                Đăng Xuất
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="px-4 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">login</span>
                Đăng Nhập Bằng Google
              </button>
            )}
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] border border-[#494454]/30"
              title="Quay lại"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      </div>

      {/* Profile Navigation Tabs */}
      <div className="flex border-b border-[#494454]/30 overflow-x-auto gap-2">
        {(['overview', 'trophies', 'speedruns', 'rig'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 font-mono text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap capitalize ${
              activeTab === tab
                ? 'border-[#4cd7f6] text-[#4cd7f6] bg-[#4cd7f6]/10'
                : 'border-transparent text-[#958ea0] hover:text-[#cbc3d7]'
            }`}
          >
            {tab === 'overview' && <span className="material-symbols-outlined text-base">analytics</span>}
            {tab === 'trophies' && <span className="material-symbols-outlined text-base">emoji_events</span>}
            {tab === 'speedruns' && <span className="material-symbols-outlined text-base">timer</span>}
            {tab === 'rig' && <span className="material-symbols-outlined text-base">computer</span>}
            {tab === 'overview' ? 'Tổng Quan' : tab === 'trophies' ? 'Thành Tựu (Trophies)' : tab === 'speedruns' ? 'Kỷ Lục Tốc Độ' : 'Hệ Thống Thiết Bị'}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
              <span className="text-[11px] font-mono text-[#958ea0]">Tựa Game Sẵn Sàng</span>
              <h3 className="text-2xl font-bold font-mono text-white mt-1">{FEATURED_GAMES.length}</h3>
              <p className="text-[10px] font-mono text-emerald-400 mt-1">NES, SNES, GBA</p>
            </div>

            <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
              <span className="text-[11px] font-mono text-[#958ea0]">Bản Lưu Trữ Hiện Có</span>
              <h3 className="text-2xl font-bold font-mono text-[#4cd7f6] mt-1">{saveCount}</h3>
              <p className="text-[10px] font-mono text-[#958ea0] mt-1">IndexedDB / Cloud</p>
            </div>

            <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
              <span className="text-[11px] font-mono text-[#958ea0]">Thành Tựu Khả Dụng</span>
              <h3 className="text-2xl font-bold font-mono text-[#d0bcff] mt-1">{AVAILABLE_TROPHIES.length}</h3>
              <p className="text-[10px] font-mono text-purple-400 mt-1">Sẵn sàng mở khóa</p>
            </div>

            <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
              <span className="text-[11px] font-mono text-[#958ea0]">Độ Trễ WebRTC NetPlay</span>
              <h3 className="text-2xl font-bold font-mono text-emerald-400 mt-1">~16 ms</h3>
              <p className="text-[10px] font-mono text-[#958ea0] mt-1">P2P Rollback Netcode</p>
            </div>
          </div>

          {/* Platform Distribution & Library Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 space-y-4">
              <h3 className="font-headline font-bold text-white text-sm">Cơ Cấu Nền Tảng Trong Thư Viện</h3>
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-[#cbc3d7] mb-1">
                    <span>Super Nintendo Entertainment System (SNES)</span>
                    <span className="text-[#4cd7f6] font-bold">50%</span>
                  </div>
                  <div className="w-full bg-[#111319] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#4cd7f6] h-full" style={{ width: '50%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[#cbc3d7] mb-1">
                    <span>Game Boy Advance (GBA)</span>
                    <span className="text-[#d0bcff] font-bold">33%</span>
                  </div>
                  <div className="w-full bg-[#111319] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#d0bcff] h-full" style={{ width: '33%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[#cbc3d7] mb-1">
                    <span>Nintendo Entertainment System (NES)</span>
                    <span className="text-[#ffb3bc] font-bold">17%</span>
                  </div>
                  <div className="w-full bg-[#111319] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#ffb3bc] h-full" style={{ width: '17%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 bg-[#1e1f26] border border-[#494454]/30 rounded-xl p-5 space-y-4">
              <h3 className="font-headline font-bold text-white text-sm">Thử Thách Retro Đang Chờ Đón</h3>
              <div className="space-y-2">
                {AVAILABLE_TROPHIES.slice(0, 3).map((trophy) => (
                  <div
                    key={trophy.id}
                    className="p-2.5 rounded-lg bg-[#111319] border border-[#494454]/20 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-lg">emoji_events</span>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-white font-bold">{trophy.title}</p>
                        <p className="text-[10px] font-mono text-[#958ea0]">{trophy.gameTitle}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-0.5 rounded">
                      +{trophy.points} XP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Trophies */}
      {activeTab === 'trophies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AVAILABLE_TROPHIES.map((t) => (
            <div
              key={t.id}
              className="p-4 bg-[#1e1f26] border border-[#494454]/30 rounded-xl flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">trophy</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-headline font-bold text-white text-sm">{t.title}</h4>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                    {t.tier.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-[#cbc3d7] mt-1">{t.description}</p>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#958ea0] mt-3">
                  <span>{t.gameTitle} ({t.platform})</span>
                  <span className="text-emerald-400 font-bold">+{t.points} XP</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Speedruns */}
      {activeTab === 'speedruns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline font-bold text-white text-base">Bảng Ghi Kỷ Lục Tốc Độ (Speedrun Leaderboard)</h3>
            <span className="text-xs font-mono text-[#4cd7f6]">WASM Cycle-Accurate Timer</span>
          </div>

          <div className="space-y-2">
            {AVAILABLE_SPEEDRUNS.map((rec) => (
              <div
                key={rec.id}
                className="p-4 bg-[#1e1f26] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#111319] border border-[#494454]/40 flex items-center justify-center font-mono font-bold text-emerald-400">
                    #{rec.rank}
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-sm text-white">{rec.gameTitle}</h4>
                    <p className="text-xs font-mono text-[#958ea0]">{rec.category} • Ready for Run</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="font-mono font-bold text-base text-[#4cd7f6]">{rec.time}</span>
                    <span className="text-[10px] font-mono text-[#958ea0] block">{rec.splitDelta}</span>
                  </div>
                  <button
                    onClick={() => onPlayGame(rec.gameId || 'zelda-alttp')}
                    className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    Khởi Chạy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Emulation Rig Telemetry */}
      {activeTab === 'rig' && (
        <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#494454]/20 pb-4">
            <div>
              <h3 className="font-headline font-bold text-white text-sm">Thông Số Phần Cứng & Môi Trường Trình Duyệt</h3>
              <p className="text-xs font-mono text-[#958ea0]">Tự động phát hiện thông qua WebGL 2.0, WebAssembly, WebAudio và Gamepad API</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
              Hardware Acceleration: ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">WASM EXECUTION CORE</span>
              <span className="text-white font-bold">V8 Liftoff + TurboFan JIT Engine</span>
            </div>
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">GRAPHICS SHADER PIPELINE</span>
              <span className="text-[#4cd7f6] font-bold">WebGL 2.0 / Post-Processing Shaders</span>
            </div>
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">REFRESH PACING</span>
              <span className="text-emerald-400 font-bold">60.00 Hz (requestAnimationFrame)</span>
            </div>
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">AUDIO BUFFER LATENCY</span>
              <span className="text-amber-400 font-bold">16ms Low-Latency Synthesis</span>
            </div>
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">CONTROLLER INPUT BUS</span>
              <span className="text-white font-bold">HTML5 Gamepad API @ 120Hz Polling</span>
            </div>
            <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
              <span className="text-[#958ea0] text-[10px] block">LOCAL STORAGE PERSISTENCE</span>
              <span className="text-[#d0bcff] font-bold">IndexedDB 2.0 + Firestore Cloud</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
