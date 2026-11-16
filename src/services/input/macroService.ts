/**
 * RetroVerse Macro Combos Engine
 * Executes iconic fighting & action game special moves automatically
 */

import { EmulatorInputState } from '../../emulator/engine';
import { hapticFeedbackService } from './hapticFeedbackService';

export interface MacroStep {
  press: (keyof EmulatorInputState)[];
  durationMs: number;
  pauseAfterMs?: number;
}

export interface MacroDefinition {
  id: string;
  name: string;
  description: string;
  platform: 'ALL' | 'NES' | 'SNES' | 'GENESIS' | 'GBA';
  notation: string;
  category: 'FIGHTING' | 'PLATFORMER' | 'SPECIAL';
  steps: MacroStep[];
}

export const PRESET_MACROS: MacroDefinition[] = [
  {
    id: 'hadouken',
    name: 'Hadouken (波動拳)',
    description: 'Chưởng sóng năng lượng kinh điển trong Street Fighter (Xuống - Xéo Tới - Tới + Đấm)',
    platform: 'ALL',
    notation: '↓ ↘ → + Y/A',
    category: 'FIGHTING',
    steps: [
      { press: ['down'], durationMs: 45, pauseAfterMs: 25 },
      { press: ['down', 'right'], durationMs: 45, pauseAfterMs: 25 },
      { press: ['right', 'y'], durationMs: 70, pauseAfterMs: 30 },
    ],
  },
  {
    id: 'shoryuken',
    name: 'Shoryuken (昇龍拳)',
    description: 'Cú đấm thăng long sát thương cao (Tới - Xuống - Xéo Tới + Đấm)',
    platform: 'ALL',
    notation: '→ ↓ ↘ + Y/A',
    category: 'FIGHTING',
    steps: [
      { press: ['right'], durationMs: 40, pauseAfterMs: 25 },
      { press: ['down'], durationMs: 40, pauseAfterMs: 25 },
      { press: ['down', 'right', 'y'], durationMs: 70, pauseAfterMs: 30 },
    ],
  },
  {
    id: 'tatsumaki',
    name: 'Tatsumaki (竜巻旋風脚)',
    description: 'Đá lốc xoáy lướt ngang vượt cản (Xuống - Xéo Lùi - Lùi + Đá)',
    platform: 'ALL',
    notation: '↓ ↙ ← + B',
    category: 'FIGHTING',
    steps: [
      { press: ['down'], durationMs: 45, pauseAfterMs: 25 },
      { press: ['down', 'left'], durationMs: 45, pauseAfterMs: 25 },
      { press: ['left', 'b'], durationMs: 70, pauseAfterMs: 30 },
    ],
  },
  {
    id: 'sonic-spindash',
    name: 'Sonic Spin Dash',
    description: 'Tích tụ tốc độ cuộn tròn lao đi với vận tốc siêu thanh của Sonic',
    platform: 'GENESIS',
    notation: 'Giữ ↓ + Nhấp B 4 lần',
    category: 'PLATFORMER',
    steps: [
      { press: ['down'], durationMs: 60, pauseAfterMs: 30 },
      { press: ['down', 'b'], durationMs: 50, pauseAfterMs: 40 },
      { press: ['down', 'b'], durationMs: 50, pauseAfterMs: 40 },
      { press: ['down', 'b'], durationMs: 50, pauseAfterMs: 40 },
      { press: ['down', 'b'], durationMs: 70, pauseAfterMs: 60 },
      { press: [], durationMs: 50 },
    ],
  },
  {
    id: 'konami-code',
    name: 'Konami Code (30 Mạng)',
    description: 'Mật mã huyền thoại của Konami trên Contra, Gradius: Lên Lên Xuống Xuống Trái Phải Trái Phải B A',
    platform: 'NES',
    notation: '↑ ↑ ↓ ↓ ← → ← → B A',
    category: 'SPECIAL',
    steps: [
      { press: ['up'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['up'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['down'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['down'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['left'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['right'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['left'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['right'], durationMs: 50, pauseAfterMs: 45 },
      { press: ['b'], durationMs: 55, pauseAfterMs: 45 },
      { press: ['a'], durationMs: 55, pauseAfterMs: 45 },
    ],
  },
  {
    id: 'megaman-dashjump',
    name: 'Dash Jump (Mega Man X)',
    description: 'Kỹ thuật lướt rồi nhảy tức thời để vượt khoảng cách cực xa trong Mega Man X',
    platform: 'SNES',
    notation: 'Lướt (L/A) + Nhảy (B)',
    category: 'PLATFORMER',
    steps: [
      { press: ['right'], durationMs: 40, pauseAfterMs: 20 },
      { press: ['right', 'a'], durationMs: 50, pauseAfterMs: 20 },
      { press: ['right', 'a', 'b'], durationMs: 120, pauseAfterMs: 40 },
    ],
  },
];

class MacroService {
  private isRunning: boolean = false;
  private currentAbortController: AbortController | null = null;

  public async executeMacro(
    macro: MacroDefinition,
    dispatchInput: (btn: keyof EmulatorInputState, pressed: boolean) => void
  ): Promise<boolean> {
    if (this.isRunning) {
      this.cancel();
    }

    this.isRunning = true;
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    hapticFeedbackService.triggerComboExecuted();

    try {
      for (const step of macro.steps) {
        if (signal.aborted) break;

        // Press requested buttons
        for (const btn of step.press) {
          dispatchInput(btn, true);
        }

        await new Promise((r) => setTimeout(r, step.durationMs));

        // Release buttons
        for (const btn of step.press) {
          dispatchInput(btn, false);
        }

        if (step.pauseAfterMs && step.pauseAfterMs > 0) {
          await new Promise((r) => setTimeout(r, step.pauseAfterMs));
        }
      }

      this.isRunning = false;
      return true;
    } catch {
      this.isRunning = false;
      return false;
    }
  }

  public cancel() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isRunning = false;
  }

  public getMacrosForPlatform(platform: string): MacroDefinition[] {
    const plat = platform.toUpperCase();
    return PRESET_MACROS.filter((m) => {
      if (m.platform === 'ALL') return true;
      if (m.platform === 'GENESIS' && (plat === 'GENESIS' || plat === 'MEGADRIVE' || plat === 'MD')) return true;
      if (m.platform === 'NES' && plat === 'NES') return true;
      if (m.platform === 'SNES' && plat === 'SNES') return true;
      if (m.platform === 'GBA' && plat === 'GBA') return true;
      return false;
    });
  }
}

export const macroService = new MacroService();
