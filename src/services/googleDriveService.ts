/**
 * Google Drive API v3 Integration Service
 * Facilitates browsing folders, searching for ROM backups, and downloading binary cartridge dumps directly to the client sandbox.
 */

import { getCachedAccessToken } from './firebase';

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
  romPlatform?: 'NES' | 'SNES' | 'GBA' | 'UNKNOWN';
}

export interface DriveFolderBreadcrumb {
  id: string;
  name: string;
}

const ROM_EXTENSIONS = ['.nes', '.smc', '.sfc', '.gba', '.bin', '.zip', '.7z'];

export function detectPlatformFromFilename(filename: string): 'NES' | 'SNES' | 'GBA' | 'UNKNOWN' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.nes')) return 'NES';
  if (lower.endsWith('.smc') || lower.endsWith('.sfc')) return 'SNES';
  if (lower.endsWith('.gba')) return 'GBA';
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
