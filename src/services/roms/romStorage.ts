export interface StoredRom {
  gameId: string;
  filename: string;
  platform: 'NES' | 'SNES' | 'GBA' | string;
  data: Uint8Array;
  size: number;
  uploadedAt: string;
}

class RomStorageService {
  private inMemoryRoms = new Map<string, StoredRom>();

  public saveRom(gameId: string, filename: string, platform: string, data: Uint8Array): void {
    this.inMemoryRoms.set(gameId, {
      gameId,
      filename,
      platform,
      data,
      size: data.byteLength,
      uploadedAt: new Date().toISOString()
    });
  }

  public getRom(gameId: string): StoredRom | undefined {
    return this.inMemoryRoms.get(gameId);
  }

  public hasRom(gameId: string): boolean {
    return this.inMemoryRoms.has(gameId);
  }

  public clear(gameId?: string): void {
    if (gameId) {
      this.inMemoryRoms.delete(gameId);
    } else {
      this.inMemoryRoms.clear();
    }
  }
}

export const romStorage = new RomStorageService();
