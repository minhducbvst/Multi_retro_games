import React, { useState, useEffect } from 'react';
import {
  DriveItem,
  DriveFolderBreadcrumb,
  listDriveItems,
  searchDriveRoms,
  downloadDriveFile,
  extractDriveFolderIdFromUrl,
  scanAllDriveRoms,
  cleanRomTitle,
} from '../services/googleDriveService';
import { auth, loginWithGoogle, logoutUser, getCachedAccessToken } from '../services/firebase';
import { libraryStore, getCartridgeCoverArt } from '../services/games/libraryStore';
import { Game } from '../types';

interface GoogleDriveRomPickerProps {
  onRomSelected: (romBytes: Uint8Array, filename: string) => void;
  onBatchRomsLoaded?: (roms: Array<{ bytes: Uint8Array; filename: string }>) => void;
  onDriveGamesSynced?: (count: number) => void;
}

export const GoogleDriveRomPicker: React.FC<GoogleDriveRomPickerProps> = ({
  onRomSelected,
  onBatchRomsLoaded,
  onDriveGamesSynced,
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
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

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

  // Convert a single DriveItem into a Game record
  const mapDriveItemToGame = (item: DriveItem): Game => {
    const platform = item.romPlatform === 'UNKNOWN' ? 'NES' : (item.romPlatform || 'NES');
    const title = cleanRomTitle(item.name);
    return {
      id: `drive-${item.id}`,
      title,
      platform,
      year: 1995,
      developer: 'Google Drive Storage',
      genre: 'Cloud Storage ROM',
      rating: 5.0,
      ratingCount: 1,
      boxArt: getCartridgeCoverArt(title, platform),
      description: `Tệp ROM lưu trữ trên Google Drive: "${item.name}". Quét tự động từ thư mục đám mây của bạn.`,
      features: ['Google Drive Cloud', 'WebAssembly WASM', 'SRAM Battery'],
      batterySave: true,
      compatibility: 100,
      source: 'drive',
      driveFileId: item.id,
      romFilename: item.name,
      uploadedAt: item.modifiedTime || new Date().toISOString(),
    };
  };

  // Scan ALL Google Drive for retro ROMs and sync to library
  const handleScanAndSyncAllDrive = async () => {
    setIsScanningAll(true);
    setAuthError(null);
    setDownloadProgressText('Đang quét toàn bộ Google Drive để tìm kiếm các tệp ROM (.nes, .smc, .sfc, .gba)...');

    try {
      const roms = await scanAllDriveRoms();
      if (roms.length === 0) {
        setSyncSuccessMsg('Đã hoàn tất quét: Không tìm thấy tệp ROM nào (.nes, .smc, .sfc, .gba) trên Google Drive.');
        setTimeout(() => setSyncSuccessMsg(null), 4000);
        return;
      }

      const games = roms.map(mapDriveItemToGame);
      libraryStore.addGames(games);

      setSyncSuccessMsg(`Thành công! Đã quét và đồng bộ ${games.length} trò chơi từ Google Drive vào thư viện.`);
      setTimeout(() => setSyncSuccessMsg(null), 4000);

      if (onDriveGamesSynced) {
        onDriveGamesSynced(games.length);
      }
    } catch (err: any) {
      setAuthError(`Lỗi khi quét Google Drive: ${err.message}`);
    } finally {
      setIsScanningAll(false);
      setDownloadProgressText(null);
    }
  };

  // Add all ROMs in currently viewed folder into library
  const handleSyncCurrentFolderToLibrary = () => {
    const romItems = items.filter((i) => i.isRom);
    if (romItems.length === 0) return;

    const games = romItems.map(mapDriveItemToGame);
    libraryStore.addGames(games);

    setSyncSuccessMsg(`Đã thêm ${games.length} trò chơi từ thư mục hiện tại vào thư viện.`);
    setTimeout(() => setSyncSuccessMsg(null), 4000);

    if (onDriveGamesSynced) {
      onDriveGamesSynced(games.length);
    }
  };

  // Add single ROM to library
  const handleAddSingleItemToLibrary = (item: DriveItem) => {
    const game = mapDriveItemToGame(item);
    libraryStore.addGame(game);
    setSyncSuccessMsg(`Đã thêm "${game.title}" vào thư viện!`);
    setTimeout(() => setSyncSuccessMsg(null), 3000);
  };

  const handleDownloadAndImportRom = async (item: DriveItem) => {
    setDownloadingFileId(item.id);
    setDownloadProgressText(`Đang tải ${item.name} từ Google Drive...`);
    setAuthError(null);
    try {
      const buffer = await downloadDriveFile(item.id);
      const bytes = new Uint8Array(buffer);
      // Also register into library
      const game = mapDriveItemToGame(item);
      libraryStore.addGame(game);

      setDownloadProgressText(`Tải thành công! Đang khởi động giả lập...`);
      setTimeout(() => {
        setDownloadingFileId(null);
        setDownloadProgressText(null);
        onRomSelected(bytes, item.name);
      }, 400);
    } catch (err: any) {
      setAuthError(`Không thể tải ${item.name}: ${err.message}`);
      setDownloadingFileId(null);
      setDownloadProgressText(null);
    }
  };

  const handleImportAllRomsInFolder = async () => {
    const romItems = items.filter((i) => i.isRom);
    if (romItems.length === 0) return;

    setBatchImporting(true);
    setDownloadProgressText(`Bắt đầu tải về ${romItems.length} ROMs...`);
    setAuthError(null);

    const loadedRoms: Array<{ bytes: Uint8Array; filename: string }> = [];

    try {
      for (let i = 0; i < romItems.length; i++) {
        const item = romItems[i];
        setDownloadProgressText(`Đang tải [${i + 1}/${romItems.length}] ${item.name}...`);
        const buffer = await downloadDriveFile(item.id);
        loadedRoms.push({
          bytes: new Uint8Array(buffer),
          filename: item.name,
        });

        // Register to library
        const game = mapDriveItemToGame(item);
        libraryStore.addGame(game);
      }

      setDownloadProgressText(`Đã tải thành công ${loadedRoms.length} ROMs!`);
      if (onBatchRomsLoaded && loadedRoms.length > 0) {
        onBatchRomsLoaded(loadedRoms);
      } else if (loadedRoms.length > 0) {
        onRomSelected(loadedRoms[0].bytes, loadedRoms[0].filename);
      }
    } catch (err: any) {
      setAuthError(`Lỗi tải hàng loạt: ${err.message}`);
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
            Kết nối với Google Drive
          </h3>
          <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
            Liên kết tài khoản Google để quét danh mục tệp ROM (.nes, .smc, .sfc, .gba) có sẵn trên Google Drive và đồng bộ trực tiếp vào Thư viện của bạn.
          </p>
        </div>

        {authError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono max-w-md text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5">error</span>
            <span>{authError}</span>
          </div>
        )}

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
          <span>{isAuthenticating ? 'Đang kết nối Google Drive...' : 'Đăng nhập với Google'}</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] font-mono text-[#958ea0]">
          <span className="material-symbols-outlined text-sm text-emerald-400">verified_user</span>
          <span>Chỉ quyền đọc (drive.readonly). Không sửa đổi hoặc chia sẻ tệp của bạn.</span>
        </div>
      </div>
    );
  }

  // Authenticated Drive Browser UI
  return (
    <div className="flex flex-col bg-[#191b22] border border-[#494454]/30 rounded-2xl overflow-hidden font-sans">
      {/* Top Bar: Connected Account & Main Actions */}
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
              <span>{currentUser?.displayName || 'Google Drive Đã Kết Nối'}</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                Sẵn sàng
              </span>
            </div>
            <div className="text-[11px] font-mono text-[#958ea0] truncate max-w-[260px]">
              {currentUser?.email}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Action: Scan ALL ROMs on Drive and populate library */}
          <button
            onClick={handleScanAndSyncAllDrive}
            disabled={isScanningAll}
            className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Quét toàn bộ Google Drive và thêm tất cả ROM vào Thư viện"
          >
            <span className={`material-symbols-outlined text-sm ${isScanningAll ? 'animate-spin' : ''}`}>
              travel_explore
            </span>
            <span>{isScanningAll ? 'Đang quét Drive...' : 'Quét Toàn Bộ ROM Trên Drive'}</span>
          </button>

          <button
            onClick={() => loadFolder(currentFolderId)}
            className="p-1.5 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-[#4cd7f6] border border-[#494454]/30 transition-colors"
            title="Làm mới thư mục"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>

          <button
            onClick={handleSignOut}
            className="px-2.5 py-1 rounded-lg bg-[#282a30] hover:bg-red-500/20 text-[#cbc3d7] hover:text-red-400 border border-[#494454]/30 text-xs font-mono transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {syncSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-emerald-400">check_circle</span>
          <span>{syncSuccessMsg}</span>
        </div>
      )}

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
              placeholder="Tìm kiếm ROM hoặc thư mục trong Drive (.nes, .smc, .gba)..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
            />
          </form>

          {/* Paste Drive Folder Link */}
          <div className="flex gap-2">
            <input
              type="text"
              value={folderUrlInput}
              onChange={(e) => setFolderUrlInput(e.target.value)}
              placeholder="Dán link hoặc ID thư mục Drive..."
              className="w-48 sm:w-56 px-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
            />
            <button
              onClick={handleJumpToFolderUrl}
              className="px-3 py-2 bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#494454]/30 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap"
            >
              Mở Thư Mục
            </button>
          </div>
        </div>

        {/* Breadcrumb Trail & Folder Sync */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-mono py-1">
          <div className="flex items-center gap-1.5 overflow-x-auto">
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
          </div>

          {/* Quick sync current folder buttons */}
          {romCountInFolder > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncCurrentFolderToLibrary}
                className="px-3 py-1 rounded bg-[#a078ff]/15 hover:bg-[#a078ff]/25 border border-[#a078ff]/40 text-[#d0bcff] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Thêm danh mục tất cả ROM trong thư mục này vào Thư viện"
              >
                <span className="material-symbols-outlined text-sm">bookmark_add</span>
                <span>Lưu Tất Cả Vào Thư Viện ({romCountInFolder})</span>
              </button>

              <button
                onClick={handleImportAllRomsInFolder}
                disabled={batchImporting || !!downloadingFileId}
                className="px-3 py-1 rounded bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download_for_offline</span>
                <span>Tải Toàn Bộ Tệp ({romCountInFolder})</span>
              </button>
            </div>
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
            <span>Đang đọc tệp từ Google Drive...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-[#958ea0] font-mono text-xs">
            <span className="material-symbols-outlined text-3xl text-[#494454]">folder_off</span>
            <span>Không tìm thấy tệp hoặc thư mục nào. Bạn có thể bấm "Quét Toàn Bộ ROM Trên Drive" ở trên.</span>
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
                    {item.isFolder && <span>• Thư mục</span>}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="shrink-0 flex items-center gap-2">
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
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSingleItemToLibrary(item);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white font-mono text-xs flex items-center gap-1 border border-[#494454]/40"
                      title="Lưu vào Thư viện trò chơi"
                    >
                      <span className="material-symbols-outlined text-xs text-[#a078ff]">bookmark_add</span>
                      <span className="hidden sm:inline">Lưu Vào Thư Viện</span>
                    </button>

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
                          <span>Đang nạp...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-xs">play_arrow</span>
                          <span>Chơi Ngay</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadAndImportRom(item);
                    }}
                    disabled={downloadingFileId === item.id || batchImporting}
                    className="px-2.5 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] font-mono text-xs transition-colors"
                  >
                    Nạp tệp
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#111319] border-t border-[#494454]/20 flex items-center justify-between text-[11px] font-mono text-[#958ea0]">
        <span>Hiển thị {items.length} mục trong thư mục hiện tại</span>
        <span className="text-[#4cd7f6]">{romCountInFolder} tệp ROM hợp lệ</span>
      </div>
    </div>
  );
};
