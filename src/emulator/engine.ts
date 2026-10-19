import { Game, Platform, EmulatorTelemetry } from '../types';

export interface EmulatorInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  l: boolean;
  r: boolean;
  start: boolean;
  select: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: 'up' | 'down' | 'left' | 'right';
  isAttacking: boolean;
  attackFrame: number;
  isDashing: boolean;
  hearts: number;
  maxHearts: number;
  magic: number;
  rupees: number;
  bombs: number;
  arrows: number;
  scene: 'castle_courtyard' | 'crypt' | 'dark_world';
}

export class RetroEmulatorEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private currentGame: Game | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private fastForwardSpeed: number = 1;

  // Audio Context
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;

  // Ring buffer for rewinding (up to 600 frames = 10s at 60fps)
  private rewindBuffer: Array<{ player: PlayerState; tick: number }> = [];
  private readonly MAX_REWIND_FRAMES = 600;

  // Input state
  public inputs: EmulatorInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false
  };

  // Game internal state
  public player: PlayerState = {
    x: 120,
    y: 130,
    vx: 0,
    vy: 0,
    direction: 'down',
    isAttacking: false,
    attackFrame: 0,
    isDashing: false,
    hearts: 14,
    maxHearts: 14,
    magic: 85,
    rupees: 180,
    bombs: 10,
    arrows: 30,
    scene: 'castle_courtyard'
  };

  public tickCount: number = 0;
  private lightningFlash: number = 0;
  private rainDrops: Array<{ x: number; y: number; speed: number; len: number }> = [];

  // Telemetry metrics
  private lastFpsTime: number = performance.now();
  private framesThisSecond: number = 0;
  public telemetry: EmulatorTelemetry = {
    fps: 60.0,
    droppedFrames: 0,
    audioLatencyMs: 8.2,
    bufferHealth: 99.8,
    cpuLoad: 12,
    sampleRate: 44100
  };

  constructor() {
    // Generate rain particles
    for (let i = 0; i < 45; i++) {
      this.rainDrops.push({
        x: Math.random() * 256,
        y: Math.random() * 224,
        speed: 4 + Math.random() * 4,
        len: 6 + Math.random() * 6
      });
    }
  }

  public initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  public loadGame(game: Game): void {
    this.currentGame = game;
    this.reset();
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.initAudio();
    this.lastFpsTime = performance.now();
    this.gameLoop();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (!this.isRunning) {
      this.start();
    } else {
      this.isPaused = false;
      this.initAudio();
    }
  }

  public reset(): void {
    this.player = {
      x: 120,
      y: 130,
      vx: 0,
      vy: 0,
      direction: 'down',
      isAttacking: false,
      attackFrame: 0,
      isDashing: false,
      hearts: 14,
      maxHearts: 14,
      magic: 85,
      rupees: 180,
      bombs: 10,
      arrows: 30,
      scene: 'castle_courtyard'
    };
    this.rewindBuffer = [];
    this.tickCount = 0;
  }

  public setInput(btn: keyof EmulatorInputState, pressed: boolean): void {
    const wasPressed = this.inputs[btn];
    this.inputs[btn] = pressed;

    if (pressed && !wasPressed) {
      if (btn === 'b') {
        // Sword attack
        this.triggerAttack();
      } else if (btn === 'a') {
        // Dash / Interaction
        this.triggerDash();
      } else if (btn === 'y') {
        // Boomerang / Magic item
        this.triggerMagicItem();
      }
    }
  }

  public releaseAllInputs(): void {
    for (const key in this.inputs) {
      this.inputs[key as keyof EmulatorInputState] = false;
    }
  }

  public setFastForward(speed: number): void {
    this.fastForwardSpeed = speed;
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public rewindSeconds(seconds: number = 5): void {
    const framesToRewind = Math.min(seconds * 60, this.rewindBuffer.length);
    if (framesToRewind > 0) {
      for (let i = 0; i < framesToRewind; i++) {
        const state = this.rewindBuffer.pop();
        if (state) {
          this.player = { ...state.player };
          this.tickCount = state.tick;
        }
      }
      this.playBeep(240, 0.08, 'sawtooth');
    }
  }

  public saveState(slot: number): string {
    const snapshot = {
      slot,
      gameId: this.currentGame?.id || 'zelda-alttp',
      tickCount: this.tickCount,
      player: { ...this.player },
      timestamp: new Date().toISOString()
    };
    this.playBeep(880, 0.12, 'sine');
    return JSON.stringify(snapshot);
  }

  public loadState(stateData: string): boolean {
    try {
      const parsed = JSON.parse(stateData);
      if (parsed.player) {
        this.player = { ...parsed.player };
        this.tickCount = parsed.tickCount || this.tickCount;
        this.playBeep(523, 0.15, 'sine');
        return true;
      }
    } catch (e) {
      console.error("Failed to load state", e);
    }
    return false;
  }

  public captureScreenshot(): string {
    if (this.canvas) {
      return this.canvas.toDataURL('image/png');
    }
    return '';
  }

  public exportSram(): Uint8Array {
    // Return mock 8KB battery backup buffer with player progress
    const sram = new Uint8Array(8192);
    sram[0] = 0x5a; // 'Z'
    sram[1] = 0x45; // 'E'
    sram[2] = 0x4c; // 'L'
    sram[3] = 0x44; // 'D'
    sram[4] = this.player.hearts;
    sram[5] = this.player.magic;
    sram[6] = this.player.rupees & 0xff;
    sram[7] = (this.player.rupees >> 8) & 0xff;
    return sram;
  }

  private initAudio(): void {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  private playBeep(freq: number, duration: number, type: OscillatorType = 'square'): void {
    if (this.isMuted || !this.audioCtx || this.audioCtx.state !== 'running') return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(this.volume * 0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  private triggerAttack(): void {
    if (this.player.isAttacking) return;
    this.player.isAttacking = true;
    this.player.attackFrame = 0;
    // Authentic sword slash sound
    this.playBeep(440, 0.05, 'sawtooth');
    setTimeout(() => {
      this.playBeep(660, 0.08, 'square');
    }, 40);
  }

  private triggerDash(): void {
    this.player.isDashing = true;
    this.playBeep(220, 0.1, 'triangle');
    setTimeout(() => {
      this.player.isDashing = false;
    }, 500);
  }

  private triggerMagicItem(): void {
    if (this.player.magic >= 4) {
      this.player.magic -= 4;
      this.playBeep(784, 0.15, 'sine');
    }
  }

  private update(): void {
    this.tickCount++;

    // Random lightning flash in Hyrule Castle night
    if (Math.random() < 0.004) {
      this.lightningFlash = 4;
      this.playBeep(110, 0.35, 'sawtooth');
    } else if (this.lightningFlash > 0) {
      this.lightningFlash--;
    }

    // Save history in ring buffer for rewind
    if (this.tickCount % 2 === 0) {
      this.rewindBuffer.push({
        player: { ...this.player },
        tick: this.tickCount
      });
      if (this.rewindBuffer.length > this.MAX_REWIND_FRAMES) {
        this.rewindBuffer.shift();
      }
    }

    // Movement speeds
    const speed = this.player.isDashing ? 3.2 : 1.5;
    let dx = 0;
    let dy = 0;

    if (this.inputs.up) {
      dy -= speed;
      this.player.direction = 'up';
    }
    if (this.inputs.down) {
      dy += speed;
      this.player.direction = 'down';
    }
    if (this.inputs.left) {
      dx -= speed;
      this.player.direction = 'left';
    }
    if (this.inputs.right) {
      dx += speed;
      this.player.direction = 'right';
    }

    // Diagonal normalization
    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    // Boundary constraints (256 x 224)
    this.player.x = Math.max(20, Math.min(236, this.player.x + dx));
    this.player.y = Math.max(30, Math.min(200, this.player.y + dy));

    // Attack frame progression
    if (this.player.isAttacking) {
      this.player.attackFrame++;
      if (this.player.attackFrame > 12) {
        this.player.isAttacking = false;
        this.player.attackFrame = 0;
      }
    }

    // Update rain particles
    for (const drop of this.rainDrops) {
      drop.y += drop.speed;
      drop.x -= 1.2; // wind slant
      if (drop.y > 224) {
        drop.y = -drop.len;
        drop.x = Math.random() * 280;
      }
    }
  }

  private render(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = 256;
    const h = 224;

    // Background base
    if (this.lightningFlash > 0) {
      ctx.fillStyle = '#b4c0e0';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#141824';
      ctx.fillRect(0, 0, w, h);
    }

    // Draw Hyrule Castle Wall / Tiles
    ctx.fillStyle = '#1d2232';
    ctx.fillRect(16, 24, 224, 60);

    // Stone brick grid
    ctx.strokeStyle = '#282f44';
    ctx.lineWidth = 1;
    for (let x = 16; x < 240; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x, 84);
      ctx.stroke();
    }
    for (let y = 24; y < 84; y += 12) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(240, y);
      ctx.stroke();
    }

    // Castle Gate Archway
    ctx.fillStyle = '#0d101a';
    ctx.fillRect(96, 36, 64, 48);
    ctx.strokeStyle = '#3d4766';
    ctx.strokeRect(96, 36, 64, 48);

    // Torches on both sides
    const torchFlicker = (this.tickCount % 6 < 3) ? 1 : 0;
    // Left Torch
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(80, 52, 4, 12);
    ctx.fillStyle = torchFlicker ? '#ff9900' : '#ffcc00';
    ctx.fillRect(78, 46, 8, 8);
    // Right Torch
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(172, 52, 4, 12);
    ctx.fillStyle = torchFlicker ? '#ffcc00' : '#ff9900';
    ctx.fillRect(170, 46, 8, 8);

    // Courtyard stone floor
    ctx.fillStyle = '#181d2a';
    ctx.fillRect(16, 84, 224, 130);

    // Rain puddle reflections
    ctx.fillStyle = '#222b40';
    ctx.beginPath();
    ctx.ellipse(80, 140, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(180, 160, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Render Player Character (Link in iconic green tunic & cap)
    const px = Math.round(this.player.x);
    const py = Math.round(this.player.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + 8, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tunic Body (Green)
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(px - 5, py - 4, 10, 10);

    // Belt
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(px - 5, py + 2, 10, 2);

    // Cap (Green)
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(px - 6, py - 12, 12, 6);
    // Cap tip drooping
    if (this.player.direction === 'left') {
      ctx.fillRect(px + 4, py - 10, 4, 4);
    } else {
      ctx.fillRect(px - 8, py - 10, 4, 4);
    }

    // Face / Head (Flesh tone)
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(px - 4, py - 7, 8, 5);

    // Eyes
    ctx.fillStyle = '#111';
    if (this.player.direction === 'left') {
      ctx.fillRect(px - 3, py - 6, 2, 2);
    } else if (this.player.direction === 'right') {
      ctx.fillRect(px + 1, py - 6, 2, 2);
    } else if (this.player.direction === 'up') {
      // Back of head (Brown hair)
      ctx.fillStyle = '#a04000';
      ctx.fillRect(px - 4, py - 7, 8, 5);
    } else {
      ctx.fillRect(px - 3, py - 6, 2, 2);
      ctx.fillRect(px + 1, py - 6, 2, 2);
    }

    // Shield (Blue Hylian Shield with red triforce crest)
    ctx.fillStyle = '#2980b9';
    if (this.player.direction === 'left') {
      ctx.fillRect(px + 4, py - 3, 4, 9);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(px + 5, py, 2, 3);
    } else if (this.player.direction === 'right') {
      ctx.fillRect(px - 8, py - 3, 4, 9);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(px - 7, py, 2, 3);
    } else {
      ctx.fillRect(px - 8, py - 1, 5, 8);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(px - 7, py + 1, 3, 3);
    }

    // Master Sword
    if (this.player.isAttacking) {
      ctx.fillStyle = '#e8f8f5';
      ctx.strokeStyle = '#4cd7f6';
      ctx.lineWidth = 1;

      // Sword slash swing arc
      if (this.player.direction === 'down') {
        ctx.fillRect(px + 4, py + 2, 16, 3);
        ctx.strokeRect(px + 4, py + 2, 16, 3);
      } else if (this.player.direction === 'up') {
        ctx.fillRect(px + 4, py - 18, 4, 16);
        ctx.strokeRect(px + 4, py - 18, 4, 16);
      } else if (this.player.direction === 'left') {
        ctx.fillRect(px - 18, py - 1, 16, 4);
        ctx.strokeRect(px - 18, py - 1, 16, 4);
      } else {
        ctx.fillRect(px + 4, py - 1, 16, 4);
        ctx.strokeRect(px + 4, py - 1, 16, 4);
      }
    } else {
      // Sheathed sword / held ready
      ctx.fillStyle = '#bdc3c7';
      ctx.fillRect(px + 5, py - 6, 2, 10);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(px + 4, py - 7, 4, 2);
    }

    // Rain Streaks
    ctx.strokeStyle = 'rgba(174, 214, 241, 0.45)';
    ctx.lineWidth = 1;
    for (const drop of this.rainDrops) {
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - 2, drop.y + drop.len);
      ctx.stroke();
    }

    // HUD Layer: Hearts, Magic Meter, Rupee, Bombs
    // Top-left HUD box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(8, 6, 90, 22);
    ctx.strokeStyle = '#494454';
    ctx.strokeRect(8, 6, 90, 22);

    // Magic Meter bar
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(12, 12, (this.player.magic / 100) * 80, 4);
    ctx.strokeStyle = '#2ecc71';
    ctx.strokeRect(12, 12, 80, 4);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '7px monospace';
    ctx.fillText('MAGIC', 12, 10);

    // Hearts top-right HUD
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(160, 6, 88, 22);
    ctx.strokeStyle = '#494454';
    ctx.strokeRect(160, 6, 88, 22);

    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = (i < Math.ceil(this.player.hearts / 2)) ? '#e74c3c' : '#555';
      ctx.fillRect(166 + i * 11, 10, 8, 7);
    }
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = (i + 7 < Math.ceil(this.player.hearts / 2)) ? '#e74c3c' : '#555';
      ctx.fillRect(166 + i * 11, 19, 8, 7);
    }

    // Rupee counter
    ctx.fillStyle = '#ffb95f';
    ctx.font = '8px monospace';
    ctx.fillText(`R:${this.player.rupees.toString().padStart(3, '0')}`, 16, 22);
  }

  private gameLoop = (): void => {
    if (!this.isRunning) return;

    if (!this.isPaused) {
      // Step simulation for fast-forward multiplier
      for (let s = 0; s < this.fastForwardSpeed; s++) {
        this.update();
      }
      this.render();
      this.framesThisSecond++;
    }

    // Calculate real FPS
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.telemetry.fps = Math.round((this.framesThisSecond * 1000) / (now - this.lastFpsTime) * 10) / 10;
      this.framesThisSecond = 0;
      this.lastFpsTime = now;
      this.telemetry.cpuLoad = Math.round(10 + Math.random() * 4);
    }

    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  public dispose(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
