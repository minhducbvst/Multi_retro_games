import { useState, useEffect } from 'react';
import { Game, Platform } from '../../types';
import { romStorage } from '../roms/romStorage';

const STORAGE_KEY = 'retroverse_user_games';

function stripRomExtension(name: string): string {
  return name.replace(/\.(nes|sfc|smc|gba|gb|gbc|md|gen|smd|bin|zip)$/i, '');
}

function normalizeIdentityText(val?: string): string {
  if (!val) return '';
  return stripRomExtension(val)
    .trim()
    .toLowerCase()
    .replace(/[\s_.-]+/g, ' ')
    .trim();
}

function isSvgBoxArt(boxArt?: string): boolean {
  return Boolean(boxArt && boxArt.startsWith('data:image/svg+xml'));
}

// Helper for generating dynamic SVG retro cartridge cover art
export function getCartridgeCoverArt(title: string, platform: Platform | string): string {
  const plat = (platform || 'NES').toUpperCase();
  let accentColor = '#4cd7f6';

  if (plat.includes('SNES')) {
    accentColor = '#a078ff';
  } else if (plat.includes('GBA')) {
    accentColor = '#38bdf8';
  } else if (plat.includes('NES')) {
    accentColor = '#fb7185';
  } else if (plat.includes('GENESIS') || plat.includes('SEGA') || plat.includes('MEGA')) {
    accentColor = '#34d399';
  }

  // Generate SVG data URL for crisp retro cartridge artwork
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#141721" />
        <stop offset="50%" stop-color="#0c0e14" />
        <stop offset="100%" stop-color="#191b24" />
      </linearGradient>
      <linearGradient id="stripe" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#a078ff" stop-opacity="0.3"/>
      </linearGradient>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2a2e3d" stroke-width="0.5"/>
      </pattern>
    </defs>
    <rect width="400" height="500" rx="16" fill="url(#bg)"/>
    <rect width="400" height="500" rx="16" fill="url(#grid)" opacity="0.6"/>
    
    <!-- Cartridge Header Top Grip -->
    <rect x="30" y="24" width="340" height="18" rx="4" fill="#202433" stroke="#33384c" stroke-width="1"/>
    <line x1="50" y1="33" x2="350" y2="33" stroke="#494454" stroke-width="2" stroke-dasharray="8,6"/>
    
    <!-- Platform Header Strip -->
    <rect x="30" y="58" width="340" height="34" rx="6" fill="#1b1e2a" stroke="#33384c" stroke-width="1"/>
    <text x="46" y="80" fill="${accentColor}" font-family="monospace" font-size="14" font-weight="bold" letter-spacing="2">${plat} CARTRIDGE</text>
    <circle cx="346" cy="75" r="5" fill="${accentColor}" opacity="0.8"/>
    
    <!-- Main Center Art Box -->
    <rect x="30" y="104" width="340" height="280" rx="10" fill="#0d0f17" stroke="#33384c" stroke-width="1.5"/>
    <rect x="30" y="378" width="340" height="6" fill="url(#stripe)"/>

    <!-- Controller Icon Graphic -->
    <g transform="translate(140, 170)" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="0" y="0" width="120" height="70" rx="20" fill="#161824" stroke="#494454"/>
      <!-- D-Pad -->
      <path d="M 24 25 L 24 45 M 14 35 L 34 35" stroke="${accentColor}" stroke-width="4"/>
      <!-- Action Buttons -->
      <circle cx="95" cy="30" r="5" fill="#f43f5e" stroke="none"/>
      <circle cx="82" cy="42" r="5" fill="#38bdf8" stroke="none"/>
      <!-- Select / Start -->
      <line x1="52" y1="37" x2="58" y2="37" stroke="#958ea0" stroke-width="2"/>
      <line x1="62" y1="37" x2="68" y2="37" stroke="#958ea0" stroke-width="2"/>
    </g>

    <!-- Game Title Label -->
    <text x="200" y="300" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="19" font-weight="bold">
      ${escapeXml(truncateTitle(title, 26))}
    </text>
    <text x="200" y="330" text-anchor="middle" fill="#958ea0" font-family="monospace" font-size="11">
      VERIFIED ROM DUMP
    </text>

    <!-- Bottom Cartridge Connector Pins -->
    <g transform="translate(40, 420)">
      <rect x="0" y="0" width="320" height="56" rx="4" fill="#151722" stroke="#2a2e3d"/>
      <line x1="0" y1="28" x2="320" y2="28" stroke="#ef4444" stroke-opacity="0.4" stroke-width="1"/>
      <!-- Gold Connector Pins -->
      ${Array.from({ length: 18 })
        .map((_, i) => `<rect x="${14 + i * 16}" y="32" width="10" height="18" rx="1.5" fill="#fbbf24" opacity="0.85"/>`)
        .join('')}
    </g>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function truncateTitle(str: string, max: number): string {
  if (!str) return 'Retro ROM';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

class LibraryStore {
  private games: Game[] = [];
  private snapshot: Game[] = [];
  private listeners: Array<(games: Game[]) => void> = [];

  constructor() {
    this.loadFromStorage();
    this.updateSnapshot();
  }

  private updateSnapshot(): void {
    this.snapshot = [...this.games];
  }

  private isDuplicateRecord(a: Partial<Game>, b: Partial<Game>): boolean {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.driveFileId && b.driveFileId && a.driveFileId === b.driveFileId) return true;

    const platA = String(a.platform || '').toUpperCase();
    const platB = String(b.platform || '').toUpperCase();
    if (platA !== platB) return false;

    if (a.crc32 && b.crc32) {
      return a.crc32.toLowerCase() === b.crc32.toLowerCase();
    }
    if (a.md5 && b.md5) {
      return a.md5.toLowerCase() === b.md5.toLowerCase();
    }

    const fileA = normalizeIdentityText(a.romFilename);
    const fileB = normalizeIdentityText(b.romFilename);
    if (fileA && fileB) {
      return fileA === fileB;
    }

    const titleA = normalizeIdentityText(a.title);
    const titleB = normalizeIdentityText(b.title);
    if (titleA && titleB && titleA === titleB) {
      return true;
    }

    return false;
  }

  private mergeDuplicateRecords(existing: Game, incoming: Game): Game {
    const existingHasLocal = Boolean(romStorage.getRom(existing.id));
    const incomingHasLocal = Boolean(romStorage.getRom(incoming.id));

    // Prefer keeping the record whose ID already owns local IndexedDB/memory ROM data, or custom local ID
    const keepIncomingId =
      (!existingHasLocal && incomingHasLocal) ||
      (!existingHasLocal &&
        existing.id.startsWith('drive-') &&
        incoming.id.startsWith('custom-'));

    const canonicalId = keepIncomingId ? incoming.id : existing.id;
    const droppedId = canonicalId === existing.id ? incoming.id : existing.id;

    // If the dropped ID holds cached bytes in memory while canonical ID does not, migrate them cleanly
    if (droppedId !== canonicalId && !romStorage.getRom(canonicalId)) {
      const droppedRom = romStorage.getRom(droppedId);
      if (droppedRom) {
        romStorage.saveRom(canonicalId, droppedRom.filename, droppedRom.platform, droppedRom.data);
        romStorage.clear(droppedId);
      }
    }

    const cleanTitle =
      incoming.title && !/\.(nes|sfc|smc|gba|gb|gbc|md|gen|smd|zip)$/i.test(incoming.title)
        ? incoming.title
        : existing.title || incoming.title;

    const mergedPlatform = existing.platform || incoming.platform;
    const hasCustomArt =
      (incoming.boxArt && !incoming.boxArt.includes('unsplash') && !isSvgBoxArt(incoming.boxArt)) ||
      (existing.boxArt && !existing.boxArt.includes('unsplash') && !isSvgBoxArt(existing.boxArt));

    const resolvedBoxArt = hasCustomArt
      ? (!isSvgBoxArt(incoming.boxArt) && !incoming.boxArt?.includes('unsplash')
          ? incoming.boxArt
          : existing.boxArt)
      : getCartridgeCoverArt(cleanTitle, mergedPlatform);

    const hasDrive = Boolean(existing.driveFileId || incoming.driveFileId || existing.source === 'drive' || incoming.source === 'drive');
    const hasLocal = Boolean(
      existingHasLocal ||
      incomingHasLocal ||
      existing.source === 'local' ||
      incoming.source === 'local' ||
      existing.crc32 ||
      incoming.crc32
    );

    const merged: Game = {
      ...existing,
      ...incoming,
      id: canonicalId,
      title: cleanTitle,
      platform: mergedPlatform,
      boxArt: resolvedBoxArt,
      romFilename: incoming.romFilename || existing.romFilename,
      crc32: incoming.crc32 || existing.crc32,
      md5: incoming.md5 || existing.md5,
      sramSize: incoming.sramSize ?? existing.sramSize,
      batterySave: incoming.batterySave ?? existing.batterySave,
      driveFileId: incoming.driveFileId || existing.driveFileId,
      driveFolderId: incoming.driveFolderId || existing.driveFolderId,
      driveSubfolderName: incoming.driveSubfolderName || existing.driveSubfolderName,
      uploadedAt: incoming.uploadedAt || existing.uploadedAt,
      source: hasLocal ? 'local' : hasDrive ? 'drive' : existing.source,
      developer:
        hasLocal && hasDrive
          ? 'Máy tính & Google Drive'
          : existing.developer || incoming.developer,
    };

    return merged;
  }

  private deduplicateList(list: Game[]): Game[] {
    const result: Game[] = [];
    for (const item of list) {
      const normalizedItem: Game = {
        ...item,
        boxArt:
          !item.boxArt || item.boxArt.includes('unsplash') || isSvgBoxArt(item.boxArt)
            ? getCartridgeCoverArt(item.title, item.platform)
            : item.boxArt,
      };
      const dupIdx = result.findIndex((existing) => this.isDuplicateRecord(existing, normalizedItem));
      if (dupIdx >= 0) {
        result[dupIdx] = this.mergeDuplicateRecords(result[dupIdx], normalizedItem);
      } else {
        result.push(normalizedItem);
      }
    }
    return result;
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly keep ONLY user-uploaded ROMs or Google Drive scanned ROMs.
          // Discard any sample/mock games (Zelda, Mario, Metroid, Castlevania, Megaman, Kirby, Earthbound, Chrono, etc.)
          const sampleKeywords = [
            'alttp', 'zelda', 'smw', 'super-mario', 'metroid', 'castlevania',
            'megaman', 'smk', 'pokemon', 'chrono', 'smb3', 'kirby', 'earthbound',
            'fire-emblem'
          ];

          const sanitized = parsed.filter((g: any) => {
            if (!g || !g.id) return false;
            const idLower = String(g.id).toLowerCase();
            const titleLower = String(g.title || '').toLowerCase();

            // If it matches any sample game ID pattern, drop it
            const isSample = sampleKeywords.some(
              (kw) => idLower === kw || idLower.startsWith(`${kw}-`) || (titleLower.includes('legend of zelda') && !g.source)
            );
            if (isSample) return false;

            // Strictly filter out any Java / J2ME / .jar leftover items
            if (
              g.platform === 'JAVA' ||
              idLower.startsWith('java-') ||
              titleLower.includes('j2me') ||
              titleLower.includes('bounce tales') ||
              titleLower.includes('diamond rush') ||
              titleLower.includes('space impact') ||
              (g.romFilename && (g.romFilename.endsWith('.jar') || g.romFilename.endsWith('.jad')))
            ) {
              return false;
            }

            // Must be user custom uploaded or drive scanned
            return (
              g.source === 'local' ||
              g.source === 'drive' ||
              idLower.startsWith('custom-') ||
              idLower.startsWith('drive-')
            );
          });

          this.games = this.deduplicateList(sanitized);
          // Persist the sanitized and deduplicated library list
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.games));
        } else {
          this.games = [];
        }
      } else {
        this.games = [];
      }
    } catch {
      this.games = [];
    }
  }

  private saveToStorage(): void {
    this.updateSnapshot();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.games));
    } catch (e) {
      console.error('Failed to save library to storage', e);
    }
    this.notify();
  }

  public getGames(): Game[] {
    return this.snapshot;
  }

  public getGameById(id: string): Game | undefined {
    return this.games.find((g) => g.id === id);
  }

  public findDuplicate(candidate: Partial<Game>): Game | undefined {
    return this.games.find((g) => this.isDuplicateRecord(g, candidate));
  }

  private upsertInternal(game: Game, prependIfNew: boolean): Game {
    const prepared: Game = {
      ...game,
      boxArt:
        !game.boxArt || game.boxArt.includes('unsplash') || isSvgBoxArt(game.boxArt)
          ? getCartridgeCoverArt(game.title, game.platform)
          : game.boxArt,
    };

    const existingIdx = this.games.findIndex((g) => this.isDuplicateRecord(g, prepared));
    if (existingIdx >= 0) {
      const merged = this.mergeDuplicateRecords(this.games[existingIdx], prepared);
      this.games[existingIdx] = merged;
      // Remove any extra stray duplicates if present
      this.games = this.games.filter(
        (g, i) => i === existingIdx || !this.isDuplicateRecord(g, merged)
      );
      return merged;
    }

    if (prependIfNew) {
      this.games.unshift(prepared);
    } else {
      this.games.push(prepared);
    }
    return prepared;
  }

  public addGame(game: Game): Game {
    const saved = this.upsertInternal(game, true);
    this.saveToStorage();
    return saved;
  }

  public addGames(newGames: Game[]): Game[] {
    const savedList = newGames.map((game) => this.upsertInternal(game, false));
    this.saveToStorage();
    return savedList;
  }

  public removeGame(id: string): void {
    this.games = this.games.filter((g) => g.id !== id);
    this.saveToStorage();
  }

  public clearAll(): void {
    this.games = [];
    this.saveToStorage();
  }

  public subscribe(callback: (games: Game[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(): void {
    const snapshot = this.getGames();
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('Error in libraryStore listener', err);
      }
    });
  }
}

export const libraryStore = new LibraryStore();

// React hook for auto-updating components when games are added/removed
export function useLibraryStore(): Game[] {
  const [games, setGames] = useState<Game[]>(() => libraryStore.getGames());

  useEffect(() => {
    return libraryStore.subscribe((updated) => {
      setGames(updated);
    });
  }, []);

  return games;
}
