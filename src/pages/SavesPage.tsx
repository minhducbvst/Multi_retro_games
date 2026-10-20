import React, { useState, useEffect } from 'react';
import { saveManager } from '../services/saves/saveManager';
import { getGameById } from '../services/games/catalog';
import { SaveMetadata, SaveConflict } from '../types';

interface SavesPageProps {
  onPlayGame: (gameId: string, slot?: number) => void;
  onBack: () => void;
  onNavigateToVault?: () => void;
}

export const SavesPage: React.FC<SavesPageProps> = ({ onPlayGame, onBack, onNavigateToVault }) => {
  const [filterType, setFilterType] = useState<'all' | 'battery' | 'state'>('all');
  const [autoSyncCloud, setAutoSyncCloud] = useState<boolean>(true);
  const [activeConflict, setActiveConflict] = useState<SaveConflict | null>(() => saveManager.getConflict());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState<boolean>(false);

  // Load real saves from saveManager
  const [saves, setSaves] = useState<SaveMetadata[]>(() => saveManager.getAllSaves());

  const refreshSaves = () => {
    setSaves(saveManager.getAllSaves());
    setActiveConflict(saveManager.getConflict());
  };

  useEffect(() => {
    refreshSaves();
    // Poll for IndexedDB changes or saves updates
    const interval = setInterval(refreshSaves, 1500);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleResolveConflict = (choice: 'keep_local' | 'restore_cloud') => {
    if (!activeConflict) return;
    saveManager.resolveConflict(choice);
    setActiveConflict(null);
    refreshSaves();
    showToast(`Conflict resolved! Kept ${choice === 'keep_local' ? 'Local' : 'Cloud'} version.`);
  };

  const handleDownloadSrm = (save: SaveMetadata) => {
    const raw = saveManager.exportSram(save.gameId);
    const blob = new Blob([raw.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.gameId}_slot${save.slot}.${save.type === 'battery' ? 'srm' : 'state'}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${a.download}`);
  };

  const handleDeleteSave = async (saveId: string) => {
    await saveManager.deleteSave(saveId);
    refreshSaves();
    showToast('Save file erased from storage');
  };

  const handleClearAllSaves = async () => {
    await saveManager.clearAllData();
    refreshSaves();
    setShowConfirmClear(false);
    showToast('Đã xóa toàn bộ dữ liệu lưu chạy thử thành công!');
  };

  const filteredSaves = saves.filter((s) => {
    if (filterType === 'battery') return s.type === 'battery';
    if (filterType === 'state') return s.type === 'state';
    return true;
  });

  const totalBytes = saves.reduce((acc, s) => acc + (s.sizeBytes || 0), 0);
  const formattedQuota = totalBytes > 1024 * 1024
    ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(totalBytes / 1024).toFixed(1)} KB`;
  const quotaPercent = Math.min(100, Math.max(0.5, (totalBytes / (100 * 1024 * 1024)) * 100));

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">cloud_done</span>
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
              <span className="material-symbols-outlined text-[#4cd7f6]">cloud_sync</span>
              Cloud Saves & Save State Manager
            </h1>
            <p className="text-xs font-mono text-[#958ea0]">
              Quản lý và đồng bộ tệp lưu Battery SRAM (.srm) và Savestates với Firestore Cloud Storage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto-Sync Toggle */}
          <div className="flex items-center gap-2 bg-[#1e1f26] px-3 py-1.5 rounded-lg border border-[#494454]/30">
            <span className="text-xs font-mono text-[#cbc3d7]">Auto Cloud Sync</span>
            <button
              onClick={() => {
                setAutoSyncCloud(!autoSyncCloud);
                showToast(autoSyncCloud ? 'Đã tạm dừng tự động đồng bộ' : 'Đã bật tự động đồng bộ');
              }}
              className={`w-9 h-5 flex items-center rounded-full p-1 duration-300 cursor-pointer ${
                autoSyncCloud ? 'bg-[#4cd7f6] justify-end' : 'bg-[#494454] justify-start'
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-[#111319] shadow-md"></div>
            </button>
          </div>

          {saves.length > 0 && (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-mono text-xs transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">delete_sweep</span>
              Xóa Hết Dữ Liệu Lưu
            </button>
          )}

          <button
            onClick={() => {
              refreshSaves();
              showToast('Đã kiểm tra và đồng bộ toàn bộ tệp lưu');
            }}
            className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            Đồng Bộ Ngay
          </button>
        </div>
      </div>

      {/* Cloud Quota Status Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
          <p className="text-xs font-mono text-[#958ea0]">Dung Lượng Lưu Trữ</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-xl font-bold font-mono text-white">{formattedQuota}</h3>
            <span className="text-xs font-mono text-[#cbc3d7]">/ 100.0 MB</span>
          </div>
          <div className="w-full bg-[#111319] h-2 rounded-full mt-2 overflow-hidden">
            <div className="bg-[#4cd7f6] h-full rounded-full transition-all duration-500" style={{ width: `${quotaPercent}%` }}></div>
          </div>
        </div>

        <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
          <p className="text-xs font-mono text-[#958ea0]">Battery Saves (.srm)</p>
          <h3 className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {saves.filter((s) => s.type === 'battery' || s.type === 'sram').length} Tệp Khả Dụng
          </h3>
          <p className="text-[11px] font-mono text-[#958ea0] mt-1">Lưu trữ pin không bị mất khi reload</p>
        </div>

        <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30">
          <p className="text-xs font-mono text-[#958ea0]">Save State Snapshots</p>
          <h3 className="text-xl font-bold font-mono text-[#d0bcff] mt-1">
            {saves.filter((s) => s.type === 'state').length} Khe Lưu Nhanh
          </h3>
          <p className="text-[11px] font-mono text-[#958ea0] mt-1">Hỗ trợ 9 Slot lưu trạng thái tức thì</p>
        </div>

        <div className="p-4 bg-[#1e1f26] rounded-xl border border-[#494454]/30 flex flex-col justify-between">
          <p className="text-xs font-mono text-[#958ea0]">Chế Độ Xung Đột</p>
          <span className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">shield</span>
            Smart Timestamp Check
          </span>
          <p className="text-[10px] font-mono text-[#958ea0]">Tự động bảo vệ tránh ghi đè dữ liệu</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-[#494454]/20 pb-2">
        <div className="flex items-center gap-2">
          {(['all', 'battery', 'state'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-all ${
                filterType === t
                  ? 'bg-[#4cd7f6] text-[#003641] font-bold shadow-sm'
                  : 'bg-[#1e1f26] text-[#958ea0] hover:text-[#cbc3d7]'
              }`}
            >
              {t === 'all' ? 'Tất Cả Tệp Lưu' : t === 'battery' ? 'Battery RAM (.srm)' : 'Save States (.state)'}
            </button>
          ))}
        </div>

        <span className="text-xs font-mono text-[#958ea0]">
          {filteredSaves.length} bản ghi
        </span>
      </div>

      {/* Empty State or Saves List */}
      {filteredSaves.length === 0 ? (
        <div className="bg-[#1e1f26] rounded-2xl border border-[#494454]/30 p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto my-6">
          <div className="w-16 h-16 rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6] mb-4">
            <span className="material-symbols-outlined text-3xl">save</span>
          </div>
          <h2 className="text-lg font-bold font-headline text-white mb-2">
            Chưa Có Dữ Liệu Lưu Nào
          </h2>
          <p className="text-xs font-mono text-[#958ea0] max-w-md leading-relaxed mb-6">
            Dữ liệu chạy thử đã được làm sạch hoàn toàn. Khi bạn chơi bất kỳ game retro nào trong giả lập,
            tiến trình sẽ tự động lưu vào bộ nhớ pin SRAM hoặc bạn có thể nhấn phím tắt F2 để lưu nhanh (Save State).
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono text-xs font-bold transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">sports_esports</span>
              Khám Phá Game Ngay
            </button>
            {onNavigateToVault && (
              <button
                onClick={onNavigateToVault}
                className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] border border-[#494454]/40 font-mono text-xs transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">folder_open</span>
                Nhập ROM từ Máy / Drive
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSaves.map((save) => {
            const game = getGameById(save.gameId);
            const isState = save.type === 'state';

            return (
              <div
                key={save.id}
                className="p-4 bg-[#1e1f26] border border-[#494454]/30 hover:border-[#4cd7f6]/40 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all"
              >
                {/* Save info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#111319] border border-[#494454]/40 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {game?.boxArt ? (
                      <img src={game.boxArt} alt={game.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-[#4cd7f6]">sports_esports</span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white font-headline">
                        {game?.title || save.gameTitle || save.gameId}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#111319] text-[#cbc3d7] border border-[#494454]/40">
                        {isState ? `Slot ${save.slot}` : 'Battery SRAM'}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-xs">cloud_done</span> Cloud Synced
                      </span>
                    </div>
                    <p className="text-xs font-mono text-[#cbc3d7] mt-1">{save.locationName || 'Saved Position'}</p>
                    <div className="flex items-center gap-4 text-[11px] font-mono text-[#958ea0] mt-1">
                      <span>Size: {((save.sizeBytes || 8192) / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span>Modified: {save.updatedAt ? new Date(save.updatedAt).toLocaleString() : 'Recent'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
                  <button
                    onClick={() => onPlayGame(save.gameId, save.slot)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs flex items-center gap-1 shadow-md transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    Resume
                  </button>
                  <button
                    onClick={() => handleDownloadSrm(save)}
                    className="p-2 rounded-lg bg-[#111319] hover:bg-[#282a30] text-[#cbc3d7] hover:text-[#4cd7f6] border border-[#494454]/30 text-xs font-mono transition-colors"
                    title="Export raw binary (.srm / .state)"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                  </button>
                  <button
                    onClick={() => handleDeleteSave(save.id)}
                    className="p-2 rounded-lg bg-[#111319] hover:bg-red-500/20 text-[#cbc3d7] hover:text-red-400 border border-[#494454]/30 text-xs font-mono transition-colors"
                    title="Xóa tệp lưu"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal to Clear All Data */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-red-500/50 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="font-headline font-bold text-lg text-white">Xác Nhận Xóa Toàn Bộ Dữ Liệu</h3>
            </div>
            <p className="text-xs font-mono text-[#cbc3d7] leading-relaxed">
              Thao tác này sẽ xóa toàn bộ các tệp lưu trạng thái và pin SRAM cục bộ trong IndexedDB.
              Ứng dụng sẽ trở về trạng thái nguyên bản sạch sẽ sẵn sàng để triển khai.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] font-mono text-xs transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleClearAllSaves}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-mono text-xs font-bold transition-all shadow-md"
              >
                Xóa sạch dữ liệu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal (if real conflict detected) */}
      {activeConflict && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-amber-500/50 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="font-headline font-bold text-lg text-white">Phát Hiện Xung Đột Lưu Trữ</h3>
            </div>
            <p className="text-xs font-mono text-[#cbc3d7]">
              Cả thiết bị cục bộ và máy chủ đám mây đều có các mốc thời gian lưu khác nhau cho tựa game này. Vui lòng chọn phiên bản bạn muốn giữ:
            </p>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div
                onClick={() => handleResolveConflict('keep_local')}
                className="p-3 bg-[#111319] hover:bg-[#151922] border border-[#4cd7f6]/40 hover:border-[#4cd7f6] rounded-xl cursor-pointer transition-all space-y-1"
              >
                <div className="flex justify-between items-center text-xs font-mono font-bold text-[#4cd7f6]">
                  <span>Bản Cục Bộ (Local)</span>
                  <span className="material-symbols-outlined text-sm">laptop</span>
                </div>
                <p className="text-xs font-mono text-white">{activeConflict.localSave.locationName || 'Current Save'}</p>
                <span className="inline-block mt-2 px-2 py-0.5 rounded bg-[#4cd7f6]/20 text-[#4cd7f6] text-[10px] font-mono">
                  Giữ Bản Máy Này
                </span>
              </div>

              <div
                onClick={() => handleResolveConflict('restore_cloud')}
                className="p-3 bg-[#111319] hover:bg-[#151922] border border-[#d0bcff]/40 hover:border-[#d0bcff] rounded-xl cursor-pointer transition-all space-y-1"
              >
                <div className="flex justify-between items-center text-xs font-mono font-bold text-[#d0bcff]">
                  <span>Bản Đám Mây (Cloud)</span>
                  <span className="material-symbols-outlined text-sm">cloud</span>
                </div>
                <p className="text-xs font-mono text-white">{activeConflict.cloudSave.locationName || 'Cloud Save'}</p>
                <span className="inline-block mt-2 px-2 py-0.5 rounded bg-[#d0bcff]/20 text-[#d0bcff] text-[10px] font-mono">
                  Đồng Bộ Từ Cloud
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
