import { Nostalgist } from 'nostalgist';
import { romStorage } from '../services/roms/romStorage';

export interface NostalgistInstanceRef {
  nostalgist: Nostalgist | null;
  isRunning: boolean;
}

export async function launchRetroEmulator(
  containerOrCanvas: HTMLCanvasElement | HTMLElement,
  gameId: string,
  platform: string,
  onStatusChange?: (status: string) => void
): Promise<Nostalgist | null> {
  const storedRom = romStorage.getRom(gameId);
  if (!storedRom) {
    throw new Error('No ROM binary data found for this game.');
  }

  // Determine correct RetroArch core for Nostalgist
  const upperPlat = (storedRom.platform || platform || '').toUpperCase();
  let core = 'fceumm'; // NES default
  if (upperPlat === 'SNES' || upperPlat.includes('SUPER')) {
    core = 'snes9x';
  } else if (upperPlat === 'GBA' || upperPlat.includes('ADVANCE')) {
    core = 'mgba';
  } else if (upperPlat === 'GENESIS' || upperPlat === 'MEGADRIVE') {
    core = 'genesis_plus_gx';
  }

  onStatusChange?.(`Đang khởi động core ${core}...`);

  try {
    const isCanvas = containerOrCanvas instanceof HTMLCanvasElement;
    const launchOptions: any = {
      core,
      rom: {
        fileName: storedRom.filename || `${gameId}.rom`,
        fileContent: storedRom.data,
      },
    };

    if (isCanvas) {
      launchOptions.element = containerOrCanvas;
    }

    const instance = await Nostalgist.launch(launchOptions);
    onStatusChange?.('Trò chơi đang chạy');
    return instance;
  } catch (err) {
    console.error('Failed to launch Nostalgist emulator core:', err);
    throw err;
  }
}
