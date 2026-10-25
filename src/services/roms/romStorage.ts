export interface StoredRom {
  gameId: string;
  filename: string;
  platform: 'NES' | 'SNES' | 'GBA' | string;
  data: Uint8Array;
  size: number;
  uploadedAt: string;
}

const DB_NAME = 'retroverse_rom_vault_v1';
const STORE_NAME = 'rom_cartridges';
const DB_VERSION = 1;

class RomStorageService {
  private inMemoryRoms = new Map<string, StoredRom>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'gameId' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => {
            console.warn('Could not open IndexedDB for ROM storage:', req.error);
            resolve(null);
          };
        } catch (e) {
          console.warn('IndexedDB exception:', e);
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const db = await this.getDb();
      if (!db) {
        this.isInitialized = true;
        return;
      }

      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => {
            if (Array.isArray(req.result)) {
              req.result.forEach((item: StoredRom) => {
                if (item && item.gameId && item.data) {
                  // Ensure data is Uint8Array
                  const bytes = item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data);
                  this.inMemoryRoms.set(item.gameId, {
                    ...item,
                    data: bytes,
                  });
                }
              });
            }
            resolve();
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch (e) {
      console.warn('Error loading ROMs from IndexedDB:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  public saveRom(gameId: string, filename: string, platform: string, data: Uint8Array): void {
    const item: StoredRom = {
      gameId,
      filename,
      platform,
      data,
      size: data.byteLength,
      uploadedAt: new Date().toISOString(),
    };

    // 1. Immediately cache in memory for synchronous instant retrieval
    this.inMemoryRoms.set(gameId, item);

    // 2. Persist asynchronously in IndexedDB
    this.getDb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(item);
      } catch (err) {
        console.warn('Could not persist ROM to IndexedDB:', err);
      }
    });
  }

  public getRom(gameId: string): StoredRom | undefined {
    return this.inMemoryRoms.get(gameId);
  }

  public async getRomAsync(gameId: string): Promise<StoredRom | undefined> {
    // Check in-memory cache first
    const cached = this.inMemoryRoms.get(gameId);
    if (cached) return cached;

    // Check IndexedDB
    try {
      const db = await this.getDb();
      if (!db) return undefined;

      return await new Promise<StoredRom | undefined>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(gameId);
          req.onsuccess = () => {
            const res = req.result as StoredRom | undefined;
            if (res && res.data) {
              const bytes = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data);
              const loaded: StoredRom = { ...res, data: bytes };
              this.inMemoryRoms.set(gameId, loaded);
              resolve(loaded);
            } else {
              resolve(undefined);
            }
          };
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
    } catch {
      return undefined;
    }
  }

  public hasRom(gameId: string): boolean {
    return this.inMemoryRoms.has(gameId);
  }

  public clear(gameId?: string): void {
    if (gameId) {
      this.inMemoryRoms.delete(gameId);
      this.getDb().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(gameId);
        } catch {}
      });
    } else {
      this.inMemoryRoms.clear();
      this.getDb().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
        } catch {}
      });
    }
  }
}

export const romStorage = new RomStorageService();
