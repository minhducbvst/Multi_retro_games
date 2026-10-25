import re

# 1. Update VirtualGamepad.tsx
with open('src/components/VirtualGamepad.tsx', 'r', encoding='utf-8') as f:
    vg_lines = f.readlines()

# Find the start and end of center bar in landscape layout
start_idx = None
end_idx = None
for i, line in enumerate(vg_lines):
    if '{/* Center: System & Controls Bar */}' in line and i < 350:
        start_idx = i
    if start_idx is not None and i > start_idx:
        if '{/* Right: Shoulder R */}' in line:
            end_idx = i - 1
            break

if start_idx is not None and end_idx is not None:
    new_center = '''          {/* Center: ONE Unified System & Controls Floating HUD Capsule */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#12141c]/90 backdrop-blur-md px-2.5 sm:px-3.5 py-1 rounded-full border border-[#494454]/50 shadow-xl max-w-[calc(100%-140px)] overflow-x-auto no-scrollbar mx-1">
            {/* 1. Back button & Title */}
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="text-xs text-[#cbc3d7] hover:text-[#4cd7f6] flex items-center gap-1 font-mono transition-colors shrink-0"
                title="Thoát trò chơi"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span className="truncate max-w-[90px] xs:max-w-[120px] font-bold">
                  {gameTitle || 'RetroVerse'}
                </span>
              </button>
            )}

            <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>

            {/* 2. Select & Start */}
            {config.showSystemButtons && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onPointerDown={(e) => handlePress('select', e)}
                  onPointerUp={(e) => handleRelease('select', e)}
                  onPointerCancel={(e) => handleRelease('select', e)}
                  className="px-2 py-0.5 rounded bg-[#252733] border border-[#494454]/60 text-[10px] font-mono text-[#cbc3d7] active:bg-[#4cd7f6] active:text-[#003641]"
                >
                  SELECT
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => handlePress('start', e)}
                  onPointerUp={(e) => handleRelease('start', e)}
                  onPointerCancel={(e) => handleRelease('start', e)}
                  className="px-2 py-0.5 rounded bg-[#252733] border border-[#494454]/60 text-[10px] font-mono text-[#4cd7f6] font-bold active:bg-[#4cd7f6] active:text-[#003641]"
                >
                  START
                </button>
              </div>
            )}

            <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>

            {/* 3. D-Pad / Joystick Switcher */}
            <button
              type="button"
              onClick={() => {
                handleUpdateConfig({
                  movementType: config.movementType === 'dpad' ? 'joystick' : 'dpad',
                });
                triggerHaptic(20);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-mono text-[#4cd7f6] bg-[#1e202c] hover:bg-[#282a3a] border border-[#4cd7f6]/30 flex items-center gap-1 transition-colors shrink-0"
              title="Đổi giữa D-Pad và Joystick"
            >
              <span className="material-symbols-outlined text-sm">
                {config.movementType === 'dpad' ? 'drag_indicator' : 'control_camera'}
              </span>
              <span className="hidden xs:inline">{config.movementType === 'dpad' ? 'D-Pad' : 'Stick'}</span>
            </button>

            {/* 4. Orientation Switcher */}
            {onCycleOrientation && (
              <>
                <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
                <button
                  type="button"
                  onClick={onCycleOrientation}
                  className="text-[#4cd7f6] text-[11px] font-mono flex items-center gap-0.5 hover:text-white transition-colors shrink-0"
                  title="Đổi hướng màn hình (Dọc / Ngang / Tự động)"
                >
                  <span className="material-symbols-outlined text-xs">
                    {orientationMode === 'auto'
                      ? 'screen_rotation'
                      : 'stay_current_landscape'}
                  </span>
                  <span>{orientationMode === 'auto' ? 'Auto' : 'Ngang'}</span>
                </button>
              </>
            )}

            {/* 5. Rotation Flip 90° / 270° */}
            {isVirtualRotated && onToggleRotationAngle && (
              <button
                type="button"
                onClick={onToggleRotationAngle}
                className="text-[#958ea0] hover:text-[#4cd7f6] text-[11px] font-mono flex items-center gap-0.5 transition-colors shrink-0 pl-1 border-l border-[#494454]/40"
                title="Đảo chiều xoay màn hình (90° / 270°)"
              >
                <span className="material-symbols-outlined text-xs">
                  {rotationAngleDeg === 90 ? 'rotate_90_degrees_cw' : 'rotate_90_degrees_ccw'}
                </span>
                <span>{rotationAngleDeg === 90 ? '90°' : '270°'}</span>
              </button>
            )}

            {/* 6. Quick Game Actions (Pause, Fast Forward, Quick Save, Quick Load) */}
            {config.showQuickTools && (
              <>
                <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {onTogglePause && (
                    <button
                      type="button"
                      onClick={onTogglePause}
                      className="p-1 rounded text-[#d0bcff] hover:text-white flex items-center justify-center transition-colors"
                      title="Tạm dừng / Tiếp tục"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isPaused ? 'play_arrow' : 'pause'}
                      </span>
                    </button>
                  )}
                  {onCycleFastForward && (
                    <button
                      type="button"
                      onClick={onCycleFastForward}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5 transition-colors ${
                        fastForwardSpeed > 1
                          ? 'bg-[#03b5d3]/20 text-[#4cd7f6] font-bold'
                          : 'text-[#958ea0] hover:text-[#cbc3d7]'
                      }`}
                      title="Tua nhanh"
                    >
                      <span className="material-symbols-outlined text-xs">fast_forward</span>
                      <span>{fastForwardSpeed}x</span>
                    </button>
                  )}
                  {onTriggerQuickSave && (
                    <button
                      type="button"
                      onClick={onTriggerQuickSave}
                      className="p-1 rounded text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-colors"
                      title={`Lưu nhanh Slot #${currentSlot}`}
                    >
                      <span className="material-symbols-outlined text-xs">save</span>
                    </button>
                  )}
                  {onTriggerQuickLoad && (
                    <button
                      type="button"
                      onClick={onTriggerQuickLoad}
                      className="p-1 rounded text-[#4cd7f6] hover:text-[#70e0f8] flex items-center justify-center transition-colors"
                      title={`Nạp nhanh Slot #${currentSlot}`}
                    >
                      <span className="material-symbols-outlined text-xs">file_open</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 7. Visual Settings */}
            {onOpenVisualSettings && (
              <>
                <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
                <button
                  type="button"
                  onClick={onOpenVisualSettings}
                  className="p-1 rounded text-[#d0bcff] hover:text-white transition-colors shrink-0"
                  title="Bộ lọc hình ảnh CRT / Pixel"
                >
                  <span className="material-symbols-outlined text-sm">display_settings</span>
                </button>
              </>
            )}

            {/* 8. Gamepad Settings */}
            <div className="w-px h-3.5 bg-[#494454]/40 shrink-0"></div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 rounded text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors shrink-0"
              title="Tùy chỉnh tay cầm"
            >
              <span className="material-symbols-outlined text-sm">tune</span>
            </button>

            {/* 9. PC Mode Toggle */}
            {onTogglePCMode && (
              <button
                type="button"
                onClick={onTogglePCMode}
                className="p-1 rounded text-[#958ea0] hover:text-white transition-colors shrink-0"
                title="Chuyển sang chế độ PC"
              >
                <span className="material-symbols-outlined text-sm">computer</span>
              </button>
            )}
          </div>
'''
    vg_lines[start_idx:end_idx] = [new_center + '\n']
    with open('src/components/VirtualGamepad.tsx', 'w', encoding='utf-8') as f:
        f.writelines(vg_lines)
    print("VirtualGamepad.tsx updated!")
else:
    print(f"Could not find indices: {start_idx}, {end_idx}")

# 2. Update EmulatorPage.tsx
with open('src/pages/EmulatorPage.tsx', 'r', encoding='utf-8') as f:
    ep_lines = f.readlines()

pill_start = None
pill_end = None
for i, line in enumerate(ep_lines):
    if '{/* LANDSCAPE MINIMAL TOP HUD PILL */}' in line:
        pill_start = i
    if pill_start is not None and i > pill_start:
        if '{/* LANDSCAPE FLOATING OVERLAY GAMEPAD */}' in line:
            pill_end = i
            break

if pill_start is not None and pill_end is not None:
    # Remove the pill
    ep_lines[pill_start:pill_end] = []
    print("Removed duplicate HUD pill from EmulatorPage.tsx!")

# Now update the VirtualGamepad invocation in landscape
content = "".join(ep_lines)

old_invoc = '''          {/* LANDSCAPE FLOATING OVERLAY GAMEPAD */}
          {isHandheldTouchMode && effectiveOrientation === 'landscape' && (
            <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between">
              <VirtualGamepad
                layout="landscape"
                onInput={handleVirtualInput}
                platform={game?.platform}
                onTriggerQuickSave={triggerQuickSave}
                onTriggerQuickLoad={triggerQuickLoad}
                onTriggerRewind={triggerRewind}
                onCycleFastForward={cycleFastForward}
                onTogglePause={togglePlayPause}
                isPaused={isPaused}
                fastForwardSpeed={fastForwardSpeed}
                currentSlot={currentSlot}
                rotationAngle={activeRotationDeg}
              />
            </div>
          )}'''

new_invoc = '''          {/* LANDSCAPE FLOATING OVERLAY GAMEPAD */}
          {isHandheldTouchMode && effectiveOrientation === 'landscape' && (
            <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between">
              <VirtualGamepad
                layout="landscape"
                onInput={handleVirtualInput}
                platform={game?.platform}
                onTriggerQuickSave={triggerQuickSave}
                onTriggerQuickLoad={triggerQuickLoad}
                onTriggerRewind={triggerRewind}
                onCycleFastForward={cycleFastForward}
                onTogglePause={togglePlayPause}
                isPaused={isPaused}
                fastForwardSpeed={fastForwardSpeed}
                currentSlot={currentSlot}
                rotationAngle={activeRotationDeg}
                gameTitle={game.title}
                onExit={onExit}
                orientationMode={orientationMode}
                onCycleOrientation={cycleOrientation}
                isVirtualRotated={isVirtualRotated}
                rotationAngleDeg={rotationAngleDeg}
                onToggleRotationAngle={() => {
                  const next = rotationAngleDeg === 90 ? -90 : 90;
                  setRotationAngleDeg(next);
                  showToast(`Đã đảo chiều xoay (${next === 90 ? '90°' : '270°'})`);
                }}
                onOpenVisualSettings={() => setShowVisualSettingsModal(true)}
                onTogglePCMode={() => setIsHandheldTouchMode(false)}
              />
            </div>
          )}'''

if old_invoc in content:
    content = content.replace(old_invoc, new_invoc, 1)
    with open('src/pages/EmulatorPage.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("EmulatorPage.tsx invocation updated!")
else:
    print("Could not find old_invoc in EmulatorPage.tsx")
