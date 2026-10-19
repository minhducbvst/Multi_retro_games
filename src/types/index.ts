export type Platform = 'NES' | 'SNES' | 'GBA' | 'GENESIS';

export interface Game {
  id: string;
  title: string;
  japaneseTitle?: string;
  platform: Platform;
  year: number;
  developer: string;
  genre: string;
  rating: number;
  ratingCount: number;
  boxArt: string;
  artwork?: string;
  backdropArt?: string;
  description: string;
  features: string[];
  batterySave?: boolean;
  sramSize?: string;
  nativeResolution?: string;
  aspectRatio?: string;
  framerate?: number;
  multiplayer?: {
    supported: boolean;
    type: string;
    maxPlayers: number;
  };
  recommendedCore?: string;
  compatibility?: number; // e.g. 99.8%
  compatibilityScore?: number;
  players?: string;
  releaseDate?: string;
  sampleRomUrl?: string;
  romFilename?: string;
  md5?: string;
  crc32?: string;
  sha1?: string;
}

export type SaveType = 'battery' | 'sram' | 'state' | 'autosave';

export interface SaveMetadata {
  id: string;
  ownerUid?: string;
  gameId: string;
  gameTitle?: string;
  platform?: Platform;
  slot: number;
  type: SaveType;
  locationName?: string;
  location?: string;
  sizeBytes: number;
  checksum?: string;
  hearts?: number;
  equipment?: string;
  rawBase64Data?: string;
  screenshotUrl?: string;
  cloudSynced?: boolean;
  timestamp?: number;
  inGameTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveConflict {
  gameId: string;
  gameTitle?: string;
  platform?: Platform;
  slot?: number;
  localSave: SaveMetadata;
  cloudSave: SaveMetadata;
  divergenceHours?: number;
}

export interface NetPlayRoom {
  id: string;
  code: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  guestUid?: string;
  guestName?: string;
  guestAvatar?: string;
  gameId: string;
  gameTitle: string;
  platform: Platform;
  status: 'waiting' | 'ready' | 'playing' | 'closed';
  isPublic: boolean;
  hostReady: boolean;
  guestReady: boolean;
  pingMs: number;
  spectators: { id: string; name: string; latencyMs: number }[];
  rollbackFrames: number;
  inputDelayTarget: string;
  pauseAuthority: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface SignalingMessage {
  id: string;
  roomId: string;
  senderUid: string;
  targetUid?: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: string;
  createdAt: string;
}

export interface Trophy {
  id: string;
  title: string;
  gameTitle: string;
  platform: Platform;
  description: string;
  tier: 'Diamond' | 'Gold' | 'Platinum' | 'Ruby';
  code: string;
  unlockedPercentage: number;
  unlockedDate: string;
  iconName: string;
  points?: number;
}

export interface SpeedrunRecord {
  id: string;
  gameTitle: string;
  platform: Platform;
  category: string;
  time: string;
  splitDelta: string;
  globalRank: number;
  rank?: number;
  totalRunners: number;
  percentile: number;
  verificationHash: string;
  coreVersion: string;
  gameId?: string;
  date?: string;
}

export interface ControllerMapping {
  dpadUp: string;
  dpadDown: string;
  dpadLeft: string;
  dpadRight: string;
  buttonA: string;
  buttonB: string;
  buttonX: string;
  buttonY: string;
  triggerL: string;
  triggerR: string;
  start: string;
  select: string;
}

export interface ShaderPreset {
  id: string;
  name: string;
  subtitle: string;
  scanlineIntensity: number;
  screenCurvature: number;
  bloomGlow: number;
}

export interface EmulatorTelemetry {
  fps: number;
  frameTimeMs?: number;
  apuSampleRate?: number;
  audioBufferHealth?: number;
  jitCompilations?: number;
  vramUsageBytes?: number;
  cpuCycleEstimate?: string;
  droppedFrames?: number;
  cpuLoad?: number;
  audioLatencyMs?: number;
  bufferHealth?: number;
  sampleRate?: number;
}
