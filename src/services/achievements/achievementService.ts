/**
 * RetroVerse Achievement Engine
 * Tracks in-game retro milestones, awards persistent badges, and alerts the player
 */

import { hapticFeedbackService } from '../input/hapticFeedbackService';

export interface RetroAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  badgeColor: string;
  points: number;
  unlockedAt: number | null; // Timestamp
}

const DEFAULT_ACHIEVEMENTS: RetroAchievement[] = [
  {
    id: 'first_ignition',
    title: 'Khởi Nguyên Retro (First Ignition)',
    description: 'Nạp và khởi động thành công một tựa game retro bất kỳ',
    icon: 'power_settings_new',
    badgeColor: 'from-amber-500 to-yellow-600',
    points: 10,
    unlockedAt: null,
  },
  {
    id: 'save_guardian',
    title: 'Vệ Binh Thời Gian (Save Guardian)',
    description: 'Thực hiện Quick Save để bảo vệ tiến trình chơi an toàn',
    icon: 'save',
    badgeColor: 'from-blue-500 to-indigo-600',
    points: 15,
    unlockedAt: null,
  },
  {
    id: 'time_rewind',
    title: 'Chúa Tể Dòng Thời Gian (Time Lord)',
    description: 'Sử dụng tính năng Rewind để đảo ngược sai lầm trong quá khứ',
    icon: 'history',
    badgeColor: 'from-purple-500 to-pink-600',
    points: 20,
    unlockedAt: null,
  },
  {
    id: 'hyperspeed',
    title: 'Vận Tốc Ánh Sáng (Hyperspeed)',
    description: 'Tua nhanh trò chơi ở tốc độ 4x hoặc 8x',
    icon: 'fast_forward',
    badgeColor: 'from-emerald-500 to-teal-600',
    points: 15,
    unlockedAt: null,
  },
  {
    id: 'visual_purist',
    title: 'Mắt Nhìn Hoài Niệm (Retro Purist)',
    description: 'Kích hoạt bộ lọc CRT Scanlines hoặc màn hình Nokia huyền thoại',
    icon: 'tv',
    badgeColor: 'from-cyan-500 to-blue-600',
    points: 20,
    unlockedAt: null,
  },
  {
    id: 'multi_platform',
    title: 'Nhà Sưu Tầm Đa Hệ Máy (Multiverse Master)',
    description: 'Trải nghiệm game trên ít nhất 3 hệ máy console khác nhau',
    icon: 'devices',
    badgeColor: 'from-orange-500 to-red-600',
    points: 30,
    unlockedAt: null,
  },
  {
    id: 'turbo_striker',
    title: 'Cơn Mưa Đạn Liên Thanh (Turbo Striker)',
    description: 'Sử dụng nút Auto-Fire / Turbo để bắn liên hồi',
    icon: 'bolt',
    badgeColor: 'from-yellow-400 to-amber-600',
    points: 15,
    unlockedAt: null,
  },
  {
    id: 'combo_virtuoso',
    title: 'Bậc Thầy Quyết Đấu (Combo Virtuoso)',
    description: 'Thi triển thành công một chiêu thức võ thuật Macro đặc biệt',
    icon: 'sports_mma',
    badgeColor: 'from-rose-500 to-red-700',
    points: 25,
    unlockedAt: null,
  },
  {
    id: 'gamepad_pro',
    title: 'Vận Động Viên Thể Thao Điện Tử (Gamepad Pro)',
    description: 'Kết nối và chơi bằng tay cầm vật lý Bluetooth hoặc USB',
    icon: 'sports_esports',
    badgeColor: 'from-violet-500 to-purple-800',
    points: 25,
    unlockedAt: null,
  },
];

type UnlockListener = (achievement: RetroAchievement) => void;

class AchievementService {
  private achievements: RetroAchievement[] = [];
  private playedPlatforms: Set<string> = new Set();
  private listeners: Set<UnlockListener> = new Set();

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const saved = localStorage.getItem('retroverse_achievements_v1');
      if (saved) {
        const parsed: Record<string, number> = JSON.parse(saved);
        this.achievements = DEFAULT_ACHIEVEMENTS.map((a) => ({
          ...a,
          unlockedAt: parsed[a.id] || null,
        }));
      } else {
        this.achievements = [...DEFAULT_ACHIEVEMENTS];
      }

      const savedPlats = localStorage.getItem('retroverse_played_platforms');
      if (savedPlats) {
        this.playedPlatforms = new Set(JSON.parse(savedPlats));
      }
    } catch {
      this.achievements = [...DEFAULT_ACHIEVEMENTS];
    }
  }

  private saveState() {
    try {
      const record: Record<string, number> = {};
      this.achievements.forEach((a) => {
        if (a.unlockedAt) record[a.id] = a.unlockedAt;
      });
      localStorage.setItem('retroverse_achievements_v1', JSON.stringify(record));
      localStorage.setItem('retroverse_played_platforms', JSON.stringify(Array.from(this.playedPlatforms)));
    } catch {}
  }

  public getAll(): RetroAchievement[] {
    return this.achievements;
  }

  public getUnlockedCount(): number {
    return this.achievements.filter((a) => a.unlockedAt !== null).length;
  }

  public getTotalPoints(): number {
    return this.achievements.reduce((sum, a) => (a.unlockedAt ? sum + a.points : sum), 0);
  }

  public onUnlock(cb: UnlockListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public unlock(id: string): boolean {
    const ach = this.achievements.find((a) => a.id === id);
    if (!ach || ach.unlockedAt !== null) return false;

    ach.unlockedAt = Date.now();
    this.saveState();

    hapticFeedbackService.triggerAchievementUnlocked();

    this.listeners.forEach((listener) => {
      try {
        listener(ach);
      } catch (err) {
        console.error(err);
      }
    });

    return true;
  }

  // --- Tracking Helpers ---

  public trackGameLaunch(platform: string) {
    this.unlock('first_ignition');
    this.playedPlatforms.add(platform.toUpperCase());
    this.saveState();
    if (this.playedPlatforms.size >= 3) {
      this.unlock('multi_platform');
    }
  }

  public trackQuickSave() {
    this.unlock('save_guardian');
  }

  public trackRewind() {
    this.unlock('time_rewind');
  }

  public trackFastForward(speed: number) {
    if (speed >= 4) {
      this.unlock('hyperspeed');
    }
  }

  public trackVisualFilter(filterName: string) {
    if (filterName !== 'Pixelated' && filterName !== 'Bilinear Smooth') {
      this.unlock('visual_purist');
    }
  }

  public trackTurboUsed() {
    this.unlock('turbo_striker');
  }

  public trackComboExecuted() {
    this.unlock('combo_virtuoso');
  }

  public trackGamepadConnected() {
    this.unlock('gamepad_pro');
  }
}

export const achievementService = new AchievementService();
