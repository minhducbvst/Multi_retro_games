import React from 'react';

interface ChangelogPageProps {
  onBack: () => void;
}

export const ChangelogPage: React.FC<ChangelogPageProps> = ({ onBack }) => {
  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#494454]/20 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/30 transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-bold font-headline text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6]">history_edu</span>
              Changelog & System Architecture
            </h1>
            <p className="text-xs font-mono text-[#958ea0]">
              Version 2.4.0 • WebAssembly Emulation Core Specifications & Release Notes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-bold">
            v2.4.0 PRODUCTION
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Release Notes Left Column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <div>
                <h2 className="text-lg font-bold font-headline text-white">RetroVerse 2.4.0 — The NetPlay & Cloud Overhaul</h2>
                <span className="text-xs font-mono text-[#4cd7f6]">Released October 2026 • Build hash: 78ec383a</span>
              </div>
              <span className="px-2.5 py-1 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] font-mono text-xs font-bold">
                Major Update
              </span>
            </div>

            <div className="space-y-4 text-xs font-mono text-[#cbc3d7] leading-relaxed">
              <div className="space-y-1">
                <h3 className="font-headline font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6]"></span>
                  Low-Latency WebRTC DataChannel NetPlay
                </h3>
                <p className="text-[#958ea0] pl-3">
                  Introduced peer-to-peer multiplayer rooms with frame-delay lockstep emulation. Sub-20ms latency on regional STUN/TURN relays, zero-server input transmission, and live lobby spectator chat.
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-headline font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Firebase Cloud Save Synchronization
                </h3>
                <p className="text-[#958ea0] pl-3">
                  Integrated Firebase Authentication with Google sign-in and Cloud Firestore sync for SRAM (.srm) and Save States (Slots 1-9). Includes smart conflict resolution with local rollback support.
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-headline font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d0bcff]"></span>
                  Enhanced Audio DSP & CRT Shaders
                </h3>
                <p className="text-[#958ea0] pl-3">
                  Simulated aperture grille Trinitron scanlines, 8-channel SNES S-DSP Gaussian audio filtering, and 60-frame rolling ring buffer for instantaneous in-game rewind (Backspace) and fast-forward (Spacebar).
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-headline font-bold text-sm text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffb3bc]"></span>
                  Client-Side ROM Vault & Header Inspector
                </h3>
                <p className="text-[#958ea0] pl-3">
                  Zero-server drag-and-drop cartridge loader with automated iNES and SNES LoROM/HiROM header parsing, CRC32/MD5 verification, and SRAM battery backup persistence.
                </p>
              </div>
            </div>
          </div>

          {/* Historical Changelog */}
          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
            <h3 className="font-headline font-bold text-white text-sm">Release History</h3>
            
            <div className="border-l-2 border-[#494454]/40 ml-3 space-y-6 pl-4 text-xs font-mono">
              <div className="relative">
                <span className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-[#4cd7f6] ring-4 ring-[#1e1f26]"></span>
                <span className="font-bold text-white">v2.3.2 • Game Boy Advance Sound APU Fix</span>
                <p className="text-[#958ea0] mt-0.5">Fixed direct sound DMA channel buffering on Safari and iOS WebKit engines.</p>
                <span className="text-[10px] text-[#494454]">Sept 28, 2026</span>
              </div>

              <div className="relative">
                <span className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-[#958ea0] ring-4 ring-[#1e1f26]"></span>
                <span className="font-bold text-white">v2.2.0 • WebGPU Render Pipeline Alpha</span>
                <p className="text-[#958ea0] mt-0.5">Experimental integer scaling shaders with sub-pixel scanlines rendering.</p>
                <span className="text-[10px] text-[#494454]">August 14, 2026</span>
              </div>

              <div className="relative">
                <span className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-[#958ea0] ring-4 ring-[#1e1f26]"></span>
                <span className="font-bold text-white">v2.0.0 • Initial WebAssembly Architecture</span>
                <p className="text-[#958ea0] mt-0.5">Switched from interpreted JavaScript core to compiled WebAssembly binaries.</p>
                <span className="text-[10px] text-[#494454]">May 19, 2026</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Architecture Right Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
            <h3 className="font-headline font-bold text-white text-sm">Architecture Overview</h3>
            
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                <span className="text-[#4cd7f6] font-bold block">1. Presentation Layer</span>
                <p className="text-[11px] text-[#958ea0]">React 19 + TypeScript + Tailwind CSS with dark CRT aesthetic.</p>
              </div>

              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                <span className="text-emerald-400 font-bold block">2. Emulation Runtime</span>
                <p className="text-[11px] text-[#958ea0]">HTML5 2D/WebGL Canvas loop @ 60 FPS + WebAudio API APU chiptune synth.</p>
              </div>

              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                <span className="text-[#d0bcff] font-bold block">3. State & Persistence</span>
                <p className="text-[11px] text-[#958ea0]">Local IndexedDB battery caching with Cloud Firestore document syncing.</p>
              </div>

              <div className="p-3 bg-[#111319] rounded-lg border border-[#494454]/20 space-y-1">
                <span className="text-[#ffb3bc] font-bold block">4. Networking Mesh</span>
                <p className="text-[11px] text-[#958ea0]">WebRTC RTCPeerConnection + RTCDataChannel with STUN/TURN relay fallback.</p>
              </div>
            </div>
          </div>

          <div className="bg-[#1e1f26] border border-[#494454]/30 rounded-2xl p-6 space-y-3">
            <h3 className="font-headline font-bold text-white text-sm">Open Source Licenses</h3>
            <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
              RetroVerse is built with respect for the emulation preservation community. Emulation cores are licensed under GPLv2 and MIT.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
