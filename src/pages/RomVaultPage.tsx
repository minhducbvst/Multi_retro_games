import React, { useState, useRef } from 'react';
import { parseRom, RomHeaderInfo } from '../emulator/romParser';
import { GoogleDriveRomPicker } from '../components/GoogleDriveRomPicker';
import { Game } from '../types';
import { libraryStore, getCartridgeCoverArt } from '../services/games/libraryStore';
import { romStorage } from '../services/roms/romStorage';

interface RomVaultPageProps {
  onLaunchRom: (romData: Uint8Array, headerInfo: RomHeaderInfo) => void;
  onBack: () => void;
  onAddCustomGame?: (game: Game, romData: Uint8Array) => void;
  initialSourceMode?: 'local' | 'drive';
}

interface LoadedCartridgeItem {
  filename: string;
  bytes: Uint8Array;
  info: RomHeaderInfo;
}

export const RomVaultPage: React.FC<RomVaultPageProps> = ({
  onLaunchRom,
  onBack,
  onAddCustomGame,
  initialSourceMode = 'local',
}) => {
  // Source mode: 'local' (direct from machine) or 'drive' (Google Drive folder)
  const [sourceMode, setSourceMode] = useState<'local' | 'drive'>(initialSourceMode);

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [analyzedRom, setAnalyzedRom] = useState<{ info: RomHeaderInfo; bytes: Uint8Array } | null>(null);
  const [detectedFolderRoms, setDetectedFolderRoms] = useState<LoadedCartridgeItem[]>([]);
  const [userAcknowledgedLegal, setUserAcknowledgedLegal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const processSingleFile = async (file: File) => {
    setErrorMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const header = parseRom(bytes, file.name);

      if (header.platform === 'UNKNOWN') {
        setErrorMsg(`"${file.name}" is an unrecognized ROM format. Please supply a valid .nes, .smc, .sfc, or .gba file.`);
        return;
      }

      setAnalyzedRom({ info: header, bytes });
      showToast(`Cartridge header analyzed: ${header.internalTitle || header.filename}`);
    } catch {
      setErrorMsg('Failed to read cartridge binary from disk. Please check file permissions.');
    }
  };

  const processMultipleFiles = async (files: FileList | File[]) => {
    setErrorMsg(null);
    const validRoms: LoadedCartridgeItem[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (['.nes', '.smc', '.sfc', '.gba', '.bin', '.zip'].includes(ext)) {
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const info = parseRom(bytes, file.name);
          if (info.platform !== 'UNKNOWN') {
            validRoms.push({ filename: file.name, bytes, info });
          }
        } catch (e) {
          console.warn('Error reading file:', file.name, e);
        }
      }
    }

    if (validRoms.length === 0) {
      setErrorMsg('No compatible retro ROMs found in selected folder or files.');
      return;
    }

    setDetectedFolderRoms(validRoms);
    // Select the first one for inspection
    setAnalyzedRom({ info: validRoms[0].info, bytes: validRoms[0].bytes });
    showToast(`Found ${validRoms.length} playable ROM cartridge(s) from folder!`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length === 1) {
        processSingleFile(e.dataTransfer.files[0]);
      } else {
        processMultipleFiles(e.dataTransfer.files);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  // Callback from Google Drive Picker
  const handleDriveRomSelected = (romBytes: Uint8Array, filename: string) => {
    setErrorMsg(null);
    const header = parseRom(romBytes, filename);
    setAnalyzedRom({ info: header, bytes: romBytes });
    showToast(`Imported "${filename}" from Google Drive!`);
  };

  const handleDriveBatchLoaded = (roms: Array<{ bytes: Uint8Array; filename: string }>) => {
    const list: LoadedCartridgeItem[] = roms.map((r) => ({
      filename: r.filename,
      bytes: r.bytes,
      info: parseRom(r.bytes, r.filename),
    }));
    setDetectedFolderRoms(list);
    if (list.length > 0) {
      setAnalyzedRom({ info: list[0].info, bytes: list[0].bytes });
      showToast(`Imported ${list.length} ROMs from Google Drive folder!`);
    }
  };

  const handleLaunch = () => {
    if (!analyzedRom) return;
    if (!userAcknowledgedLegal) {
      showToast('Please confirm legal ownership acknowledgement before executing ROM.');
      return;
    }
    onLaunchRom(analyzedRom.bytes, analyzedRom.info);
  };

  const handleSaveToLibrary = () => {
    if (!analyzedRom) return;
    const plat = analyzedRom.info.platform === 'UNKNOWN' ? 'NES' : analyzedRom.info.platform;
    const title = analyzedRom.info.internalTitle || analyzedRom.info.filename;
    const customGame: Game = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      platform: plat,
      year: 1995,
      developer: sourceMode === 'drive' ? 'Google Drive Cloud Storage' : 'Tải lên từ máy tính',
      genre: 'Custom / Backup',
      rating: 5.0,
      ratingCount: 1,
      boxArt: getCartridgeCoverArt(title, plat),
      description: `Tệp ROM: ${analyzedRom.info.filename}. Nguồn: ${
        sourceMode === 'drive' ? 'Google Drive' : 'Máy tính'
      }. Checksum: ${analyzedRom.info.crc32}.`,
      players: '1-2 Players',
      releaseDate: 'Physical Backup',
      features: ['Client WASM', 'SRAM Battery', analyzedRom.info.coProcessor],
      batterySave: analyzedRom.info.hasBattery,
      sramSize: analyzedRom.info.sramSize,
      compatibility: 100,
      crc32: analyzedRom.info.crc32,
      md5: analyzedRom.info.md5,
      source: sourceMode === 'drive' ? 'drive' : 'local',
      romFilename: analyzedRom.info.filename,
    };

    romStorage.saveRom(customGame.id, analyzedRom.info.filename, plat, analyzedRom.bytes);
    libraryStore.addGame(customGame);

    if (onAddCustomGame) {
      onAddCustomGame(customGame, analyzedRom.bytes);
    }
    showToast(`Đã lưu "${customGame.title}" vào thư viện!`);
  };

  const handleSaveAllToLibrary = () => {
    if (detectedFolderRoms.length === 0) return;
    const gamesToAdd: Game[] = [];

    detectedFolderRoms.forEach((rom) => {
      const plat = rom.info.platform === 'UNKNOWN' ? 'NES' : rom.info.platform;
      const title = rom.info.internalTitle || rom.filename;
      const game: Game = {
        id: `custom-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        title,
        platform: plat,
        year: 1995,
        developer: sourceMode === 'drive' ? 'Google Drive Cloud Storage' : 'Tải lên từ máy tính',
        genre: 'Custom / Backup',
        rating: 5.0,
        ratingCount: 1,
        boxArt: getCartridgeCoverArt(title, plat),
        description: `Tệp ROM: ${rom.filename}. Checksum: ${rom.info.crc32}.`,
        features: ['WASM Client', 'SRAM Battery', rom.info.coProcessor],
        batterySave: rom.info.hasBattery,
        source: 'local',
        romFilename: rom.filename,
        crc32: rom.info.crc32,
      };

      gamesToAdd.push(game);
      romStorage.saveRom(game.id, rom.filename, plat, rom.bytes);
    });

    libraryStore.addGames(gamesToAdd);
    showToast(`Đã thêm thành công ${gamesToAdd.length} tựa game vào thư viện!`);
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none font-sans">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">memory</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#494454]/20 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/30 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-bold font-headline text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6]">input</span>
              ROM Importer & Cartridge Vault
            </h1>
            <p className="text-xs font-mono text-[#958ea0]">
              Import game cartridges directly from local machine or from Google Drive cloud folders
            </p>
          </div>
        </div>

        {/* Source Switcher Mode Pills */}
        <div className="flex items-center p-1 bg-[#16171e] rounded-xl border border-[#494454]/30 font-mono text-xs">
          <button
            onClick={() => setSourceMode('local')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              sourceMode === 'local'
                ? 'bg-[#4cd7f6] text-[#003641] font-bold shadow-md'
                : 'text-[#cbc3d7] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">computer</span>
            <span>Direct from Machine</span>
          </button>
          <button
            onClick={() => setSourceMode('drive')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              sourceMode === 'drive'
                ? 'bg-[#4cd7f6] text-[#003641] font-bold shadow-md'
                : 'text-[#cbc3d7] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">cloud_sync</span>
            <span>Google Drive Storage</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Source Panel & Right Cartridge Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Direct Machine or Google Drive */}
        <div className="lg:col-span-7 space-y-4">
          {sourceMode === 'local' ? (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[300px] ${
                  dragActive
                    ? 'border-[#4cd7f6] bg-[#4cd7f6]/10 scale-[1.01]'
                    : 'border-[#494454]/40 bg-[#1e1f26]/60 hover:bg-[#1e1f26] hover:border-[#4cd7f6]/50'
                }`}
              >
                {/* Single file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".nes,.smc,.sfc,.gba,.bin,.zip"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processSingleFile(e.target.files[0]);
                    }
                  }}
                />

                {/* Directory / Folder input */}
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      processMultipleFiles(e.target.files);
                    }
                  }}
                />

                <div className="w-16 h-16 rounded-2xl bg-[#111319] border border-[#494454]/40 flex items-center justify-center text-[#4cd7f6] mb-4 shadow-xl">
                  <span className="material-symbols-outlined text-3xl">upload_file</span>
                </div>

                <h3 className="font-headline font-bold text-white text-base">
                  Drop Cartridge ROMs or Folders Here
                </h3>
                <p className="text-xs font-mono text-[#958ea0] mt-1 max-w-sm">
                  Drag and drop individual ROM files or a directory from your computer
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <span className="px-2 py-0.5 bg-[#111319] text-[#ffb3bc] rounded text-[11px] font-mono border border-[#494454]/30">
                    .NES (Nintendo)
                  </span>
                  <span className="px-2 py-0.5 bg-[#111319] text-[#4cd7f6] rounded text-[11px] font-mono border border-[#494454]/30">
                    .SMC / .SFC (Super Nintendo)
                  </span>
                  <span className="px-2 py-0.5 bg-[#111319] text-[#d0bcff] rounded text-[11px] font-mono border border-[#494454]/30">
                    .GBA (Game Boy Advance)
                  </span>
                </div>

                {/* Dual Picker Buttons: File vs Folder */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white rounded-lg text-xs font-mono border border-[#494454]/30 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm text-[#4cd7f6]">attachment</span>
                    <span>Browse File</span>
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="px-4 py-2 bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 text-[#4cd7f6] rounded-lg text-xs font-mono font-bold border border-[#4cd7f6]/30 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                    <span>Import Local Folder</span>
                  </button>
                </div>
              </div>

              {/* Detected Folder ROMs List */}
              {detectedFolderRoms.length > 0 && (
                <div className="p-4 bg-[#1e1f26] border border-[#494454]/30 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between pb-2 border-b border-[#494454]/20 gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white font-mono">
                      <span className="material-symbols-outlined text-sm text-[#4cd7f6]">folder</span>
                      <span>Đã tìm thấy ({detectedFolderRoms.length}) tệp ROM trong thư mục</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveAllToLibrary}
                        className="px-3 py-1 rounded bg-[#a078ff]/20 hover:bg-[#a078ff]/30 text-[#d0bcff] border border-[#a078ff]/40 text-xs font-mono font-bold flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">bookmark_add</span>
                        <span>Lưu tất cả vào thư viện ({detectedFolderRoms.length})</span>
                      </button>
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1.5 divide-y divide-[#494454]/20 pr-1">
                    {detectedFolderRoms.map((rom, idx) => (
                      <div
                        key={idx}
                        onClick={() => setAnalyzedRom({ info: rom.info, bytes: rom.bytes })}
                        className={`pt-2 flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          analyzedRom?.info.filename === rom.filename
                            ? 'bg-[#33343b] text-white border-l-2 border-[#4cd7f6]'
                            : 'hover:bg-[#282a30] text-[#cbc3d7]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-sm text-[#4cd7f6]">sports_esports</span>
                          <span className="text-xs font-mono truncate">{rom.filename}</span>
                          <span className="px-1.5 py-0.2 rounded bg-[#111319] text-[10px] font-mono text-[#4cd7f6]">
                            {rom.info.platform}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#958ea0]">
                          {(rom.info.sizeBytes / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Google Drive Mode */
            <div className="space-y-4">
              <GoogleDriveRomPicker
                onRomSelected={handleDriveRomSelected}
                onBatchRomsLoaded={handleDriveBatchLoaded}
              />
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Privacy & Legal Callout */}
          <div className="p-4 bg-[#111319] rounded-xl border border-[#494454]/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
              <span className="material-symbols-outlined text-base">policy</span>
              <span>Client-Side Sandbox Execution (No Remote Re-distribution)</span>
            </div>
            <p className="text-[11px] font-mono text-[#958ea0] leading-relaxed">
              RetroVerse parses cartridges purely inside your client browser's local memory and WebAssembly engine. When importing from Google Drive, files are fetched directly via your authenticated Google session and stored in your private local session.
            </p>
          </div>
        </div>

        {/* Right Column: Cartridge Inspection & Verification */}
        <div className="lg:col-span-5 bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#494454]/20 mb-4">
              <h3 className="font-headline font-bold text-white text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">qr_code_scanner</span>
                Header Analysis & Checksums
              </h3>
              {analyzedRom && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-[10px]">
                  Valid Header
                </span>
              )}
            </div>

            {analyzedRom ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
                    <span className="text-[#958ea0] text-[10px] block">INTERNAL GAME TITLE</span>
                    <span className="text-white font-bold truncate block">
                      {analyzedRom.info.internalTitle || analyzedRom.info.filename}
                    </span>
                  </div>
                  <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
                    <span className="text-[#958ea0] text-[10px] block">TARGET PLATFORM</span>
                    <span className="text-[#4cd7f6] font-bold">{analyzedRom.info.platform}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
                    <span className="text-[#958ea0] text-[10px] block">ROM SIZE</span>
                    <span className="text-[#cbc3d7]">{(analyzedRom.info.sizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20">
                    <span className="text-[#958ea0] text-[10px] block">SRAM BATTERY</span>
                    <span className="text-emerald-400">
                      {analyzedRom.info.hasBattery ? 'Yes (Battery Backed)' : 'No'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                  <span className="text-[#958ea0] text-[10px] block">HARDWARE CO-PROCESSOR / MAPPER</span>
                  <span className="text-white font-bold">{analyzedRom.info.coProcessor || 'Standard ASIC'}</span>
                  <p className="text-[10px] text-[#958ea0]">ROM Speed / Mapping: {analyzedRom.info.romSpeedAndType || 'FastROM'}</p>
                </div>

                <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                  <span className="text-[#958ea0] text-[10px] block">CRYPTO CHECKSUMS</span>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#958ea0]">CRC32:</span>
                    <span className="text-[#4cd7f6]">{analyzedRom.info.crc32}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#958ea0]">MD5:</span>
                    <span className="text-[#d0bcff]">{analyzedRom.info.md5}</span>
                  </div>
                </div>

                {/* Ownership checkbox */}
                <label className="flex items-start gap-2.5 mt-4 p-3 rounded-lg bg-[#111319] border border-[#494454]/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userAcknowledgedLegal}
                    onChange={(e) => setUserAcknowledgedLegal(e.target.checked)}
                    className="mt-0.5 accent-[#4cd7f6]"
                  />
                  <span className="text-[11px] font-mono text-[#cbc3d7] leading-tight">
                    I certify that I am the rightful legal owner of the physical cartridge backing this ROM dump and will use it in accordance with applicable laws.
                  </span>
                </label>
              </div>
            ) : (
              <div className="py-16 text-center text-[#958ea0] font-mono text-xs flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-[#494454] mb-2">developer_board</span>
                <p>No ROM loaded in inspector.</p>
                <p className="text-[11px] text-[#494454] mt-1">
                  Pick a file from your computer or choose from Google Drive to inspect.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#494454]/20 mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => {
                setAnalyzedRom(null);
                setUserAcknowledgedLegal(false);
              }}
              disabled={!analyzedRom}
              className="px-3 py-1.5 rounded-lg bg-[#111319] hover:bg-[#282a30] text-[#958ea0] hover:text-[#cbc3d7] font-mono text-xs disabled:opacity-30 transition-colors"
            >
              Clear Cartridge
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveToLibrary}
                disabled={!analyzedRom}
                className="px-3 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white font-mono text-xs disabled:opacity-30 transition-colors flex items-center gap-1.5"
                title="Save game metadata to personal library"
              >
                <span className="material-symbols-outlined text-sm">bookmark_add</span>
                <span>Add to Library</span>
              </button>

              <button
                onClick={handleLaunch}
                disabled={!analyzedRom || !userAcknowledgedLegal}
                className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-[#4cd7f6]/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">sports_esports</span>
                <span>Launch Emulator</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
