import { Trophy, SpeedrunRecord } from '../../types';

export interface UserStats {
  totalGames: number;
  hoursPlayed: number;
  savesStored: number;
  trophiesUnlocked: number;
  speedrunRecords: number;
  netPlayWinRate: string;
  favoriteGenre: string;
}

export const DEFAULT_USER_STATS: UserStats = {
  totalGames: 12,
  hoursPlayed: 0,
  savesStored: 0,
  trophiesUnlocked: 0,
  speedrunRecords: 0,
  netPlayWinRate: '0.0%',
  favoriteGenre: 'Action / Adventure'
};

export const AVAILABLE_TROPHIES: Trophy[] = [
  {
    id: 'trophy-zelda',
    title: 'Triforce Conqueror',
    gameTitle: 'The Legend of Zelda: A Link to the Past',
    platform: 'SNES',
    description: '100% Item completion & beaten without a single game over screen in Master Mode.',
    tier: 'Diamond',
    code: 'SNES #1094',
    unlockedPercentage: 3.2,
    unlockedDate: 'Locked (Requires Completion)',
    iconName: 'shield',
    points: 250
  },
  {
    id: 'trophy-mk',
    title: 'Speed Demon 150cc',
    gameTitle: 'Super Mario Kart',
    platform: 'SNES',
    description: 'Gold cup on all tracks with sub-1:05 lap records achieved across all circuits.',
    tier: 'Gold',
    code: 'SNES #2041',
    unlockedPercentage: 5.8,
    unlockedDate: 'Locked (Requires Time Trial)',
    iconName: 'sports_motorsports',
    points: 150
  },
  {
    id: 'trophy-metroid',
    title: 'Metroid Zero Mission',
    gameTitle: 'Metroid: Fusion',
    platform: 'GBA',
    description: 'Sub-2 hour speedrun completion with 100% item collection on Hard Mode.',
    tier: 'Platinum',
    code: 'GBA #4412',
    unlockedPercentage: 1.9,
    unlockedDate: 'Locked (Requires Speedrun)',
    iconName: 'rocket_launch',
    points: 200
  },
  {
    id: 'trophy-smw',
    title: '96-Exit Master',
    gameTitle: 'Super Mario World',
    platform: 'SNES',
    description: 'Uncovered every secret goal, Special Zone exit, and Star Road pathway.',
    tier: 'Ruby',
    code: 'SNES #3890',
    unlockedPercentage: 4.4,
    unlockedDate: 'Locked (Requires Special Zone)',
    iconName: 'stars',
    points: 100
  }
];

export const AVAILABLE_SPEEDRUNS: SpeedrunRecord[] = [
  {
    id: 'run-zelda',
    gameId: 'zelda-alttp',
    gameTitle: 'The Legend of Zelda: A Link to the Past',
    platform: 'SNES',
    category: 'Any% No Major Glitches (NMG)',
    time: '--:--:--',
    splitDelta: 'Ready to record',
    globalRank: 1,
    rank: 1,
    date: 'Unranked',
    totalRunners: 1280,
    percentile: 100,
    verificationHash: 'WASM-Snes9x v2.1.0 Ready',
    coreVersion: 'Snes9x 2010'
  },
  {
    id: 'run-mk',
    gameId: 'super-mario-kart',
    gameTitle: 'Super Mario Kart',
    platform: 'SNES',
    category: 'Mushroom Cup 150cc Time Attack',
    time: '--:--:--',
    splitDelta: 'Ready to record',
    globalRank: 1,
    rank: 1,
    date: 'Unranked',
    totalRunners: 980,
    percentile: 100,
    verificationHash: 'Frame-Counter Ready',
    coreVersion: 'Snes9x 2010'
  },
  {
    id: 'run-metroid',
    gameId: 'metroid-fusion',
    gameTitle: 'Metroid Fusion',
    platform: 'GBA',
    category: 'Any% Normal',
    time: '--:--:--',
    splitDelta: 'Ready to record',
    globalRank: 1,
    rank: 1,
    date: 'Unranked',
    totalRunners: 870,
    percentile: 100,
    verificationHash: 'mGBA Cycle-Exact',
    coreVersion: 'mGBA 0.9.3'
  }
];
