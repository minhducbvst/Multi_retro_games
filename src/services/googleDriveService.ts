/**
 * Google Drive API v3 Integration Service
 * Facilitates linking a fixed Drive folder, organizing ROMs into platform subfolders (NES, SNES, GBA, etc.),
 * uploading/syncing library games to Drive, and downloading binary cartridge dumps directly to the client sandbox.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  getCachedAccessToken,
  handleFirestoreError,
  isFirestoreReachable,
  OperationType,
} from './firebase';
import { Game, Platform } from '../types';
import { romStorage } from './roms/romStorage';
import { libraryStore } from './games/libraryStore';

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
  isFolder: boolean;
  isRom: boolean;
  romPlatform?: 'NES' | 'SNES' | 'GBA' | 'GENESIS' | 'UNKNOWN';
}

export interface DriveFolderBreadcrumb {
  id: string;
  name: string;
}

export interface LinkedDriveFolder {
  id: string;
  name: string;
  linkedAt: string;
}

export interface SyncGamePlanItem {
  game: Game;
  subfolderName: string;
  subfolderId: string;
  filename: string;
  bytes: Uint8Array;
  existingDriveFile: DriveItem | null;
}

export interface SyncPlanResult {
  items: SyncGamePlanItem[];
  missingRomGames: Game[];
  createdSubfolders: string[];
}

export interface SyncToDriveResult {
  uploadedCount: number;
  overwrittenCount: number;
  skippedExistingCount: number;
  missingLocalRomCount: number;
  createdSubfolders: string[];
  details: Array<{
    gameId: string;
    gameTitle: string;
    subfolderName: string;
    filename: string;
    status: 'uploaded' | 'overwritten' | 'skipped' | 'missing-rom';
  }>;
}

const LINKED_FOLDER_STORAGE_KEY = 'retroverse_linked_drive_folder_v1';
const linkedFolderListeners = new Set<(folder: LinkedDriveFolder | null) => void>();

function getLinkedFolderStorageKey(): string {
  const uid = auth.currentUser?.uid;
  return uid ? `${LINKED_FOLDER_STORAGE_KEY}_${uid}` : LINKED_FOLDER_STORAGE_KEY;
}

function notifyLinkedFolderListeners(folder: LinkedDriveFolder | null): void {
  linkedFolderListeners.forEach((cb) => {
    try {
      cb(folder);
    } catch {}
  });
}

export function getLinkedDriveFolder(): LinkedDriveFolder | null {
  try {
    const raw =
      localStorage.getItem(getLinkedFolderStorageKey()) ||
      localStorage.getItem(LINKED_FOLDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkedDriveFolder;
    if (parsed && typeof parsed.id === 'string' && parsed.id.trim()) {
      return parsed;
    }
  } catch {}
  return null;
}

export async function saveLinkedDriveFolder(folder: LinkedDriveFolder): Promise<void> {
  try {
    const payload = JSON.stringify(folder);
    localStorage.setItem(getLinkedFolderStorageKey(), payload);
    localStorage.setItem(LINKED_FOLDER_STORAGE_KEY, payload);
  } catch {}
  notifyLinkedFolderListeners(folder);

  const user = auth.currentUser;
  if (user && !user.isAnonymous && user.emailVerified && isFirestoreReachable()) {
    const path = `users/${user.uid}`;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          displayName: (user.displayName || 'RetroPlayer').slice(0, 100),
          email: (user.email || '').slice(0, 254),
          linkedDriveFolderId: folder.id,
          linkedDriveFolderName: folder.name.slice(0, 200),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  }
}

export async function clearLinkedDriveFolder(): Promise<void> {
  try {
    localStorage.removeItem(getLinkedFolderStorageKey());
    localStorage.removeItem(LINKED_FOLDER_STORAGE_KEY);
  } catch {}
  notifyLinkedFolderListeners(null);

  const user = auth.currentUser;
  if (user && !user.isAnonymous && user.emailVerified && isFirestoreReachable()) {
    const path = `users/${user.uid}`;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          displayName: (user.displayName || 'RetroPlayer').slice(0, 100),
          email: (user.email || '').slice(0, 254),
          linkedDriveFolderId: '',
          linkedDriveFolderName: '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  }
}

export async function loadLinkedDriveFolderFromCloud(): Promise<LinkedDriveFolder | null> {
  const local = getLinkedDriveFolder();
  const user = auth.currentUser;
  if (!user || user.isAnonymous || !user.emailVerified || !isFirestoreReachable()) {
    return local;
  }

  const path = `users/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      if (typeof data.linkedDriveFolderId === 'string' && data.linkedDriveFolderId.trim()) {
        const synced: LinkedDriveFolder = {
          id: data.linkedDriveFolderId.trim(),
          name:
            typeof data.linkedDriveFolderName === 'string' && data.linkedDriveFolderName.trim()
              ? data.linkedDriveFolderName.trim()
              : 'Google Drive Folder',
          linkedAt:
            typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
        };
        try {
          const payload = JSON.stringify(synced);
          localStorage.setItem(getLinkedFolderStorageKey(), payload);
          localStorage.setItem(LINKED_FOLDER_STORAGE_KEY, payload);
        } catch {}
        notifyLinkedFolderListeners(synced);
        return synced;
      }
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }
  return local;
}

export function useLinkedDriveFolder(): LinkedDriveFolder | null {
  const [folder, setFolder] = useState<LinkedDriveFolder | null>(() => getLinkedDriveFolder());

  useEffect(() => {
    setFolder(getLinkedDriveFolder());
    linkedFolderListeners.add(setFolder);

    const unsubAuth = auth.onAuthStateChanged((usr) => {
      if (usr) {
        loadLinkedDriveFolderFromCloud().catch(() => {});
      } else {
        setFolder(getLinkedDriveFolder());
      }
    });

    if (auth.currentUser) {
      loadLinkedDriveFolderFromCloud().catch(() => {});
    }

    return () => {
      linkedFolderListeners.delete(setFolder);
      unsubAuth();
    };
  }, []);

  return folder;
}

const ROM_EXTENSIONS = ['.nes', '.smc', '.sfc', '.gba', '.bin', '.zip', '.7z', '.md', '.gen'];

export function detectPlatformFromFilename(filename: string): 'NES' | 'SNES' | 'GBA' | 'GENESIS' | 'UNKNOWN' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.nes')) return 'NES';
  if (lower.endsWith('.smc') || lower.endsWith('.sfc')) return 'SNES';
  if (lower.endsWith('.gba')) return 'GBA';
  if (lower.endsWith('.md') || lower.endsWith('.gen')) return 'GENESIS';
  return 'UNKNOWN';
}

export function isRomFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ROM_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Lists items inside a given Drive folder (or 'root')
 */
export async function listDriveItems(
  folderId = 'root',
  tokenOverride?: string
): Promise<{ items: DriveItem[]; nextPageToken?: string }> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  // Construct query: items in parent folder that are not trashed
  const query = `'${folderId}' in parents and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('orderBy', 'folder,name');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      throw new Error('Session expired or unauthorized. Please re-authenticate with Google Drive.');
    }
    throw new Error(`Drive API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawFiles: any[] = data.files || [];

  const items: DriveItem[] = rawFiles.map((f) => {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
    const isRom = !isFolder && isRomFilename(f.name);
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      isFolder,
      isRom,
      romPlatform: isRom ? detectPlatformFromFilename(f.name) : undefined,
    };
  });

  // Sort folders first, then ROMs, then other files
  items.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.isRom && !b.isRom) return -1;
    if (!a.isRom && b.isRom) return 1;
    return a.name.localeCompare(b.name);
  });

  return { items, nextPageToken: data.nextPageToken };
}

/**
 * Searches user's Google Drive for ROM files and game folders
 */
export async function searchDriveRoms(
  searchTerm?: string,
  tokenOverride?: string
): Promise<DriveItem[]> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  let q = `trashed = false and (mimeType = 'application/vnd.google-apps.folder' or name contains '.nes' or name contains '.smc' or name contains '.sfc' or name contains '.gba' or name contains '.zip')`;
  if (searchTerm && searchTerm.trim().length > 0) {
    const cleanSearch = searchTerm.trim().replace(/['\\]/g, '');
    q = `trashed = false and name contains '${cleanSearch}'`;
  }

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)');
  url.searchParams.set('pageSize', '60');
  url.searchParams.set('orderBy', 'folder,modifiedTime desc');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawFiles: any[] = data.files || [];

  return rawFiles.map((f) => {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
    const isRom = !isFolder && isRomFilename(f.name);
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      isFolder,
      isRom,
      romPlatform: isRom ? detectPlatformFromFilename(f.name) : undefined,
    };
  });
}

/**
 * Downloads a file from Google Drive as an ArrayBuffer
 */
export async function downloadDriveFile(
  fileId: string,
  tokenOverride?: string
): Promise<ArrayBuffer> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to download file from Google Drive (${res.status}): ${errText}`);
  }

  return await res.arrayBuffer();
}

/**
 * Extract folder ID if user pasted a full Google Drive URL
 * e.g. https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
 */
export function extractDriveFolderIdFromUrl(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // If user pasted a clean ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  const folderMatch = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  const idMatch = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return null;
}

/**
 * Clean a ROM filename into a human-friendly title
 * e.g. "Super Mario World (USA) [!].smc" -> "Super Mario World"
 */
export function cleanRomTitle(filename: string): string {
  return filename
    .replace(/\.(nes|smc|sfc|gba|bin|zip|7z)$/i, '')
    .replace(/[\[\(].*?[\]\)]/g, '')
    .replace(/_/g, ' ')
    .trim() || filename;
}

/**
 * High-speed scan across user's Google Drive to locate all compatible retro ROM cartridges
 */
export async function scanAllDriveRoms(tokenOverride?: string): Promise<DriveItem[]> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  // Find all retro ROM files across the entire drive
  const q = `trashed = false and (name contains '.nes' or name contains '.smc' or name contains '.sfc' or name contains '.gba' or name contains '.bin')`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('orderBy', 'name');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive scan failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawFiles: any[] = data.files || [];

  return rawFiles
    .filter((f) => isRomFilename(f.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      isFolder: false,
      isRom: true,
      romPlatform: detectPlatformFromFilename(f.name),
    }));
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function handleDriveHttpFailure(status: number, errText: string, actionLabel: string): never {
  if (status === 401 || status === 403) {
    if (
      errText.includes('insufficient') ||
      errText.includes('Insufficient') ||
      errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      status === 401
    ) {
      throw new Error(
        `DRIVE_REAUTH_REQUIRED: Tài khoản Google chưa được cấp quyền ghi/tạo thư mục trên Google Drive hoặc phiên đã hết hạn. Vui lòng bấm đăng nhập lại Google Drive.`
      );
    }
  }
  throw new Error(`${actionLabel} (${status}): ${errText}`);
}

/**
 * Fetches metadata for a specific Google Drive folder ID (to verify existence and read its real name)
 */
export async function getDriveFolderMetadata(
  folderId: string,
  tokenOverride?: string
): Promise<DriveItem> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  if (folderId === 'root') {
    return {
      id: 'root',
      name: 'My Drive',
      mimeType: 'application/vnd.google-apps.folder',
      isFolder: true,
      isRom: false,
    };
  }

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,modifiedTime,webViewLink,trashed`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    handleDriveHttpFailure(res.status, errText, 'Không thể đọc thông tin thư mục Google Drive');
  }

  const f = await res.json();
  if (f.trashed) {
    throw new Error('Thư mục Google Drive này đã nằm trong thùng rác.');
  }
  if (f.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('ID hoặc đường dẫn vừa nhập không phải là một thư mục Google Drive.');
  }

  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    isFolder: true,
    isRom: false,
  };
}

/**
 * Creates a new folder on Google Drive inside parentFolderId
 */
export async function createDriveFolder(
  folderName: string,
  parentFolderId = 'root',
  tokenOverride?: string
): Promise<DriveItem> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const cleanName = folderName.trim().slice(0, 120);
  if (!cleanName) {
    throw new Error('Tên thư mục không được để trống.');
  }

  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: cleanName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    handleDriveHttpFailure(res.status, errText, 'Không thể tạo thư mục trên Google Drive');
  }

  const f = await res.json();
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    isFolder: true,
    isRom: false,
  };
}

/**
 * Maps a Game's platform/category into a clean subfolder name (NES, SNES, GBA, GENESIS, etc.)
 */
export function getPlatformSubfolderName(game: Pick<Game, 'platform'>): string {
  const raw = String(game.platform || 'NES').trim().toUpperCase();
  if (raw === 'NES' || raw === 'SNES' || raw === 'GBA' || raw === 'GENESIS' || raw === 'GB' || raw === 'GBC') {
    return raw;
  }
  return raw.replace(/[\\/:*?"<>|]/g, '_') || 'NES';
}

export function getDefaultExtensionForPlatform(platform: Platform | string): string {
  const p = String(platform || 'NES').toUpperCase();
  if (p === 'SNES') return '.smc';
  if (p === 'GBA') return '.gba';
  if (p === 'GENESIS') return '.md';
  if (p === 'GB') return '.gb';
  if (p === 'GBC') return '.gbc';
  return '.nes';
}

export function buildRomFilenameForGame(game: Game): string {
  if (game.romFilename && game.romFilename.trim()) {
    return game.romFilename.trim().replace(/[\\/:*?"<>|]/g, '_');
  }
  const safeTitle = (game.title || game.id).replace(/[\\/:*?"<>|]/g, '_').trim() || 'retro_game';
  return `${safeTitle}${getDefaultExtensionForPlatform(game.platform)}`;
}

/**
 * Finds an existing platform subfolder inside the linked parent folder, or creates it automatically if missing
 */
export async function ensurePlatformSubfolder(
  parentFolderId: string,
  platformFolderName: string,
  tokenOverride?: string
): Promise<{ id: string; name: string; created: boolean }> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const escapedName = escapeDriveQueryValue(platformFolderName);
  const query = `'${escapeDriveQueryValue(parentFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id, name, mimeType)');
  url.searchParams.set('pageSize', '5');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    handleDriveHttpFailure(res.status, errText, `Không thể kiểm tra thư mục con ${platformFolderName}`);
  }

  const data = await res.json();
  const files: any[] = data.files || [];
  if (files.length > 0) {
    return {
      id: files[0].id,
      name: files[0].name,
      created: false,
    };
  }

  const created = await createDriveFolder(platformFolderName, parentFolderId, token);
  return {
    id: created.id,
    name: created.name,
    created: true,
  };
}

/**
 * Checks whether a ROM file with the given filename already exists inside a Drive folder
 */
export async function findDriveFileInFolder(
  folderId: string,
  filename: string,
  tokenOverride?: string
): Promise<DriveItem | null> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const escapedFilename = escapeDriveQueryValue(filename);
  const query = `'${escapeDriveQueryValue(folderId)}' in parents and name = '${escapedFilename}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id, name, mimeType, size, modifiedTime, webViewLink)');
  url.searchParams.set('pageSize', '5');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    handleDriveHttpFailure(res.status, errText, `Không thể kiểm tra tệp "${filename}" trên Drive`);
  }

  const data = await res.json();
  const f = (data.files || [])[0];
  if (!f) return null;

  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    isFolder: false,
    isRom: isRomFilename(f.name),
    romPlatform: detectPlatformFromFilename(f.name),
  };
}

/**
 * Uploads or updates a binary ROM file into the target Google Drive folder via multipart/related upload
 */
export async function uploadRomBinaryToDrive(params: {
  filename: string;
  bytes: Uint8Array;
  parentFolderId: string;
  existingFileId?: string;
  tokenOverride?: string;
}): Promise<DriveItem> {
  const token = params.tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const boundary = `retroverse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = params.existingFileId
    ? { name: params.filename }
    : { name: params.filename, parents: [params.parentFolderId] };

  const headerPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`;
  const footerPart = `\r\n--${boundary}--`;

  const bodyBlob = new Blob([
    headerPart,
    params.bytes as unknown as BlobPart,
    footerPart,
  ]);

  const endpoint = params.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(params.existingFileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`;

  const res = await fetch(endpoint, {
    method: params.existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: bodyBlob,
  });

  if (!res.ok) {
    const errText = await res.text();
    handleDriveHttpFailure(res.status, errText, `Tải lên "${params.filename}" thất bại`);
  }

  const f = await res.json();
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    isFolder: false,
    isRom: isRomFilename(f.name),
    romPlatform: detectPlatformFromFilename(f.name),
  };
}

/**
 * Step 1: Ensures platform subfolders (NES, SNES, GBA...) exist inside linkedFolder,
 * resolves ROM binaries from IndexedDB (or downloads from Drive if needed), and detects existing Drive files
 * so UI can request explicit user confirmation before overwriting any existing Drive file.
 */
export async function prepareDriveSyncPlan(
  games: Game[],
  linkedFolder: LinkedDriveFolder,
  onProgress?: (msg: string) => void,
  tokenOverride?: string
): Promise<SyncPlanResult> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  const subfolderCache = new Map<string, { id: string; name: string }>();
  const createdSubfolders: string[] = [];
  const items: SyncGamePlanItem[] = [];
  const missingRomGames: Game[] = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const subfolderName = getPlatformSubfolderName(game);
    const filename = buildRomFilenameForGame(game);

    onProgress?.(`[${i + 1}/${games.length}] Đang kiểm tra dữ liệu "${game.title}" (${subfolderName})...`);

    let stored = romStorage.getRom(game.id);
    if (!stored) {
      stored = await romStorage.getRomAsync(game.id);
    }

    let bytes = stored?.data;
    if ((!bytes || bytes.byteLength === 0) && game.driveFileId) {
      try {
        onProgress?.(`[${i + 1}/${games.length}] Đang tải tạm "${filename}" từ Drive để chuyển vào ${subfolderName}/...`);
        const buf = await downloadDriveFile(game.driveFileId, token);
        bytes = new Uint8Array(buf);
        romStorage.saveRom(game.id, filename, game.platform, bytes);
      } catch {
        bytes = undefined;
      }
    }

    if (!bytes || bytes.byteLength === 0) {
      missingRomGames.push(game);
      continue;
    }

    let subfolder = subfolderCache.get(subfolderName);
    if (!subfolder) {
      onProgress?.(`Đang kiểm tra / tạo thư mục con "${subfolderName}" trong "${linkedFolder.name}"...`);
      const ensured = await ensurePlatformSubfolder(linkedFolder.id, subfolderName, token);
      subfolder = { id: ensured.id, name: ensured.name };
      subfolderCache.set(subfolderName, subfolder);
      if (ensured.created) {
        createdSubfolders.push(ensured.name);
      }
    }

    const existingDriveFile = await findDriveFileInFolder(subfolder.id, filename, token);
    items.push({
      game,
      subfolderName: subfolder.name,
      subfolderId: subfolder.id,
      filename,
      bytes,
      existingDriveFile,
    });
  }

  return {
    items,
    missingRomGames,
    createdSubfolders,
  };
}

/**
 * Step 2: Executes uploads prepared by prepareDriveSyncPlan.
 * Only overwrites existing Drive files when overwriteExisting === true (after explicit user confirmation).
 */
export async function executeDriveSyncPlan(
  plan: SyncPlanResult,
  linkedFolder: LinkedDriveFolder,
  overwriteExisting: boolean,
  onProgress?: (msg: string) => void,
  tokenOverride?: string
): Promise<SyncToDriveResult> {
  const token = tokenOverride || getCachedAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is required. Please sign in with Google first.');
  }

  let uploadedCount = 0;
  let overwrittenCount = 0;
  let skippedExistingCount = 0;
  const details: SyncToDriveResult['details'] = [];

  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];

    if (item.existingDriveFile && !overwriteExisting) {
      skippedExistingCount++;
      libraryStore.addGame({
        ...item.game,
        driveFileId: item.existingDriveFile.id,
        driveFolderId: linkedFolder.id,
        driveSubfolderName: item.subfolderName,
      });
      details.push({
        gameId: item.game.id,
        gameTitle: item.game.title,
        subfolderName: item.subfolderName,
        filename: item.filename,
        status: 'skipped',
      });
      continue;
    }

    onProgress?.(
      `[${i + 1}/${plan.items.length}] Đang tải "${item.filename}" lên ${linkedFolder.name}/${item.subfolderName}/...`
    );

    const uploaded = await uploadRomBinaryToDrive({
      filename: item.filename,
      bytes: item.bytes,
      parentFolderId: item.subfolderId,
      existingFileId: item.existingDriveFile?.id,
      tokenOverride: token,
    });

    if (item.existingDriveFile) {
      overwrittenCount++;
    } else {
      uploadedCount++;
    }

    libraryStore.addGame({
      ...item.game,
      driveFileId: uploaded.id,
      driveFolderId: linkedFolder.id,
      driveSubfolderName: item.subfolderName,
      uploadedAt: uploaded.modifiedTime || new Date().toISOString(),
    });

    details.push({
      gameId: item.game.id,
      gameTitle: item.game.title,
      subfolderName: item.subfolderName,
      filename: item.filename,
      status: item.existingDriveFile ? 'overwritten' : 'uploaded',
    });
  }

  for (const missing of plan.missingRomGames) {
    details.push({
      gameId: missing.id,
      gameTitle: missing.title,
      subfolderName: getPlatformSubfolderName(missing),
      filename: buildRomFilenameForGame(missing),
      status: 'missing-rom',
    });
  }

  return {
    uploadedCount,
    overwrittenCount,
    skippedExistingCount,
    missingLocalRomCount: plan.missingRomGames.length,
    createdSubfolders: plan.createdSubfolders,
    details,
  };
}

