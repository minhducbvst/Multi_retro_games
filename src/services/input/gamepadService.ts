import { EmulatorInputState } from '../../emulator/engine';

export interface GamepadMappingConfig {
  up: number | string; // Button index or axis direction
  down: number | string;
  left: number | string;
  right: number | string;
  a: number; // Button index
  b: number;
  x: number;
  y: number;
  l: number;
  r: number;
  start: number;
  select: number;
  hotkeySave?: number;
  hotkeyLoad?: number;
  hotkeyRewind?: number;
  hotkeyFastForward?: number;
}

// Standard Gamepad Layout mappings (W3C standard mapping)
// 0: Bottom (A/B), 1: Right (B/A), 2: Left (X/Y), 3: Top (Y/X)
// 4: L1, 5: R1, 6: L2, 7: R2, 8: Select, 9: Start, 10: L3, 11: R3
// 12: Up, 13: Down, 14: Left, 15: Right, 16: Guide/Home
export const STANDARD_SNES_GAMEPAD_MAPPING: GamepadMappingConfig = {
  b: 0, // Bottom (B on SNES)
  a: 1, // Right (A on SNES)
  y: 2, // Left (Y on SNES)
  x: 3, // Top (X on SNES)
  l: 4, // L1
  r: 5, // R1
  select: 8, // Back / Select
  start: 9, // Start
  up: 12, // D-pad Up
  down: 13, // D-pad Down
  left: 14, // D-pad Left
  right: 15, // D-pad Right
  hotkeyRewind: 6, // L2 trigger
  hotkeyFastForward: 7, // R2 trigger
  hotkeySave: 10, // L3 stick click
  hotkeyLoad: 11, // R3 stick click
};

export const XBOX_LAYOUT_MAPPING: GamepadMappingConfig = {
  a: 0, // Xbox A -> Game B (Standard bottom)
  b: 1, // Xbox B -> Game A (Standard right)
  x: 2, // Xbox X -> Game Y (Standard left)
  y: 3, // Xbox Y -> Game X (Standard top)
  l: 4,
  r: 5,
  select: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  hotkeyRewind: 6,
  hotkeyFastForward: 7,
  hotkeySave: 10,
  hotkeyLoad: 11,
};

export interface ConnectedGamepadInfo {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttonsCount: number;
  axesCount: number;
  timestamp: number;
}

export type GamepadActionCallback = (action: 'save' | 'load' | 'rewind' | 'fastforward' | 'pause') => void;

export class GamepadService {
  private activeGamepadIndex: number = 0;
  private deadzone: number = 0.20; // 20% stick deadzone
  private mapping: GamepadMappingConfig = { ...STANDARD_SNES_GAMEPAD_MAPPING };
  private connectedControllers: Map<number, ConnectedGamepadInfo> = new Map();
  private pollInterval: number | null = null;
  private onConnectListeners: Array<(gp: ConnectedGamepadInfo) => void> = [];
  private onDisconnectListeners: Array<(index: number) => void> = [];
  private onActionListeners: Array<GamepadActionCallback> = [];
  private lastButtonStates: boolean[] = [];

  constructor() {
    this.loadSavedConfig();
    this.setupWindowListeners();
  }

  private loadSavedConfig(): void {
    try {
      const savedDeadzone = localStorage.getItem('retroverse_deadzone');
      if (savedDeadzone) {
        this.deadzone = Number(savedDeadzone) / 100;
      }
      const savedMapping = localStorage.getItem('retroverse_gamepad_mapping');
      if (savedMapping) {
        this.mapping = { ...this.mapping, ...JSON.parse(savedMapping) };
      }
    } catch {
      // Use defaults
    }
  }

  private setupWindowListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      const gp = e.gamepad;
      const info: ConnectedGamepadInfo = {
        index: gp.index,
        id: gp.id,
        mapping: gp.mapping,
        connected: gp.connected,
        buttonsCount: gp.buttons.length,
        axesCount: gp.axes.length,
        timestamp: gp.timestamp
      };
      this.connectedControllers.set(gp.index, info);
      this.activeGamepadIndex = gp.index;
      this.onConnectListeners.forEach(cb => cb(info));
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      this.connectedControllers.delete(e.gamepad.index);
      this.onDisconnectListeners.forEach(cb => cb(e.gamepad.index));
    });
  }

  public getConnectedControllers(): ConnectedGamepadInfo[] {
    this.refreshControllersFromApi();
    return Array.from(this.connectedControllers.values());
  }

  public getPrimaryController(): ConnectedGamepadInfo | null {
    this.refreshControllersFromApi();
    return this.connectedControllers.get(this.activeGamepadIndex) || 
      (this.connectedControllers.size > 0 ? Array.from(this.connectedControllers.values())[0] : null);
  }

  public setActiveGamepadIndex(index: number): void {
    this.activeGamepadIndex = index;
  }

  public setDeadzone(valPercent: number): void {
    this.deadzone = Math.max(0, Math.min(valPercent / 100, 0.5));
    try {
      localStorage.setItem('retroverse_deadzone', String(valPercent));
    } catch {
      // Ignore
    }
  }

  public getDeadzone(): number {
    return Math.round(this.deadzone * 100);
  }

  public setMapping(config: Partial<GamepadMappingConfig>): void {
    this.mapping = { ...this.mapping, ...config };
    try {
      localStorage.setItem('retroverse_gamepad_mapping', JSON.stringify(this.mapping));
    } catch {
      // Ignore
    }
  }

  public getMapping(): GamepadMappingConfig {
    return { ...this.mapping };
  }

  // Refresh controllers using navigator.getGamepads()
  public refreshControllersFromApi(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    try {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.connected) {
          this.connectedControllers.set(gp.index, {
            index: gp.index,
            id: gp.id,
            mapping: gp.mapping,
            connected: gp.connected,
            buttonsCount: gp.buttons.length,
            axesCount: gp.axes.length,
            timestamp: gp.timestamp
          });
        } else if (this.connectedControllers.has(i)) {
          this.connectedControllers.delete(i);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Poll current frame inputs from gamepad
  public poll(inputState: EmulatorInputState): {
    inputs: EmulatorInputState;
    rawButtons: boolean[];
    activeAxes: number[];
  } {
    const rawButtons: boolean[] = [];
    const activeAxes: number[] = [0, 0, 0, 0];

    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return { inputs: inputState, rawButtons, activeAxes };
    }

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.activeGamepadIndex] || (gamepads.length > 0 ? gamepads[0] : null);

    if (!gp || !gp.connected) {
      return { inputs: inputState, rawButtons, activeAxes };
    }

    // Populate raw button states
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      const isPressed = typeof b === 'object' ? b.pressed || b.value > 0.4 : b > 0.4;
      rawButtons.push(isPressed);
    }

    // Populate axes with deadzone applied
    for (let i = 0; i < gp.axes.length && i < 4; i++) {
      const val = gp.axes[i];
      activeAxes[i] = Math.abs(val) > this.deadzone ? val : 0;
    }

    // Helper to check button index
    const isBtnPressed = (idx?: number | string): boolean => {
      if (typeof idx === 'number') {
        return !!rawButtons[idx];
      }
      return false;
    };

    // Calculate D-Pad from digital buttons + analog left stick
    const stickX = activeAxes[0];
    const stickY = activeAxes[1];

    const upPressed = isBtnPressed(this.mapping.up) || stickY < -this.deadzone;
    const downPressed = isBtnPressed(this.mapping.down) || stickY > this.deadzone;
    const leftPressed = isBtnPressed(this.mapping.left) || stickX < -this.deadzone;
    const rightPressed = isBtnPressed(this.mapping.right) || stickX > this.deadzone;

    const updated: EmulatorInputState = {
      up: inputState.up || upPressed,
      down: inputState.down || downPressed,
      left: inputState.left || leftPressed,
      right: inputState.right || rightPressed,
      a: inputState.a || isBtnPressed(this.mapping.a),
      b: inputState.b || isBtnPressed(this.mapping.b),
      x: inputState.x || isBtnPressed(this.mapping.x),
      y: inputState.y || isBtnPressed(this.mapping.y),
      l: inputState.l || isBtnPressed(this.mapping.l),
      r: inputState.r || isBtnPressed(this.mapping.r),
      start: inputState.start || isBtnPressed(this.mapping.start),
      select: inputState.select || isBtnPressed(this.mapping.select)
    };

    // Check special hotkey triggers on edges (just pressed)
    if (this.mapping.hotkeySave !== undefined && isBtnPressed(this.mapping.hotkeySave) && !this.lastButtonStates[this.mapping.hotkeySave]) {
      this.notifyAction('save');
      this.vibrate(50, 100, 150);
    }
    if (this.mapping.hotkeyLoad !== undefined && isBtnPressed(this.mapping.hotkeyLoad) && !this.lastButtonStates[this.mapping.hotkeyLoad]) {
      this.notifyAction('load');
      this.vibrate(80, 50, 150);
    }
    if (this.mapping.hotkeyRewind !== undefined && isBtnPressed(this.mapping.hotkeyRewind)) {
      this.notifyAction('rewind');
    }
    if (this.mapping.hotkeyFastForward !== undefined && isBtnPressed(this.mapping.hotkeyFastForward)) {
      this.notifyAction('fastforward');
    }

    this.lastButtonStates = rawButtons;

    return { inputs: updated, rawButtons, activeAxes };
  }

  // Trigger haptic vibration on controller (DualShock / Xbox / DualSense / Switch)
  public async vibrate(weakMagnitude: number = 0.4, strongMagnitude: number = 0.8, durationMs: number = 180): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.activeGamepadIndex] || (gamepads.length > 0 ? gamepads[0] : null);

    if (gp && 'vibrationActuator' in gp && (gp as any).vibrationActuator) {
      try {
        await (gp as any).vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.min(1, Math.max(0, weakMagnitude)),
          strongMagnitude: Math.min(1, Math.max(0, strongMagnitude)),
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public onConnect(cb: (gp: ConnectedGamepadInfo) => void): () => void {
    this.onConnectListeners.push(cb);
    return () => {
      this.onConnectListeners = this.onConnectListeners.filter(c => c !== cb);
    };
  }

  public onDisconnect(cb: (index: number) => void): () => void {
    this.onDisconnectListeners.push(cb);
    return () => {
      this.onDisconnectListeners = this.onDisconnectListeners.filter(c => c !== cb);
    };
  }

  public onAction(cb: GamepadActionCallback): () => void {
    this.onActionListeners.push(cb);
    return () => {
      this.onActionListeners = this.onActionListeners.filter(c => c !== cb);
    };
  }

  private notifyAction(action: 'save' | 'load' | 'rewind' | 'fastforward' | 'pause'): void {
    this.onActionListeners.forEach(cb => cb(action));
  }
}

export const gamepadService = new GamepadService();
