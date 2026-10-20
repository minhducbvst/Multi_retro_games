import React, { useState, useEffect, useRef } from 'react';
import { useLibraryStore } from '../services/games/libraryStore';
import { Game } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (gameId: string) => void;
  onPlayGame: (gameId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectGame,
  onPlayGame
}) => {
  const games = useLibraryStore();
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'NES' | 'SNES' | 'GBA'>('ALL');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Global Esc key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredGames = games.filter((g) => {
    const matchesQuery =
      g.title.toLowerCase().includes(query.toLowerCase()) ||
      g.genre.toLowerCase().includes(query.toLowerCase()) ||
      (g.japaneseTitle && g.japaneseTitle.toLowerCase().includes(query.toLowerCase()));
    const matchesPlatform = platformFilter === 'ALL' || g.platform === platformFilter;
    return matchesQuery && matchesPlatform;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-20 p-4 select-none">
      <div
        className="w-full max-w-2xl bg-[#1e1f26] border border-[#494454]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-[#494454]/30 gap-3 bg-[#16171e]">
          <span className="material-symbols-outlined text-[#4cd7f6] text-xl">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cartridges, genres, or ROM checksums..."
            className="flex-1 bg-transparent text-white font-mono text-sm placeholder-[#958ea0] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[#958ea0] hover:text-white font-mono text-xs"
            >
              Clear
            </button>
          )}
          <kbd className="px-2 py-0.5 rounded bg-[#282a30] text-[10px] font-mono text-[#cbc3d7] border border-[#494454]/40">
            ESC
          </kbd>
        </div>

        {/* Platform Quick Filter Pills */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#494454]/20 bg-[#111319]/50 text-xs font-mono">
          <span className="text-[#958ea0] text-[11px]">Filter:</span>
          {(['ALL', 'SNES', 'GBA', 'NES'] as const).map((plat) => (
            <button
              key={plat}
              onClick={() => setPlatformFilter(plat)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                platformFilter === plat
                  ? 'bg-[#4cd7f6] text-[#003641] font-bold'
                  : 'bg-[#282a30] text-[#cbc3d7] hover:text-white'
              }`}
            >
              {plat}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-[#958ea0]">
            {filteredGames.length} titles
          </span>
        </div>

        {/* Search Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredGames.length > 0 ? (
            filteredGames.map((game) => (
              <div
                key={game.id}
                onClick={() => {
                  onSelectGame(game.id);
                  onClose();
                }}
                className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-[#282a30] cursor-pointer transition-all border border-transparent hover:border-[#4cd7f6]/30"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={game.artwork || game.boxArt}
                    alt={game.title}
                    className="w-12 h-12 rounded-lg object-cover border border-[#494454]/40 group-hover:scale-105 transition-transform"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-headline font-bold text-sm text-white group-hover:text-[#4cd7f6] transition-colors">
                        {game.title}
                      </h4>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          game.platform === 'SNES'
                            ? 'bg-[#4cd7f6]/10 text-[#4cd7f6]'
                            : game.platform === 'GBA'
                            ? 'bg-[#d0bcff]/10 text-[#d0bcff]'
                            : 'bg-[#ffb3bc]/10 text-[#ffb3bc]'
                        }`}
                      >
                        {game.platform}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#958ea0] mt-0.5">
                      {game.genre} • {game.developer} • {game.year}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayGame(game.id);
                      onClose();
                    }}
                    className="px-3 py-1 rounded-lg bg-[#4cd7f6] text-[#003641] font-mono font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    Play
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-[#958ea0] font-mono text-xs">
              <span className="material-symbols-outlined text-3xl text-[#494454] mb-2">search_off</span>
              <p>No cartridge matches "{query}"</p>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#16171e] border-t border-[#494454]/20 flex items-center justify-between text-[11px] font-mono text-[#958ea0]">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[#282a30] text-[#cbc3d7]">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[#282a30] text-[#cbc3d7]">↵</kbd> Select
            </span>
          </div>
          <span>RetroVerse Catalog</span>
        </div>
      </div>
    </div>
  );
};
