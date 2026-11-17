import React, { useState, useEffect, useCallback } from 'react';
import { Game } from '../types';
import {
  DriveItem,
  DriveFolderBreadcrumb,
  LinkedDriveFolder,
  SyncPlanResult,
  SyncToDriveResult,
  useLinkedDriveFolder,
  saveLinkedDriveFolder,
  clearLinkedDriveFolder,
  listDriveItems,
  getDriveFolderMetadata,
  createDriveFolder,
  extractDriveFolderIdFromUrl,
  getPlatformSubfolderName,
  buildRomFilenameForGame,
  prepareDriveSyncPlan,
  executeDriveSyncPlan,
} from '../services/googleDriveService';
import { auth, loginWithGoogle, getCachedAccessToken } from '../services/firebase';

interface DriveFolderSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  gamesToSync: Game[];
  title?: string;
  initialMode?: 'sync' | 'pick-folder';
  onSyncCompleted?: (summaryMsg: string) => void;
}

export const DriveFolderSyncModal: React.FC<DriveFolderSyncModalProps> = ({
  isOpen,
  onClose,
  gamesToSync,
  title,
  initialMode = 'sync',
  onSyncCompleted,
}) => {
  const linkedFolder = useLinkedDriveFolder();

  const [hasToken, setHasToken] = useState<boolean>(!!getCachedAccessToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  // Folder picker state
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(
    initialMode === 'pick-folder' || !linkedFolder
  );
  const [browseFolderId, setBrowseFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<DriveFolderBreadcrumb[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [folderUrlInput, setFolderUrlInput] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isLinkingFolder, setIsLinkingFolder] = useState(false);

  // Sync execution state
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<SyncPlanResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncToDriveResult | null>(null);

  // Reset modal transient states when opened
  useEffect(() => {
    if (!isOpen) return;
    setHasToken(!!getCachedAccessToken());
    setErrorMsg(null);
    setNeedsReauth(false);
    setPendingPlan(null);
    setSyncResult(null);
    setProgressMsg(null);
    setIsPickingFolder(initialMode === 'pick-folder' || !linkedFolder);
  }, [isOpen, initialMode]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      setHasToken(!!getCachedAccessToken());
    });
    return () => unsub();
  }, []);

  const loadDriveFolders = useCallback(async (folderId: string) => {
    setIsLoadingFolders(true);
    setErrorMsg(null);
    try {
      const res = await listDriveItems(folderId);
      setFolders(res.items.filter((i) => i.isFolder));
    } catch (err: any) {
      const msg = err?.message || 'Không thể tải danh sách thư mục Google Drive.';
      setErrorMsg(msg.replace('DRIVE_REAUTH_REQUIRED: ', ''));
      if (
        msg.includes('DRIVE_REAUTH_REQUIRED') ||
        msg.includes('unauthorized') ||
        msg.includes('401') ||
        msg.includes('token')
      ) {
        setNeedsReauth(true);
        setHasToken(false);
      }
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && hasToken && isPickingFolder) {
      loadDriveFolders(browseFolderId);
    }
  }, [isOpen, hasToken, isPickingFolder, browseFolderId, loadDriveFolders]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    try {
      const { accessToken } = await loginWithGoogle();
      if (accessToken) {
        setHasToken(true);
        setNeedsReauth(false);
      } else {
        setErrorMsg('Đăng nhập thành công nhưng không nhận được quyền truy cập Google Drive.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể kết nối tài khoản Google.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleOpenFolder = (folder: DriveItem) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setBrowseFolderId(folder.id);
  };

  const handleBreadcrumbClick = (idx: number) => {
    const target = breadcrumbs[idx];
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    setBrowseFolderId(target.id);
  };

  const handleLinkFolderObject = async (folderId: string, folderName: string) => {
    setIsLinkingFolder(true);
    setErrorMsg(null);
    try {
      const folderData: LinkedDriveFolder = {
        id: folderId,
        name: folderName,
        linkedAt: new Date().toISOString(),
      };
      await saveLinkedDriveFolder(folderData);
      setIsPickingFolder(false);
      setPendingPlan(null);
      setSyncResult(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu liên kết thư mục.');
    } finally {
      setIsLinkingFolder(false);
    }
  };

  const handleJumpAndLinkUrl = async (linkImmediately: boolean) => {
    if (!folderUrlInput.trim()) return;
    const extracted = extractDriveFolderIdFromUrl(folderUrlInput);
    if (!extracted) {
      setErrorMsg('Không nhận diện được ID hoặc đường dẫn thư mục Google Drive hợp lệ.');
      return;
    }

    setIsLoadingFolders(true);
    setErrorMsg(null);
    try {
      const meta = await getDriveFolderMetadata(extracted);
      if (linkImmediately) {
        await handleLinkFolderObject(meta.id, meta.name);
        setFolderUrlInput('');
      } else {
        setBreadcrumbs([
          { id: 'root', name: 'My Drive' },
          { id: meta.id, name: meta.name },
        ]);
        setBrowseFolderId(meta.id);
        setFolderUrlInput('');
      }
    } catch (err: any) {
      const msg = err?.message || 'Không thể truy cập thư mục Google Drive vừa nhập.';
      setErrorMsg(msg.replace('DRIVE_REAUTH_REQUIRED: ', ''));
      if (msg.includes('DRIVE_REAUTH_REQUIRED')) {
        setNeedsReauth(true);
        setHasToken(false);
      }
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setErrorMsg(null);
    try {
      const created = await createDriveFolder(newFolderName.trim(), browseFolderId);
      setNewFolderName('');
      await loadDriveFolders(browseFolderId);
      // Automatically link the newly created folder if the user had no folder linked yet
      if (!linkedFolder) {
        await handleLinkFolderObject(created.id, created.name);
      }
    } catch (err: any) {
      const msg = err?.message || 'Không thể tạo thư mục mới trên Google Drive.';
      setErrorMsg(msg.replace('DRIVE_REAUTH_REQUIRED: ', ''));
      if (msg.includes('DRIVE_REAUTH_REQUIRED')) {
        setNeedsReauth(true);
        setHasToken(false);
      }
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUnlinkFolder = async () => {
    await clearLinkedDriveFolder();
    setIsPickingFolder(true);
    setPendingPlan(null);
    setSyncResult(null);
  };

  const runExecutePlan = async (plan: SyncPlanResult, overwriteExisting: boolean) => {
    if (!linkedFolder) return;
    setIsUploading(true);
    setErrorMsg(null);
    try {
      const result = await executeDriveSyncPlan(
        plan,
        linkedFolder,
        overwriteExisting,
        (msg) => setProgressMsg(msg)
      );
      setPendingPlan(null);
      setSyncResult(result);

      const summaryParts: string[] = [];
      if (result.uploadedCount > 0) summaryParts.push(`+${result.uploadedCount} tải mới`);
      if (result.overwrittenCount > 0) summaryParts.push(`${result.overwrittenCount} ghi đè`);
      if (result.skippedExistingCount > 0) summaryParts.push(`${result.skippedExistingCount} bỏ qua trùng`);
      if (result.missingLocalRomCount > 0) summaryParts.push(`${result.missingLocalRomCount} thiếu tệp ROM`);

      const summaryMsg =
        summaryParts.length > 0
          ? `Đồng bộ Google Drive hoàn tất (${summaryParts.join(', ')}).`
          : 'Đã kiểm tra đồng bộ Google Drive.';
      onSyncCompleted?.(summaryMsg);
    } catch (err: any) {
      const msg = err?.message || 'Đồng bộ lên Google Drive thất bại.';
      setErrorMsg(msg.replace('DRIVE_REAUTH_REQUIRED: ', ''));
      if (msg.includes('DRIVE_REAUTH_REQUIRED')) {
        setNeedsReauth(true);
        setHasToken(false);
      }
    } finally {
      setIsUploading(false);
      setProgressMsg(null);
    }
  };

  const handleStartSync = async () => {
    if (!linkedFolder || gamesToSync.length === 0) return;

    setIsPreparing(true);
    setErrorMsg(null);
    setSyncResult(null);
    setPendingPlan(null);
    setProgressMsg('Đang kiểm tra thư mục con theo thể loại game trên Google Drive...');

    try {
      const plan = await prepareDriveSyncPlan(gamesToSync, linkedFolder, (msg) =>
        setProgressMsg(msg)
      );
      setIsPreparing(false);

      const hasConflicts = plan.items.some((item) => item.existingDriveFile !== null);
      if (hasConflicts) {
        // Require explicit user confirmation before overwriting any existing Drive file
        setPendingPlan(plan);
        setProgressMsg(null);
        return;
      }

      await runExecutePlan(plan, false);
    } catch (err: any) {
      setIsPreparing(false);
      setProgressMsg(null);
      const msg = err?.message || 'Không thể chuẩn bị đồng bộ Google Drive.';
      setErrorMsg(msg.replace('DRIVE_REAUTH_REQUIRED: ', ''));
      if (msg.includes('DRIVE_REAUTH_REQUIRED')) {
        setNeedsReauth(true);
        setHasToken(false);
      }
    }
  };

  // Group games by platform subfolder for preview
  const subfolderGroups = gamesToSync.reduce<Record<string, Game[]>>((acc, g) => {
    const sub = getPlatformSubfolderName(g);
    if (!acc[sub]) acc[sub] = [];
    acc[sub].push(g);
    return acc;
  }, {});

  const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
  const conflictingItems = pendingPlan?.items.filter((i) => i.existingDriveFile !== null) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[#191b22] border border-[#4cd7f6]/40 shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-[#111319] border-b border-[#494454]/30 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#4cd7f6]/15 border border-[#4cd7f6]/40 flex items-center justify-center text-[#4cd7f6] shrink-0">
              <span className="material-symbols-outlined text-xl">cloud_upload</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                {title || 'Liên Kết Thư Mục & Đồng Bộ Google Drive'}
              </h3>
              <p className="text-[11px] font-mono text-[#958ea0] truncate">
                Tự động phân loại vào thư mục con NES, SNES, GBA, GENESIS...
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Auth Gate if token missing or reauth required */}
          {!hasToken ? (
            <div className="p-6 rounded-xl bg-[#0c0e14] border border-[#494454]/40 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6]">
                <span className="material-symbols-outlined text-3xl">add_to_drive</span>
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="text-sm font-bold text-white">
                  {needsReauth
                    ? 'Cần cấp lại quyền Google Drive'
                    : 'Kết nối Google Drive để đồng bộ ROM'}
                </h4>
                <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
                  Đăng nhập Google để chọn thư mục gốc cố định và cho phép tải tệp ROM lên các thư mục con theo từng hệ máy (NES, SNES, GBA, GENESIS).
                </p>
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthenticating}
                className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-white hover:bg-neutral-100 text-[#1f1f1f] font-sans font-medium text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isAuthenticating ? 'Đang kết nối...' : 'Đăng nhập với Google'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Section 1: Linked Fixed Folder Card */}
              <div className="p-4 rounded-xl bg-[#0c0e14] border border-[#494454]/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#4cd7f6] uppercase tracking-wider">
                    <span className="material-symbols-outlined text-base">folder_special</span>
                    <span>Thư Mục Google Drive Cố Định</span>
                  </div>

                  {linkedFolder && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPickingFolder((prev) => !prev)}
                        className="px-2.5 py-1 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white font-mono text-[11px] transition-colors cursor-pointer"
                      >
                        {isPickingFolder ? 'Đóng Trình Chọn' : 'Đổi Thư Mục'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlinkFolder}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 font-mono text-[11px] transition-colors cursor-pointer"
                      >
                        Hủy Liên Kết
                      </button>
                    </div>
                  )}
                </div>

                {linkedFolder ? (
                  <div className="p-3 rounded-lg bg-[#191b22] border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="material-symbols-outlined text-2xl text-emerald-400 shrink-0">
                        folder
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {linkedFolder.name}
                        </div>
                        <div className="text-[11px] font-mono text-[#958ea0] truncate">
                          Cấu trúc lưu: {linkedFolder.name} / [NES | SNES | GBA | GENESIS]
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold shrink-0 w-fit">
                      Đã liên kết cố định
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-amber-400">info</span>
                    <span>
                      Chưa chọn thư mục cố định. Hãy chọn một thư mục có sẵn hoặc tạo mới thư mục ở bên dưới.
                    </span>
                  </div>
                )}

                {/* Folder Browser / Creator */}
                {isPickingFolder && (
                  <div className="pt-3 border-t border-[#494454]/30 space-y-3">
                    {/* Paste URL / ID */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={folderUrlInput}
                        onChange={(e) => setFolderUrlInput(e.target.value)}
                        placeholder="Dán link hoặc ID thư mục Google Drive..."
                        className="flex-1 px-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
                      />
                      <button
                        type="button"
                        onClick={() => handleJumpAndLinkUrl(true)}
                        disabled={!folderUrlInput.trim() || isLoadingFolders}
                        className="px-3 py-2 rounded-lg bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        Liên Kết Link Này
                      </button>
                    </div>

                    {/* Create New Folder in Current Directory */}
                    <form onSubmit={handleCreateNewFolder} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder={`Tạo thư mục mới trong "${currentBreadcrumb.name}" (VD: RetroVerse ROMs)...`}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#111319] border border-[#494454]/40 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#a078ff]"
                      />
                      <button
                        type="submit"
                        disabled={!newFolderName.trim() || isCreatingFolder}
                        className="px-3 py-2 rounded-lg bg-[#a078ff]/20 hover:bg-[#a078ff]/35 border border-[#a078ff]/50 text-[#d0bcff] font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">create_new_folder</span>
                        <span>{isCreatingFolder ? 'Đang tạo...' : 'Tạo Thư Mục Mới'}</span>
                      </button>
                    </form>

                    {/* Breadcrumbs + Link Current Folder */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111319] px-3 py-2 rounded-lg border border-[#494454]/30">
                      <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto">
                        {breadcrumbs.map((crumb, idx) => (
                          <React.Fragment key={crumb.id}>
                            {idx > 0 && <span className="text-[#494454]">/</span>}
                            <button
                              type="button"
                              onClick={() => handleBreadcrumbClick(idx)}
                              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                idx === breadcrumbs.length - 1
                                  ? 'text-[#4cd7f6] font-bold'
                                  : 'text-[#cbc3d7] hover:text-white'
                              }`}
                            >
                              {crumb.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleLinkFolderObject(currentBreadcrumb.id, currentBreadcrumb.name)
                        }
                        disabled={isLinkingFolder}
                        className="px-3 py-1 rounded bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-xs">link</span>
                        <span>Chọn &amp; Liên Kết "{currentBreadcrumb.name}"</span>
                      </button>
                    </div>

                    {/* Folder List */}
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-[#494454]/30 bg-[#111319] divide-y divide-[#494454]/20">
                      {isLoadingFolders ? (
                        <div className="py-8 text-center text-xs font-mono text-[#958ea0] flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined text-base animate-spin text-[#4cd7f6]">
                            refresh
                          </span>
                          <span>Đang tải thư mục...</span>
                        </div>
                      ) : folders.length === 0 ? (
                        <div className="py-6 text-center text-xs font-mono text-[#958ea0]">
                          Không có thư mục con nào trong "{currentBreadcrumb.name}". Bạn có thể chọn trực tiếp thư mục này hoặc tạo thư mục mới ở trên.
                        </div>
                      ) : (
                        folders.map((folder) => (
                          <div
                            key={folder.id}
                            className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-[#1e1f26] transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenFolder(folder)}
                              className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-lg text-[#d0bcff]">
                                folder
                              </span>
                              <span className="text-xs font-bold text-white truncate">
                                {folder.name}
                              </span>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleLinkFolderObject(folder.id, folder.name)}
                                disabled={isLinkingFolder}
                                className="px-2.5 py-1 rounded bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/30 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Liên Kết
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenFolder(folder)}
                                className="p-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white cursor-pointer"
                                title="Mở thư mục"
                              >
                                <span className="material-symbols-outlined text-sm">
                                  chevron_right
                                </span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Explicit Overwrite Confirmation Panel */}
              {pendingPlan && conflictingItems.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/50 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-xl text-amber-400 shrink-0 mt-0.5">
                      warning
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-amber-200">
                        Phát hiện {conflictingItems.length} tệp ROM đã tồn tại trên Google Drive
                      </h4>
                      <p className="text-xs font-mono text-amber-200/80 mt-0.5">
                        Vui lòng xác nhận bạn muốn ghi đè các tệp cũ hay chỉ tải lên các tệp mới.
                      </p>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto rounded-lg bg-[#0c0e14] border border-amber-500/30 divide-y divide-[#494454]/20">
                    {conflictingItems.map((item) => (
                      <div
                        key={item.game.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono"
                      >
                        <span className="text-white truncate">{item.filename}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] shrink-0">
                          {linkedFolder?.name}/{item.subfolderName}/
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPendingPlan(null)}
                      disabled={isUploading}
                      className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] font-mono text-xs cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => runExecutePlan(pendingPlan, false)}
                      disabled={isUploading}
                      className="px-3 py-1.5 rounded-lg bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold cursor-pointer"
                    >
                      Bỏ Qua Tệp Trùng, Chỉ Tải Tệp Mới
                    </button>
                    <button
                      type="button"
                      onClick={() => runExecutePlan(pendingPlan, true)}
                      disabled={isUploading}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold cursor-pointer"
                    >
                      Ghi Đè &amp; Tải Lên Tất Cả
                    </button>
                  </div>
                </div>
              )}

              {/* Section 3: Games & Subfolder Preview */}
              {gamesToSync.length > 0 && !pendingPlan && (
                <div className="p-4 rounded-xl bg-[#0c0e14] border border-[#494454]/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-[#a078ff]">
                        account_tree
                      </span>
                      <span>Danh Sách Đồng Bộ ({gamesToSync.length} Game)</span>
                    </span>
                    <span className="text-[11px] font-mono text-[#958ea0]">
                      Phân loại theo hệ máy
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(subfolderGroups).map(([sub, list]) => (
                      <span
                        key={sub}
                        className="px-2 py-1 rounded bg-[#191b22] border border-[#4cd7f6]/30 text-[#4cd7f6] font-mono text-[11px]"
                      >
                        📁 {linkedFolder ? `${linkedFolder.name}/` : ''}
                        <strong>{sub}</strong> ({list.length})
                      </span>
                    ))}
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-lg bg-[#111319] border border-[#494454]/30 divide-y divide-[#494454]/20">
                    {gamesToSync.map((g) => {
                      const sub = getPlatformSubfolderName(g);
                      const fname = buildRomFilenameForGame(g);
                      return (
                        <div
                          key={g.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{g.title}</div>
                            <div className="text-[10px] font-mono text-[#958ea0] truncate">
                              {fname}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#a078ff]/15 border border-[#a078ff]/30 text-[#d0bcff] font-mono text-[10px] shrink-0">
                            -&gt; {sub}/
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Progress Banner */}
              {(isPreparing || isUploading || progressMsg) && (
                <div className="p-3 rounded-xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/40 text-[#4cd7f6] text-xs font-mono flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  <span>{progressMsg || 'Đang xử lý đồng bộ Google Drive...'}</span>
                </div>
              )}

              {/* Completion Summary Banner */}
              {syncResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <span className="material-symbols-outlined text-lg text-emerald-400">
                      check_circle
                    </span>
                    <span>Đồng bộ Google Drive hoàn tất!</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2 rounded bg-[#0c0e14] border border-emerald-500/20">
                      <span className="text-[#958ea0] block text-[10px]">Tải mới</span>
                      <span className="text-emerald-300 font-bold">{syncResult.uploadedCount}</span>
                    </div>
                    <div className="p-2 rounded bg-[#0c0e14] border border-amber-500/20">
                      <span className="text-[#958ea0] block text-[10px]">Ghi đè</span>
                      <span className="text-amber-300 font-bold">{syncResult.overwrittenCount}</span>
                    </div>
                    <div className="p-2 rounded bg-[#0c0e14] border border-[#494454]/30">
                      <span className="text-[#958ea0] block text-[10px]">Bỏ qua trùng</span>
                      <span className="text-[#cbc3d7] font-bold">
                        {syncResult.skippedExistingCount}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[#0c0e14] border border-rose-500/20">
                      <span className="text-[#958ea0] block text-[10px]">Thiếu tệp ROM</span>
                      <span className="text-rose-300 font-bold">
                        {syncResult.missingLocalRomCount}
                      </span>
                    </div>
                  </div>
                  {syncResult.createdSubfolders.length > 0 && (
                    <p className="text-[11px] font-mono text-emerald-200/80">
                      Đã tạo mới thư mục con: {syncResult.createdSubfolders.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#111319] border-t border-[#494454]/30 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer"
          >
            Đóng
          </button>

          {hasToken && linkedFolder && gamesToSync.length > 0 && !pendingPlan && (
            <button
              type="button"
              onClick={handleStartSync}
              disabled={isPreparing || isUploading}
              className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#4cd7f6]/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span
                className={`material-symbols-outlined text-base ${
                  isPreparing || isUploading ? 'animate-spin' : ''
                }`}
              >
                {isPreparing || isUploading ? 'sync' : 'cloud_upload'}
              </span>
              <span>
                {isPreparing || isUploading
                  ? 'Đang đồng bộ lên Drive...'
                  : `Đồng Bộ ${gamesToSync.length} Game Lên "${linkedFolder.name}"`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
