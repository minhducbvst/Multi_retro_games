import { EmulatorInputState } from '../../emulator/engine';

export type TargetSystem = 'NES' | 'SNES' | 'GBA';

export type VirtualControllerButton =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'l'
  | 'r'
  | 'select'
  | 'start'
  | 'quickSave'
  | 'quickLoad'
  | 'rewind'
  | 'fastForward'
  | 'pause';

export interface KeyBinding {
  code: string;
  label: string;
}

export interface GamepadBinding {
  buttonIndex: number;
  label: string;
}

export interface SystemInputMap {
  keyboard: Record<VirtualControllerButton, KeyBinding>;
  gamepad: Record<VirtualControllerButton, GamepadBinding>;
}

// System-specific valid button lists
export const SYSTEM_BUTTONS: Record<TargetSystem, { id: VirtualControllerButton; name: string; category: 'dpad' | 'face' | 'shoulder' | 'meta' | 'hotkey' }[]> = {
  NES: [
    { id: 'up', name: 'D-Pad Lên (Up)', category: 'dpad' },
    { id: 'down', name: 'D-Pad Xuống (Down)', category: 'dpad' },
    { id: 'left', name: 'D-Pad Trái (Left)', category: 'dpad' },
    { id: 'right', name: 'D-Pad Phải (Right)', category: 'dpad' },
    { id: 'b', name: 'Nút B (Chạy / Tấn công)', category: 'face' },
    { id: 'a', name: 'Nút A (Nhảy / Chọn)', category: 'face' },
    { id: 'select', name: 'Select', category: 'meta' },
    { id: 'start', name: 'Start', category: 'meta' },
    { id: 'quickSave', name: 'Lưu nhanh (Quick Save)', category: 'hotkey' },
    { id: 'quickLoad', name: 'Nạp nhanh (Quick Load)', category: 'hotkey' },
    { id: 'rewind', name: 'Tua lại (Rewind 5s)', category: 'hotkey' },
    { id: 'fastForward', name: 'Tua nhanh (Fast Forward)', category: 'hotkey' },
    { id: 'pause', name: 'Tạm dừng (Pause / Resume)', category: 'hotkey' },
  ],
  SNES: [
    { id: 'up', name: 'D-Pad Lên (Up)', category: 'dpad' },
    { id: 'down', name: 'D-Pad Xuống (Down)', category: 'dpad' },
    { id: 'left', name: 'D-Pad Trái (Left)', category: 'dpad' },
    { id: 'right', name: 'D-Pad Phải (Right)', category: 'dpad' },
    { id: 'y', name: 'Nút Y (Trái - Left)', category: 'face' },
    { id: 'x', name: 'Nút X (Trên - Top)', category: 'face' },
    { id: 'b', name: 'Nút B (Dưới - Bottom)', category: 'face' },
    { id: 'a', name: 'Nút A (Phải - Right)', category: 'face' },
    { id: 'l', name: 'Vai L (Shoulder L)', category: 'shoulder' },
    { id: 'r', name: 'Vai R (Shoulder R)', category: 'shoulder' },
    { id: 'select', name: 'Select', category: 'meta' },
    { id: 'start', name: 'Start', category: 'meta' },
    { id: 'quickSave', name: 'Lưu nhanh (Quick Save)', category: 'hotkey' },
    { id: 'quickLoad', name: 'Nạp nhanh (Quick Load)', category: 'hotkey' },
    { id: 'rewind', name: 'Tua lại (Rewind 5s)', category: 'hotkey' },
    { id: 'fastForward', name: 'Tua nhanh (Fast Forward)', category: 'hotkey' },
    { id: 'pause', name: 'Tạm dừng (Pause / Resume)', category: 'hotkey' },
  ],
  GBA: [
    { id: 'up', name: 'D-Pad Lên (Up)', category: 'dpad' },
    { id: 'down', name: 'D-Pad Xuống (Down)', category: 'dpad' },
    { id: 'left', name: 'D-Pad Trái (Left)', category: 'dpad' },
    { id: 'right', name: 'D-Pad Phải (Right)', category: 'dpad' },
    { id: 'b', name: 'Nút B', category: 'face' },
    { id: 'a', name: 'Nút A', category: 'face' },
    { id: 'l', name: 'Vai L (Bumper L)', category: 'shoulder' },
    { id: 'r', name: 'Vai R (Bumper R)', category: 'shoulder' },
    { id: 'select', name: 'Select', category: 'meta' },
    { id: 'start', name: 'Start', category: 'meta' },
    { id: 'quickSave', name: 'Lưu nhanh (Quick Save)', category: 'hotkey' },
    { id: 'quickLoad', name: 'Nạp nhanh (Quick Load)', category: 'hotkey' },
    { id: 'rewind', name: 'Tua lại (Rewind 5s)', category: 'hotkey' },
    { id: 'fastForward', name: 'Tua nhanh (Fast Forward)', category: 'hotkey' },
    { id: 'pause', name: 'Tạm dừng (Pause / Resume)', category: 'hotkey' },
  ],
};

const DEFAULT_SNES_KEYBOARD: Record<VirtualControllerButton, KeyBinding> = {
  up: { code: 'ArrowUp', label: '↑ Phím Mũi Tên Lên' },
  down: { code: 'ArrowDown', label: '↓ Phím Mũi Tên Xuống' },
  left: { code: 'ArrowLeft', label: '← Phím Mũi Tên Trái' },
  right: { code: 'ArrowRight', label: '→ Phím Mũi Tên Phải' },
  b: { code: 'KeyZ', label: 'Z' },
  a: { code: 'KeyX', label: 'X' },
  y: { code: 'KeyA', label: 'A' },
  x: { code: 'KeyS', label: 'S' },
  l: { code: 'KeyQ', label: 'Q' },
  r: { code: 'KeyE', label: 'E' },
  select: { code: 'ShiftRight', label: 'Shift Phải' },
  start: { code: 'Enter', label: 'Enter' },
  quickSave: { code: 'F2', label: 'F2' },
  quickLoad: { code: 'F4', label: 'F4' },
  rewind: { code: 'Backspace', label: 'Backspace' },
  fastForward: { code: 'Tab', label: 'Tab' },
  pause: { code: 'Space', label: 'Space' },
};

const DEFAULT_SNES_GAMEPAD: Record<VirtualControllerButton, GamepadBinding> = {
  up: { buttonIndex: 12, label: 'D-Pad Lên (Btn 12)' },
  down: { buttonIndex: 13, label: 'D-Pad Xuống (Btn 13)' },
  left: { buttonIndex: 14, label: 'D-Pad Trái (Btn 14)' },
  right: { buttonIndex: 15, label: 'D-Pad Phải (Btn 15)' },
  b: { buttonIndex: 0, label: 'Btn 0 (SNES B / Xbox A)' },
  a: { buttonIndex: 1, label: 'Btn 1 (SNES A / Xbox B)' },
  y: { buttonIndex: 2, label: 'Btn 2 (SNES Y / Xbox X)' },
  x: { buttonIndex: 3, label: 'Btn 3 (SNES X / Xbox Y)' },
  l: { buttonIndex: 4, label: 'Btn 4 (L1 / LB)' },
  r: { buttonIndex: 5, label: 'Btn 5 (R1 / RB)' },
  select: { buttonIndex: 8, label: 'Btn 8 (Select / Back)' },
  start: { buttonIndex: 9, label: 'Btn 9 (Start / Menu)' },
  quickSave: { buttonIndex: 10, label: 'Btn 10 (L3 Cần Trái)' },
  quickLoad: { buttonIndex: 11, label: 'Btn 11 (R3 Cần Phải)' },
  rewind: { buttonIndex: 6, label: 'Btn 6 (Cò L2 / LT)' },
  fastForward: { buttonIndex: 7, label: 'Btn 7 (Cò R2 / RT)' },
  pause: { buttonIndex: 16, label: 'Btn 16 (Home / Guide)' },
};

const DEFAULT_NES_KEYBOARD: Record<VirtualControllerButton, KeyBinding> = {
  up: { code: 'ArrowUp', label: '↑ Phím Mũi Tên Lên' },
  down: { code: 'ArrowDown', label: '↓ Phím Mũi Tên Xuống' },
  left: { code: 'ArrowLeft', label: '← Phím Mũi Tên Trái' },
  right: { code: 'ArrowRight', label: '→ Phím Mũi Tên Phải' },
  b: { code: 'KeyZ', label: 'Z' },
  a: { code: 'KeyX', label: 'X' },
  y: { code: '', label: 'Chưa gán' },
  x: { code: '', label: 'Chưa gán' },
  l: { code: '', label: 'Chưa gán' },
  r: { code: '', label: 'Chưa gán' },
  select: { code: 'ShiftRight', label: 'Shift Phải' },
  start: { code: 'Enter', label: 'Enter' },
  quickSave: { code: 'F2', label: 'F2' },
  quickLoad: { code: 'F4', label: 'F4' },
  rewind: { code: 'Backspace', label: 'Backspace' },
  fastForward: { code: 'Tab', label: 'Tab' },
  pause: { code: 'Space', label: 'Space' },
};

const DEFAULT_NES_GAMEPAD: Record<VirtualControllerButton, GamepadBinding> = {
  up: { buttonIndex: 12, label: 'D-Pad Lên (Btn 12)' },
  down: { buttonIndex: 13, label: 'D-Pad Xuống (Btn 13)' },
  left: { buttonIndex: 14, label: 'D-Pad Trái (Btn 14)' },
  right: { buttonIndex: 15, label: 'D-Pad Phải (Btn 15)' },
  b: { buttonIndex: 0, label: 'Btn 0 (NES B)' },
  a: { buttonIndex: 1, label: 'Btn 1 (NES A)' },
  y: { buttonIndex: -1, label: 'Chưa gán' },
  x: { buttonIndex: -1, label: 'Chưa gán' },
  l: { buttonIndex: -1, label: 'Chưa gán' },
  r: { buttonIndex: -1, label: 'Chưa gán' },
  select: { buttonIndex: 8, label: 'Btn 8 (Select)' },
  start: { buttonIndex: 9, label: 'Btn 9 (Start)' },
  quickSave: { buttonIndex: 10, label: 'Btn 10 (L3)' },
  quickLoad: { buttonIndex: 11, label: 'Btn 11 (R3)' },
  rewind: { buttonIndex: 6, label: 'Btn 6 (L2)' },
  fastForward: { buttonIndex: 7, label: 'Btn 7 (R2)' },
  pause: { buttonIndex: 16, label: 'Btn 16 (Home)' },
};

const DEFAULT_GBA_KEYBOARD: Record<VirtualControllerButton, KeyBinding> = {
  up: { code: 'ArrowUp', label: '↑ Phím Mũi Tên Lên' },
  down: { code: 'ArrowDown', label: '↓ Phím Mũi Tên Xuống' },
  left: { code: 'ArrowLeft', label: '← Phím Mũi Tên Trái' },
  right: { code: 'ArrowRight', label: '→ Phím Mũi Tên Phải' },
  b: { code: 'KeyZ', label: 'Z' },
  a: { code: 'KeyX', label: 'X' },
  y: { code: '', label: 'Chưa gán' },
  x: { code: '', label: 'Chưa gán' },
  l: { code: 'KeyQ', label: 'Q' },
  r: { code: 'KeyE', label: 'E' },
  select: { code: 'ShiftRight', label: 'Shift Phải' },
  start: { code: 'Enter', label: 'Enter' },
  quickSave: { code: 'F2', label: 'F2' },
  quickLoad: { code: 'F4', label: 'F4' },
  rewind: { code: 'Backspace', label: 'Backspace' },
  fastForward: { code: 'Tab', label: 'Tab' },
  pause: { code: 'Space', label: 'Space' },
};

const DEFAULT_GBA_GAMEPAD: Record<VirtualControllerButton, GamepadBinding> = {
  up: { buttonIndex: 12, label: 'D-Pad Lên (Btn 12)' },
  down: { buttonIndex: 13, label: 'D-Pad Xuống (Btn 13)' },
  left: { buttonIndex: 14, label: 'D-Pad Trái (Btn 14)' },
  right: { buttonIndex: 15, label: 'D-Pad Phải (Btn 15)' },
  b: { buttonIndex: 0, label: 'Btn 0 (GBA B)' },
  a: { buttonIndex: 1, label: 'Btn 1 (GBA A)' },
  y: { buttonIndex: -1, label: 'Chưa gán' },
  x: { buttonIndex: -1, label: 'Chưa gán' },
  l: { buttonIndex: 4, label: 'Btn 4 (L Bumper)' },
  r: { buttonIndex: 5, label: 'Btn 5 (R Bumper)' },
  select: { buttonIndex: 8, label: 'Btn 8 (Select)' },
  start: { buttonIndex: 9, label: 'Btn 9 (Start)' },
  quickSave: { buttonIndex: 10, label: 'Btn 10 (L3)' },
  quickLoad: { buttonIndex: 11, label: 'Btn 11 (R3)' },
  rewind: { buttonIndex: 6, label: 'Btn 6 (L2)' },
  fastForward: { buttonIndex: 7, label: 'Btn 7 (R2)' },
  pause: { buttonIndex: 16, label: 'Btn 16 (Home)' },
};

export class InputConfigService {
  private storageKey = 'retroverse_input_config_v3';
  private configs: Record<TargetSystem, SystemInputMap>;
  private changeListeners: Array<() => void> = [];

  constructor() {
    this.configs = {
      NES: { keyboard: { ...DEFAULT_NES_KEYBOARD }, gamepad: { ...DEFAULT_NES_GAMEPAD } },
      SNES: { keyboard: { ...DEFAULT_SNES_KEYBOARD }, gamepad: { ...DEFAULT_SNES_GAMEPAD } },
      GBA: { keyboard: { ...DEFAULT_GBA_KEYBOARD }, gamepad: { ...DEFAULT_GBA_GAMEPAD } },
    };
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.NES) this.configs.NES = parsed.NES;
        if (parsed.SNES) this.configs.SNES = parsed.SNES;
        if (parsed.GBA) this.configs.GBA = parsed.GBA;
      }
    } catch (e) {
      console.warn('Could not load input config from localStorage', e);
    }
  }

  public saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.configs));
      this.notifyListeners();
    } catch (e) {
      console.warn('Could not save input config to localStorage', e);
    }
  }

  public getSystemConfig(system: TargetSystem): SystemInputMap {
    return this.configs[system];
  }

  public setKeyboardBinding(system: TargetSystem, button: VirtualControllerButton, binding: KeyBinding): void {
    this.configs[system].keyboard[button] = binding;
    this.saveToStorage();
  }

  public setGamepadBinding(system: TargetSystem, button: VirtualControllerButton, binding: GamepadBinding): void {
    this.configs[system].gamepad[button] = binding;
    this.saveToStorage();
  }

  public clearBinding(system: TargetSystem, device: 'keyboard' | 'gamepad', button: VirtualControllerButton): void {
    if (device === 'keyboard') {
      this.configs[system].keyboard[button] = { code: '', label: 'Chưa gán' };
    } else {
      this.configs[system].gamepad[button] = { buttonIndex: -1, label: 'Chưa gán' };
    }
    this.saveToStorage();
  }

  public resetSystem(system: TargetSystem): void {
    if (system === 'NES') {
      this.configs.NES = { keyboard: { ...DEFAULT_NES_KEYBOARD }, gamepad: { ...DEFAULT_NES_GAMEPAD } };
    } else if (system === 'SNES') {
      this.configs.SNES = { keyboard: { ...DEFAULT_SNES_KEYBOARD }, gamepad: { ...DEFAULT_SNES_GAMEPAD } };
    } else if (system === 'GBA') {
      this.configs.GBA = { keyboard: { ...DEFAULT_GBA_KEYBOARD }, gamepad: { ...DEFAULT_GBA_GAMEPAD } };
    }
    this.saveToStorage();
  }

  public resetAll(): void {
    this.configs.NES = { keyboard: { ...DEFAULT_NES_KEYBOARD }, gamepad: { ...DEFAULT_NES_GAMEPAD } };
    this.configs.SNES = { keyboard: { ...DEFAULT_SNES_KEYBOARD }, gamepad: { ...DEFAULT_SNES_GAMEPAD } };
    this.configs.GBA = { keyboard: { ...DEFAULT_GBA_KEYBOARD }, gamepad: { ...DEFAULT_GBA_GAMEPAD } };
    this.saveToStorage();
  }

  // Presets
  public applyPreset(system: TargetSystem, preset: 'retro_arrow' | 'wasd_gamer' | 'numpad_compact'): void {
    const kb = this.configs[system].keyboard;

    if (preset === 'wasd_gamer') {
      kb.up = { code: 'KeyW', label: 'W' };
      kb.down = { code: 'KeyS', label: 'S' };
      kb.left = { code: 'KeyA', label: 'A' };
      kb.right = { code: 'KeyD', label: 'D' };
      kb.b = { code: 'KeyJ', label: 'J' };
      kb.a = { code: 'KeyK', label: 'K' };
      kb.y = { code: 'KeyU', label: 'U' };
      kb.x = { code: 'KeyI', label: 'I' };
      kb.l = { code: 'KeyO', label: 'O' };
      kb.r = { code: 'KeyP', label: 'P' };
      kb.select = { code: 'Space', label: 'Space' };
      kb.start = { code: 'Enter', label: 'Enter' };
    } else if (preset === 'numpad_compact') {
      kb.up = { code: 'Numpad8', label: 'Num 8' };
      kb.down = { code: 'Numpad2', label: 'Num 2' };
      kb.left = { code: 'Numpad4', label: 'Num 4' };
      kb.right = { code: 'Numpad6', label: 'Num 6' };
      kb.b = { code: 'Numpad1', label: 'Num 1' };
      kb.a = { code: 'Numpad3', label: 'Num 3' };
      kb.y = { code: 'Numpad7', label: 'Num 7' };
      kb.x = { code: 'Numpad9', label: 'Num 9' };
      kb.l = { code: 'NumpadDivide', label: 'Num /' };
      kb.r = { code: 'NumpadMultiply', label: 'Num *' };
      kb.select = { code: 'Numpad0', label: 'Num 0' };
      kb.start = { code: 'NumpadEnter', label: 'Num Enter' };
    } else {
      // Default retro arrows
      if (system === 'NES') this.configs.NES.keyboard = { ...DEFAULT_NES_KEYBOARD };
      if (system === 'SNES') this.configs.SNES.keyboard = { ...DEFAULT_SNES_KEYBOARD };
      if (system === 'GBA') this.configs.GBA.keyboard = { ...DEFAULT_GBA_KEYBOARD };
    }
    this.saveToStorage();
  }

  public applyGamepadPreset(system: TargetSystem, preset: 'snes_standard' | 'xbox_pc' | 'playstation'): void {
    const gp = this.configs[system].gamepad;

    if (preset === 'xbox_pc') {
      // Xbox / PC layout: A is bottom (Btn 0), B is right (Btn 1), X is left (Btn 2), Y is top (Btn 3)
      gp.b = { buttonIndex: 0, label: 'Btn 0 (Xbox A / Bottom)' };
      gp.a = { buttonIndex: 1, label: 'Btn 1 (Xbox B / Right)' };
      gp.y = { buttonIndex: 2, label: 'Btn 2 (Xbox X / Left)' };
      gp.x = { buttonIndex: 3, label: 'Btn 3 (Xbox Y / Top)' };
      gp.l = { buttonIndex: 4, label: 'Btn 4 (LB)' };
      gp.r = { buttonIndex: 5, label: 'Btn 5 (RB)' };
      gp.select = { buttonIndex: 8, label: 'Btn 8 (View / Back)' };
      gp.start = { buttonIndex: 9, label: 'Btn 9 (Menu / Start)' };
    } else if (preset === 'playstation') {
      // DualShock / DualSense layout: Cross is bottom (Btn 0), Circle is right (Btn 1), Square is left (Btn 2), Triangle is top (Btn 3)
      gp.b = { buttonIndex: 0, label: 'Btn 0 (Cross ✕ / Bottom)' };
      gp.a = { buttonIndex: 1, label: 'Btn 1 (Circle ◯ / Right)' };
      gp.y = { buttonIndex: 2, label: 'Btn 2 (Square ▢ / Left)' };
      gp.x = { buttonIndex: 3, label: 'Btn 3 (Triangle △ / Top)' };
      gp.l = { buttonIndex: 4, label: 'Btn 4 (L1)' };
      gp.r = { buttonIndex: 5, label: 'Btn 5 (R1)' };
      gp.select = { buttonIndex: 8, label: 'Btn 8 (Share / Create)' };
      gp.start = { buttonIndex: 9, label: 'Btn 9 (Options)' };
    } else {
      // Standard SNES 8BitDo / Nintendo
      if (system === 'NES') this.configs.NES.gamepad = { ...DEFAULT_NES_GAMEPAD };
      if (system === 'SNES') this.configs.SNES.gamepad = { ...DEFAULT_SNES_GAMEPAD };
      if (system === 'GBA') this.configs.GBA.gamepad = { ...DEFAULT_GBA_GAMEPAD };
    }
    this.saveToStorage();
  }

  // Runtime Input Resolvers
  public getVirtualButtonForKeyboard(code: string, system: TargetSystem = 'SNES'): VirtualControllerButton | null {
    const kb = this.configs[system]?.keyboard || this.configs.SNES.keyboard;
    for (const [btn, binding] of Object.entries(kb)) {
      if (binding.code === code) {
        return btn as VirtualControllerButton;
      }
    }
    // Hardcoded fallback for primary arrows if not remapped
    if (code === 'ArrowUp') return 'up';
    if (code === 'ArrowDown') return 'down';
    if (code === 'ArrowLeft') return 'left';
    if (code === 'ArrowRight') return 'right';
    return null;
  }

  public getVirtualButtonForGamepad(buttonIndex: number, system: TargetSystem = 'SNES'): VirtualControllerButton | null {
    const gp = this.configs[system]?.gamepad || this.configs.SNES.gamepad;
    for (const [btn, binding] of Object.entries(gp)) {
      if (binding.buttonIndex === buttonIndex) {
        return btn as VirtualControllerButton;
      }
    }
    return null;
  }

  public onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.changeListeners.forEach((l) => l());
  }

  // Format key code to friendly string
  public static formatKeyCode(code: string, keyName?: string): string {
    if (!code) return 'Chưa gán';
    if (code === 'Space') return 'Phím Space';
    if (code === 'Enter') return 'Phím Enter';
    if (code === 'Escape') return 'Phím Esc';
    if (code === 'Backspace') return 'Phím Backspace';
    if (code === 'Tab') return 'Phím Tab';
    if (code === 'ShiftLeft') return 'Shift Trái';
    if (code === 'ShiftRight') return 'Shift Phải';
    if (code === 'ControlLeft') return 'Ctrl Trái';
    if (code === 'ControlRight') return 'Ctrl Phải';
    if (code === 'AltLeft') return 'Alt Trái';
    if (code === 'AltRight') return 'Alt Phải';
    if (code === 'ArrowUp') return '↑ Mũi Tên Lên';
    if (code === 'ArrowDown') return '↓ Mũi Tên Xuống';
    if (code === 'ArrowLeft') return '← Mũi Tên Trái';
    if (code === 'ArrowRight') return '→ Mũi Tên Phải';
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (code.startsWith('Digit')) return code.replace('Digit', '');
    if (code.startsWith('Numpad')) return `Num ${code.replace('Numpad', '')}`;
    return keyName ? keyName.toUpperCase() : code;
  }
}

export const inputConfigService = new InputConfigService();
