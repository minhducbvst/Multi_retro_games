import React, { useState, useEffect } from 'react';
import {
  DriveItem,
  DriveFolderBreadcrumb,
  listDriveItems,
  searchDriveRoms,
  downloadDriveFile,
  extractDriveFolderIdFromUrl,
} from '../services/googleDriveService';
import { auth, loginWithGoogle, logoutUser, getCachedAccessToken } from '../services/firebase';

interface GoogleDriveRomPickerProps {
  onRomSelected: (romBytes: Uint8Array, filename: string) => void;
  onBatchRomsLoaded?: (roms: Array<{ bytes: Uint8Array; filename: string }>) => void;
}

export const GoogleDriveRomPicker: React.FC<GoogleDriveRomPickerProps> = ({
  onRomSelected,
  onBatchRomsLoaded,
}) => {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [hasToken, setHasToken] = useState<boolean>(!!getCachedAccessToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<DriveFolderBreadcrumb[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Folder URL input jump
  const [folderUrlInput, setFolderUrlInput] = useState('');

  // Downloading / Processing state
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadProgressText, setDownloadProgressText] = useState<string | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);

  // Sync auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setHasToken(!!getCachedAccessToken());
    });
    return () => unsubscribe();
  }, []);

  // Fetch items when currentFolderId changes (if authenticated)
  useEffect(() => {
    if (hasToken) {
      loadFolder(currentFolderId);
    }
  }, [currentFolderId, hasToken]);

  const loadFolder = async (folderId: string) => {
    setIsLoadingItems(true);
    setAuthError(null);
    try {
      const result = await listDriveItems(folderId);
      setItems(result.items);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to list items from Google Drive');
      if (err.message?.includes('token') || err.message?.includes('unauthorized') || err.message?.includes('401')) {
        setHasToken(false);
      }
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const { user, accessToken } = await loginWithGoogle();
      setCurrentUser(user);
      if (accessToken) {
        setHasToken(true);
      } else {
        setAuthError('Authentication succeeded but Drive access token was not returned.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUser();
      setHasToken(false);
      setItems([]);
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
      setCurrentFolderId('root');
    } catch (err: any) {
      setAuthError(err.message || 'Error signing out');
    }
  };

  const handleOpenFolder = (folder: DriveItem) => {
    setSearchQuery('');
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
  };

  const handleNavigateBreadcrumb = (targetIndex: number) => {
    const target = breadcrumbs[targetIndex];
    setBreadcrumbs((prev) => prev.slice(0, targetIndex + 1));
    setCurrentFolderId(target.id);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadFolder(currentFolderId);
      return;
    }

    setIsSearching(true);
    setIsLoadingItems(true);
    setAuthError(null);
    try {
      const searchResults = await searchDriveRoms(searchQuery);
      setItems(searchResults);
    } catch (err: any) {
      setAuthError(err.message || 'Drive search query failed');
    } finally {
      setIsLoadingItems(false);
      setIsSearching(false);
    }
  };

  const handleJumpToFolderUrl = () => {
    if (!folderUrlInput.trim()) return;
    const folderId = extractDriveFolderIdFromUrl(folderUrlInput);
    if (!folderId) {
      setAuthError('Could not parse Google Drive Folder ID from input. Please provide a valid URL or Folder ID.');
      return;
    }
    setBreadcrumbs([
      { id: 'root', name: 'My Drive' },
      { id: folderId, name: `Folder (${folderId.slice(0, 8)}...)` },
    ]);
    setCurrentFolderId(folderId);
    setFolderUrlInput('');
  };

  const handleDownloadAndImportRom = async (item: DriveItem) => {
    setDownloadingFileId(item.id);
    setDownloadProgressText(`Downloading ${item.name} from Google Drive...`);
    setAuthError(null);
    try {
      const buffer = await downloadDriveFile(item.id);
      const bytes = new Uint8Array(buffer);
      setDownloadProgressText(`Downloaded successfully! Initializing parser...`);
      setTimeout(() => {
        setDownloadingFileId(null);
        setDownloadProgressText(null);
        onRomSelected(bytes, item.name);
      }, 400);
    } catch (err: any) {
      setAuthError(`Failed to download ${item.name}: ${err.message}`);
      setDownloadingFileId(null);
      setDownloadProgressText(null);
    }
  };

  const handleImportAllRomsInFolder = async () => {
    const romItems = items.filter((i) => i.isRom);
    if (romItems.length === 0) return;

    setBatchImporting(true);
    setDownloadProgressText(`Starting batch import of ${romItems.length} ROMs...`);
    setAuthError(null);

    const loadedRoms: Array<{ bytes: Uint8Array; filename: string }> = [];

    try {
      for (let i = 0; i < romItems.length; i++) {
        const item = romItems[i];
        setDownloadProgressText(`Downloading [${i + 1}/${romItems.length}] ${item.name}...`);
        const buffer = await downloadDriveFile(item.id);
        loadedRoms.push({
          bytes: new Uint8Array(buffer),
          filename: item.name,
        });
      }

      setDownloadProgressText(`Successfully fetched ${loadedRoms.length} ROMs!`);
      if (onBatchRomsLoaded && loadedRoms.length > 0) {
        onBatchRomsLoaded(loadedRoms);
      } else if (loadedRoms.length > 0) {
        onRomSelected(loadedRoms[0].bytes, loadedRoms[0].filename);
      }
    } catch (err: any) {
      setAuthError(`Batch download error: ${err.message}`);
    } finally {
      setBatchImporting(false);
      setDownloadProgressText(null);
    }
  };

  const romCountInFolder = items.filter((i) => i.isRom).length;

  // Not signed in / no OAuth token UI
  if (!hasToken) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#191b22] border border-[#494454]/30 rounded-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6] shadow-xl">
          <span className="material-symbols-outlined text-4xl">cloud_sync</span>
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="font-headline font-bold text-white text-lg">
            Connect to Google Drive
          </h3>
          <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
            Link your Google account to directly browse personal game folders and ROM archives (.nes, .smc, .sfc, .gba) stored in your Google Drive cloud storage.
          </p>
        </div>

        {authError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono max-w-md text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5">error</span>
            <span>{authError}</span>
          </div>
        )}

        {/* Official Sign In with Google button style specified by workspace skill */}
        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white hover:bg-neutral-100 text-[#1f1f1f] font-sans font-medium text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
          </svg>
          <span>{isAuthenticating ? 'Connecting to Drive...' : 'Sign in with Google'}</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] font-mono text-[#958ea0]">
          <span className="material-symbols-outlined text-sm text-emerald-400">verified_user</span>
          <span>Read-only access (drive.readonly). Your files are never uploaded or shared.</span>
        </div>
      </div>
    );
  }

  // Authenticated Drive Browser UI
  return (
    <div className="flex flex-col bg-[#191b22] border border-[#494454]/30 rounded-2xl overflow-hidden font-sans">
      {/* Top Bar: Connected Account & Sign Out */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-[#111319] border-b border-[#494454]/20 gap-3">
        <div className="flex items-center gap-3">
          {currentUser?.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt={currentUser.displayName || 'Google User'}
              className="w-8 h-8 rounded-full border border-[#4cd7f6]/40"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center font-bold text-xs">
              G
            </div>
          )}
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>{currentUser?.displayName || 'Google Drive Connected'}</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                Active
              </span>
            </div>
            <div className="text-[11px] font-mono text-[#958ea0] truncate max-w-[260px]">
              {currentUser?.email}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadFolder(currentFolderId)}
            className="p-1.5 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-[#4cd7f6] border border-[#494454]/30 transition-colors"
            title="Refresh current folder"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
          <button
            onClick={handleSignOut}
            className="px-2.5 py-1 rounded-lg bg-[#282a30] hover:bg-red-500/20 text-[#cbc3d7] hover:text-red-400 border border-[#494454]/30 text-xs font-mono transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Action / Search & Jump Bar */}
      <div className="p-4 border-b border-[#494454]/20 bg-[#16171e] space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search Drive */}
          <form onSubmit={handleSearch} className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#958ea0]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ROMs or folders in Drive (e.g. .nes, .smc, Zelda)..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
            />
          </form>

          {/* Paste Drive Folder Link */}
          <div className="flex gap-2">
            <input
              type="text"
              value={folderUrlInput}
              onChange={(e) => setFolderUrlInput(e.target.value)}
              placeholder="Paste Drive Folder link or ID..."
              className="w-48 sm:w-56 px-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
            />
            <button
              onClick={handleJumpToFolderUrl}
              className="px-3 py-2 bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#494454]/30 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap"
            >
              Open Folder
            </button>
          </div>
        </div>

        {/* Breadcrumb Trail */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono py-1">
          <span className="material-symbols-outlined text-sm text-[#4cd7f6]">folder_open</span>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              {idx > 0 && <span className="text-[#494454]">/</span>}
              <button
                onClick={() => handleNavigateBreadcrumb(idx)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'bg-[#33343b] text-white font-bold'
                    : 'text-[#cbc3d7] hover:text-[#4cd7f6] hover:bg-[#1e1f26]'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}

          {/* Batch Import Button */}
          {romCountInFolder > 0 && (
            <button
              onClick={handleImportAllRomsInFolder}
              disabled={batchImporting || !!downloadingFileId}
              className="ml-auto px-3 py-1 rounded bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">download_for_offline</span>
              <span>Import All in Folder ({romCountInFolder})</span>
            </button>
          )}
        </div>
      </div>

      {/* Status & Alerts */}
      {downloadProgressText && (
        <div className="p-3 bg-[#4cd7f6]/10 border-b border-[#4cd7f6]/30 text-[#4cd7f6] text-xs font-mono flex items-center gap-2">
          <span className="material-symbols-outlined text-base animate-spin">sync</span>
          <span>{downloadProgressText}</span>
        </div>
      )}

      {authError && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs font-mono flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span>
          <span>{authError}</span>
        </div>
      )}

      {/* Items List View */}
      <div className="min-h-[260px] max-h-[380px] overflow-y-auto divide-y divide-[#494454]/20">
        {isLoadingItems ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-[#958ea0] font-mono text-xs">
            <span className="material-symbols-outlined text-3xl text-[#4cd7f6] animate-spin">refresh</span>
            <span>Fetching contents from Google Drive...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-[#958ea0] font-mono text-xs">
            <span className="material-symbols-outlined text-3xl text-[#494454]">folder_off</span>
            <span>No files or folders found. Try searching or navigating to a ROM directory.</span>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                item.isFolder
                  ? 'hover:bg-[#1f2129] cursor-pointer'
                  : 'hover:bg-[#1e1f26]'
              }`}
              onClick={() => {
                if (item.isFolder) handleOpenFolder(item);
              }}
            >
              {/* Item Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    item.isFolder
                      ? 'bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/30'
                      : item.isRom
                      ? 'bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30'
                      : 'bg-[#494454]/20 text-[#958ea0]'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {item.isFolder ? 'folder' : item.isRom ? 'sports_esports' : 'draft'}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-2">
                    <span className="truncate">{item.name}</span>
                    {item.romPlatform && item.romPlatform !== 'UNKNOWN' && (
                      <span className="px-1.5 py-0.2 rounded bg-[#4cd7f6]/20 text-[#4cd7f6] text-[10px] font-mono shrink-0">
                        {item.romPlatform}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-[#958ea0] flex items-center gap-2 mt-0.5">
                    {item.size && (
                      <span>{(Number(item.size) / (1024 * 1024)).toFixed(2)} MB</span>
                    )}
                    {item.modifiedTime && (
                      <span>• {new Date(item.modifiedTime).toLocaleDateString()}</span>
                    )}
                    {item.isFolder && <span>• Folder</span>}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="shrink-0">
                {item.isFolder ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFolder(item);
                    }}
                    className="p-1.5 text-[#958ea0] hover:text-white rounded-lg hover:bg-[#282a30] transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                ) : item.isRom ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadAndImportRom(item);
                    }}
                    disabled={downloadingFileId === item.id || batchImporting}
                    className="px-3 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                  >
                    {downloadingFileId === item.id ? (
                      <>
                        <span className="material-symbols-outlined text-xs animate-spin">refresh</span>
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-xs">play_arrow</span>
                        <span>Import &amp; Play</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadAndImportRom(item);
                    }}
                    disabled={downloadingFileId === item.id || batchImporting}
                    className="px-2.5 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] font-mono text-xs transition-colors"
                  >
                    Try Import
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#111319] border-t border-[#494454]/20 flex items-center justify-between text-[11px] font-mono text-[#958ea0]">
        <span>Showing {items.length} items in current directory</span>
        <span className="text-[#4cd7f6]">{romCountInFolder} playable ROMs detected</span>
      </div>
    </div>
  );
};
