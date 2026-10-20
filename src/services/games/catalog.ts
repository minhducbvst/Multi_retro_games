import { Game } from '../../types';
import { libraryStore } from './libraryStore';

// Dynamic game collection - completely cleared of sample/mock games.
// Only holds cartridges scanned from Google Drive or uploaded directly from user device.
export const FEATURED_GAMES: Game[] = libraryStore.getGames();

// Keep FEATURED_GAMES in sync with libraryStore updates
libraryStore.subscribe((games) => {
  FEATURED_GAMES.length = 0;
  FEATURED_GAMES.push(...games);
});

export function getGameById(id: string): Game | undefined {
  return libraryStore.getGameById(id);
}
