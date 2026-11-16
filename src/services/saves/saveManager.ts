import { SaveMetadata, SaveConflict, Platform } from '../../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';

const DB_NAME = 'retroverse_saves_db';
const STORE_NAME = 'saves_store';

function openLocalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clean production storage: No fake test saves pre-seeded
const INITIAL_MOCK_SAVES: SaveMetadata[] = [];

export const INITIAL_CONFLICT: SaveConflict | null = null;

export class SaveManager {
  private localSaves: Map<string, SaveMetadata> = new Map();
  private conflict: SaveConflict | null = null;

  constructor() {
    this.initIndexedDb();
  }

  private async initIndexedDb(): Promise<void> {
    try {
      const db = await openLocalDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          req.result.forEach((item: SaveMetadata) => {
            // Purge old mock test data with 'local-alex' or mock ids
            if (item.ownerUid === 'local-alex' || item.id?.includes('slot1-local') || item.id?.includes('conflict')) {
              store.delete(item.id);
            } else {
              this.localSaves.set(item.id, item);
            }
          });
        }
      };
    } catch {
      // Fallback in memory
    }
  }

  public getConflict(): SaveConflict | null {
    return this.conflict;
  }

  public resolveConflict(choice: 'keep_local' | 'restore_cloud' | 'fork_slot'): void {
    if (!this.conflict) return;

    if (choice === 'keep_local') {
      this.localSaves.set(this.conflict.localSave.id, {
        ...this.conflict.localSave,
        updatedAt: new Date().toISOString()
      });
      this.conflict = null;
    } else if (choice === 'restore_cloud') {
      this.localSaves.set(this.conflict.localSave.id, {
        ...this.conflict.cloudSave,
        id: this.conflict.localSave.id,
        updatedAt: new Date().toISOString()
      });
      this.conflict = null;
    } else if (choice === 'fork_slot') {
      const forkedSave: SaveMetadata = {
        ...this.conflict.cloudSave,
        id: `zelda-slot4-forked`,
        slot: 4,
        locationName: `${this.conflict.cloudSave.locationName} (Forked)`,
        updatedAt: new Date().toISOString()
      };
      this.localSaves.set(forkedSave.id, forkedSave);
      this.conflict = null;
    }
  }

  public getAllSaves(): SaveMetadata[] {
    return Array.from(this.localSaves.values());
  }

  public getSavesForGame(gameId: string): SaveMetadata[] {
    return this.getAllSaves().filter(s => s.gameId === gameId);
  }

  public async saveLocal(save: SaveMetadata): Promise<void> {
    this.localSaves.set(save.id, save);
    try {
      const db = await openLocalDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(save);
    } catch (e) {
      console.warn("IndexedDB write fallback", e);
    }

    // Sync to Firestore if authenticated
    if (auth.currentUser) {
      try {
        const path = `users/${auth.currentUser.uid}/saves/${save.id}`;
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'saves', save.id), {
          ...save,
          ownerUid: auth.currentUser.uid,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}/saves/${save.id}`);
      }
    }
  }

  public async deleteSave(id: string): Promise<void> {
    this.localSaves.delete(id);
    try {
      const db = await openLocalDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
    } catch {
      // Ignore
    }

    if (auth.currentUser) {
      try {
        const path = `users/${auth.currentUser.uid}/saves/${id}`;
        await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'saves', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${auth.currentUser.uid}/saves/${id}`);
      }
    }
  }

  public hasSram(gameId: string): boolean {
    return Array.from(this.localSaves.values()).some(
      (s) => s.gameId === gameId && (s.type === 'sram' || s.type === 'battery') && !!s.rawBase64Data
    );
  }

  public getSramBytes(gameId: string): Uint8Array | null {
    const save = Array.from(this.localSaves.values()).find(
      (s) => s.gameId === gameId && (s.type === 'sram' || s.type === 'battery')
    );
    if (save && save.rawBase64Data) {
      try {
        const binaryString = atob(save.rawBase64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch {
        return null;
      }
    }
    return null;
  }

  public async importSram(
    gameId: string,
    gameTitle: string,
    platform: Platform | string,
    bytes: Uint8Array
  ): Promise<void> {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    await this.saveLocal({
      id: `${gameId}-sram-battery`,
      ownerUid: auth.currentUser?.uid || 'local-user',
      gameId,
      gameTitle,
      platform: platform as Platform,
      slot: 0,
      type: 'sram',
      locationName: `Bộ nhớ Pin SRAM (${(bytes.byteLength / 1024).toFixed(1)} KB)`,
      sizeBytes: bytes.byteLength,
      checksum: 'sram-sync',
      rawBase64Data: base64,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public exportSram(gameId: string): Uint8Array {
    const bytes = this.getSramBytes(gameId);
    if (bytes && bytes.byteLength > 0 && typeof document !== 'undefined') {
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${gameId}.sav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    return bytes || new Uint8Array(0);
  }

  public exportSave(save: SaveMetadata): void {
    if (typeof document === 'undefined') return;
    let blob: Blob;
    if (save.rawBase64Data) {
      try {
        const binStr = atob(save.rawBase64Data);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
      } catch {
        blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
      }
    } else {
      blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.gameTitle || save.gameId}_slot${save.slot}.state`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public cleanOrphanStates(): number {
    let purgedCount = 0;
    for (const [id, save] of this.localSaves.entries()) {
      if (save.type === 'autosave' || (save.type === 'state' && save.slot > 3)) {
        this.localSaves.delete(id);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  public async clearAllData(): Promise<void> {
    this.localSaves.clear();
    this.conflict = null;
    try {
      const db = await openLocalDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch {
      // Ignore
    }
  }
}

export const saveManager = new SaveManager();
